-- ═══════════════════════════════════════════════════════════════════════════
--  Cloud bookkeeping holds its own line
--
--  Five things, all in Postgres because rule 12 puts the boundary there and a
--  TypeScript comparison one hop out is not a boundary. Found in a read-only
--  review of the storage broker and the Cloud SQL, each proven on the live
--  project in a rolled-back block before this file was applied.
--
--  1. `tdg_cloud_account_upsert` REQUIRES the reservation it books against.
--     It booked whatever `cloud-storage` handed it, and the broker only
--     compared the object to a reservation it could find: cancel the
--     reservation (or let it expire and be reaped by any later begin), PUT a
--     4 GiB body to a presigned URL that bounds nothing, then finish — the
--     size guard was skipped on a `NaN` and the bytes were booked. Now a
--     finish with no reservation is refused (`TDGC5`) unless the catalogue
--     already holds exactly these bytes, which is a retry of a finish that
--     landed — the one honest reason for that shape — and a finish larger
--     than its reservation is refused (`TDGC3`) here as well as in the
--     broker.
--
--  2. Reservations count NET of the file they replace, in the three reads
--     that sum them (`tdg_cloud_write_gate`, `tdg_cloud_status`,
--     `tdg_admin_cloud_account`). `tdg_cloud_begin_upload` already asks the
--     gate only for the DIFFERENCE when a file is overwritten, but the
--     reservation row stores the FULL size, and the sums read the rows — so
--     re-syncing a 100 GB file on a 250 GB plan holding 240 GB showed
--     used 240 / reserved 100 / free 0, the meter drew 340 GB in a 250 GB
--     track, and a second app's 5 GB upload was refused as full with 10 GB
--     genuinely free.
--
--  3. `tdg_cloud_plan_of.lapsed_at` has an anchor when no subscription ever
--     ran. It came only from a subscription grant's period end, so a
--     developer whose perpetual test grant was reset, or any gifted account
--     later reset, read `null` — and every reader then counted retention
--     from `now()`, so the printed deadline moved every day and
--     `purge_ready` was never true. The fallback is when the grants last
--     changed (`cloud_entitlements.updated_at`), then when the hosted bytes
--     last changed (`tdg_cloud_usage.updated_at`); the retention report and
--     the maintenance arm inherit it.
--
--  4. `cloud_user_for_subscription(text)` — service-role only — answers
--     "whose subscription is this" from the grants in one indexed-shaped
--     query, replacing the webhook's read of EVERY `cloud_entitlements` row,
--     which PostgREST caps at 1000: the 1001st subscriber's renewal would
--     have found nobody and been dismissed as a sibling app's.
--
--  5. `cloud_user_exists(uuid)` — service-role only — is the one question
--     the webhook needs to ask about a `client_reference_id` it did not
--     mint: a buyer who edits the buy URL to `hello`, or a deleted account,
--     used to turn into a 500 that Stripe retried for three days with no
--     ledger row written. `service_role` has no SELECT on `profiles`
--     (deliberately), so the answer is a function, like `tdg_cloud_is_developer`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · the booking primitive refuses what nothing promised ───────────────
create or replace function public.tdg_cloud_account_upsert(p_uid uuid, p_app text, p_path text, p_bytes bigint)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_old  bigint;
  v_had  boolean;
  v_res  bigint;
  v_meta jsonb;
begin
  select f.bytes into v_old
    from public.tdg_cloud_files f
   where f.user_id = p_uid and f.app = p_app and f.path = p_path;
  v_had := found;

  --  The reservation is the only key. Any expiry counts: the broker HEADs
  --  the object and finishes within the presigned URL's own life, and a
  --  reservation that has merely aged is still the promise that was made.
  --  One that was cancelled, or reaped, is gone — and so is the promise.
  select r.bytes into v_res
    from public.tdg_cloud_reservations r
   where r.user_id = p_uid and r.app = p_app and r.path = p_path;
  if not found then
    --  A finish that already booked, retried after a dropped answer: the row
    --  holds exactly these bytes, so there is nothing to do and no reason to
    --  refuse. Anything else at this size is an object nothing promised
    --  space for.
    if v_had and v_old = p_bytes then
      return;
    end if;
    raise exception 'tdg: no reservation stands behind this upload — begin it again'
      using errcode = 'TDGC5';
  end if;
  if p_bytes > v_res then
    raise exception 'tdg: the upload is larger than its reservation, so it is not booked'
      using errcode = 'TDGC3';
  end if;

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

  --  The upload this reservation promised has landed — at whatever size,
  --  zero included. Its slot goes back, and the annotations it carried land
  --  on the catalogue row.
  delete from public.tdg_cloud_reservations r
   where r.user_id = p_uid and r.app = p_app and r.path = p_path
   returning r.meta into v_meta;
  if v_meta is not null and v_meta <> '{}'::jsonb then
    update public.tdg_cloud_files f
       set meta = f.meta || v_meta
     where f.user_id = p_uid and f.app = p_app and f.path = p_path;
  end if;
end;
$$;

-- ── 3 · the plan, with an anchor for retention that is never `now()` ──────
create or replace function public.tdg_cloud_plan_of(p_user uuid)
returns table(pack text, quota_bytes bigint, in_force boolean, lapsed_at timestamptz)
language plpgsql
stable security definer
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

  if in_force then
    foreach v_pack in array v_held loop
      v_best := coalesce((v_doc #>> array['plans', v_pack, 'quota_gb'])::numeric, 0);
      if pack is null or v_best > v_gb then
        pack := v_pack;
        v_gb := v_best;
      end if;
    end loop;
  end if;

  v_over := (v_doc #>> array['limits', 'quota_override_gb', p_user::text])::numeric;
  if v_over is not null and v_over > v_gb then v_gb := v_over; end if;

  quota_bytes := (v_gb * 1073741824)::bigint;

  --  When did the LAST plan run out? The latest period end across every
  --  subscription grant, which is the anchor retention counts from. An
  --  account that never held a subscription — a perpetual grant since reset,
  --  a tester whose door was shut — anchors on the moment its grants last
  --  changed, and failing that on the moment its hosted bytes last changed.
  --  Never null while there is something to count from, because every reader
  --  falls back to `now()` for null, and a deadline counted from `now()` is
  --  one that moves every time it is read.
  if not in_force then
    select max((entry->>'currentPeriodEnd')::timestamptz) into lapsed_at
      from jsonb_each(v_grants) as g(k, entry)
     where entry->>'kind' = 'subscription'
       and entry->>'currentPeriodEnd' is not null;
    if lapsed_at is null then
      select e.updated_at into lapsed_at
        from public.cloud_entitlements e where e.user_id = p_user;
    end if;
    if lapsed_at is null then
      select max(u.updated_at) into lapsed_at
        from public.tdg_cloud_usage u where u.user_id = p_user;
    end if;
  end if;

  return next;
end;
$$;

-- ── 2 · reservations net of what they replace, in the three sums ──────────
create or replace function public.tdg_cloud_write_gate(p_user uuid, p_more_bytes bigint)
returns bigint
language plpgsql
stable security definer
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
  --  A reservation over a file already hosted only asks for the growth: the
  --  bytes it replaces are counted in `v_used` already.
  select coalesce(sum(greatest(r.bytes - coalesce(f.bytes, 0), 0)), 0) into v_reserved
    from public.tdg_cloud_reservations r
    left join public.tdg_cloud_files f
      on f.user_id = r.user_id and f.app = r.app and f.path = r.path
   where r.user_id = p_user and r.expires_at > now();

  if v_used + v_reserved + greatest(p_more_bytes, 0) > v_plan.quota_bytes then
    raise exception 'tdg: that would go past this account''s % storage — Cloud is full',
      pg_size_pretty(v_plan.quota_bytes)
      using errcode = 'TDGC3';
  end if;

  return v_plan.quota_bytes;
end;
$$;

create or replace function public.tdg_cloud_status()
returns jsonb
language plpgsql
stable security definer
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
  v_allow_x   numeric := coalesce((public.tdg_cloud_config_doc() #>> '{egress,monthly_allowance_x_quota}')::numeric, 1.0);
  v_ret_days  integer := coalesce((public.tdg_cloud_config_doc() #>> '{retention,read_only_days}')::integer, 90);
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

  --  Net of the file each reservation replaces; see tdg_cloud_write_gate.
  select coalesce(sum(greatest(r.bytes - coalesce(f.bytes, 0), 0)), 0) into v_reserved
    from public.tdg_cloud_reservations r
    left join public.tdg_cloud_files f
      on f.user_id = r.user_id and f.app = r.app and f.path = r.path
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

  select e.grants -> v_plan.pack into v_grant
    from public.cloud_entitlements e where e.user_id = v_uid;

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

create or replace function public.tdg_admin_cloud_account(p_target uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_doc       jsonb   := public.tdg_cloud_config_doc();
  v_plan      record;
  v_grant     jsonb;
  v_used      bigint  := 0;
  v_files     integer := 0;
  v_reserved  bigint  := 0;
  v_per_app   jsonb   := '[]'::jsonb;
  v_egress    bigint  := 0;
  v_allow_x   numeric := coalesce((v_doc #>> '{egress,monthly_allowance_x_quota}')::numeric, 1.0);
  v_ret_days  integer := coalesce((v_doc #>> '{retention,read_only_days}')::integer, 90);
  v_deadline  timestamptz;
  v_retention jsonb;
  v_override  numeric;
begin
  perform public.tdg_admin_uid();
  if p_target is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  select * into v_plan from public.tdg_cloud_plan_of(p_target);

  select coalesce(sum(u.bytes), 0), coalesce(sum(u.files), 0),
         coalesce(jsonb_agg(jsonb_build_object('app', u.app, 'bytes', u.bytes, 'files', u.files)
                            order by u.bytes desc), '[]'::jsonb)
    into v_used, v_files, v_per_app
    from public.tdg_cloud_usage u where u.user_id = p_target;

  --  Net of the file each reservation replaces; see tdg_cloud_write_gate.
  select coalesce(sum(greatest(r.bytes - coalesce(f.bytes, 0), 0)), 0) into v_reserved
    from public.tdg_cloud_reservations r
    left join public.tdg_cloud_files f
      on f.user_id = r.user_id and f.app = r.app and f.path = r.path
   where r.user_id = p_target and r.expires_at > now();

  select coalesce(sum(e.bytes), 0) into v_egress
    from public.tdg_cloud_egress e
   where e.user_id = p_target and e.month = date_trunc('month', now())::date;

  select e.grants -> v_plan.pack into v_grant
    from public.cloud_entitlements e where e.user_id = p_target;

  if not v_plan.in_force and v_used > 0 then
    v_deadline := coalesce(v_plan.lapsed_at, now()) + make_interval(days => v_ret_days);
    v_retention := jsonb_build_object(
      'state', case when v_deadline <= now() then 'purge_eligible' else 'read_only' end,
      'lapsed_at', v_plan.lapsed_at,
      'deadline', v_deadline);
  else
    v_retention := jsonb_build_object('state', 'none');
  end if;

  v_override := (v_doc #>> array['limits', 'quota_override_gb', p_target::text])::numeric;

  return jsonb_build_object(
    'available',        coalesce((v_doc #>> '{availability,available}')::boolean, false),
    'enabled_for_them', public.tdg_cloud_enabled_for(p_target),
    'plan', case when v_plan.pack is null then null else jsonb_build_object(
      'pack',  v_plan.pack,
      'name',  v_doc #>> array['plans', v_plan.pack, 'name'],
      'grant', v_grant) end,
    'quota_bytes',      v_plan.quota_bytes,
    'quota_override_gb', v_override,
    'used_bytes',       v_used,
    'reserved_bytes',   v_reserved,
    'free_bytes',       greatest(v_plan.quota_bytes - v_used - v_reserved, 0),
    'files',            v_files,
    'per_app',          v_per_app,
    'egress',           jsonb_build_object(
      'month_bytes',     v_egress,
      'allowance_bytes', (v_plan.quota_bytes * v_allow_x)::bigint),
    'retention',        v_retention
  );
end;
$$;

-- ── 4 · whose subscription is this, without reading every row ─────────────
create or replace function public.cloud_user_for_subscription(p_subscription_id text)
returns table (user_id uuid, pack text)
language sql
stable security definer
set search_path to 'public'
as $$
  select e.user_id, g.key
    from public.cloud_entitlements e,
         jsonb_each(coalesce(e.grants, '{}'::jsonb)) as g(key, value)
   where p_subscription_id is not null
     and p_subscription_id <> ''
     and g.value ->> 'subscriptionId' = p_subscription_id
   limit 1;
$$;
comment on function public.cloud_user_for_subscription(text) is
  'Which account (and which pack) a Stripe subscription id belongs to, from the grants cloud-stripe-webhook wrote when it started. Service role only: the webhook is the one caller, and it used to read every cloud_entitlements row to answer this, which PostgREST caps at 1000 rows.';
revoke all on function public.cloud_user_for_subscription(text) from public, anon, authenticated;
grant execute on function public.cloud_user_for_subscription(text) to service_role;

-- ── 5 · is this uuid an account at all ────────────────────────────────────
create or replace function public.cloud_user_exists(p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select p_user is not null and exists (select 1 from public.profiles p where p.user_id = p_user);
$$;
comment on function public.cloud_user_exists(uuid) is
  'True when a uuid names an account. Service role only, for cloud-stripe-webhook to check a client_reference_id it did not mint before writing a grant or a ledger row against it; service_role has no SELECT on profiles, deliberately.';
revoke all on function public.cloud_user_exists(uuid) from public, anon, authenticated;
grant execute on function public.cloud_user_exists(uuid) to service_role;
