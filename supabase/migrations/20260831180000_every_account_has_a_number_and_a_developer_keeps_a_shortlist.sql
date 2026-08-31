-- ═══════════════════════════════════════════════════════════════════════════
--  Two things the Developer console could not say, and now can:
--    1. WHICH account this is, in one syllable — `signup_no`, the account's
--       place in the order everybody joined. #1 is the first person who ever
--       made a TDG account.
--    2. WHICH accounts a developer keeps coming back to — public.tdg_dev_pins,
--       one developer's own shortlist, in their own order.
--  Applied 2026-08-31 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHY A NUMBER, AND WHY THE SERVER HAS TO WORK IT OUT
--  A uuid is not something two people can say to each other, and a display
--  name is not unique. "Account 3" is, and the order accounts were created in
--  is the one ordering of this table that never changes: a rename moves a row
--  in an alphabetical list, a sign-in moves it in a recency list, and joining
--  moves nothing that already joined.
--
--  It cannot be counted in the browser. `tdg_admin_accounts` FILTERS (the
--  search box re-queries it) and it CAPS (p_max_rows, ceiling 1000), so the
--  rows a browser is holding are a subset of the table in the general case —
--  and a number derived from a subset is a number that changes when you type
--  in the search box. That is worse than no number at all, because it looks
--  like a fact. So the rank is computed over the WHOLE of public.profiles,
--  inside the function, before any filter or limit touches it.
--
--  The cost is one sort of public.profiles per call. This is an admin console
--  read on a table with single-digit thousands of rows at its most optimistic,
--  and the alternative — a stored counter column — is a number that can drift
--  from the thing it claims to count and has no way to notice. Correct and
--  derived beats fast and stored here.
--
--  WHY PINS ARE A TABLE AND NOT localStorage
--  `devMode.ts` is per device on purpose: "hide the tab before I share a
--  screen" is a fact about this screen. A shortlist is the opposite — it is
--  work. You build it while dealing with somebody, and losing it because you
--  opened the console on the other machine is the same loss as losing a
--  bookmark folder. It is also per DEVELOPER and not per project: two of us
--  use this page and we are not working on the same people.
--
--  WHY IT IS NOT IN THE AUDIT LOG
--  Every other write from `#/dev` is logged because every other write changes
--  something about somebody else's account. A pin changes nothing about the
--  account it names — it is a bookmark, visible to one developer, invisible to
--  the person it points at. Logging it would put lines in a log whose whole
--  value is that every line in it matters.

begin;

/* ── 1 · the number ─────────────────────────────────────────────────────── */

--  A `returns table` cannot be replaced in place: Postgres refuses a
--  `create or replace` whose OUT list moved. Same drop-and-recreate the
--  revocations migration did, and for the same reason.
--
--  `DevAccount` in src/dev/api.ts is hand-written to match this list column
--  for column and moves in the same commit — there is no generated types
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
  mak_stripe_customer_id text, store jsonb, revocations jsonb,
  --  The account's place in the order everybody joined. 1 is the first.
  signup_no integer
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
      ), '[]'::jsonb),
      nr.n::integer
    from public.profiles p
    join auth.users u on u.id = p.user_id
    --  Ranked over the WHOLE table, joined in — never derived from the rows
    --  this call is about to return, which the search and p_max_rows have
    --  already narrowed. created_at is not declared unique, so user_id breaks
    --  a tie: two accounts made in the same microsecond still get one number
    --  each, and the same number every time.
    join (
      select p2.user_id as user_id,
             row_number() over (order by p2.created_at, p2.user_id) as n
        from public.profiles p2
    ) nr on nr.user_id = p.user_id
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

/* ── 2 · the shortlist ──────────────────────────────────────────────────── */

create table if not exists public.tdg_dev_pins (
  --  The DEVELOPER whose list this is. Not the account being pinned.
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  --  The account pinned. `on delete cascade` is what makes Delete Forever
  --  clean: an account that no longer exists cannot be left on anybody's list.
  user_id    uuid        not null references auth.users(id) on delete cascade,
  --  Where it sits in the owner's own order, 1 upward. Only the ORDER is ever
  --  read, never the value: unpinning leaves a gap and a reorder closes it,
  --  and neither of those is worth a write. What matters is that
  --  tdg_admin_reorder_pins rewrites the whole list in one statement, so two
  --  rows can never end up sharing a place.
  sort       integer     not null default 0,
  created_at timestamptz not null default now(),
  primary key (owner_id, user_id)
);

comment on table public.tdg_dev_pins is
  'One developer''s pinned accounts on #/dev, in their own order. Private to the owner; written only by tdg_admin_set_pin and tdg_admin_reorder_pins.';

--  The one index the reads want: every read is "this owner''s list, in order".
create index if not exists tdg_dev_pins_owner_sort_idx
  on public.tdg_dev_pins (owner_id, sort, created_at);

alter table public.tdg_dev_pins enable row level security;

--  RLS on with NO policy in either direction, deliberately. Nothing outside
--  the three security-definer verbs below may touch this table, and each of
--  them opens with tdg_admin_uid() and scopes every statement to the caller's
--  own owner_id. There is no read for the account being pinned either: being
--  on somebody's shortlist is not a fact about you that you get told.
--  AGENTS.md rule 12.
revoke all on table public.tdg_dev_pins from public, anon, authenticated;

/*  This developer's list, in this developer's order. */
create or replace function public.tdg_admin_pins()
returns table (user_id uuid, sort integer, pinned_at timestamptz)
language plpgsql
stable security definer set search_path to 'public'
as $fn$
declare
  v_me uuid := public.tdg_admin_uid();
begin
  return query
    select d.user_id, d.sort, d.created_at
      from public.tdg_dev_pins d
     where d.owner_id = v_me
     order by d.sort, d.created_at, d.user_id;
end;
$fn$;

revoke all on function public.tdg_admin_pins() from public, anon, authenticated;
grant execute on function public.tdg_admin_pins() to authenticated;

/*  Pin one, or unpin one.

    A new pin goes to the END of the list. The alternative — dropping it on
    top — reorders a list the developer arranged by hand every time they pin
    somebody, which is the one thing a hand-arranged list may not do to
    itself.                                                                  */
create or replace function public.tdg_admin_set_pin(
  p_target uuid,
  p_on     boolean default true
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_me   uuid := public.tdg_admin_uid();
  v_next integer;
begin
  if p_target is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  if coalesce(p_on, true) then
    --  A pin pointing at nothing is a row that can never be drawn and never
    --  be cleared, so the account has to exist before one is written.
    if not exists (select 1 from public.profiles pr where pr.user_id = p_target) then
      raise exception 'tdg: no such account' using errcode = '22023';
    end if;

    select coalesce(max(d.sort), 0) + 1
      into v_next
      from public.tdg_dev_pins d
     where d.owner_id = v_me;

    insert into public.tdg_dev_pins (owner_id, user_id, sort)
    values (v_me, p_target, v_next)
    on conflict (owner_id, user_id) do nothing;
  else
    delete from public.tdg_dev_pins d
     where d.owner_id = v_me and d.user_id = p_target;
  end if;

  return jsonb_build_object('user_id', p_target, 'pinned', coalesce(p_on, true));
end;
$fn$;

revoke all on function public.tdg_admin_set_pin(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.tdg_admin_set_pin(uuid, boolean) to authenticated;

/*  Put the list in a new order.

    The client sends the ids it believes are pinned, in the order it wants
    them. This function is deliberately FORGIVING in both directions, because
    the browser's copy can be a moment behind the table — the other tab pinned
    somebody, a Delete Forever cascaded a row away:

      · an id that is not pinned by this caller is ignored, so a stale list
        can never insert a pin;
      · a pin the list does not mention keeps its relative place AFTER the ids
        that were named, so a stale list can never drop one either.

    One statement, so a drag is one round trip and the order is never observed
    half-written.                                                            */
create or replace function public.tdg_admin_reorder_pins(p_order uuid[])
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_me uuid := public.tdg_admin_uid();
  v_n  integer := 0;
begin
  with named as (
    --  min(ord), so an id sent twice counts once and at its first mention
    --  rather than multiplying the row it joins to.
    select u.id as id, min(u.ord) as ord
      from unnest(coalesce(p_order, '{}'::uuid[])) with ordinality as u(id, ord)
     group by u.id
  ),
  ranked as (
    select d.user_id as user_id,
           row_number() over (
             --  Named ids first in the order given; everything else after, in
             --  the order it already had.
             order by (n.ord is null), n.ord, d.sort, d.created_at, d.user_id
           ) as pos
      from public.tdg_dev_pins d
      left join named n on n.id = d.user_id
     where d.owner_id = v_me
  )
  update public.tdg_dev_pins d
     set sort = r.pos::integer
    from ranked r
   where d.owner_id = v_me
     and d.user_id = r.user_id
     and d.sort is distinct from r.pos::integer;

  get diagnostics v_n = row_count;
  return jsonb_build_object('moved', v_n);
end;
$fn$;

revoke all on function public.tdg_admin_reorder_pins(uuid[])
  from public, anon, authenticated;
grant execute on function public.tdg_admin_reorder_pins(uuid[]) to authenticated;

commit;
