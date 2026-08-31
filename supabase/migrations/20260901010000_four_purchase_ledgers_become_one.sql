--  ═══════════════════════════════════════════════════════════════════════
--  Four purchase ledgers become one, and the four names keep working.
--  ═══════════════════════════════════════════════════════════════════════
--
--  Applied 2026-09-01.
--
--  WHY
--
--  `cloud_purchase_events`, `devfleet_purchase_events`,
--  `veditor_purchase_events` and `mak_subscription_events` were four tables
--  holding one fact — *a Stripe event granted somebody something* — in one
--  shape:
--
--      stripe_event_id, event_type, user_id, pack|tier, amount_cents,
--      currency, created_at
--
--  The only difference is that MAK calls the column `tier` instead of `pack`
--  and carries a surrogate `id` nothing reads.
--
--  Four tables for one fact is not merely untidy; the cost is written down in
--  `tdg_admin_events`, which had to build a UNION ALL in DYNAMIC SQL across
--  every app discovered by `tdg_store_apps()`, and then bolt on a hardcoded
--  fifth arm for `mak_subscription_events` because its column has a different
--  name. `tdg_admin_overview` summed gross the same way: a loop, plus MAK
--  again by hand. A fifth app would have meant a fifth table and a third
--  place to remember.
--
--  So the bytes move into `tdg_purchase_events`, keyed `(app, stripe_event_id)`
--  — the same uniqueness each table had on its own, which is what keeps each
--  app's webhook idempotency per-app exactly as it was.
--
--  THE FOUR OLD NAMES SURVIVE AS VIEWS, AND THAT IS NOT OPTIONAL
--
--  Three of those tables are written by Stripe webhooks that live in OTHER
--  REPOSITORIES — `veditor-stripe-webhook`, `devfleet-stripe-webhook` and
--  `mak-stripe-webhook`, deployed into this project from TDG Veditor,
--  DevFleet and Makullveny. This migration cannot redeploy them, and the
--  house rule from `20260828090000_tdg_privacy_and_table_merges` is explicit
--  that a table another repo's deployed build reads is not merged out from
--  under it. So each old name comes back as a view over the merged table,
--  with its original column names, and every webhook and every
--  `*_admin_*` SQL function keeps working with no change at all.
--
--  ⚠ THE TRAP, FOUND BY TESTING RATHER THAN BY READING
--
--  All four webhooks write their ledger row with
--  `Prefer: resolution=ignore-duplicates`, which PostgREST turns into
--  `INSERT ... ON CONFLICT DO NOTHING`. A Stripe retry therefore expects a
--  silent 201, and the webhooks treat a failure as "ledger write failed" and
--  move on.
--
--  A naive INSTEAD OF INSERT trigger BREAKS that. PostgREST's ON CONFLICT
--  attaches to the insert on the VIEW; the duplicate is then raised by the
--  trigger's own separate INSERT on the base table, which has no ON CONFLICT
--  of its own. Driven through real PostgREST with a real token before this
--  file was written, the second insert of the same event id came back **409
--  duplicate key**, where the table it replaced answered 201.
--
--  Hence `on conflict (app, stripe_event_id) do nothing` INSIDE
--  `tdg_purchase_events_write`. Re-driven after that change: 201, and no
--  second row. The one behaviour this does change is that a duplicate insert
--  sent WITHOUT the Prefer header now also succeeds silently instead of
--  raising 23505 — nothing in this project does that (the admin verbs mint a
--  fresh `admin:<uuid>` every time), and swallowing a repeat of an event we
--  already recorded is the answer every caller here wants anyway.
--
--  `tdg_store_apps()` HAD TO LEARN ABOUT VIEWS
--
--  It discovers each app's ledger by looking for `<app>_purchase_events`
--  among `relkind in ('r','p')` — tables and partitioned tables. Left alone,
--  every ledger would have become invisible the moment it turned into a
--  view, `events_table` would have gone null, and `tdg_admin_events` would
--  have quietly dropped every app from the ledger while still returning
--  rows. Entitlements discovery is deliberately NOT widened: those are still
--  real tables and the shape test that finds them is the registry's whole
--  point.

-- ── 1 · the one ledger ──────────────────────────────────────────────────────

create table if not exists public.tdg_purchase_events (
  id              bigint      generated always as identity primary key,
  app             text        not null,
  stripe_event_id text        not null,
  event_type      text        not null,
  user_id         uuid        references auth.users(id) on delete set null,
  item            text,
  amount_cents    integer,
  currency        text,
  created_at      timestamptz not null default now(),
  constraint tdg_purchase_events_app_event_key unique (app, stripe_event_id)
);

comment on table public.tdg_purchase_events is
  'Every Stripe event that granted somebody something, for every TDG app, in one ledger — the merge of cloud/devfleet/veditor_purchase_events and mak_subscription_events (20260901010000). `app` is the id tdg_store_apps() reports, plus ''makullveny''. `item` is the pack or tier the event granted. Unique on (app, stripe_event_id), which is each app''s own webhook idempotency key and why one Stripe event may appear once per app and no more. The four old names remain as views because three of their writers are webhooks deployed from other repositories.';

comment on column public.tdg_purchase_events.item is
  'What the event granted: a pack for cloud/devfleet/veditor, a tier for makullveny. The per-app views present it under the name that app''s own callers already use.';

create index if not exists tdg_purchase_events_user_idx    on public.tdg_purchase_events (user_id);
create index if not exists tdg_purchase_events_at_idx      on public.tdg_purchase_events (created_at desc);
create index if not exists tdg_purchase_events_app_at_idx  on public.tdg_purchase_events (app, created_at desc);

-- ── 2 · carry the rows across, and refuse to continue if any are lost ───────
--
--  ONE ROW'S user_id IS DELIBERATELY DROPPED, AND HERE IS EXACTLY WHICH.
--
--  Only two of the four tables carried `user_id references auth.users on
--  delete set null` — devfleet and mak. cloud and veditor had no constraint
--  at all, so veditor kept a uuid belonging to an account that no longer
--  exists: `dddddddd-0000-4000-8000-00000000dead`, one row, plainly a
--  hand-made test sentinel rather than a customer (the string ends "dead").
--
--  The merged ledger keeps the FK, because the erasure it buys is the
--  behaviour a privacy-minded project wants and two of the four tables
--  already had it: delete an account and the money stays recorded while the
--  person stops being named. Applying that rule to the row that predates it
--  is not data loss so much as the rule catching up — but it IS a change, so
--  it is written down here rather than left to be discovered.
--
--  Every other one of the 366 rows crosses verbatim.

insert into public.tdg_purchase_events
  (app, stripe_event_id, event_type, user_id, item, amount_cents, currency, created_at)
select x.app, x.stripe_event_id, x.event_type,
       --  Exactly what ON DELETE SET NULL would have left behind had the
       --  constraint existed when that account went.
       case when exists (select 1 from auth.users u where u.id = x.user_id)
            then x.user_id end,
       x.item, x.amount_cents, x.currency, x.created_at
from (
  select 'cloud' as app,      stripe_event_id, event_type, user_id, pack as item, amount_cents, currency, created_at
    from public.cloud_purchase_events
  union all
  select 'devfleet',   stripe_event_id, event_type, user_id, pack, amount_cents, currency, created_at
    from public.devfleet_purchase_events
  union all
  select 'veditor',    stripe_event_id, event_type, user_id, pack, amount_cents, currency, created_at
    from public.veditor_purchase_events
  union all
  select 'makullveny', stripe_event_id, event_type, user_id, tier, amount_cents, currency, created_at
    from public.mak_subscription_events
) x
on conflict (app, stripe_event_id) do nothing;

do $$
declare
  v_before bigint;
  v_after  bigint;
begin
  select (select count(*) from public.cloud_purchase_events)
       + (select count(*) from public.devfleet_purchase_events)
       + (select count(*) from public.veditor_purchase_events)
       + (select count(*) from public.mak_subscription_events)
    into v_before;
  select count(*) into v_after from public.tdg_purchase_events;
  if v_after <> v_before then
    raise exception 'tdg: the ledger copy is short — % rows in the four tables, % in the merged one', v_before, v_after;
  end if;
end $$;

-- ── 3 · the old tables go, the old names come back as views ─────────────────

drop table public.cloud_purchase_events;
drop table public.devfleet_purchase_events;
drop table public.veditor_purchase_events;
drop table public.mak_subscription_events;

create view public.cloud_purchase_events with (security_invoker = true) as
  select stripe_event_id, event_type, user_id, item as pack, amount_cents, currency, created_at
    from public.tdg_purchase_events where app = 'cloud';

create view public.devfleet_purchase_events with (security_invoker = true) as
  select stripe_event_id, event_type, user_id, item as pack, amount_cents, currency, created_at
    from public.tdg_purchase_events where app = 'devfleet';

create view public.veditor_purchase_events with (security_invoker = true) as
  select stripe_event_id, event_type, user_id, item as pack, amount_cents, currency, created_at
    from public.tdg_purchase_events where app = 'veditor';

--  MAK keeps its `id` and its `tier` spelling: the shape its own repo's
--  webhook and eight `mak_admin_*`/`tdg_admin_set_mak_*` verbs were written
--  against. Nothing reads the id; it is here so the view is the same shape
--  the table was.
create view public.mak_subscription_events with (security_invoker = true) as
  select id, stripe_event_id, event_type, user_id, item as tier, amount_cents, currency, created_at
    from public.tdg_purchase_events where app = 'makullveny';

comment on view public.cloud_purchase_events is
  'Compatibility view over public.tdg_purchase_events (app = ''cloud''). The table merged on 2026-09-01; this name is what cloud-stripe-webhook writes and tdg_store_apps() discovers.';
comment on view public.devfleet_purchase_events is
  'Compatibility view over public.tdg_purchase_events (app = ''devfleet''). Written by devfleet-stripe-webhook, which is deployed from the DevFleet repository and cannot be changed from here.';
comment on view public.veditor_purchase_events is
  'Compatibility view over public.tdg_purchase_events (app = ''veditor''). Written by veditor-stripe-webhook, which is deployed from the TDG Veditor repository and cannot be changed from here.';
comment on view public.mak_subscription_events is
  'Compatibility view over public.tdg_purchase_events (app = ''makullveny''), keeping the `tier` spelling and the unread `id`. Written by mak-stripe-webhook, deployed from the Makullveny repository.';

-- ── 4 · one writer for all four doors ──────────────────────────────────────

create or replace function public.tdg_purchase_events_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row jsonb := to_jsonb(new);
begin
  --  tg_argv[0] is the app this door belongs to, tg_argv[1] the name that
  --  door calls the granted thing ('pack' or 'tier'). One function, four
  --  triggers, so a fifth app is a CREATE TRIGGER and nothing else.
  insert into public.tdg_purchase_events
    (app, stripe_event_id, event_type, user_id, item, amount_cents, currency, created_at)
  values (
    tg_argv[0],
    v_row ->> 'stripe_event_id',
    v_row ->> 'event_type',
    nullif(v_row ->> 'user_id', '')::uuid,
    v_row ->> tg_argv[1],
    nullif(v_row ->> 'amount_cents', '')::integer,
    v_row ->> 'currency',
    coalesce(nullif(v_row ->> 'created_at', '')::timestamptz, now())
  )
  --  Not decoration. See the ⚠ paragraph at the top: without this a Stripe
  --  retry gets 409 where the table it replaced gave 201, because
  --  PostgREST's own ON CONFLICT lands on the view and never reaches here.
  on conflict (app, stripe_event_id) do nothing;
  return new;
end;
$$;

comment on function public.tdg_purchase_events_write() is
  'INSTEAD OF INSERT for the four per-app ledger views. Takes (app, item_column) as trigger arguments and swallows a duplicate event id, which is what Prefer: resolution=ignore-duplicates asked for and what the view cannot deliver on its own.';

create trigger cloud_purchase_events_write    instead of insert on public.cloud_purchase_events
  for each row execute function public.tdg_purchase_events_write('cloud', 'pack');
create trigger devfleet_purchase_events_write instead of insert on public.devfleet_purchase_events
  for each row execute function public.tdg_purchase_events_write('devfleet', 'pack');
create trigger veditor_purchase_events_write  instead of insert on public.veditor_purchase_events
  for each row execute function public.tdg_purchase_events_write('veditor', 'pack');
create trigger mak_subscription_events_write  instead of insert on public.mak_subscription_events
  for each row execute function public.tdg_purchase_events_write('makullveny', 'tier');

-- ── 5 · the same doors as before, open to exactly the same people ──────────

alter table public.tdg_purchase_events enable row level security;

--  The only reader that was ever not the service: MAK granted `authenticated`
--  SELECT behind `mak_subscription_events_admin_read USING bea_is_admin()`.
--  Reproduced verbatim, and scoped to MAK's rows so this merge does not hand
--  anybody a view of the other three apps they did not have yesterday.
create policy tdg_purchase_events_mak_admin_read on public.tdg_purchase_events
  for select to authenticated
  using (app = 'makullveny' and public.bea_is_admin());

revoke all on public.tdg_purchase_events from public, anon, authenticated;
grant select, insert on public.tdg_purchase_events to service_role;
grant select on public.tdg_purchase_events to authenticated;   -- RLS narrows it to the line above

revoke all on public.cloud_purchase_events    from public, anon, authenticated;
revoke all on public.devfleet_purchase_events from public, anon, authenticated;
revoke all on public.veditor_purchase_events  from public, anon, authenticated;
revoke all on public.mak_subscription_events  from public, anon, authenticated;

grant select, insert on public.cloud_purchase_events    to service_role;
grant select, insert on public.devfleet_purchase_events to service_role;
grant select, insert on public.veditor_purchase_events  to service_role;
grant select, insert on public.mak_subscription_events  to service_role;
grant select on public.mak_subscription_events to authenticated;

-- ── 6 · the registry finds a ledger that is now a view ─────────────────────

create or replace function public.tdg_store_apps()
returns table(app_id text, entitlements_table text, events_table text, known_packs text[], has_grants boolean)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
      --  Entitlements stay REAL TABLES on purpose: the three-column shape
      --  test below is the registry, and a view could fake it.
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

    --  'v' as well as 'r'/'p' since 20260901010000: every per-app ledger is
    --  now a view over tdg_purchase_events. Without this the lookup returns
    --  null and tdg_admin_events silently drops the app it belongs to.
    select c.relname::text into events_table
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v')
       and c.relname = r.app || '_purchase_events';

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

    has_grants := exists (
      select 1 from pg_attribute a
       where a.attrelid = (quote_ident('public') || '.' || quote_ident(r.ent))::regclass
         and a.attname = 'grants' and a.atttypid = 'jsonb'::regtype
         and a.attnum > 0 and not a.attisdropped
    );

    return next;
  end loop;
end;
$function$;

-- ── 7 · the two readers that had to know all four names, simplified ────────

--  Was: a UNION ALL assembled in dynamic SQL from tdg_store_apps(), plus a
--  hardcoded arm for mak_subscription_events because of its `tier` column.
--  Now: one ordinary query. Same columns, same order, same limits.
create or replace function public.tdg_admin_events(p_target uuid default null::uuid, p_max_rows integer default 200)
returns table(at timestamp with time zone, source text, event_type text, user_id uuid,
              who text, item text, amount_cents integer, currency text, event_id text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  perform public.tdg_admin_uid();

  return query
  select e.created_at,
         e.app,
         e.event_type,
         e.user_id,
         coalesce(pr.display_name, pr.username, '(no profile)'),
         e.item,
         e.amount_cents,
         e.currency,
         e.stripe_event_id
    from public.tdg_purchase_events e
    left join public.profiles pr on pr.user_id = e.user_id
   where p_target is null or e.user_id = p_target
   order by e.created_at desc
   limit greatest(1, least(coalesce(p_max_rows, 200), 1000));
end;
$function$;

--  Same change to gross: the per-app loop summed each ledger and then MAK was
--  added by hand afterwards. One sum over one table now covers all four.
create or replace function public.tdg_admin_overview()
returns table(accounts integer, developers integer, suspended integer, hidden integer,
              soft_deleted integer, unconfirmed integer, new_7d integer, new_30d integer,
              active_7d integer, core_paid integer, mak_paid integer, feedback_new integer,
              store_owners jsonb, gross_cents bigint)
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $function$
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
  end loop;

  select coalesce(sum(e.amount_cents), 0)::bigint into v_gross
    from public.tdg_purchase_events e;

  return query
  select
    (select count(*) from public.profiles)::integer,
    (select count(*) from public.profiles p where p.is_admin)::integer,
    (select count(*) from auth.users u
      where u.banned_until is not null and u.banned_until > now())::integer,
    (select count(*) from public.tdg_profile_state s
      where s.hidden_by_admin and (s.hidden_until is null or s.hidden_until > now()))::integer,
    (select count(*) from public.tdg_profile_state s where s.deleted_by_admin)::integer,
    (select count(*) from auth.users u where u.email_confirmed_at is null)::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '7 days')::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '30 days')::integer,
    (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '7 days')::integer,
    (select count(*) from public.subscriptions s where s.tier <> 'free')::integer,
    (select count(*) from public.mak_subscriptions m
      where m.tier <> 'free' or m.candle_purchased_at is not null
         or coalesce(array_length(m.owned_themes, 1), 0) > 0)::integer,
    (select count(*) from public.tdg_feedback f where f.status = 'new')::integer,
    v_owners,
    v_gross;
end;
$function$;
