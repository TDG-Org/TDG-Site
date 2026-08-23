-- ═══════════════════════════════════════════════════════════════════════════
--  TDG Core Developer Console · the app registry, discovered rather than typed
--  Applied 2026-08-23 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS CHANGES, IN ONE LINE
--  Nothing in the console names an app any more. It asks the database which
--  apps exist and renders one Store panel per answer.
--
--  WHY
--  Before this, adding a TDG app that sells anything meant editing six places:
--  the `returns table` of tdg_admin_accounts, the `returns table` of
--  tdg_admin_overview, the union inside tdg_admin_events, the object inside
--  tdg_admin_catalog, the `v_app not in (...)` guard and both if/else arms of
--  tdg_admin_set_pack — and then five more in the site's TypeScript. Six of
--  those seven files had to agree, and the day one of them did not was the day
--  the roster said an account owned nothing while the panel granted it a pack.
--
--  Worse, none of the six failed loudly. A forgotten arm of tdg_admin_set_pack
--  raises "unknown app"; a forgotten column in tdg_admin_accounts just renders
--  an app that quietly does not exist. A console that omits a product is a
--  console you cannot trust about the products it does show.
--
--  HOW: CONVENTION, NOT CONFIGURATION
--  Every TDG app that sells packs already has to create one table to sell
--  anything at all:
--
--      public.<app>_entitlements (user_id uuid, owned_packs text[],
--                                 stripe_customer_id text, …)
--
--  That table IS the registration. `tdg_store_apps()` below scans the catalogue
--  for it, and everything else here reads that one function. Create the table a
--  new app needs anyway and the console grows a panel for it: the dropdown, the
--  per-account tiles, the overview count, the ledger, the pack grant and the
--  audit line, all of them, with no SQL and no TypeScript written for that app.
--
--  There is deliberately NO registry table to maintain. A row somebody has to
--  remember to insert is the same class of bug as a column somebody has to
--  remember to add; it is just one line shorter. The two optional refinements
--  an app can offer are also discovered:
--
--    · public.<app>_known_packs()  → the list the grant tiles offer, and the
--      list granting is checked against. Absent, and the console accepts any
--      well-formed pack id, because an app on its first day has no list yet and
--      a console that cannot grant is worse than one that cannot spell-check.
--    · public.<app>_purchase_events → its money ledger, joined into Purchases.
--      Absent, and grants still work; they simply do not appear in the merged
--      ledger, which the console says out loud rather than implying by silence.
--    · an `owned_packs`-bearing table may also carry a `grants jsonb` column
--      (veditor_entitlements does, for its subscription packs). Where it
--      exists, the console reads it and can say a pack is rented and when it
--      lapses. Where it does not, every pack reads as held outright, which is
--      what a table without that column means.
--
--  WHAT IS NOT DISCOVERED, AND WHY
--  Makullveny. Its entitlements are a tier ladder plus a theme list plus two
--  timestamp flags in `mak_subscriptions`, which is a different SHAPE, not a
--  different app of the same shape. Discovery here is for the pack-store shape
--  only, and Makullveny keeps the bespoke panel it needs. `tdg_admin_events`
--  still unions its ledger in, because money is money.
--
--  IS THIS SAFE, GIVEN THE DYNAMIC SQL?
--  Every identifier interpolated below comes from pg_catalog / the
--  information_schema — that is, from names Postgres itself is holding — and
--  goes through format('%I'). Nothing a caller types is ever concatenated into
--  a statement: `p_app` is matched against the discovered list and the ROW's
--  own table name is what gets used, and `p_pack` travels as a bound parameter.
--
--  WHAT A DEPLOYED BROWSER SEES
--  tdg_admin_accounts and tdg_admin_overview change their `returns table`, so
--  they are dropped and recreated rather than replaced. Both are called only by
--  src/dev/ on this site — Bible Educator uses the `bea_admin_*` family — so
--  the blast radius is one page used by two people. A console left open in a
--  tab across this migration reads `undefined` for the columns that moved and
--  wants a reload. That is the cost, it is paid once, and it buys the end of
--  the six-places problem.

begin;

-- ── 0 · the registry ───────────────────────────────────────────────────────

--  Every app with a pack store, found by looking.
--
--  The shape test is deliberately strict — all three of user_id uuid,
--  owned_packs text[] and stripe_customer_id text — so that a table which
--  merely ends in `_entitlements` cannot half-join the console and render a
--  panel whose switches fail on contact. A table either matches the pattern the
--  writes below assume, or it is not an app.
--
--  Views are excluded on purpose (relkind r / p only). `veditor_entitlements_live`
--  is a view over `veditor_entitlements` that adds `now()`, and counting it
--  would give TDG Veditor two panels, two overview counts and a ledger joined
--  to itself.
--
--  Not granted to anybody. It is read through tdg_admin_catalog(), which checks
--  is_admin first, and from inside the SECURITY DEFINER functions here.
create or replace function public.tdg_store_apps()
returns table (
  app_id             text,
  entitlements_table text,
  events_table       text,
  known_packs        text[],
  has_grants         boolean
)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  r        record;
  v_packs  text[];
begin
  for r in
    select c.relname::text as ent,
           regexp_replace(c.relname::text, '_entitlements$', '') as app
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname like '%\_entitlements'
      and (
        select count(*) from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          and (
            (a.attname = 'user_id'            and a.atttypid = 'uuid'::regtype)  or
            (a.attname = 'owned_packs'        and a.atttypid = 'text[]'::regtype) or
            (a.attname = 'stripe_customer_id' and a.atttypid = 'text'::regtype)
          )
      ) = 3
    order by 2
  loop
    app_id             := r.app;
    entitlements_table := r.ent;

    --  Its ledger, if it keeps one.
    select c.relname::text into events_table
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname = r.app || '_purchase_events';

    --  Its pack list, if it publishes one. A zero-argument function returning
    --  text[], by the same naming convention veditor_known_packs() already set.
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = r.app || '_known_packs'
         and p.pronargs = 0 and p.prorettype = 'text[]'::regtype
    ) then
      execute format('select public.%I()', r.app || '_known_packs') into v_packs;
      known_packs := coalesce(v_packs, '{}'::text[]);
    else
      known_packs := '{}'::text[];
    end if;

    --  Does it record HOW a pack is held? veditor_entitlements does, because
    --  its Pro Export Pack is a subscription and "Owned" is not the whole truth
    --  about a thing that can lapse.
    has_grants := exists (
      select 1 from pg_attribute a
       where a.attrelid = (quote_ident('public') || '.' || quote_ident(r.ent))::regclass
         and a.attname = 'grants' and a.atttypid = 'jsonb'::regtype
         and a.attnum > 0 and not a.attisdropped
    );

    return next;
  end loop;
end;
$$;
revoke all on function public.tdg_store_apps() from public;


-- ── 1 · the catalog now names the apps ─────────────────────────────────────

--  `apps` replaces the old `veditor_packs` / `devfleet_packs` keys. Those two
--  named their apps in the payload, which meant the site had to know both names
--  to read it, which is the whole thing this migration removes. The console
--  renders one panel per entry here, in this order, and prints an app it has no
--  copy for rather than dropping it.
create or replace function public.tdg_admin_catalog()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  perform public.tdg_admin_uid();
  return jsonb_build_object(
    'core_tiers', to_jsonb(public.tdg_core_tiers()),
    'statuses',   to_jsonb(public.tdg_sub_statuses()),
    'mak_tiers',  to_jsonb(public.mak_known_tiers()),
    'mak_themes', to_jsonb(public.mak_known_themes()),
    'apps', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id',                 a.app_id,
                'entitlements_table', a.entitlements_table,
                'events_table',       a.events_table,
                'packs',              to_jsonb(a.known_packs),
                'has_grants',         a.has_grants)
              order by a.app_id)
         from public.tdg_store_apps() a),
      '[]'::jsonb)
  );
end;
$$;


-- ── 2 · one account, across however many apps there are ────────────────────

--  The four per-app columns become one `store` object, keyed by app id:
--
--    {"devfleet": {"packs": [],          "stripe_customer_id": null, "grants": {}},
--     "veditor":  {"packs": ["themes"],  "stripe_customer_id": "cus_…",
--                  "grants": {"themes": {"kind": "perpetual", …}}}}
--
--  Built by adding one left join per discovered app and merging one
--  jsonb_build_object per app onto an empty object, so it stays ONE query for
--  the whole roster rather than a lookup per row per app.
drop function if exists public.tdg_admin_accounts(text, uuid, integer);

create function public.tdg_admin_accounts(
  p_q        text    default '',
  p_target   uuid    default null,
  p_max_rows integer default 200
)
returns table (
  user_id                  uuid,
  email                    text,
  username                 text,
  display_name             text,
  bio                      text,
  recovery_email           text,
  is_admin                 boolean,
  public_profile           boolean,
  public_friend_list       boolean,
  created_at               timestamptz,
  updated_at               timestamptz,
  username_changed_at      timestamptz,
  last_sign_in_at          timestamptz,
  email_confirmed_at       timestamptz,
  auth_banned_until        timestamptz,
  status                   text,
  ban_until                timestamptz,
  hidden_by_admin          boolean,
  hidden_until             timestamptz,
  deleted_by_admin         boolean,
  deleted_at               timestamptz,
  friend_count             integer,
  streak_current           integer,
  streak_longest           integer,
  streak_total             integer,
  core_tier                text,
  core_status              text,
  core_stripe_customer_id  text,
  core_renewed_at          timestamptz,
  core_row_count           integer,
  mak_tier                 text,
  mak_status               text,
  mak_themes               text[],
  mak_candle_purchased_at  timestamptz,
  mak_support_badge_at     timestamptz,
  mak_period_end           timestamptz,
  mak_cancel_at_period_end boolean,
  mak_stripe_customer_id   text,
  store                    jsonb
)
language plpgsql stable security definer set search_path to 'public', 'auth'
as $$
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
  -- A leading @ is how a human writes a username; nobody stores one.
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
      '{}'::jsonb %s
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.bea_profile_state st on st.user_id = p.user_id
    left join public.bea_streaks       sk on sk.user_id = p.user_id
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
$$;


-- ── 3 · the numbers, per app ───────────────────────────────────────────────

--  `veditor_owners` and `devfleet_owners` become `store_owners`, an object of
--  app id → how many accounts own at least one of its packs. `gross_cents`
--  sums every discovered ledger plus Makullveny's, so a new app's takings are
--  in the headline total the day its first payment lands.
drop function if exists public.tdg_admin_overview();

create function public.tdg_admin_overview()
returns table (
  accounts     integer,
  developers   integer,
  suspended    integer,
  hidden       integer,
  soft_deleted integer,
  unconfirmed  integer,
  new_7d       integer,
  new_30d      integer,
  active_7d    integer,
  core_paid    integer,
  mak_paid     integer,
  store_owners jsonb,
  gross_cents  bigint
)
language plpgsql stable security definer set search_path to 'public', 'auth'
as $$
declare
  r        record;
  v_n      bigint;
  v_owners jsonb  := '{}'::jsonb;
  v_gross  bigint := 0;
begin
  perform public.tdg_admin_uid();

  for r in select * from public.tdg_store_apps() loop
    execute format(
      'select count(*) from public.%I e where coalesce(array_length(e.owned_packs, 1), 0) > 0',
      r.entitlements_table) into v_n;
    v_owners := v_owners || jsonb_build_object(r.app_id, v_n);

    if r.events_table is not null then
      execute format('select coalesce(sum(e.amount_cents), 0)::bigint from public.%I e',
                     r.events_table) into v_n;
      v_gross := v_gross + v_n;
    end if;
  end loop;

  select coalesce(sum(e.amount_cents), 0)::bigint into v_n
    from public.mak_subscription_events e;
  v_gross := v_gross + v_n;

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
    v_owners,
    v_gross;
end;
$$;


-- ── 4 · the merged ledger, over however many ledgers there are ─────────────

--  Same shape as before, same three-column meaning; the union is assembled from
--  the registry instead of being typed out. Makullveny is appended by hand
--  because its ledger is tier-shaped, not pack-shaped: `tier` is what goes in
--  the `item` column the console prints.
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
declare
  r       record;
  v_union text := '';
  v_sql   text;
begin
  perform public.tdg_admin_uid();

  for r in select * from public.tdg_store_apps() where events_table is not null loop
    v_union := v_union || format(
      $u$ %s select e.created_at as at, %L::text as source, e.event_type, e.user_id,
                    e.pack as item, e.amount_cents, e.currency,
                    e.stripe_event_id as event_id
             from public.%I e $u$,
      case when v_union = '' then '' else 'union all' end, r.app_id, r.events_table);
  end loop;

  v_union := v_union || format(
    $u$ %s select e.created_at as at, 'makullveny'::text as source, e.event_type, e.user_id,
                  e.tier as item, e.amount_cents, e.currency,
                  e.stripe_event_id as event_id
           from public.mak_subscription_events e $u$,
    case when v_union = '' then '' else 'union all' end);

  v_sql := format($q$
    with ledger as ( %s )
    select l.at, l.source, l.event_type, l.user_id,
           coalesce(pr.display_name, pr.username, '(no profile)'),
           l.item, l.amount_cents, l.currency, l.event_id
    from ledger l
    left join public.profiles pr on pr.user_id = l.user_id
    where $1::uuid is null or l.user_id = $1::uuid
    order by l.at desc
    limit greatest(1, least(coalesce($2, 200), 1000))
  $q$, v_union);

  return query execute v_sql using p_target, p_max_rows;
end;
$$;


-- ── 5 · granting a pack for an app nobody wrote code for ───────────────────

--  Same signature, same ledger row, same audit line. What changed is that the
--  app is looked up rather than switched on, so this works for a product that
--  did not exist when this file was written.
--
--  The known-list check keeps the asymmetry it always had — granting is held to
--  the list, REVOKING never is, so a pack retired from the list can still be
--  taken off an account that has it — and gains one more case: an app with no
--  `<app>_known_packs()` at all has no list to be held to, so a well-formed
--  pack id is accepted. That is the first day of a new app, and a console that
--  cannot grant on day one is a console somebody works around with raw SQL,
--  which is the ledger-less path this whole family of functions exists to close.
create or replace function public.tdg_admin_set_pack(
  p_target uuid, p_app text, p_pack text, p_owned boolean
)
returns text[]
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me     uuid   := public.tdg_admin_uid();
  v_app    text   := lower(btrim(coalesce(p_app, '')));
  v_pack   text   := btrim(coalesce(p_pack, ''));
  v_reg    record;
  v_before text[];
  v_after  text[];
begin
  if p_target is null or p_owned is null or v_pack = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  select * into v_reg from public.tdg_store_apps() a where a.app_id = v_app;
  if not found then
    raise exception 'tdg: no app called "%" — an app is registered by having a public.<app>_entitlements table', v_app
      using errcode = '22023';
  end if;

  --  Granting is held to the app's own list where it publishes one. Where it
  --  does not, the shape of a pack id is the only check there can be.
  if p_owned then
    if array_length(v_reg.known_packs, 1) is not null then
      if not (v_pack = any (v_reg.known_packs)) then
        raise exception 'tdg: % does not sell a pack called "%"', v_app, v_pack
          using errcode = '22023';
      end if;
    elsif v_pack !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
      raise exception 'tdg: a pack id is 2-48 characters, lowercase letters, numbers, - and _'
        using errcode = '22023';
    end if;
  end if;

  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  execute format('insert into public.%I (user_id) values ($1) on conflict (user_id) do nothing',
                 v_reg.entitlements_table)
    using p_target;

  execute format(
    'select coalesce(e.owned_packs, ''{}''::text[]) from public.%I e where e.user_id = $1 for update',
    v_reg.entitlements_table)
    into v_before using p_target;
  v_before := coalesce(v_before, '{}'::text[]);

  if p_owned then
    v_after := case when v_pack = any (v_before) then v_before else v_before || v_pack end;
  else
    v_after := array_remove(v_before, v_pack);
  end if;
  v_after := (select coalesce(array_agg(x order by x), '{}'::text[]) from unnest(v_after) as x);

  execute format('update public.%I e set owned_packs = $1, updated_at = now() where e.user_id = $2',
                 v_reg.entitlements_table)
    using v_after, p_target;

  if v_after is distinct from v_before then
    if v_reg.events_table is not null then
      execute format(
        'insert into public.%I (stripe_event_id, event_type, user_id, pack) values ($1, $2, $3, $4)',
        v_reg.events_table)
        using 'admin:' || gen_random_uuid()::text,
              v_app || (case when p_owned then '.admin.grant' else '.admin.revoke' end),
              p_target, v_pack;
    end if;
    perform public.tdg_admin_log(
      p_target,
      case when p_owned then 'grant-pack' else 'revoke-pack' end,
      v_app || ':' || v_pack);
  end if;

  perform v_me;
  return v_after;
end;
$$;


-- ── 6 · grants ─────────────────────────────────────────────────────────────
--  The two dropped functions lost theirs with them. tdg_store_apps() is
--  deliberately not granted: it is reached through tdg_admin_catalog(), which
--  checks is_admin, and from inside the definers above.

revoke all on function
  public.tdg_admin_accounts(text, uuid, integer),
  public.tdg_admin_overview()
from public;

grant execute on function
  public.tdg_admin_accounts(text, uuid, integer),
  public.tdg_admin_overview()
to authenticated;

commit;
