-- ═══════════════════════════════════════════════════════════════════════════
--  TDG Cloud · the whole backend, built dormant.
--  Applied 2026-08-30 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS IS
--  Pooled account storage for every TDG app — two paid plans, one quota,
--  private Supabase Storage behind it — implemented completely and switched
--  OFF. Nothing here is reachable by an ordinary account until
--  `tdg_cloud_config`'s availability flag flips, and flipping it is the whole
--  launch. The Store shows the plans as Coming Soon in the meantime, priced
--  from this file's config rather than from anything hardcoded in a client.
--
--  THE TWO PLANS, AND WHERE THEIR NUMBERS LIVE
--  (Comment-only edit, 2026-08-30, per migrations/README's rule: the seed
--  below is the HISTORY — Studio was raised the same day, in config and
--  Stripe, to 2 TB · $12.99/mo · $129.99/yr. Read tdg_cloud_config, never
--  this file, for the current numbers.)
--  `standard` (200 GB · $2.99/mo · $29.99/yr) for ordinary app data, and
--  `studio` (1 TB · $9.99/mo · $99.99/yr) for storage-heavy work — Veditor
--  projects and media, Developer-app assets. The numbers in this paragraph are
--  a COMMENT; the authority is the `plans` object seeded into
--  `tdg_cloud_config` below, which the site, the apps and the Stripe
--  provisioner all read. Change a price there and in Stripe in the same
--  sitting; change it here only so the story stays readable.
--
--  WHY ONE QUOTA AND NOT ONE PER APP
--  Storage is what is being sold, and an account buys an amount of it, not an
--  amount per product. `tdg_cloud_usage` still counts per app — the Account
--  page's breakdown and the metrics need it — but every check is against the
--  one pooled number, so an account never hits "full in Veditor" while paying
--  for space it cannot use.
--
--  HOW OWNERSHIP WORKS — EXACTLY LIKE EVERY OTHER APP, ON PURPOSE
--  `cloud_entitlements` is registry-shaped (user_id / owned_packs /
--  stripe_customer_id / grants), so `tdg_store_apps()` discovers it and the
--  whole Developer console — the panel, the grant pickers, the overview tile,
--  the Purchases filter, the audit trail — grows a `cloud` app with no
--  TypeScript written for it. `cloud-stripe-webhook` is the ONE writer of
--  grants, the same rule every other `<app>_entitlements` keeps, and
--  `tdg-site-billing` can change or cancel a Cloud plan today because it
--  resolves apps through the registry rather than a list.
--
--  WHERE THE BYTES LIVE, AND WHO MAY TOUCH THEM
--  Bucket `tdg-cloud`, private. An object is named `<user id>/<app>/<path>`,
--  and the RLS on storage.objects lets an account read and delete under its
--  own prefix only. WRITING is narrower than owning: an insert must match a
--  live row in `tdg_cloud_reservations`, and reservations are only handed out
--  by `tdg_cloud_begin_upload`, which is where availability, entitlement,
--  retention and the quota are all checked — so "Cloud is off" and "Cloud is
--  full" are enforced in Postgres, not in whichever client happens to be
--  polite. A BEFORE trigger on storage.objects enforces the same thing again
--  underneath RLS, so a policy edited in a dashboard cannot quietly open the
--  bucket.
--
--  Reads and deletes are deliberately NOT gated on the plan: retention's whole
--  promise is that lapsing stops new writes and never strands the data, and a
--  person deleting their own bytes must always be allowed to.
--
--  WHAT COUNTS AGAINST THE QUOTA
--  Only what lands in the bucket. Apps are told (docs/cloud-app-prompt.md) to
--  sync meaningful user data and never caches, temp files, logs or anything
--  regenerable — but the SERVER-side rule is simpler and unarguable: bytes in
--  the bucket count, bytes anywhere else do not.
--
--  RETENTION — LAPSING IS READ-ONLY, NEVER A DELETE
--  When no plan is in force and hosted bytes remain, the account is read-only:
--  uploads refuse, downloads and deletes keep working, and the deadline —
--  lapse + `retention.read_only_days` — is reported by `tdg_cloud_status()` so
--  every surface can warn. Nothing in this file deletes ANYTHING on its own:
--  `tdg_admin_cloud_retention_report()` names what is past the deadline, and
--  actual purging is a deliberate act (the `cloud-maintenance` function, run
--  by a developer or a cron they chose to schedule), gated on
--  `availability.auto_purge` which ships FALSE. Resubscribing before a purge
--  simply puts the plan back in force and the read-only state derives away.
--
--  WHY THE CONFIG IS ONE JSONB ROW
--  The same reason `tdg_site_content` is: what is stored is a document of
--  knobs (plans, prices, limits, retention, egress, cost assumptions) that
--  must be editable from `#/dev` before and after launch without a migration
--  per knob. `tdg_cloud_public_config()` is the flat, identity-free
--  projection the Store reads — the THIRD function on this project granted to
--  `anon`, argued at the grant below — and everything privileged goes through
--  `tdg_admin_cloud_*`, which open with `tdg_admin_uid()` like every other
--  admin verb.
--
--  EGRESS
--  Postgres cannot see storage downloads, so egress is metered where it can
--  be: `tdg_cloud_begin_download` authorises a fetch and logs the file's size
--  into `tdg_cloud_egress`. Our own apps use that path; a raw storage read by
--  an owner still works (see above — reads are never gated), so the meter is
--  telemetry and fair-use warning, not a wall. The allowance and what to do
--  past it live in config (`egress`), defaulting to WARN.

begin;

-- ── 0 · the two packs, and what a grant means ─────────────────────────────

--  The registry's optional refinement: the list the console's grant tiles
--  offer, and what granting is checked against. Same convention as
--  veditor_known_packs().
create or replace function public.cloud_known_packs()
returns text[]
language sql immutable
as $$
  select array['standard', 'studio']::text[];
$$;

--  Which packs a grants object holds IN FORCE right now. Byte-for-byte the
--  semantics of veditor_packs_in_force, because rule 11's promise — a
--  cancelled-but-unexpired subscription keeps working, a failed card gets
--  Stripe's ~2-week retry window — is project-wide, not per app. The 14-day
--  dunning grace mirrors DUNNING_GRACE_DAYS in src/store/grant.ts.
create or replace function public.cloud_packs_in_force(p_grants jsonb)
returns text[]
language sql stable
set search_path to 'public'
as $$
  select coalesce(array_agg(pack order by pack), '{}'::text[])
    from jsonb_each(coalesce(p_grants, '{}'::jsonb)) as g(pack, entry)
   where entry->>'kind' = 'perpetual'
      or (
        entry->>'kind' = 'subscription'
        and entry->>'currentPeriodEnd' is not null
        and (
              (entry->>'status' in ('active', 'trialing')
               and (entry->>'currentPeriodEnd')::timestamptz > now())
           or (entry->>'status' in ('past_due', 'unpaid')
               and (entry->>'currentPeriodEnd')::timestamptz + interval '14 days' > now())
            )
      );
$$;

-- ── 1 · cloud_entitlements · the registry shape, so everything existing works

create table public.cloud_entitlements (
  user_id            uuid primary key references public.profiles(user_id) on delete cascade,
  owned_packs        text[] not null default '{}'::text[],
  grants             jsonb  not null default '{}'::jsonb,
  stripe_customer_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.cloud_entitlements is
  'TDG Cloud plan ownership (one row per account). owned_packs (standard/studio) is DERIVED from grants by cloud_entitlements_sync_owned through cloud_packs_in_force(), exactly the veditor pattern. Written by the cloud-stripe-webhook Edge Function via the service role key and by the tdg_admin_* pack verbs; RLS grants the owner read-only access and no direct client writes. Registry-shaped on purpose: tdg_store_apps() discovers it, which is what gives the Developer console its cloud panel for free.';

--  owned_packs is derived, never written directly — a write straight at it is
--  wiped on INSERT (this trigger runs and reads grants) and that asymmetry is
--  the bug the veditor webhook's header documents at length.
create or replace function public.cloud_entitlements_sync_owned()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.owned_packs := public.cloud_packs_in_force(new.grants);
  new.updated_at  := now();
  return new;
end;
$$;

create trigger cloud_entitlements_sync_owned
before insert or update of grants on public.cloud_entitlements
for each row execute function public.cloud_entitlements_sync_owned();

alter table public.cloud_entitlements enable row level security;

create policy cloud_entitlements_select_own
  on public.cloud_entitlements for select
  using (auth.uid() = user_id);

--  This project's default privileges hand new tables DML for authenticated
--  (measured in 20260828200000); every table below revokes it explicitly.
revoke all on public.cloud_entitlements from anon, authenticated;
grant select on public.cloud_entitlements to authenticated;
grant all on public.cloud_entitlements to service_role;

-- ── 2 · cloud_purchase_events · the money ledger ──────────────────────────

create table public.cloud_purchase_events (
  stripe_event_id text primary key,
  event_type      text not null,
  user_id         uuid,
  pack            text,
  amount_cents    integer,
  currency        text,
  created_at      timestamptz not null default now()
);

comment on table public.cloud_purchase_events is
  'Append-only ledger of everything that changed TDG Cloud ownership. Stripe deliveries are keyed by their real event id (evt_...) for webhook-retry idempotency; admin grants carry an admin:<uuid> id. Written only by the cloud-stripe-webhook Edge Function via the service role key and by the tdg_admin_* pack verbs. No client policies at all.';

alter table public.cloud_purchase_events enable row level security;
revoke all on public.cloud_purchase_events from anon, authenticated;
grant all on public.cloud_purchase_events to service_role;

--  The webhook's email fallback, service_role only for the reason veditor's
--  is: callable by a browser it would be an account-existence oracle.
create or replace function public.cloud_user_for_email(addr text)
returns uuid
language sql stable security definer
set search_path to 'public', 'auth'
as $$
  select u.id
  from auth.users u
  where coalesce(btrim(addr), '') <> ''
    and lower(u.email::text) = lower(btrim(addr))
  order by u.created_at
  limit 1;
$$;
revoke all on function public.cloud_user_for_email(text) from public, anon, authenticated;
grant execute on function public.cloud_user_for_email(text) to service_role;

-- ── 3 · tdg_cloud_config · every knob, one row ────────────────────────────

create table public.tdg_cloud_config (
  one        boolean primary key default true check (one),
  doc        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.tdg_cloud_config is
  'TDG Cloud''s central configuration: availability/launch flags, the two plans with their quotas and prices, upload limits, retention and egress policy, and the cost assumptions the metrics run on. One jsonb row for the reason tdg_site_content is one: these are knobs a developer adjusts from #/dev before and after launch, and a migration per knob would make tuning a deploy. RLS on, no client policies — tdg_cloud_public_config() is the public projection, tdg_admin_cloud_config()/_set the privileged surface.';

alter table public.tdg_cloud_config enable row level security;
revoke all on public.tdg_cloud_config from anon, authenticated;
grant all on public.tdg_cloud_config to service_role;

--  The seed. `available: false` IS the dormancy: every purchase surface and
--  every production write derives from this one value. `dev_testing: true`
--  lets developer accounts (profiles.is_admin, plus anyone listed in
--  `testers`) drive the whole path while the public answer stays Coming Soon.
--
--  Economics defaults (Supabase Pro, 2026): storage $0.021/GB-month beyond
--  100 GB included, egress $0.09/GB beyond 250 GB included, $25/mo base.
--  Stripe: 2.9% + 30¢. `tax_rate` is a conservative effective rate for CA
--  (federal + state on profit); `assumed_*` are the modelling knobs the
--  metrics use where real usage is still thin.
insert into public.tdg_cloud_config (one, doc) values (true, '{
  "availability": { "available": false, "dev_testing": true, "testers": [], "auto_purge": false },
  "plans": {
    "standard": {
      "name": "Cloud Standard",
      "tagline": "Your TDG world, on every machine. Settings, saves, documents and projects, synced.",
      "quota_gb": 200, "monthly_cents": 299, "annual_cents": 2999,
      "payment_link_monthly": null, "payment_link_annual": null,
      "stripe_product": null, "stripe_price_monthly": null, "stripe_price_annual": null
    },
    "studio": {
      "name": "Cloud Studio",
      "tagline": "Room for the heavy work: TDG Veditor projects and media, Developer builds, large assets.",
      "quota_gb": 1024, "monthly_cents": 999, "annual_cents": 9999,
      "payment_link_monthly": null, "payment_link_annual": null,
      "stripe_product": null, "stripe_price_monthly": null, "stripe_price_annual": null
    }
  },
  "limits": {
    "max_file_gb": 5, "max_files_per_account": 100000, "max_path_chars": 512,
    "reservation_ttl_minutes": 60, "max_open_reservations": 64,
    "quota_override_gb": {}
  },
  "retention": { "read_only_days": 90, "warn_days_before_purge": 14 },
  "egress": { "monthly_allowance_x_quota": 1.0, "overage_behavior": "warn" },
  "economics": {
    "storage_usd_per_gb_month": 0.021, "egress_usd_per_gb": 0.09,
    "base_plan_usd_month": 25, "base_included_storage_gb": 100, "base_included_egress_gb": 250,
    "stripe_pct": 0.029, "stripe_fixed_cents": 30, "tax_rate": 0.30,
    "assumed_avg_utilization": 0.15, "assumed_egress_x_stored": 0.15
  }
}'::jsonb);

--  The internal read every function below shares. SECURITY DEFINER because
--  the table has no client policies; revoked from clients because the full
--  document includes knobs (testers, cost assumptions) that are nobody's
--  business but ours.
create or replace function public.tdg_cloud_config_doc()
returns jsonb
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select c.doc from public.tdg_cloud_config c limit 1), '{}'::jsonb);
$$;
revoke all on function public.tdg_cloud_config_doc() from public, anon, authenticated;
grant execute on function public.tdg_cloud_config_doc() to service_role;

/*
 * The public projection, and the THIRD function on this project granted to
 * `anon` — the bar 20260826120000 set and 20260828120000 restated: no
 * parameter, no auth.uid(), no refusal to probe with, and a return value that
 * names nobody. What comes back is the Store's shelf copy — plan names,
 * quotas, prices, and whether Cloud can be bought at all — which every
 * visitor is about to be shown anyway, and which must be readable signed out
 * because the Store index is.
 *
 * The payment links are nulled while `available` is false, deliberately: a
 * deactivated Stripe link is a real URL that answers a dead page, and the one
 * thing worse than no Buy button is a Buy button that opens one.
 */
create or replace function public.tdg_cloud_public_config()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_doc  jsonb := public.tdg_cloud_config_doc();
  v_on   boolean := coalesce((v_doc #>> '{availability,available}')::boolean, false);
  v_out  jsonb := '[]'::jsonb;
  v_pack text;
  v_plan jsonb;
begin
  foreach v_pack in array public.cloud_known_packs() loop
    v_plan := v_doc #> array['plans', v_pack];
    if v_plan is null then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id',            v_pack,
      'name',          v_plan->>'name',
      'tagline',       v_plan->>'tagline',
      'quota_gb',      coalesce((v_plan->>'quota_gb')::numeric, 0),
      'monthly_cents', coalesce((v_plan->>'monthly_cents')::integer, 0),
      'annual_cents',  coalesce((v_plan->>'annual_cents')::integer, 0),
      'payment_link_monthly', case when v_on then v_plan->>'payment_link_monthly' end,
      'payment_link_annual',  case when v_on then v_plan->>'payment_link_annual' end
    ));
  end loop;

  return jsonb_build_object(
    'available', v_on,
    'plans', v_out,
    'retention_read_only_days', coalesce((v_doc #>> '{retention,read_only_days}')::integer, 90)
  );
end;
$$;
revoke all on function public.tdg_cloud_public_config() from public;
grant execute on function public.tdg_cloud_public_config() to anon, authenticated;

-- ── 4 · usage, files, reservations, sync, egress ──────────────────────────

create table public.tdg_cloud_files (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  app        text not null,
  path       text not null,
  bytes      bigint not null default 0,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, app, path)
);

comment on table public.tdg_cloud_files is
  'The catalogue of what is in the tdg-cloud bucket: one row per hosted object, maintained by the tdg_cloud_object_change trigger on storage.objects so it cannot drift from the bytes. meta is the client''s own annotation slot (content hash, client mtime, kind) written through tdg_cloud_annotate_file — it is what makes incremental/delta sync possible without downloading anything. Owner read-only; nothing here is writable by a client directly.';

create index tdg_cloud_files_user on public.tdg_cloud_files (user_id, app);

alter table public.tdg_cloud_files enable row level security;
create policy tdg_cloud_files_select_own
  on public.tdg_cloud_files for select
  using (auth.uid() = user_id);
revoke all on public.tdg_cloud_files from anon, authenticated;
grant select on public.tdg_cloud_files to authenticated;
grant all on public.tdg_cloud_files to service_role;

create table public.tdg_cloud_usage (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  app        text not null,
  bytes      bigint not null default 0,
  files      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, app)
);

comment on table public.tdg_cloud_usage is
  'Per-account, per-app totals over tdg_cloud_files, maintained by the same storage.objects trigger in the same transaction as the object row itself. Kept as a table rather than recomputed so quota checks and the Account page''s breakdown are O(apps) reads; tdg_admin_cloud_recount() rebuilds it from storage.objects if it is ever doubted. Owner read-only.';

alter table public.tdg_cloud_usage enable row level security;
create policy tdg_cloud_usage_select_own
  on public.tdg_cloud_usage for select
  using (auth.uid() = user_id);
revoke all on public.tdg_cloud_usage from anon, authenticated;
grant select on public.tdg_cloud_usage to authenticated;
grant all on public.tdg_cloud_usage to service_role;

create table public.tdg_cloud_reservations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  app        text not null,
  path       text not null,
  bytes      bigint not null default 0,
  --  The client's annotations for the file this promises (content hash,
  --  client mtime, kind), carried here until the object lands and then merged
  --  onto the file row by the storage trigger — never written to
  --  tdg_cloud_files early, because a file row for bytes that never arrived
  --  would be a catalogue lying about the bucket.
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (user_id, app, path)
);

comment on table public.tdg_cloud_reservations is
  'A promise that one upload may happen: handed out only by tdg_cloud_begin_upload after every gate (availability, plan, retention, quota) has passed, consumed by the storage trigger when the object lands, reaped when it expires. Reserved bytes count against the quota so two uploads in flight cannot both fit through the same remaining space. The storage.objects INSERT policy and the guard trigger both require a live row here, which is what makes "Cloud is off" and "Cloud is full" server decisions.';

alter table public.tdg_cloud_reservations enable row level security;
create policy tdg_cloud_reservations_select_own
  on public.tdg_cloud_reservations for select
  using (auth.uid() = user_id);
revoke all on public.tdg_cloud_reservations from anon, authenticated;
grant select on public.tdg_cloud_reservations to authenticated;
grant all on public.tdg_cloud_reservations to service_role;

create table public.tdg_cloud_sync_state (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  app        text not null,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, app),
  constraint tdg_cloud_sync_state_size check (pg_column_size(state) <= 65536)
);

comment on table public.tdg_cloud_sync_state is
  'One app''s sync bookkeeping for one account: cursors, per-device high-water marks, last-synced stamps — never content, which is what the 64 kB check enforces (the same cap tdg_preferences carries, for the same reason). Owner read over RLS; written only through tdg_cloud_set_sync_state, which respects the same write gate uploads do.';

alter table public.tdg_cloud_sync_state enable row level security;
create policy tdg_cloud_sync_state_select_own
  on public.tdg_cloud_sync_state for select
  using (auth.uid() = user_id);
revoke all on public.tdg_cloud_sync_state from anon, authenticated;
grant select on public.tdg_cloud_sync_state to authenticated;
grant all on public.tdg_cloud_sync_state to service_role;

create table public.tdg_cloud_egress (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  app     text not null,
  month   date not null,
  bytes   bigint not null default 0,
  primary key (user_id, app, month)
);

comment on table public.tdg_cloud_egress is
  'Downloads metered per account, app and calendar month, written by tdg_cloud_begin_download. Telemetry and fair-use warnings, not a wall: an owner''s raw storage read still works, because retention promises reads are never gated. The allowance it is compared against is quota x egress.monthly_allowance_x_quota in config.';

alter table public.tdg_cloud_egress enable row level security;
create policy tdg_cloud_egress_select_own
  on public.tdg_cloud_egress for select
  using (auth.uid() = user_id);
revoke all on public.tdg_cloud_egress from anon, authenticated;
grant select on public.tdg_cloud_egress to authenticated;
grant all on public.tdg_cloud_egress to service_role;

create table public.tdg_cloud_metrics_daily (
  day date primary key,
  doc jsonb not null
);

comment on table public.tdg_cloud_metrics_daily is
  'One snapshot of the headline Cloud numbers per day, upserted whenever tdg_admin_cloud_metrics() runs — a lazy snapshot rather than a cron, so growth curves exist from the first day a developer looks without any scheduler to keep alive. No client access.';

alter table public.tdg_cloud_metrics_daily enable row level security;
revoke all on public.tdg_cloud_metrics_daily from anon, authenticated;
grant all on public.tdg_cloud_metrics_daily to service_role;

-- ── 5 · the shared readings ───────────────────────────────────────────────

--  An app id here is an OPEN, shape-checked value, the same decision
--  tdg_feedback made: the seventh app must not need a migration to sync.
create or replace function public.tdg_cloud_valid_app(p_app text)
returns boolean
language sql immutable
as $$
  select coalesce(p_app, '') ~ '^[a-z0-9][a-z0-9-]{1,31}$';
$$;

--  A relative path: no leading slash, no empty or dot-dot segments, no
--  backslashes or control characters, capped by config. The object key built
--  from it is `<uid>/<app>/<path>`, so everything about who may touch it
--  hangs off the first segment being an unforgeable uuid.
create or replace function public.tdg_cloud_valid_path(p_path text, p_max integer)
returns boolean
language sql immutable
as $$
  select coalesce(p_path, '') <> ''
     and length(p_path) <= coalesce(p_max, 512)
     and p_path !~ '^[/]'
     and p_path !~ '[\\]'
     and p_path !~ '[[:cntrl:]]'
     and p_path not like '%//%'
     and not exists (
       select 1 from unnest(string_to_array(p_path, '/')) seg
        where seg in ('', '.', '..')
     );
$$;

--  May this ACCOUNT use Cloud at all right now? Launch for everybody, or the
--  developer/tester door while the public answer is still Coming Soon.
create or replace function public.tdg_cloud_enabled_for(p_user uuid)
returns boolean
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_doc jsonb := public.tdg_cloud_config_doc();
begin
  if p_user is null then return false; end if;
  if coalesce((v_doc #>> '{availability,available}')::boolean, false) then
    return true;
  end if;
  if not coalesce((v_doc #>> '{availability,dev_testing}')::boolean, false) then
    return false;
  end if;
  return exists (select 1 from public.profiles p where p.user_id = p_user and p.is_admin)
      or coalesce(v_doc #> '{availability,testers}', '[]'::jsonb) ? p_user::text;
end;
$$;
revoke all on function public.tdg_cloud_enabled_for(uuid) from public, anon, authenticated;
grant execute on function public.tdg_cloud_enabled_for(uuid) to service_role;

--  The plan an account is standing on: its best in-force pack and the pooled
--  quota that buys, plus everything the status read needs to say about
--  retention. One resolver so the upload gate, the status read and the
--  storage trigger cannot disagree about who may hold what.
create or replace function public.tdg_cloud_plan_of(p_user uuid)
returns table (
  pack         text,
  quota_bytes  bigint,
  in_force     boolean,
  lapsed_at    timestamptz
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_doc    jsonb := public.tdg_cloud_config_doc();
  v_grants jsonb := '{}'::jsonb;
  v_held   text[];
  v_gb     numeric := 0;
  v_best   numeric;
  v_over   numeric;
  v_pack   text;
begin
  select coalesce(e.grants, '{}'::jsonb) into v_grants
    from public.cloud_entitlements e where e.user_id = p_user;

  v_held := public.cloud_packs_in_force(v_grants);
  in_force := coalesce(array_length(v_held, 1), 0) > 0;
  pack := null;

  --  The BIGGEST quota wins when both packs are somehow in force at once (an
  --  upgrade mid-period, an admin grant beside a subscription).
  if in_force then
    foreach v_pack in array v_held loop
      v_best := coalesce((v_doc #>> array['plans', v_pack, 'quota_gb'])::numeric, 0);
      if pack is null or v_best > v_gb then
        pack := v_pack;
        v_gb := v_best;
      end if;
    end loop;
  end if;

  --  A per-account bump a developer wrote into config (support, a gift).
  v_over := (v_doc #>> array['limits', 'quota_override_gb', p_user::text])::numeric;
  if v_over is not null and v_over > v_gb then v_gb := v_over; end if;

  quota_bytes := (v_gb * 1073741824)::bigint;

  --  When did the LAST plan run out? The latest period end across every
  --  subscription grant — the anchor retention counts from. Null while a plan
  --  is in force or the account never had one.
  if not in_force then
    select max((entry->>'currentPeriodEnd')::timestamptz) into lapsed_at
      from jsonb_each(v_grants) as g(k, entry)
     where entry->>'kind' = 'subscription'
       and entry->>'currentPeriodEnd' is not null;
  end if;

  return next;
end;
$$;
revoke all on function public.tdg_cloud_plan_of(uuid) from public, anon, authenticated;
grant execute on function public.tdg_cloud_plan_of(uuid) to service_role;

--  Everything an account and its apps need to know about their Cloud, in one
--  round trip. Authenticated, self only — the uuid comes from the token and
--  never from a parameter.
create or replace function public.tdg_cloud_status()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_uid       uuid  := auth.uid();
  v_doc       jsonb := public.tdg_cloud_config_doc();
  v_available boolean := coalesce((v_doc #>> '{availability,available}')::boolean, false);
  v_enabled   boolean;
  v_plan      record;
  v_grant     jsonb;
  v_used      bigint := 0;
  v_files     integer := 0;
  v_reserved  bigint := 0;
  v_per_app   jsonb := '[]'::jsonb;
  v_egress    bigint := 0;
  v_allow_x   numeric := coalesce((v_doc #>> '{egress,monthly_allowance_x_quota}')::numeric, 1.0);
  v_ret_days  integer := coalesce((v_doc #>> '{retention,read_only_days}')::integer, 90);
  v_retention jsonb;
  v_revoked   jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_deadline  timestamptz;
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;

  v_enabled := public.tdg_cloud_enabled_for(v_uid);
  select * into v_plan from public.tdg_cloud_plan_of(v_uid);

  select coalesce(sum(u.bytes), 0), coalesce(sum(u.files), 0),
         coalesce(jsonb_agg(jsonb_build_object('app', u.app, 'bytes', u.bytes, 'files', u.files)
                            order by u.bytes desc), '[]'::jsonb)
    into v_used, v_files, v_per_app
    from public.tdg_cloud_usage u where u.user_id = v_uid;

  select coalesce(sum(r.bytes), 0) into v_reserved
    from public.tdg_cloud_reservations r
   where r.user_id = v_uid and r.expires_at > now();

  select coalesce(sum(e.bytes), 0) into v_egress
    from public.tdg_cloud_egress e
   where e.user_id = v_uid and e.month = date_trunc('month', now())::date;

  select to_jsonb(r) into v_revoked from (
    select t.pack, t.reason, t.created_at
      from public.tdg_product_revocations t
     where t.user_id = v_uid and t.app = 'cloud'
     order by case when t.pack = '*' then 0 else 1 end
     limit 1
  ) r;

  --  The grant behind the plan, verbatim, so a client prints the standing with
  --  the same words the Store card uses (src/store/grant.ts reads this shape).
  select e.grants -> v_plan.pack into v_grant
    from public.cloud_entitlements e where e.user_id = v_uid;

  --  Retention is DERIVED, never stored: a resubscription puts the plan back
  --  in force and this whole object evaporates on the next read.
  if not v_plan.in_force and v_used > 0 then
    v_deadline := coalesce(v_plan.lapsed_at, now()) + make_interval(days => v_ret_days);
    v_retention := jsonb_build_object(
      'state', case when v_deadline <= now() then 'purge_eligible' else 'read_only' end,
      'lapsed_at', v_plan.lapsed_at,
      'deadline', v_deadline
    );
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'kind', case when v_deadline <= now() then 'retention_expired' else 'retention' end,
      'deadline', v_deadline));
  else
    v_retention := jsonb_build_object('state', 'none');
  end if;

  if v_plan.quota_bytes > 0 then
    if v_used >= v_plan.quota_bytes then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('kind', 'quota_full'));
    elsif v_used >= (v_plan.quota_bytes * 0.95)::bigint then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('kind', 'quota_critical'));
    elsif v_used >= (v_plan.quota_bytes * 0.80)::bigint then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('kind', 'quota_high'));
    end if;
    if v_egress > (v_plan.quota_bytes * v_allow_x)::bigint then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('kind', 'egress_over'));
    end if;
  end if;

  return jsonb_build_object(
    'available',        v_available,
    'enabled_for_you',  v_enabled,
    'testing',          v_enabled and not v_available,
    'plan', case when v_plan.pack is null then null else jsonb_build_object(
      'pack',  v_plan.pack,
      'name',  v_doc #>> array['plans', v_plan.pack, 'name'],
      'grant', v_grant
    ) end,
    'quota_bytes',      v_plan.quota_bytes,
    'used_bytes',       v_used,
    'reserved_bytes',   v_reserved,
    'free_bytes',       greatest(v_plan.quota_bytes - v_used - v_reserved, 0),
    'files',            v_files,
    'per_app',          v_per_app,
    'egress',           jsonb_build_object(
      'month_bytes',     v_egress,
      'allowance_bytes', (v_plan.quota_bytes * v_allow_x)::bigint,
      'behavior',        coalesce(v_doc #>> '{egress,overage_behavior}', 'warn')
    ),
    'retention',        v_retention,
    'revoked',          v_revoked,
    'warnings',         v_warnings
  );
end;
$$;
revoke all on function public.tdg_cloud_status() from public, anon;
grant execute on function public.tdg_cloud_status() to authenticated;

-- ── 6 · the write gate, and the upload/download verbs ─────────────────────

--  Why an upload may not happen, as ONE decision everything shares. Raises
--  with a distinct message per refusal so each surface can say the true
--  sentence; returns the quota headroom when it may.
create or replace function public.tdg_cloud_write_gate(p_user uuid, p_more_bytes bigint)
returns bigint  -- the pooled quota, for callers that want to report it
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_plan     record;
  v_used     bigint := 0;
  v_reserved bigint := 0;
begin
  if not public.tdg_cloud_enabled_for(p_user) then
    raise exception 'tdg: TDG Cloud is not available yet' using errcode = 'TDGC1';
  end if;

  if exists (select 1 from public.tdg_product_revocations r
              where r.user_id = p_user and r.app = 'cloud') then
    raise exception 'tdg: TDG Cloud is not available on this account' using errcode = '42501';
  end if;

  select * into v_plan from public.tdg_cloud_plan_of(p_user);
  if not v_plan.in_force then
    raise exception 'tdg: no Cloud plan is in force on this account — hosted data is read-only'
      using errcode = 'TDGC2';
  end if;

  select coalesce(sum(u.bytes), 0) into v_used
    from public.tdg_cloud_usage u where u.user_id = p_user;
  select coalesce(sum(r.bytes), 0) into v_reserved
    from public.tdg_cloud_reservations r
   where r.user_id = p_user and r.expires_at > now();

  if v_used + v_reserved + greatest(p_more_bytes, 0) > v_plan.quota_bytes then
    raise exception 'tdg: that would go past this account''s % storage — Cloud is full',
      pg_size_pretty(v_plan.quota_bytes)
      using errcode = 'TDGC3';
  end if;

  return v_plan.quota_bytes;
end;
$$;
revoke all on function public.tdg_cloud_write_gate(uuid, bigint) from public, anon, authenticated;
grant execute on function public.tdg_cloud_write_gate(uuid, bigint) to service_role;

/*
 * Ask to upload one file. This is where every rule is enforced — the
 * reservation it hands back is the ONLY key that opens the bucket for an
 * insert, so a client that skips this function has skipped nothing.
 *
 * Re-reserving the same (app, path) replaces the old reservation rather than
 * stacking a second: an interrupted upload retried a minute later is the
 * ordinary case, and it must not eat quota twice.
 */
create or replace function public.tdg_cloud_begin_upload(
  p_app text, p_path text, p_bytes bigint, p_meta jsonb default null
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid  := auth.uid();
  v_doc   jsonb := public.tdg_cloud_config_doc();
  v_max_f bigint  := (coalesce((v_doc #>> '{limits,max_file_gb}')::numeric, 5) * 1073741824)::bigint;
  v_max_n integer := coalesce((v_doc #>> '{limits,max_files_per_account}')::integer, 100000);
  v_ttl   integer := coalesce((v_doc #>> '{limits,reservation_ttl_minutes}')::integer, 60);
  v_open  integer;
  v_files integer;
  v_quota bigint;
  v_id    uuid;
  v_ends  timestamptz;
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  if not public.tdg_cloud_valid_app(p_app) then
    raise exception 'tdg: bad app id' using errcode = '22023';
  end if;
  if not public.tdg_cloud_valid_path(p_path, coalesce((v_doc #>> '{limits,max_path_chars}')::integer, 512)) then
    raise exception 'tdg: bad path' using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes < 0 or p_bytes > v_max_f then
    raise exception 'tdg: a Cloud file is at most %', pg_size_pretty(v_max_f)
      using errcode = '22023';
  end if;

  --  Expired promises are reaped here, opportunistically, because this is the
  --  one moment their space is being asked for again.
  delete from public.tdg_cloud_reservations r
   where r.user_id = v_uid and r.expires_at <= now();

  select count(*)::integer into v_open
    from public.tdg_cloud_reservations r where r.user_id = v_uid;
  if v_open >= coalesce((v_doc #>> '{limits,max_open_reservations}')::integer, 64) then
    raise exception 'tdg: too many uploads in flight — finish or cancel some first'
      using errcode = 'TDGC4';
  end if;

  select coalesce(sum(u.files), 0) into v_files
    from public.tdg_cloud_usage u where u.user_id = v_uid;
  if v_files >= v_max_n then
    raise exception 'tdg: this account is at its % hosted-file limit', v_max_n
      using errcode = 'TDGC4';
  end if;

  --  Replacing an existing file only needs the DIFFERENCE, or a full disk
  --  could never overwrite a file with a smaller one.
  v_quota := public.tdg_cloud_write_gate(
    v_uid,
    greatest(p_bytes, 0) - coalesce((select f.bytes from public.tdg_cloud_files f
                                      where f.user_id = v_uid and f.app = p_app and f.path = p_path), 0)
  );

  if p_meta is not null and (jsonb_typeof(p_meta) <> 'object' or pg_column_size(p_meta) > 8192) then
    raise exception 'tdg: bad meta' using errcode = '22023';
  end if;

  v_ends := now() + make_interval(mins => v_ttl);
  insert into public.tdg_cloud_reservations as r (user_id, app, path, bytes, meta, expires_at)
  values (v_uid, p_app, p_path, p_bytes, coalesce(p_meta, '{}'::jsonb), v_ends)
  on conflict (user_id, app, path)
  do update set bytes = excluded.bytes, meta = excluded.meta,
                created_at = now(), expires_at = excluded.expires_at
  returning r.id into v_id;

  return jsonb_build_object(
    'reservation_id', v_id,
    'object_path',    v_uid::text || '/' || p_app || '/' || p_path,
    'expires_at',     v_ends,
    'quota_bytes',    v_quota
  );
end;
$$;
revoke all on function public.tdg_cloud_begin_upload(text, text, bigint, jsonb) from public, anon;
grant execute on function public.tdg_cloud_begin_upload(text, text, bigint, jsonb) to authenticated;

create or replace function public.tdg_cloud_cancel_upload(p_id uuid)
returns void
language sql security definer
set search_path to 'public'
as $$
  delete from public.tdg_cloud_reservations r
   where r.id = p_id and r.user_id = auth.uid();
$$;
revoke all on function public.tdg_cloud_cancel_upload(uuid) from public, anon;
grant execute on function public.tdg_cloud_cancel_upload(uuid) to authenticated;

/*
 * Authorise and meter one download. Reads are never refused for a lapsed plan
 * — that is retention's promise — and only ever for an account Cloud has
 * never been enabled for, which cannot have bytes here anyway. What this adds
 * over a raw storage read is the egress ledger row, which is why the apps use
 * it: fair-use warnings and the cost telemetry both hang off that.
 */
create or replace function public.tdg_cloud_begin_download(p_app text, p_path text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_bytes bigint;
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;

  select f.bytes into v_bytes
    from public.tdg_cloud_files f
   where f.user_id = v_uid and f.app = p_app and f.path = p_path;
  if v_bytes is null then
    raise exception 'tdg: no such hosted file' using errcode = '02000';
  end if;

  insert into public.tdg_cloud_egress (user_id, app, month, bytes)
  values (v_uid, p_app, date_trunc('month', now())::date, v_bytes)
  on conflict (user_id, app, month)
  do update set bytes = public.tdg_cloud_egress.bytes + excluded.bytes;

  return jsonb_build_object(
    'object_path', v_uid::text || '/' || p_app || '/' || p_path,
    'bytes',       v_bytes
  );
end;
$$;
revoke all on function public.tdg_cloud_begin_download(text, text) from public, anon;
grant execute on function public.tdg_cloud_begin_download(text, text) to authenticated;

--  The client's own facts about a hosted file — content hash, client mtime,
--  kind — merged into meta so delta sync can compare without downloading.
--  Annotating is a WRITE about hosted data, so it passes the same gate.
create or replace function public.tdg_cloud_annotate_file(p_app text, p_path text, p_meta jsonb)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' or pg_column_size(p_meta) > 8192 then
    raise exception 'tdg: bad meta' using errcode = '22023';
  end if;
  perform public.tdg_cloud_write_gate(v_uid, 0);
  update public.tdg_cloud_files f
     set meta = f.meta || p_meta, updated_at = now()
   where f.user_id = v_uid and f.app = p_app and f.path = p_path;
  if not found then
    raise exception 'tdg: no such hosted file' using errcode = '02000';
  end if;
end;
$$;
revoke all on function public.tdg_cloud_annotate_file(text, text, jsonb) from public, anon;
grant execute on function public.tdg_cloud_annotate_file(text, text, jsonb) to authenticated;

create or replace function public.tdg_cloud_set_sync_state(p_app text, p_state jsonb)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  if not public.tdg_cloud_valid_app(p_app) then
    raise exception 'tdg: bad app id' using errcode = '22023';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'tdg: bad state' using errcode = '22023';
  end if;
  perform public.tdg_cloud_write_gate(v_uid, 0);
  insert into public.tdg_cloud_sync_state (user_id, app, state)
  values (v_uid, p_app, p_state)
  on conflict (user_id, app)
  do update set state = excluded.state, updated_at = now();
end;
$$;
revoke all on function public.tdg_cloud_set_sync_state(text, jsonb) from public, anon;
grant execute on function public.tdg_cloud_set_sync_state(text, jsonb) to authenticated;

-- ── 7 · the bucket, its policies, and the accounting triggers ─────────────

--  Private, with the per-object cap enforced by Storage itself as well as by
--  begin_upload (5 GiB — keep in step with limits.max_file_gb).
insert into storage.buckets (id, name, public, file_size_limit)
values ('tdg-cloud', 'tdg-cloud', false, 5368709120)
on conflict (id) do nothing;

--  Owner-only, by the unforgeable first path segment. Reads and deletes are
--  plan-independent (retention's promise); inserts and updates additionally
--  need a live reservation, which is where every launch/plan/quota rule
--  already ran.
create policy tdg_cloud_objects_select
  on storage.objects for select
  using (bucket_id = 'tdg-cloud' and split_part(name, '/', 1) = auth.uid()::text);

create policy tdg_cloud_objects_insert
  on storage.objects for insert
  with check (
    bucket_id = 'tdg-cloud'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from public.tdg_cloud_reservations r
       where r.user_id = auth.uid()
         and name = r.user_id::text || '/' || r.app || '/' || r.path
         and r.expires_at > now()
    )
  );

create policy tdg_cloud_objects_update
  on storage.objects for update
  using (bucket_id = 'tdg-cloud' and split_part(name, '/', 1) = auth.uid()::text)
  with check (
    bucket_id = 'tdg-cloud'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from public.tdg_cloud_reservations r
       where r.user_id = auth.uid()
         and name = r.user_id::text || '/' || r.app || '/' || r.path
         and r.expires_at > now()
    )
  );

create policy tdg_cloud_objects_delete
  on storage.objects for delete
  using (bucket_id = 'tdg-cloud' and split_part(name, '/', 1) = auth.uid()::text);

/*
 * The guard UNDER the policy. RLS is the client boundary; this refuses a
 * reservation-less insert whatever role makes it, so a policy widened in a
 * dashboard, or a service-role write from a function that forgot the rules,
 * still cannot put unaccounted bytes in the bucket. Storage's own internals
 * (multipart bookkeeping, metadata finalise) arrive as UPDATEs on the row it
 * inserted, so only INSERT is guarded.
 */
create or replace function public.tdg_cloud_object_guard()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid;
  v_app  text;
  v_path text;
begin
  if new.bucket_id <> 'tdg-cloud' then return new; end if;

  v_uid  := nullif(split_part(new.name, '/', 1), '')::uuid;
  v_app  := nullif(split_part(new.name, '/', 2), '');
  v_path := nullif(substr(new.name, length(split_part(new.name, '/', 1)) + length(split_part(new.name, '/', 2)) + 3), '');

  if v_uid is null or v_app is null or v_path is null then
    raise exception 'tdg: a tdg-cloud object is named <account>/<app>/<path>';
  end if;

  if not exists (
    select 1 from public.tdg_cloud_reservations r
     where r.user_id = v_uid and r.app = v_app and r.path = v_path
       and r.expires_at > now()
  ) then
    raise exception 'tdg: no upload reservation for this path — ask tdg_cloud_begin_upload first';
  end if;

  return new;
exception
  when invalid_text_representation then
    raise exception 'tdg: a tdg-cloud object is named <account>/<app>/<path>';
end;
$$;

create trigger tdg_cloud_object_guard
before insert on storage.objects
for each row execute function public.tdg_cloud_object_guard();

/*
 * The accounting, in the same transaction as the bytes. INSERT and metadata
 * UPDATEs upsert the file row (Storage writes the row first and lands the
 * real size in a follow-up update, so both must be handled); DELETE takes the
 * file row and its usage with it. The reservation is consumed the first time
 * a real size lands. Everything is delta-based against the file row, so an
 * overwrite adjusts by the difference and two racing deliveries cannot
 * double-count.
 */
--  `<uid>/<app>/<path>` split into its three parts, or nulls for a name that
--  is not that shape — shared by both halves of the accounting.
create or replace function public.tdg_cloud_parse_name(p_name text)
returns table (uid uuid, app text, path text)
language plpgsql immutable
as $$
begin
  begin
    uid := nullif(split_part(p_name, '/', 1), '')::uuid;
  exception when invalid_text_representation then
    uid := null;
  end;
  app  := nullif(split_part(p_name, '/', 2), '');
  path := nullif(substr(p_name, length(split_part(p_name, '/', 1)) + length(split_part(p_name, '/', 2)) + 3), '');
  return next;
end;
$$;

--  One hosted file stopped existing at this identity: drop its row, give its
--  bytes back to the usage counters.
create or replace function public.tdg_cloud_account_remove(p_uid uuid, p_app text, p_path text)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_old bigint;
begin
  delete from public.tdg_cloud_files f
   where f.user_id = p_uid and f.app = p_app and f.path = p_path
   returning f.bytes into v_old;
  if found then
    update public.tdg_cloud_usage u
       set bytes = greatest(u.bytes - coalesce(v_old, 0), 0),
           files = greatest(u.files - 1, 0),
           updated_at = now()
     where u.user_id = p_uid and u.app = p_app;
  end if;
end;
$$;

--  One hosted file exists at this identity with this many bytes: upsert its
--  row, adjust the counters by the difference, and consume the reservation
--  that promised it (merging the client meta the reservation carried).
create or replace function public.tdg_cloud_account_upsert(p_uid uuid, p_app text, p_path text, p_bytes bigint)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_old  bigint;
  v_had  boolean;
  v_meta jsonb;
begin
  select f.bytes into v_old
    from public.tdg_cloud_files f
   where f.user_id = p_uid and f.app = p_app and f.path = p_path;
  v_had := found;

  insert into public.tdg_cloud_files (user_id, app, path, bytes)
  values (p_uid, p_app, p_path, p_bytes)
  on conflict (user_id, app, path)
  do update set bytes = excluded.bytes, updated_at = now();

  insert into public.tdg_cloud_usage (user_id, app, bytes, files)
  values (p_uid, p_app, 0, 0)
  on conflict (user_id, app) do nothing;

  update public.tdg_cloud_usage u
     set bytes = greatest(u.bytes + p_bytes - coalesce(v_old, 0), 0),
         files = u.files + (case when v_had then 0 else 1 end),
         updated_at = now()
   where u.user_id = p_uid and u.app = p_app;

  --  The upload this reservation promised has landed. Its space goes back,
  --  and the annotations it carried land on the catalogue row.
  if p_bytes > 0 then
    delete from public.tdg_cloud_reservations r
     where r.user_id = p_uid and r.app = p_app and r.path = p_path
     returning r.meta into v_meta;
    if v_meta is not null and v_meta <> '{}'::jsonb then
      update public.tdg_cloud_files f
         set meta = f.meta || v_meta
       where f.user_id = p_uid and f.app = p_app and f.path = p_path;
    end if;
  end if;
end;
$$;

create or replace function public.tdg_cloud_object_change()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_new record;
  v_old record;
begin
  --  Explicit branches per operation, because OLD does not exist in an INSERT
  --  trigger and NEW does not exist in a DELETE one — touching the missing
  --  record raises, and a raising trigger here would take real uploads down.

  if tg_op = 'DELETE' then
    if old.bucket_id = 'tdg-cloud' then
      select * into v_old from public.tdg_cloud_parse_name(old.name);
      if v_old.uid is not null and v_old.app is not null and v_old.path is not null then
        perform public.tdg_cloud_account_remove(v_old.uid, v_old.app, v_old.path);
      end if;
    end if;
    return old;
  end if;

  if new.bucket_id <> 'tdg-cloud' then return new; end if;
  select * into v_new from public.tdg_cloud_parse_name(new.name);

  if tg_op = 'UPDATE' then
    --  A move is a departure from the old identity plus an arrival at the new.
    if old.name is distinct from new.name then
      select * into v_old from public.tdg_cloud_parse_name(old.name);
      if v_old.uid is not null and v_old.app is not null and v_old.path is not null then
        perform public.tdg_cloud_account_remove(v_old.uid, v_old.app, v_old.path);
      end if;
    /*
     * Storage writes the object row FIRST and lands the real size in a
     * follow-up metadata update. An in-place UPDATE that carries no size yet
     * is that half-moment, and writing a zero over the counters for it would
     * make every overwrite dip the account's usage for a beat — so it is
     * left alone. (A move's arrival, above, is recorded at any size: the
     * file exists there now whatever the metadata says yet.)
     */
    elsif new.metadata ->> 'size' is null then
      return new;
    end if;
  end if;

  if v_new.uid is not null and v_new.app is not null and v_new.path is not null then
    perform public.tdg_cloud_account_upsert(
      v_new.uid, v_new.app, v_new.path,
      coalesce((new.metadata ->> 'size')::bigint, 0));
  end if;
  return new;
end;
$$;

create trigger tdg_cloud_object_change
after insert or update or delete on storage.objects
for each row execute function public.tdg_cloud_object_change();

-- ── 8 · the admin surface ─────────────────────────────────────────────────

create or replace function public.tdg_admin_cloud_config()
returns table (doc jsonb, updated_at timestamptz, updated_by uuid, updated_by_name text)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  perform public.tdg_admin_uid();
  return query
  select c.doc, c.updated_at, c.updated_by,
         (select coalesce(p.display_name, p.username) from public.profiles p
           where p.user_id = c.updated_by)
    from public.tdg_cloud_config c;
end;
$$;
revoke all on function public.tdg_admin_cloud_config() from public, anon;
grant execute on function public.tdg_admin_cloud_config() to authenticated;

/*
 * The whole document is replaced, the way tdg_admin_site_content_set replaces
 * its document: what is being edited IS one document, and a per-key verb
 * would be a migration per knob, which is the thing the table exists to
 * avoid. The checks are the ones that keep the rest of this file coherent —
 * both known plans present with sane numbers — not a schema: an extra key a
 * newer console writes must not be refused by an older migration.
 */
create or replace function public.tdg_admin_cloud_config_set(p_doc jsonb, p_note text default null)
returns timestamptz
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_me   uuid := public.tdg_admin_uid();
  v_pack text;
  v_plan jsonb;
  v_at   timestamptz;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or pg_column_size(p_doc) > 65536 then
    raise exception 'tdg: bad config document' using errcode = '22023';
  end if;

  foreach v_pack in array public.cloud_known_packs() loop
    v_plan := p_doc #> array['plans', v_pack];
    if v_plan is null or jsonb_typeof(v_plan) <> 'object' then
      raise exception 'tdg: config must keep a plans.% object', v_pack using errcode = '22023';
    end if;
    if coalesce((v_plan->>'quota_gb')::numeric, 0) <= 0
       or coalesce((v_plan->>'monthly_cents')::integer, 0) <= 0
       or coalesce((v_plan->>'annual_cents')::integer, 0) <= 0 then
      raise exception 'tdg: plans.% needs a positive quota_gb, monthly_cents and annual_cents', v_pack
        using errcode = '22023';
    end if;
  end loop;

  update public.tdg_cloud_config
     set doc = p_doc, updated_at = now(), updated_by = v_me
   returning updated_at into v_at;

  perform public.tdg_admin_log(
    v_me, 'cloud-config',
    coalesce(nullif(btrim(coalesce(p_note, '')), ''),
             'available=' || coalesce(p_doc #>> '{availability,available}', 'false')));
  return v_at;
end;
$$;
revoke all on function public.tdg_admin_cloud_config_set(jsonb, text) from public, anon;
grant execute on function public.tdg_admin_cloud_config_set(jsonb, text) to authenticated;

--  Rebuild one account's counters from the objects themselves — the repair
--  verb for a doubted number, and the proof the trigger accounting can always
--  be re-derived from the source of truth.
create or replace function public.tdg_admin_cloud_recount(p_target uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_me uuid := public.tdg_admin_uid();
begin
  if p_target is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  delete from public.tdg_cloud_usage u where u.user_id = p_target;
  insert into public.tdg_cloud_usage (user_id, app, bytes, files)
  select p_target, split_part(o.name, '/', 2),
         coalesce(sum((o.metadata ->> 'size')::bigint), 0),
         count(*)::integer
    from storage.objects o
   where o.bucket_id = 'tdg-cloud'
     and split_part(o.name, '/', 1) = p_target::text
   group by 2;

  perform public.tdg_admin_log(p_target, 'cloud-recount', null);
  return (select coalesce(jsonb_agg(jsonb_build_object('app', u.app, 'bytes', u.bytes, 'files', u.files)), '[]'::jsonb)
            from public.tdg_cloud_usage u where u.user_id = p_target);
end;
$$;
revoke all on function public.tdg_admin_cloud_recount(uuid) from public, anon;
grant execute on function public.tdg_admin_cloud_recount(uuid) to authenticated;

--  Who is past the retention deadline, and what purging them would free.
--  A REPORT, deliberately: nothing in SQL deletes hosted bytes, because a
--  storage.objects row deleted here strands the blob it points at. The
--  cloud-maintenance Edge Function is the arm that acts on this, through the
--  Storage API, and only when availability.auto_purge says it may.
create or replace function public.tdg_admin_cloud_retention_report()
returns table (
  user_id     uuid,
  username    text,
  bytes       bigint,
  files       integer,
  lapsed_at   timestamptz,
  deadline    timestamptz,
  purge_ready boolean
)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_days integer := coalesce((public.tdg_cloud_config_doc() #>> '{retention,read_only_days}')::integer, 90);
begin
  perform public.tdg_admin_uid();
  return query
  select u.user_id,
         p.username,
         sum(u.bytes)::bigint,
         sum(u.files)::integer,
         pl.lapsed_at,
         coalesce(pl.lapsed_at, now()) + make_interval(days => v_days),
         coalesce(pl.lapsed_at, now()) + make_interval(days => v_days) <= now()
    from public.tdg_cloud_usage u
    join public.profiles p on p.user_id = u.user_id
    cross join lateral public.tdg_cloud_plan_of(u.user_id) pl
   where not pl.in_force
   group by u.user_id, p.username, pl.lapsed_at
  having sum(u.bytes) > 0
   order by 6;
end;
$$;
revoke all on function public.tdg_admin_cloud_retention_report() from public, anon;
grant execute on function public.tdg_admin_cloud_retention_report() to authenticated;

/*
 * The internal economics, computed live and snapshotted as a side effect.
 *
 * Everything money-shaped keys off config.economics, so tuning an assumption
 * (Supabase's price moves, the tax picture changes) re-prices every reading
 * without touching this function. Costs are modelled MARGINALLY — what Cloud
 * adds to a Supabase bill that exists anyway — with the base plan reported
 * beside it rather than allocated, because how much of $25/mo "belongs" to
 * Cloud is a judgement the developers make with the number in front of them.
 */
create or replace function public.tdg_admin_cloud_metrics()
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_doc      jsonb := public.tdg_cloud_config_doc();
  v_eco      jsonb := coalesce(v_doc -> 'economics', '{}'::jsonb);
  v_gb       numeric := 1073741824;
  v_sub_m    integer := 0;  v_sub_a  integer := 0;  v_sub_perp integer := 0;
  v_mrr      numeric := 0;
  v_plans    jsonb := '{}'::jsonb;
  v_pack     text;
  v_n        integer;
  v_total    bigint := 0;
  v_accounts integer := 0;
  v_dist     jsonb;
  v_by_app   jsonb;
  v_heavy    jsonb;
  v_egress   bigint := 0;
  v_st_cost  numeric;
  v_eg_cost  numeric;
  v_rev_net  numeric;
  v_growth   jsonb;
  v_out      jsonb;
begin
  perform public.tdg_admin_uid();

  --  Subscribers, by plan and cadence, and the revenue they normalise to.
  for v_pack in select unnest(public.cloud_known_packs()) loop
    select count(*)::integer into v_n
      from public.cloud_entitlements e
     where v_pack = any (e.owned_packs);
    v_plans := v_plans || jsonb_build_object(v_pack, v_n);
  end loop;

  --  The cadence is read off the grant's own `plan` field, which the
  --  cloud-stripe-webhook stamps from the payment link's metadata (and keeps
  --  right across portal plan changes by mapping the live price id). A grant
  --  without one — older, or hand-made — is counted monthly, the conservative
  --  reading for revenue.
  select
    count(*) filter (where g.entry->>'kind' = 'subscription'
                       and coalesce(g.entry->>'plan', 'monthly') <> 'annual'),
    count(*) filter (where g.entry->>'kind' = 'subscription'
                       and g.entry->>'plan' = 'annual'),
    count(*) filter (where g.entry->>'kind' = 'perpetual')
    into v_sub_m, v_sub_a, v_sub_perp
    from public.cloud_entitlements e,
         lateral jsonb_each(e.grants) as g(pack, entry)
   where g.pack = any (e.owned_packs);

  --  MRR from the config prices: monthly grants at monthly_cents, annual at
  --  annual/12. Perpetual (admin/test) grants price at zero.
  select coalesce(sum(
    case
      when g.entry->>'kind' <> 'subscription' then 0
      when g.entry->>'plan' = 'annual'
        then coalesce((v_doc #>> array['plans', g.pack, 'annual_cents'])::numeric, 0) / 12
      else coalesce((v_doc #>> array['plans', g.pack, 'monthly_cents'])::numeric, 0)
    end), 0) / 100
    into v_mrr
    from public.cloud_entitlements e,
         lateral jsonb_each(e.grants) as g(pack, entry)
   where g.pack = any (e.owned_packs);

  --  Usage: the pooled totals and the distribution over accounts with bytes.
  select coalesce(sum(t.bytes), 0), count(*)::integer
    into v_total, v_accounts
    from (select u.user_id, sum(u.bytes) as bytes
            from public.tdg_cloud_usage u group by u.user_id
          having sum(u.bytes) > 0) t;

  select jsonb_build_object(
      'avg_bytes',    coalesce(avg(t.bytes), 0)::bigint,
      'median_bytes', coalesce(percentile_cont(0.5) within group (order by t.bytes), 0)::bigint,
      'p90_bytes',    coalesce(percentile_cont(0.9) within group (order by t.bytes), 0)::bigint,
      'p95_bytes',    coalesce(percentile_cont(0.95) within group (order by t.bytes), 0)::bigint,
      'p99_bytes',    coalesce(percentile_cont(0.99) within group (order by t.bytes), 0)::bigint)
    into v_dist
    from (select sum(u.bytes) as bytes from public.tdg_cloud_usage u
           group by u.user_id having sum(u.bytes) > 0) t;

  select coalesce(jsonb_agg(jsonb_build_object('app', a.app, 'bytes', a.bytes, 'files', a.files, 'accounts', a.accounts)
                            order by a.bytes desc), '[]'::jsonb)
    into v_by_app
    from (select u.app, sum(u.bytes)::bigint as bytes, sum(u.files)::integer as files,
                 count(distinct u.user_id)::integer as accounts
            from public.tdg_cloud_usage u group by u.app) a;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', h.user_id, 'username', h.username, 'bytes', h.bytes,
           'quota_bytes', h.quota_bytes,
           'share', case when h.quota_bytes > 0 then round(h.bytes::numeric / h.quota_bytes, 3) end)
           order by h.bytes desc), '[]'::jsonb)
    into v_heavy
    from (select u.user_id, p.username, sum(u.bytes)::bigint as bytes, pl.quota_bytes
            from public.tdg_cloud_usage u
            join public.profiles p on p.user_id = u.user_id
            cross join lateral public.tdg_cloud_plan_of(u.user_id) pl
           group by u.user_id, p.username, pl.quota_bytes
          having sum(u.bytes) > 0
           order by sum(u.bytes) desc
           limit 10) h;

  select coalesce(sum(e.bytes), 0) into v_egress
    from public.tdg_cloud_egress e
   where e.month = date_trunc('month', now())::date;

  --  Marginal infrastructure cost at today's usage, in dollars per month.
  v_st_cost := (v_total / v_gb) * coalesce((v_eco->>'storage_usd_per_gb_month')::numeric, 0.021);
  v_eg_cost := (v_egress / v_gb) * coalesce((v_eco->>'egress_usd_per_gb')::numeric, 0.09);

  --  Net revenue after Stripe: the percentage off everything, the fixed fee
  --  once per CHARGE — twelve a year for a monthly plan, one for an annual,
  --  so an annual's works out at a twelfth per month.
  v_rev_net := greatest(
    v_mrr * (1 - coalesce((v_eco->>'stripe_pct')::numeric, 0.029))
      - (v_sub_m + v_sub_a / 12.0) * coalesce((v_eco->>'stripe_fixed_cents')::numeric, 30) / 100, 0);

  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'doc', d.doc) order by d.day), '[]'::jsonb)
    into v_growth
    from (select * from public.tdg_cloud_metrics_daily order by day desc limit 90) d;

  v_out := jsonb_build_object(
    'at', now(),
    'subscribers', jsonb_build_object(
      'by_plan', v_plans,
      'monthly', v_sub_m, 'annual', v_sub_a, 'granted', v_sub_perp,
      'with_data', v_accounts),
    'revenue', jsonb_build_object(
      'mrr_usd', round(v_mrr, 2),
      'arr_usd', round(v_mrr * 12, 2),
      'net_after_stripe_usd', round(v_rev_net, 2)),
    'usage', jsonb_build_object(
      'total_bytes', v_total,
      'distribution', coalesce(v_dist, '{}'::jsonb),
      'by_app', v_by_app,
      'heavy_users', v_heavy,
      'egress_month_bytes', v_egress),
    'costs', jsonb_build_object(
      'storage_usd_month', round(v_st_cost, 2),
      'egress_usd_month', round(v_eg_cost, 2),
      'marginal_usd_month', round(v_st_cost + v_eg_cost, 2),
      'base_plan_usd_month', coalesce((v_eco->>'base_plan_usd_month')::numeric, 25),
      'per_subscriber_usd', case when v_sub_m + v_sub_a > 0
        then round((v_st_cost + v_eg_cost) / (v_sub_m + v_sub_a), 2) end),
    'margin', jsonb_build_object(
      'gross_usd_month', round(v_rev_net - v_st_cost - v_eg_cost, 2),
      'after_tax_usd_month', round((v_rev_net - v_st_cost - v_eg_cost)
        * (1 - coalesce((v_eco->>'tax_rate')::numeric, 0.30)), 2),
      'note', 'marginal: the base plan is reported beside this, not allocated into it'),
    'upgrade_advice', jsonb_build_object(
      'included_storage_gb', coalesce((v_eco->>'base_included_storage_gb')::numeric, 100),
      'included_egress_gb', coalesce((v_eco->>'base_included_egress_gb')::numeric, 250),
      'stored_gb', round(v_total / v_gb, 2),
      'egress_gb_month', round(v_egress / v_gb, 2),
      'note', 'past the included amounts every GB is already billed at the metered rates; a bigger compute tier is about request volume, not storage — revisit when Cloud accounts for sustained load'),
    'assumptions', v_eco,
    'growth', v_growth
  );

  insert into public.tdg_cloud_metrics_daily (day, doc)
  values (current_date, v_out - 'growth')
  on conflict (day) do update set doc = excluded.doc;

  return v_out;
end;
$$;
revoke all on function public.tdg_admin_cloud_metrics() from public, anon;
grant execute on function public.tdg_admin_cloud_metrics() to authenticated;

commit;
