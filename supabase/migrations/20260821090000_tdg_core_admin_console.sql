-- ═══════════════════════════════════════════════════════════════════════════
--  TDG Core Developer Console · the server half
--  Applied 2026-08-21 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS IS
--  The site's Developer page (src/dev/) is presentation only. Every fact it
--  shows and every change it makes goes through one of the `tdg_admin_*`
--  functions below, and every one of them starts by refusing anybody whose
--  profile does not have `is_admin`. That refusal is the security boundary:
--  not the hidden tab, not the lazy-loaded chunk, not the route. Someone who
--  reads the built JavaScript and calls these by hand gets 42501 and nothing
--  else.
--
--  WHY IT IS ITS OWN FAMILY OF FUNCTIONS
--  `bea_admin_*` already exists and is deliberately Bible-Educator-shaped: its
--  account list carries BEA's moderation state, and its audit view filters to
--  `app = 'bible-educator'`. Bible Educator depends on those shapes. TDG Core
--  needs a SUPERSET, the same account seen across Bible Educator, Makullveny,
--  TDG Veditor and DevFleet at once, so widening the BEA functions would mean
--  changing a signature four products already read. These are new names beside
--  them, sharing the one thing that must never fork: `bea_is_admin()`.
--
--  WHY EVERY WRITE GOES THROUGH A FUNCTION AND NOT RLS
--  The entitlement tables have no client write policies at all, on purpose:
--  the Stripe webhooks own them. Granting an admin UPDATE would open a second
--  door onto money-bearing rows and lose the ledger. Instead each write here is
--  a narrow verb that also appends to the SAME `*_purchase_events` /
--  `mak_subscription_events` ledger the webhooks write, so a free grant and a
--  real payment sit in one list and neither can happen invisibly.
--
--  THE AUDIT LOG IS SHARED, THE VIEWS ARE NOT
--  Actions taken here land in `bea_moderation_audit` with `app = 'tdg-core'`.
--  `bea_admin_audit` filters to 'bible-educator', so Bible Educator's log stays
--  exactly what it was; `tdg_admin_audit` below shows EVERY app, because this
--  console is the place you come to when you do not yet know which product the
--  problem is in.

begin;

-- ── 0 · catalogs ───────────────────────────────────────────────────────────
--  The lists the console offers in its dropdowns. They live in SQL rather than
--  in the site's TypeScript so that the server validates against exactly what
--  the UI offered. A tier the page could pick but the database rejects is the
--  one failure that reads as "the console is broken".

--  Bible Educator gates on this ladder (see its
--  src/services/account/subscription.ts TIER_ORDER). `subscriptions.tier` has
--  no CHECK constraint, so this list is advisory: the console still allows a
--  hand-typed value for a tier that ships before this file is updated.
create or replace function public.tdg_core_tiers()
returns text[] language sql immutable as $$
  select array['free', 'plus', 'pro', 'lifetime']::text[];
$$;

--  Mirrors the CHECK constraint on both subscriptions tables.
create or replace function public.tdg_sub_statuses()
returns text[] language sql immutable as $$
  select array['active', 'trialing', 'past_due', 'canceled',
               'incomplete', 'incomplete_expired', 'unpaid', 'paused']::text[];
$$;

--  Mirrors the CHECK constraint on public.mak_subscriptions.tier.
create or replace function public.mak_known_tiers()
returns text[] language sql immutable as $$
  select array['free', 'candle', 'lantern', 'hearth']::text[];
$$;

--  Makullveny's MARKETPLACE_THEMES, verbatim (its src/entitlements.js). Kept in
--  step by hand: add a theme there and add it here in the same sitting, or the
--  console cannot grant the thing the app is selling. The Candle bundle does
--  NOT write these. It sets candle_purchased_at, which the app treats as
--  every marketplace theme, so granting Candle here needs no theme edits.
create or replace function public.mak_known_themes()
returns text[] language sql immutable as $$
  select array['terminal-hacker', 'cherry-blossom', 'garden-of-eden',
               'lantern-study', 'moonlit-observatory']::text[];
$$;


-- ── 1 · the guard, and the log ─────────────────────────────────────────────

--  Every function below opens with this. It answers the caller's own id so the
--  "not on yourself" rules have something to compare against, and it raises
--  rather than returning false because a developer tool that quietly does
--  nothing is worse than one that says no.
--
--  Not granted to anybody: it is called only from inside the SECURITY DEFINER
--  functions here, where the effective role is the owner.
create or replace function public.tdg_admin_uid()
returns uuid
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  if not public.bea_is_admin() then
    raise exception 'tdg: the developer console is limited to TDG developer accounts'
      using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function public.tdg_admin_uid() from public;

create or replace function public.tdg_admin_log(p_target uuid, p_action text, p_detail text)
returns void
language sql security definer set search_path to 'public'
as $$
  insert into public.bea_moderation_audit (app, actor_id, target_id, action, detail)
  values ('tdg-core', auth.uid(), p_target, p_action, nullif(btrim(coalesce(p_detail, '')), ''));
$$;
revoke all on function public.tdg_admin_log(uuid, text, text) from public;


-- ── 2 · reads ──────────────────────────────────────────────────────────────

--  ONE account shape, used for both the roster and the detail panel.
--
--  Two functions would mean two column lists to keep in step, and the day they
--  drift is the day the roster says "free" and the panel says "pro" about the
--  same person. Pass p_target for one account, or p_q to search. The payload is
--  wide, which is the point: the console's whole job is showing one person's
--  standing across four products without four round trips.
create or replace function public.tdg_admin_accounts(
  p_q        text    default '',
  p_target   uuid    default null,
  p_max_rows integer default 200
)
returns table (
  user_id                     uuid,
  email                       text,
  username                    text,
  display_name                text,
  bio                         text,
  recovery_email              text,
  is_admin                    boolean,
  public_profile              boolean,
  public_friend_list          boolean,
  created_at                  timestamptz,
  updated_at                  timestamptz,
  username_changed_at         timestamptz,
  last_sign_in_at             timestamptz,
  email_confirmed_at          timestamptz,
  auth_banned_until           timestamptz,
  status                      text,
  ban_until                   timestamptz,
  hidden_by_admin             boolean,
  hidden_until                timestamptz,
  deleted_by_admin            boolean,
  deleted_at                  timestamptz,
  friend_count                integer,
  streak_current              integer,
  streak_longest              integer,
  streak_total                integer,
  core_tier                   text,
  core_status                 text,
  core_stripe_customer_id     text,
  core_renewed_at             timestamptz,
  core_row_count              integer,
  mak_tier                    text,
  mak_status                  text,
  mak_themes                  text[],
  mak_candle_purchased_at     timestamptz,
  mak_support_badge_at        timestamptz,
  mak_period_end              timestamptz,
  mak_cancel_at_period_end    boolean,
  mak_stripe_customer_id      text,
  veditor_packs               text[],
  veditor_stripe_customer_id  text,
  devfleet_packs              text[],
  devfleet_stripe_customer_id text
)
language plpgsql stable security definer set search_path to 'public', 'auth'
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
begin
  perform public.tdg_admin_uid();
  -- A leading @ is how a human writes a username; nobody stores one.
  v_q := regexp_replace(v_q, '^@', '');

  return query
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
    coalesce(ve.owned_packs, '{}'::text[]),
    ve.stripe_customer_id,
    coalesce(df.owned_packs, '{}'::text[]),
    df.stripe_customer_id
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.bea_profile_state st on st.user_id = p.user_id
  left join public.bea_streaks       sk on sk.user_id = p.user_id
  -- public.subscriptions has no unique index on user_id, so a duplicate row is
  -- possible. Pick one deterministically and report how many there were.
  -- Bible Educator reads that table with .maybeSingle(), which ERRORS on two
  -- rows, so a count above 1 is a real fault the console should show.
  left join lateral (
    select s.tier, s.status, s.stripe_customer_id, s.renewed_at,
           count(*) over () as row_count
    from public.subscriptions s
    where s.user_id = p.user_id
    order by s.renewed_at desc nulls last, s.id
    limit 1
  ) co on true
  left join public.mak_subscriptions     mk on mk.user_id = p.user_id
  left join public.veditor_entitlements  ve on ve.user_id = p.user_id
  left join public.devfleet_entitlements df on df.user_id = p.user_id
  where (p_target is null or p.user_id = p_target)
    and (p_target is not null
         or v_q = ''
         or p.username       ilike '%' || v_q || '%'
         or p.display_name   ilike '%' || v_q || '%'
         or u.email::text    ilike '%' || v_q || '%'
         or p.recovery_email ilike '%' || v_q || '%'
         or p.user_id::text  = v_q)
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_max_rows, 200), 1000));
end;
$$;

--  The numbers across the top of the console. One round trip, because six
--  separate counts is six chances for one of them to be stale on screen.
create or replace function public.tdg_admin_overview()
returns table (
  accounts        integer,
  developers      integer,
  suspended       integer,
  hidden          integer,
  soft_deleted    integer,
  unconfirmed     integer,
  new_7d          integer,
  new_30d         integer,
  active_7d       integer,
  core_paid       integer,
  mak_paid        integer,
  veditor_owners  integer,
  devfleet_owners integer,
  gross_cents     bigint
)
language plpgsql stable security definer set search_path to 'public', 'auth'
as $$
begin
  perform public.tdg_admin_uid();
  return query
  select
    (select count(*) from public.profiles)::integer,
    (select count(*) from public.profiles p where p.is_admin)::integer,
    (select count(*) from auth.users u
      where u.banned_until is not null and u.banned_until > now())::integer,
    (select count(*) from public.bea_profile_state s
      where s.hidden_by_admin and (s.hidden_until is null or s.hidden_until > now()))::integer,
    (select count(*) from public.bea_profile_state s where s.deleted_by_admin)::integer,
    (select count(*) from auth.users u where u.email_confirmed_at is null)::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '7 days')::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '30 days')::integer,
    (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '7 days')::integer,
    (select count(*) from public.subscriptions s where s.tier <> 'free')::integer,
    (select count(*) from public.mak_subscriptions m
      where m.tier <> 'free' or m.candle_purchased_at is not null
         or coalesce(array_length(m.owned_themes, 1), 0) > 0)::integer,
    (select count(*) from public.veditor_entitlements e
      where coalesce(array_length(e.owned_packs, 1), 0) > 0)::integer,
    (select count(*) from public.devfleet_entitlements e
      where coalesce(array_length(e.owned_packs, 1), 0) > 0)::integer,
    (select coalesce(sum(x.amount_cents), 0)::bigint from (
        select amount_cents from public.veditor_purchase_events
        union all select amount_cents from public.devfleet_purchase_events
        union all select amount_cents from public.mak_subscription_events
     ) x);
end;
$$;

--  Every entitlement change TDG has ever recorded, from all three ledgers, in
--  one list. Stripe deliveries and free grants sit side by side on purpose: a
--  grant that is not visible next to the payments is a grant nobody audits.
create or replace function public.tdg_admin_events(
  p_target   uuid    default null,
  p_max_rows integer default 200
)
returns table (
  at           timestamptz,
  source       text,
  event_type   text,
  user_id      uuid,
  who          text,
  item         text,
  amount_cents integer,
  currency     text,
  event_id     text
)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  perform public.tdg_admin_uid();
  return query
  with ledger as (
    select e.created_at as at, 'veditor'::text as source, e.event_type, e.user_id,
           e.pack as item, e.amount_cents, e.currency, e.stripe_event_id as event_id
      from public.veditor_purchase_events e
    union all
    select e.created_at, 'devfleet', e.event_type, e.user_id,
           e.pack, e.amount_cents, e.currency, e.stripe_event_id
      from public.devfleet_purchase_events e
    union all
    select e.created_at, 'makullveny', e.event_type, e.user_id,
           e.tier, e.amount_cents, e.currency, e.stripe_event_id
      from public.mak_subscription_events e
  )
  select l.at, l.source, l.event_type, l.user_id,
         coalesce(pr.display_name, pr.username, '(no profile)'),
         l.item, l.amount_cents, l.currency, l.event_id
  from ledger l
  left join public.profiles pr on pr.user_id = l.user_id
  where p_target is null or l.user_id = p_target
  order by l.at desc
  limit greatest(1, least(coalesce(p_max_rows, 200), 1000));
end;
$$;

--  One guarded call for every list the console's dropdowns offer, so the page
--  makes one round trip instead of six and the catalogs themselves need no
--  grant of their own. veditor_known_packs() / devfleet_known_packs() already
--  existed and stay postgres-only; they are reached through here.
create or replace function public.tdg_admin_catalog()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  perform public.tdg_admin_uid();
  return jsonb_build_object(
    'core_tiers',     to_jsonb(public.tdg_core_tiers()),
    'statuses',       to_jsonb(public.tdg_sub_statuses()),
    'mak_tiers',      to_jsonb(public.mak_known_tiers()),
    'mak_themes',     to_jsonb(public.mak_known_themes()),
    'veditor_packs',  to_jsonb(public.veditor_known_packs()),
    'devfleet_packs', to_jsonb(public.devfleet_known_packs())
  );
end;
$$;

--  Every moderation / permission action, from EVERY app, unlike
--  bea_admin_audit, which is scoped to Bible Educator on purpose.
create or replace function public.tdg_admin_audit(
  p_target   uuid    default null,
  p_q        text    default '',
  p_max_rows integer default 200
)
returns table (
  id          bigint,
  at          timestamptz,
  app         text,
  action      text,
  detail      text,
  actor_id    uuid,
  actor_name  text,
  target_id   uuid,
  target_name text
)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
begin
  perform public.tdg_admin_uid();
  return query
  select a.id, a.created_at, a.app, a.action, a.detail,
         a.actor_id,  coalesce(ap.display_name, ap.username, 'unknown'),
         a.target_id, coalesce(tp.display_name, tp.username, 'deleted account')
  from public.bea_moderation_audit a
  left join public.profiles ap on ap.user_id = a.actor_id
  left join public.profiles tp on tp.user_id = a.target_id
  where (p_target is null or a.target_id = p_target)
    and (v_q = ''
         or a.action ilike '%' || v_q || '%'
         or a.detail ilike '%' || v_q || '%'
         or a.app    ilike '%' || v_q || '%'
         or coalesce(ap.display_name, ap.username) ilike '%' || v_q || '%'
         or coalesce(tp.display_name, tp.username) ilike '%' || v_q || '%')
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_max_rows, 200), 1000));
end;
$$;


-- ── 3 · writes: permissions and identity ───────────────────────────────────

--  Developer permission. Not on yourself, in either direction: the only way to
--  lock every developer out of this console is for the last one to untick
--  their own box, so the function simply refuses and tells you to ask the
--  other developer. Two people, two keys.
create or replace function public.tdg_admin_set_admin(p_target uuid, p_admin boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me uuid := public.tdg_admin_uid();
begin
  if p_target is null or p_admin is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if p_target = v_me then
    raise exception 'tdg: you cannot change your own developer permission — ask the other developer'
      using errcode = '42501';
  end if;

  update public.profiles p set is_admin = p_admin where p.user_id = p_target;
  if not found then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  perform public.tdg_admin_log(
    p_target,
    case when p_admin then 'grant-developer' else 'revoke-developer' end,
    null);
end;
$$;

--  Identity fields. NULL means "leave this one alone"; the empty string means
--  "clear it". Without that distinction a form that only edits the bio would
--  wipe the display name every time it saved.
--
--  Changing a username here also stamps username_changed_at, which starts the
--  account's own 2-week rename cooldown (touch_profile_timestamps). That is
--  the trigger's doing and it is deliberate (a rename is a rename), but the
--  console says so out loud next to the field.
create or replace function public.tdg_admin_set_profile(
  p_target             uuid,
  p_display_name       text    default null,
  p_username           text    default null,
  p_bio                text    default null,
  p_public_profile     boolean default null,
  p_public_friend_list boolean default null
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me       uuid := public.tdg_admin_uid();
  v_username text;
  v_changed  text[] := '{}';
begin
  if p_target is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  if p_username is not null then
    v_username := nullif(btrim(regexp_replace(p_username, '^@', '')), '');
    if v_username is not null then
      if v_username !~ '^[A-Za-z0-9_]{3,20}$' then
        raise exception 'tdg: a username is 3-20 characters, letters, numbers and underscores'
          using errcode = '22023';
      end if;
      if exists (select 1 from public.profiles p
                  where lower(p.username) = lower(v_username) and p.user_id <> p_target) then
        raise exception 'tdg: that username is already taken' using errcode = 'PT409';
      end if;
    end if;
    v_changed := v_changed || ('username=' || coalesce(v_username, '(cleared)'))::text;
  end if;

  -- Every element is cast to text explicitly. `v_changed || 'bio'` without one
  -- parses the untyped literal as an ARRAY literal and raises 22P02, which is
  -- exactly what the first cut of this function did the moment anybody edited
  -- a bio. The neighbours only escaped because their inner `||` had already
  -- produced a typed text.
  if p_display_name is not null then
    v_changed := v_changed || ('display_name=' || coalesce(nullif(btrim(p_display_name), ''), '(cleared)'))::text;
  end if;
  if p_bio is not null then
    v_changed := v_changed || 'bio'::text;
  end if;
  if p_public_profile is not null then
    v_changed := v_changed || ('public_profile=' || p_public_profile::text)::text;
  end if;
  if p_public_friend_list is not null then
    v_changed := v_changed || ('public_friend_list=' || p_public_friend_list::text)::text;
  end if;

  update public.profiles p set
    display_name       = case when p_display_name is null then p.display_name
                              else nullif(btrim(p_display_name), '') end,
    username           = case when p_username is null then p.username else v_username end,
    bio                = case when p_bio is null then p.bio else btrim(p_bio) end,
    public_profile     = coalesce(p_public_profile, p.public_profile),
    public_friend_list = coalesce(p_public_friend_list, p.public_friend_list)
  where p.user_id = p_target;

  if not found then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  perform public.tdg_admin_log(p_target, 'edit-profile', array_to_string(v_changed, ', '));
  perform v_me;
end;
$$;


-- ── 4 · writes: subscriptions and entitlements ─────────────────────────────

--  The TDG-wide tier every app can gate on (public.subscriptions).
--
--  Updates EVERY row this account has rather than one, because that table has
--  no unique index on user_id and a duplicate pair would otherwise disagree
--  with itself for ever. Inserts one when there is none, because an account created
--  before handle_new_user existed has no row at all.
create or replace function public.tdg_admin_set_core_subscription(
  p_target uuid, p_tier text, p_status text
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me     uuid    := public.tdg_admin_uid();
  v_tier   text    := lower(btrim(coalesce(p_tier, '')));
  v_status text    := lower(btrim(coalesce(p_status, 'active')));
  v_hit    integer;
begin
  if p_target is null or v_tier = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if v_tier !~ '^[a-z0-9_-]{2,32}$' then
    raise exception 'tdg: a tier is 2-32 characters, lowercase letters, numbers, - and _'
      using errcode = '22023';
  end if;
  if not (v_status = any (public.tdg_sub_statuses())) then
    raise exception 'tdg: unknown subscription status' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  update public.subscriptions s
     set tier = v_tier, status = v_status, renewed_at = now()
   where s.user_id = p_target;
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    insert into public.subscriptions (user_id, tier, status, renewed_at)
    values (p_target, v_tier, v_status, now());
  end if;

  perform public.tdg_admin_log(p_target, 'set-core-subscription', v_tier || ' / ' || v_status);
  perform v_me;
end;
$$;

--  Makullveny's own tier (public.mak_subscriptions), independent of the core
--  one. The app takes the greater of the two.
create or replace function public.tdg_admin_set_mak_subscription(
  p_target uuid, p_tier text, p_status text
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me     uuid := public.tdg_admin_uid();
  v_tier   text := lower(btrim(coalesce(p_tier, '')));
  v_status text := lower(btrim(coalesce(p_status, 'active')));
begin
  if p_target is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if not (v_tier = any (public.mak_known_tiers())) then
    raise exception 'tdg: unknown Makullveny tier' using errcode = '22023';
  end if;
  if not (v_status = any (public.tdg_sub_statuses())) then
    raise exception 'tdg: unknown subscription status' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  insert into public.mak_subscriptions (user_id, tier, status, updated_at)
  values (p_target, v_tier, v_status, now())
      on conflict (user_id)
      do update set tier = excluded.tier, status = excluded.status, updated_at = now();

  insert into public.mak_subscription_events (stripe_event_id, event_type, user_id, tier)
  values ('admin:' || gen_random_uuid()::text, 'mak.admin.set_tier', p_target, v_tier);

  perform public.tdg_admin_log(p_target, 'set-mak-subscription', v_tier || ' / ' || v_status);
  perform v_me;
end;
$$;

--  One marketplace theme on or off (mak_subscriptions.owned_themes).
create or replace function public.tdg_admin_set_mak_theme(
  p_target uuid, p_theme text, p_owned boolean
)
returns text[]
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me     uuid   := public.tdg_admin_uid();
  v_theme  text   := btrim(coalesce(p_theme, ''));
  v_before text[];
  v_after  text[];
begin
  if p_target is null or p_owned is null or v_theme = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  -- Granting is held to the known list so a typo cannot mint a theme the app
  -- has never heard of. REVOKING is not, so a theme retired from the list can
  -- still be taken off an account that already has it.
  if p_owned and not (v_theme = any (public.mak_known_themes())) then
    raise exception 'tdg: unknown Makullveny theme' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  insert into public.mak_subscriptions (user_id) values (p_target)
      on conflict (user_id) do nothing;

  select coalesce(m.owned_themes, '{}'::text[]) into v_before
    from public.mak_subscriptions m where m.user_id = p_target for update;
  v_before := coalesce(v_before, '{}'::text[]);

  if p_owned then
    v_after := case when v_theme = any (v_before) then v_before else v_before || v_theme end;
  else
    v_after := array_remove(v_before, v_theme);
  end if;
  v_after := (select coalesce(array_agg(t order by t), '{}'::text[]) from unnest(v_after) as t);

  update public.mak_subscriptions m
     set owned_themes = v_after, updated_at = now()
   where m.user_id = p_target;

  if v_after is distinct from v_before then
    insert into public.mak_subscription_events (stripe_event_id, event_type, user_id, tier)
    values ('admin:' || gen_random_uuid()::text,
            case when p_owned then 'mak.admin.grant_theme' else 'mak.admin.revoke_theme' end,
            p_target, v_theme);
    perform public.tdg_admin_log(
      p_target,
      case when p_owned then 'grant-mak-theme' else 'revoke-mak-theme' end,
      v_theme);
  end if;

  perform v_me;
  return v_after;
end;
$$;

--  The two Makullveny timestamps that behave like switches:
--    candle_bundle · the Candle bundle, which the app reads as "owns every
--                    marketplace theme" without listing them one by one.
--    support_badge · the permanent "supported Mak" marker.
create or replace function public.tdg_admin_set_mak_flag(
  p_target uuid, p_flag text, p_on boolean
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me   uuid := public.tdg_admin_uid();
  v_flag text := lower(btrim(coalesce(p_flag, '')));
begin
  if p_target is null or p_on is null or v_flag not in ('candle_bundle', 'support_badge') then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  insert into public.mak_subscriptions (user_id) values (p_target)
      on conflict (user_id) do nothing;

  if v_flag = 'candle_bundle' then
    update public.mak_subscriptions m
       set candle_purchased_at = case when p_on then coalesce(m.candle_purchased_at, now()) else null end,
           updated_at = now()
     where m.user_id = p_target;
  else
    update public.mak_subscriptions m
       set support_badge_earned_at = case when p_on then coalesce(m.support_badge_earned_at, now()) else null end,
           updated_at = now()
     where m.user_id = p_target;
  end if;

  insert into public.mak_subscription_events (stripe_event_id, event_type, user_id, tier)
  values ('admin:' || gen_random_uuid()::text,
          case when p_on then 'mak.admin.set_flag' else 'mak.admin.clear_flag' end,
          p_target, v_flag);

  perform public.tdg_admin_log(
    p_target, case when p_on then 'grant-mak-flag' else 'revoke-mak-flag' end, v_flag);
  perform v_me;
end;
$$;

--  A TDG Veditor or DevFleet Store pack, on or off, for ANY account.
--
--  veditor_admin_set_pack / devfleet_admin_set_pack already exist but only ever
--  touch auth.uid(), a developer giving THEMSELVES a pack to test with. This
--  is the other half: giving one to somebody else, which is what a free grant,
--  a refund, and a "Stripe charged them but the webhook missed it" all need.
create or replace function public.tdg_admin_set_pack(
  p_target uuid, p_app text, p_pack text, p_owned boolean
)
returns text[]
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me     uuid := public.tdg_admin_uid();
  v_app    text := lower(btrim(coalesce(p_app, '')));
  v_pack   text := btrim(coalesce(p_pack, ''));
  v_before text[];
  v_after  text[];
begin
  if p_target is null or p_owned is null or v_pack = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if v_app not in ('veditor', 'devfleet') then
    raise exception 'tdg: unknown app — expected veditor or devfleet' using errcode = '22023';
  end if;
  -- Same asymmetry as the themes: only GRANTING is held to the known list.
  if p_owned and not (v_pack = any (
        case when v_app = 'veditor' then public.veditor_known_packs()
             else public.devfleet_known_packs() end)) then
    raise exception 'tdg: unknown Store pack for that app' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  if v_app = 'veditor' then
    insert into public.veditor_entitlements (user_id) values (p_target)
        on conflict (user_id) do nothing;
    select coalesce(e.owned_packs, '{}'::text[]) into v_before
      from public.veditor_entitlements e where e.user_id = p_target for update;
  else
    insert into public.devfleet_entitlements (user_id) values (p_target)
        on conflict (user_id) do nothing;
    select coalesce(e.owned_packs, '{}'::text[]) into v_before
      from public.devfleet_entitlements e where e.user_id = p_target for update;
  end if;
  v_before := coalesce(v_before, '{}'::text[]);

  if p_owned then
    v_after := case when v_pack = any (v_before) then v_before else v_before || v_pack end;
  else
    v_after := array_remove(v_before, v_pack);
  end if;
  v_after := (select coalesce(array_agg(x order by x), '{}'::text[]) from unnest(v_after) as x);

  if v_app = 'veditor' then
    update public.veditor_entitlements e
       set owned_packs = v_after, updated_at = now() where e.user_id = p_target;
    if v_after is distinct from v_before then
      insert into public.veditor_purchase_events (stripe_event_id, event_type, user_id, pack)
      values ('admin:' || gen_random_uuid()::text,
              case when p_owned then 'veditor.admin.grant' else 'veditor.admin.revoke' end,
              p_target, v_pack);
    end if;
  else
    update public.devfleet_entitlements e
       set owned_packs = v_after, updated_at = now() where e.user_id = p_target;
    if v_after is distinct from v_before then
      insert into public.devfleet_purchase_events (stripe_event_id, event_type, user_id, pack)
      values ('admin:' || gen_random_uuid()::text,
              case when p_owned then 'devfleet.admin.grant' else 'devfleet.admin.revoke' end,
              p_target, v_pack);
    end if;
  end if;

  if v_after is distinct from v_before then
    perform public.tdg_admin_log(
      p_target,
      case when p_owned then 'grant-pack' else 'revoke-pack' end,
      v_app || ':' || v_pack);
  end if;

  perform v_me;
  return v_after;
end;
$$;


-- ── 5 · writes: standing ───────────────────────────────────────────────────

--  Account standing, in the seven verbs the console offers.
--
--  WHY THIS TOUCHES auth.users AND NOT JUST bea_profile_state
--  bea_profile_state is Bible Educator's enforcement: BEA reads it at sign-in
--  and refuses. Nothing else does, so a "banned" account could still sign into
--  TDG Veditor and use its packs, which is not what anybody means by banned on
--  a TDG-CORE console. So a suspension also sets auth.users.banned_until, which
--  GoTrue itself honours for every app on this project at once, and deletes the
--  account's live sessions so the ban starts NOW rather than whenever the
--  current access token happens to expire.
--
--  Lifting one of the two states must not lift the other's lock: unban only
--  clears the auth lock if the account is not also soft-deleted, and restore
--  only clears it if the account is not also banned.
create or replace function public.tdg_admin_moderate(
  p_target uuid,
  p_action text,
  p_until  timestamptz default null,
  p_detail text        default null
)
returns void
language plpgsql security definer set search_path to 'public', 'auth'
as $$
declare
  v_me      uuid := public.tdg_admin_uid();
  v_action  text := lower(btrim(coalesce(p_action, '')));
  v_banned  boolean;
  v_deleted boolean;
begin
  if p_target is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if v_action not in ('ban', 'unban', 'hide', 'unhide',
                      'soft_delete', 'restore', 'sign_out_everywhere') then
    raise exception 'tdg: unknown action' using errcode = '22023';
  end if;
  if p_target = v_me then
    raise exception 'tdg: a developer cannot moderate their own account' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;
  if v_action in ('ban', 'hide') and p_until is not null and p_until <= now() then
    raise exception 'tdg: that end time is in the past' using errcode = '22023';
  end if;

  -- Signing every device out is its own verb AND part of a suspension: a ban
  -- that leaves a live access token working for another hour is not a ban.
  if v_action in ('ban', 'soft_delete', 'sign_out_everywhere') then
    delete from auth.sessions s where s.user_id = p_target;
  end if;

  if v_action = 'sign_out_everywhere' then
    perform public.tdg_admin_log(p_target, 'sign-out-everywhere', p_detail);
    return;
  end if;

  insert into public.bea_profile_state (user_id) values (p_target)
      on conflict (user_id) do nothing;

  update public.bea_profile_state s set
    status           = case when v_action = 'ban'   then 'banned'
                            when v_action = 'unban' then 'active' else s.status end,
    ban_until        = case when v_action = 'ban'   then p_until
                            when v_action = 'unban' then null else s.ban_until end,
    hidden_by_admin  = case when v_action = 'hide'   then true
                            when v_action = 'unhide' then false else s.hidden_by_admin end,
    hidden_until     = case when v_action = 'hide'   then p_until
                            when v_action = 'unhide' then null else s.hidden_until end,
    deleted_by_admin = case when v_action = 'soft_delete' then true
                            when v_action = 'restore'     then false else s.deleted_by_admin end,
    deleted_at       = case when v_action = 'soft_delete' then now()
                            when v_action = 'restore'     then null else s.deleted_at end,
    updated_at       = now()
  where s.user_id = p_target;

  select (s.status = 'banned'), s.deleted_by_admin
    into v_banned, v_deleted
    from public.bea_profile_state s where s.user_id = p_target;

  if v_action in ('ban', 'soft_delete') then
    -- No end time means indefinite. GoTrue wants a real timestamp, so
    -- "indefinite" is a hundred years out rather than infinity, which its
    -- driver cannot read back.
    update auth.users u
       set banned_until = coalesce(p_until, now() + interval '100 years')
     where u.id = p_target;
  elsif v_action = 'unban' and not coalesce(v_deleted, false) then
    update auth.users u set banned_until = null where u.id = p_target;
  elsif v_action = 'restore' and not coalesce(v_banned, false) then
    update auth.users u set banned_until = null where u.id = p_target;
  end if;

  perform public.tdg_admin_log(
    p_target,
    replace(v_action, '_', '-'),
    coalesce(nullif(btrim(coalesce(p_detail, '')), ''),
             case when v_action in ('ban', 'hide')
                  then coalesce(to_char(p_until at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
                                'indefinite')
                  else null end));
end;
$$;

--  Permanent deletion. Soft-delete first is not politeness. It is the one
--  thing standing between a mis-click and an account that cannot come back.
create or replace function public.tdg_admin_delete_forever(p_target uuid)
returns void
language plpgsql security definer set search_path to 'public', 'auth'
as $$
declare
  v_me   uuid := public.tdg_admin_uid();
  v_soft boolean;
  v_who  text;
begin
  if p_target is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if p_target = v_me then
    raise exception 'tdg: you cannot delete your own developer account' using errcode = '42501';
  end if;

  select coalesce(s.deleted_by_admin, false) into v_soft
    from public.bea_profile_state s where s.user_id = p_target;
  if not coalesce(v_soft, false) then
    raise exception 'tdg: soft-delete the account first' using errcode = '42501';
  end if;

  select coalesce(p.display_name, p.username, p_target::text) into v_who
    from public.profiles p where p.user_id = p_target;

  -- Logged BEFORE the delete: the audit row's target_id is ON DELETE SET NULL,
  -- so the name written here is the only record of who this was.
  perform public.tdg_admin_log(p_target, 'delete-forever', coalesce(v_who, p_target::text));

  -- Array elements cannot carry a foreign key, so the departing account has to
  -- be scrubbed out of everyone else's lists by hand.
  update public.bea_profile_state s
     set friend_ids    = array_remove(s.friend_ids, p_target),
         blocked_ids   = array_remove(s.blocked_ids, p_target),
         requested_ids = array_remove(s.requested_ids, p_target),
         favorite_ids  = array_remove(s.favorite_ids, p_target),
         friend_order  = array_remove(s.friend_order, p_target)
   where p_target = any (s.friend_ids)    or p_target = any (s.blocked_ids)
      or p_target = any (s.requested_ids) or p_target = any (s.favorite_ids)
      or p_target = any (s.friend_order);

  -- mak_typing_records is the one child table whose FK is NO ACTION rather
  -- than CASCADE, so the delete below fails on any account with a leaderboard
  -- entry unless this goes first.
  delete from public.mak_typing_records r where r.user_id = p_target;

  delete from auth.users u where u.id = p_target;
end;
$$;


-- ── 6 · grants ─────────────────────────────────────────────────────────────
--  `authenticated` only. `anon` never: a signed-out caller has no admin row to
--  check, so letting them reach these would only ever produce a 42501 and a
--  probe endpoint. The guard inside each function is the real boundary; this
--  just stops the door being rattled.

revoke all on function
  public.tdg_admin_accounts(text, uuid, integer),
  public.tdg_admin_overview(),
  public.tdg_admin_events(uuid, integer),
  public.tdg_admin_audit(uuid, text, integer),
  public.tdg_admin_catalog(),
  public.tdg_admin_set_admin(uuid, boolean),
  public.tdg_admin_set_profile(uuid, text, text, text, boolean, boolean),
  public.tdg_admin_set_core_subscription(uuid, text, text),
  public.tdg_admin_set_mak_subscription(uuid, text, text),
  public.tdg_admin_set_mak_theme(uuid, text, boolean),
  public.tdg_admin_set_mak_flag(uuid, text, boolean),
  public.tdg_admin_set_pack(uuid, text, text, boolean),
  public.tdg_admin_moderate(uuid, text, timestamptz, text),
  public.tdg_admin_delete_forever(uuid),
  public.tdg_core_tiers(),
  public.tdg_sub_statuses(),
  public.mak_known_tiers(),
  public.mak_known_themes()
from public, authenticated;

grant execute on function
  public.tdg_admin_accounts(text, uuid, integer),
  public.tdg_admin_overview(),
  public.tdg_admin_events(uuid, integer),
  public.tdg_admin_audit(uuid, text, integer),
  public.tdg_admin_catalog(),
  public.tdg_admin_set_admin(uuid, boolean),
  public.tdg_admin_set_profile(uuid, text, text, text, boolean, boolean),
  public.tdg_admin_set_core_subscription(uuid, text, text),
  public.tdg_admin_set_mak_subscription(uuid, text, text),
  public.tdg_admin_set_mak_theme(uuid, text, boolean),
  public.tdg_admin_set_mak_flag(uuid, text, boolean),
  public.tdg_admin_set_pack(uuid, text, text, boolean),
  public.tdg_admin_moderate(uuid, text, timestamptz, text),
  public.tdg_admin_delete_forever(uuid)
to authenticated;

commit;
