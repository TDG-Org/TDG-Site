-- ═══════════════════════════════════════════════════════════════════════════
--  Two things a developer could decide and had nowhere to record:
--    1. public.tdg_product_revocations — a product this account may not have
--       and may not buy, with what was taken so it can be given straight back.
--    2. public.tdg_notices — telling the person we changed their entitlement,
--       in their own app, in words they can read.
--  Applied 2026-08-28 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHY A REVOCATION IS NOT "SWITCH THE PACK OFF"
--  Switching a pack off is already possible and it is a different decision. It
--  says "this account does not have this right now", and the Store's next move
--  is to offer to sell it again — which is correct for a refund, a lapse or a
--  mistake, and exactly wrong for the case this table exists for: an account
--  that must not have the product and must not be able to buy it back. Done
--  with the switch alone, the block lasts until the person presses Buy.
--
--  So a revocation is a standing fact with its own row, its own reason and its
--  own date, and it survives everything a purchase can do.
--
--  WHY IT REMEMBERS WHAT IT TOOK
--  Revoking has to actually take the access away — a block that leaves
--  `owned_packs` intact is a notice, not a revocation, because every TDG app
--  gates on that column. But taking it away by deleting the grant would make
--  the decision one-way: restoring would have to invent a grant, and an
--  invented grant is a purchase this project never received.
--
--  `held_before` is the whole answer. The revocation carries the exact grant
--  (or, for an app that records no grants, the exact pack ids) it removed, and
--  lifting it writes back precisely that. Nothing is guessed in either
--  direction, and a revoke-then-restore leaves the row as it started —
--  including `since`, the date the account first got the pack, which must not
--  move for a developer any more than it moves for a renewal.
--
--  WHY THE APPS STILL HAVE TO READ IT
--  Removing the grant is enough to stop today's apps unlocking the pack,
--  because all of them gate on `owned_packs`. It is NOT enough to explain
--  anything: an app that simply finds the pack missing says "buy it", which is
--  the sentence a revoked account must never be shown. `tdg_my_revocations()`
--  is the one call an app makes to find out, and `docs/revocation-app-prompt.md`
--  is the brief its own session needs. This site reads it today.
--
--  WHY NOTICES ARE A TABLE AND NOT AN EMAIL
--  The same reason `tdg_feedback_replies` is: this project has no outbound mail
--  and does not want one on the entitlement path. A notice waits in tdg-core
--  until the person's own app asks for it, is shown once, and is acked by them
--  pressing a button — so "sent" and "seen" stay different facts, and the
--  console can show which is which.

begin;

/* ── 1 · revocations ────────────────────────────────────────────────────── */

create table if not exists public.tdg_product_revocations (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  --  An app id as `tdg_store_apps()` reports it, or any product id this
  --  project sells that is not a pack Store — `makullveny` is the one today.
  app         text        not null,
  --  A pack id, or '*' for the whole app. One column rather than a nullable
  --  one so the primary key can hold both without a partial unique index, and
  --  so "the whole app" is a value you can see in a row rather than an absence
  --  you have to know how to read.
  pack        text        not null default '*',
  --  Why. Shown to the account holder, so it is written for them.
  reason      text,
  --  What was taken, exactly, so lifting gives back exactly that.
  --  `{"grants": {...}}` for an app with a grants column, `{"packs": [...]}`
  --  for one without. `{}` when there was nothing to take.
  held_before jsonb       not null default '{}'::jsonb,
  revoked_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (user_id, app, pack)
);

comment on table public.tdg_product_revocations is
  'A product an account may not hold and may not buy. Written only by tdg_admin_set_revocation; read by the account itself through tdg_my_revocations().';

alter table public.tdg_product_revocations enable row level security;

--  Read your own, and nothing else. Every TDG app asks this table what it may
--  not unlock and the shop asks it what it may not sell, so the person it is
--  about has to be able to read it — the reason is written for them.
--  There is no client write policy at all, in either direction: the boundary is
--  the admin function below and only the admin function. AGENTS.md rule 12.
drop policy if exists tdg_product_revocations_read_own on public.tdg_product_revocations;
create policy tdg_product_revocations_read_own
  on public.tdg_product_revocations
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.tdg_product_revocations to authenticated;

/*  What THIS account may not have. The RLS policy above is the check, so there
    is exactly one place the rule lives.                                       */
create or replace function public.tdg_my_revocations()
returns table (app text, pack text, reason text, created_at timestamptz)
language sql
stable
set search_path to 'public'
as $fn$
  select r.app, r.pack, r.reason, r.created_at
    from public.tdg_product_revocations r
   where r.user_id = auth.uid()
   order by r.app, r.pack
$fn$;

revoke all on function public.tdg_my_revocations() from public, anon;
grant execute on function public.tdg_my_revocations() to authenticated;

/*  Put one on, or take it off.

    On:  the row is written AND the access is removed, remembering what it
         removed. Off: what was remembered is written back and the row goes.   */
create or replace function public.tdg_admin_set_revocation(
  p_target uuid,
  p_app    text,
  p_pack   text    default '*',
  p_on     boolean default true,
  p_reason text    default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_me     uuid := public.tdg_admin_uid();
  v_app    text := lower(btrim(coalesce(p_app, '')));
  v_pack   text := coalesce(nullif(btrim(coalesce(p_pack, '')), ''), '*');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_reg    record;
  v_known  boolean := false;
  v_held   jsonb := '{}'::jsonb;
  v_grants jsonb;
  v_packs  text[];
  v_back   text[];
  v_whole  boolean;
begin
  if p_target is null or v_app = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if v_pack <> '*' and v_pack !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
    raise exception 'tdg: a pack id is 2-48 characters of lowercase letters, numbers, - and _, or * for the whole app'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  v_whole := v_pack = '*';

  --  A pack revoked underneath a whole-app revocation would capture an empty
  --  `held_before` — the app-level one already took everything — and lifting
  --  the app one would then hand the pack back while its own row still said no.
  --  Two rows disagreeing about one pack is the state this refuses to create.
  if p_on and not v_whole and exists (
    select 1 from public.tdg_product_revocations r
     where r.user_id = p_target and r.app = v_app and r.pack = '*'
  ) then
    raise exception 'tdg: the whole of % is already revoked for this account, so its packs are too', v_app
      using errcode = '22023';
  end if;

  --  An app the registry knows has something to take away. One it does not —
  --  Makullveny, which is a tier ladder and not a pack Store — is still a
  --  product a developer may revoke, and the block is recorded either way. It
  --  is never SILENTLY recorded as though access had been removed: `held_before`
  --  stays empty and the console says so out loud.
  select * into v_reg from public.tdg_store_apps() a where a.app_id = v_app;
  v_known := found;

  if p_on then
    if v_known then
      execute format('insert into public.%I (user_id) values ($1) on conflict (user_id) do nothing',
                     v_reg.entitlements_table) using p_target;

      if v_reg.has_grants then
        execute format('select coalesce(e.grants, ''{}''::jsonb) from public.%I e where e.user_id = $1 for update',
                       v_reg.entitlements_table) into v_grants using p_target;
        v_grants := coalesce(v_grants, '{}'::jsonb);

        if v_whole then
          v_held := jsonb_build_object('grants', v_grants);
          execute format('update public.%I e set grants = ''{}''::jsonb where e.user_id = $1',
                         v_reg.entitlements_table) using p_target;
        elsif v_grants ? v_pack then
          v_held := jsonb_build_object('grants', jsonb_build_object(v_pack, v_grants -> v_pack));
          execute format('update public.%I e set grants = coalesce(e.grants, ''{}''::jsonb) - $2 where e.user_id = $1',
                         v_reg.entitlements_table) using p_target, v_pack;
        end if;
      else
        execute format('select coalesce(e.owned_packs, ''{}''::text[]) from public.%I e where e.user_id = $1 for update',
                       v_reg.entitlements_table) into v_packs using p_target;
        v_packs := coalesce(v_packs, '{}'::text[]);

        if v_whole then
          v_held := jsonb_build_object('packs', to_jsonb(v_packs));
          execute format('update public.%I e set owned_packs = ''{}''::text[] where e.user_id = $1',
                         v_reg.entitlements_table) using p_target;
        elsif v_pack = any (v_packs) then
          v_held := jsonb_build_object('packs', to_jsonb(array[v_pack]));
          execute format('update public.%I e set owned_packs = array_remove(e.owned_packs, $2) where e.user_id = $1',
                         v_reg.entitlements_table) using p_target, v_pack;
        end if;
      end if;
    end if;

    insert into public.tdg_product_revocations (user_id, app, pack, reason, held_before, revoked_by)
    values (p_target, v_app, v_pack, v_reason, v_held, v_me)
    on conflict (user_id, app, pack) do update
      --  Re-revoking an already-revoked product must not overwrite what the
      --  FIRST press took with the nothing the second one found.
      set reason = coalesce(excluded.reason, public.tdg_product_revocations.reason);

  else
    select r.held_before into v_held
      from public.tdg_product_revocations r
     where r.user_id = p_target and r.app = v_app and r.pack = v_pack
     for update;
    if not found then
      raise exception 'tdg: % / % is not revoked for this account', v_app, v_pack using errcode = '02000';
    end if;
    v_held := coalesce(v_held, '{}'::jsonb);

    if v_known then
      if v_reg.has_grants and (v_held ? 'grants') then
        --  `||` and not a replace: anything bought since the revocation keeps
        --  its own grant, and what was taken comes back beside it.
        execute format('update public.%I e set grants = coalesce(e.grants, ''{}''::jsonb) || $2 where e.user_id = $1',
                       v_reg.entitlements_table) using p_target, (v_held -> 'grants');
      elsif (not v_reg.has_grants) and (v_held ? 'packs') then
        select coalesce(array_agg(pk), '{}'::text[]) into v_back
          from jsonb_array_elements_text(v_held -> 'packs') as t(pk);
        execute format(
          'update public.%I e set owned_packs = ('
          || 'select coalesce(array_agg(distinct x), ''{}''::text[]) '
          || 'from unnest(coalesce(e.owned_packs, ''{}''::text[]) || $2) as x'
          || ') where e.user_id = $1',
          v_reg.entitlements_table) using p_target, v_back;
      end if;
    end if;

    delete from public.tdg_product_revocations r
     where r.user_id = p_target and r.app = v_app and r.pack = v_pack;
  end if;

  perform public.tdg_admin_log(
    p_target,
    case when p_on then 'revoke-product' else 'restore-product' end,
    v_app || ':' || v_pack
      || case when p_on and v_held = '{}'::jsonb then ' (nothing was held to take)' else '' end
      || coalesce(' — ' || v_reason, ''));

  return jsonb_build_object('app', v_app, 'pack', v_pack, 'revoked', p_on, 'held', v_held);
end;
$fn$;

revoke all on function public.tdg_admin_set_revocation(uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.tdg_admin_set_revocation(uuid, text, text, boolean, text)
  to authenticated;

/* ── 2 · notices ────────────────────────────────────────────────────────── */

create table if not exists public.tdg_notices (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  --  Which product this is about, so the person's own app can show the ones
  --  that concern it and this site can name the shelf.
  app        text        not null,
  --  Title Case, short: what happened.
  subject    text        not null,
  --  Sentence case: what we did, in words. Written by the developer who did it.
  body       text        not null,
  author_id  uuid        references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  --  Set when the person presses the button that says they read it. Closing
  --  the panel does not count — the same rule tdg_feedback_replies keeps.
  seen_at    timestamptz
);

comment on table public.tdg_notices is
  'A message to one account about a change we made to what they own. Written only by tdg_admin_notify; read and acked by the account itself.';

create index if not exists tdg_notices_waiting
  on public.tdg_notices (user_id, created_at) where seen_at is null;

alter table public.tdg_notices enable row level security;

drop policy if exists tdg_notices_read_own on public.tdg_notices;
create policy tdg_notices_read_own
  on public.tdg_notices
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.tdg_notices to authenticated;

/*  What is waiting for this account. Oldest first: two notices about one pack
    only make sense in the order they were written.                            */
create or replace function public.tdg_my_notices()
returns table (id bigint, app text, subject text, body text, created_at timestamptz)
language sql
stable
set search_path to 'public'
as $fn$
  select n.id, n.app, n.subject, n.body, n.created_at
    from public.tdg_notices n
   where n.user_id = auth.uid() and n.seen_at is null
   order by n.created_at
   limit 20
$fn$;

revoke all on function public.tdg_my_notices() from public, anon;
grant execute on function public.tdg_my_notices() to authenticated;

/*  Seen, and only ever your own. Idempotent: acking twice is not an error, and
    a second press must not move the date the first one wrote.                 */
create or replace function public.tdg_notice_ack(p_id bigint)
returns void
language sql security definer set search_path to 'public'
as $fn$
  update public.tdg_notices n
     set seen_at = now()
   where n.id = p_id and n.user_id = auth.uid() and n.seen_at is null
$fn$;

revoke all on function public.tdg_notice_ack(bigint) from public, anon;
grant execute on function public.tdg_notice_ack(bigint) to authenticated;

/*  Tell somebody what we changed.

    Its own verb rather than a flag on every entitlement function, for two
    reasons. The words are the point — "we ended your Pro Export Pack because
    the payment was reversed" is not derivable from a status column — so they
    are typed by the developer who made the change, beside the change. And a
    signature that never grows means adding the tick box to another panel is a
    client edit rather than a migration.                                       */
create or replace function public.tdg_admin_notify(
  p_target  uuid,
  p_app     text,
  p_subject text,
  p_body    text
)
returns bigint
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_me      uuid := public.tdg_admin_uid();
  v_app     text := lower(btrim(coalesce(p_app, '')));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body    text := btrim(coalesce(p_body, ''));
  v_id      bigint;
begin
  if p_target is null or v_app = '' or v_subject = '' or v_body = '' then
    raise exception 'tdg: a notice needs an app, a subject and something to say'
      using errcode = '22023';
  end if;
  if length(v_subject) > 120 or length(v_body) > 2000 then
    raise exception 'tdg: a notice is at most a 120-character subject and 2000 characters of body'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  insert into public.tdg_notices (user_id, app, subject, body, author_id)
  values (p_target, v_app, v_subject, v_body, v_me)
  returning id into v_id;

  --  In the audit log with everything else, so "did anybody tell them?" is
  --  answered in the same place as "who changed it".
  perform public.tdg_admin_log(p_target, 'notice', v_app || ': ' || v_subject);
  return v_id;
end;
$fn$;

revoke all on function public.tdg_admin_notify(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.tdg_admin_notify(uuid, text, text, text) to authenticated;

/* ── 3 · the console has to be able to SEE a revocation ─────────────────── */

--  `tdg_admin_accounts` gains one column. A returns-table change needs the
--  drop: Postgres will not `create or replace` a function whose OUT list moved.
--  `DevAccount` in src/dev/api.ts is hand-written to match this list column for
--  column and is edited in the same sitting — there is no generated types
--  package on this project to catch a drift.
drop function if exists public.tdg_admin_accounts(text, uuid, integer);

create function public.tdg_admin_accounts(
  p_q        text    default '',
  p_target   uuid    default null,
  p_max_rows integer default 200
)
returns table (
  user_id uuid, email text, username text, display_name text, bio text,
  recovery_email text, is_admin boolean, public_profile boolean,
  public_friend_list boolean, created_at timestamptz, updated_at timestamptz,
  username_changed_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, auth_banned_until timestamptz,
  status text, ban_until timestamptz, hidden_by_admin boolean,
  hidden_until timestamptz, deleted_by_admin boolean, deleted_at timestamptz,
  friend_count integer, streak_current integer, streak_longest integer,
  streak_total integer, core_tier text, core_status text,
  core_stripe_customer_id text, core_renewed_at timestamptz,
  core_row_count integer, mak_tier text, mak_status text, mak_themes text[],
  mak_candle_purchased_at timestamptz, mak_support_badge_at timestamptz,
  mak_period_end timestamptz, mak_cancel_at_period_end boolean,
  mak_stripe_customer_id text, store jsonb, revocations jsonb
)
language plpgsql
stable security definer set search_path to 'public', 'auth'
as $fn$
declare
  v_q     text := btrim(coalesce(p_q, ''));
  v_joins text := '';
  v_store text := '';
  v_alias text;
  v_sql   text;
  r       record;
  i       integer := 0;
begin
  perform public.tdg_admin_uid();
  v_q := regexp_replace(v_q, '^@', '');

  for r in select * from public.tdg_store_apps() loop
    i := i + 1;
    v_alias := 'ent' || i;

    v_joins := v_joins || format(
      ' left join public.%I %I on %I.user_id = p.user_id',
      r.entitlements_table, v_alias, v_alias);

    v_store := v_store || format(
      $s$ || jsonb_build_object(%L, jsonb_build_object(
               'packs', to_jsonb(coalesce(%I.owned_packs, '{}'::text[])),
               'stripe_customer_id', to_jsonb(%I.stripe_customer_id),
               'grants', %s))$s$,
      r.app_id, v_alias, v_alias,
      case
        when r.has_grants then format($g$coalesce(%I.grants, '{}'::jsonb)$g$, v_alias)
        else $g$'{}'::jsonb$g$
      end);
  end loop;

  v_sql := format($q$
    select
      p.user_id,
      u.email::text,
      p.username,
      p.display_name,
      p.bio,
      p.recovery_email,
      p.is_admin,
      p.public_profile,
      p.public_friend_list,
      p.created_at,
      p.updated_at,
      p.username_changed_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      u.banned_until,
      coalesce(st.status, 'active'),
      st.ban_until,
      coalesce(st.hidden_by_admin, false),
      st.hidden_until,
      coalesce(st.deleted_by_admin, false),
      st.deleted_at,
      coalesce(array_length(st.friend_ids, 1), 0),
      coalesce(sk."current", 0),
      coalesce(sk.longest, 0),
      coalesce(sk.total_days, 0),
      coalesce(co.tier, 'free'),
      coalesce(co.status, 'active'),
      co.stripe_customer_id,
      co.renewed_at,
      coalesce(co.row_count, 0)::integer,
      coalesce(mk.tier, 'free'),
      coalesce(mk.status, 'active'),
      coalesce(mk.owned_themes, '{}'::text[]),
      mk.candle_purchased_at,
      mk.support_badge_earned_at,
      mk.current_period_end,
      coalesce(mk.cancel_at_period_end, false),
      mk.stripe_customer_id,
      '{}'::jsonb %s,
      --  Every revocation on this account, whatever app it names — including
      --  an app the registry has never heard of, because a block the console
      --  cannot see is a block nobody can lift.
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'app', rv.app, 'pack', rv.pack, 'reason', rv.reason,
                 'held', rv.held_before <> '{}'::jsonb,
                 'at', rv.created_at)
               order by rv.app, rv.pack)
          from public.tdg_product_revocations rv
         where rv.user_id = p.user_id
      ), '[]'::jsonb)
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.tdg_profile_state st on st.user_id = p.user_id
    left join public.tdg_streaks       sk on sk.user_id = p.user_id and sk.app = 'bea'
    left join lateral (
      select s.tier, s.status, s.stripe_customer_id, s.renewed_at,
             count(*) over () as row_count
      from public.subscriptions s
      where s.user_id = p.user_id
      order by s.renewed_at desc nulls last, s.id
      limit 1
    ) co on true
    left join public.mak_subscriptions mk on mk.user_id = p.user_id%s
    where ($2::uuid is null or p.user_id = $2::uuid)
      and ($2::uuid is not null
           or $1 = ''
           or p.username       ilike '%%' || $1 || '%%'
           or p.display_name   ilike '%%' || $1 || '%%'
           or u.email::text    ilike '%%' || $1 || '%%'
           or p.recovery_email ilike '%%' || $1 || '%%'
           or p.user_id::text  = $1)
    order by p.created_at desc
    limit greatest(1, least(coalesce($3, 200), 1000))
  $q$, v_store, v_joins);

  return query execute v_sql using v_q, p_target, p_max_rows;
end;
$fn$;

revoke all on function public.tdg_admin_accounts(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.tdg_admin_accounts(text, uuid, integer) to authenticated;

commit;
