--  ═══════════════════════════════════════════════════════════════════════
--  TDG Cloud moves its BYTES to Backblaze B2. Supabase keeps the brain.
--  ═══════════════════════════════════════════════════════════════════════
--
--  Why: at $0.021/GB-month + $0.09/GB egress, a subscriber who actually
--  used their whole allowance cost more to host than either plan charged.
--  The rule is now PROFIT AT 100% UTILIZATION, both cadences, and B2's
--  $0.006/GB-month with a free egress band (3× stored) is what makes that
--  arithmetic close while the plans stay fair — Standard even grows to
--  250 GB, more than the giants give at $2.99.
--
--  What moves and what stays:
--    stays  — every table, every gate, every verb: `tdg_cloud_begin_upload`
--             is still the only door, quota/retention/revocation are still
--             decided in Postgres, `tdg_cloud_files`/`_usage` still carry
--             the accounting, `tdg_cloud_begin_download` still meters.
--    moves  — the bytes live in the private B2 bucket `TDG-Cloud-Backblaze`.
--             Clients never hold a B2 credential: the `cloud-storage` Edge
--             Function checks the reservation, then hands out S3-presigned
--             URLs scoped to one exact object and a short expiry, and lands
--             the accounting through `tdg_cloud_account_upsert/remove` when
--             the transfer really happened. Client↔B2 is direct both ways,
--             so hosted traffic never counts as Supabase egress either.
--    goes   — the `tdg-cloud` Storage bucket, its four RLS policies, and
--             the two `storage.objects` triggers. Nothing lands there any
--             more, and a half-alive parallel write path would be a bug
--             factory, so it is removed rather than left dormant.
--
--  The B2 credential itself is stored in Supabase Vault (encrypted at
--  rest), written and read ONLY through the two service_role functions
--  below. It is installed by the one-shot `cloud-b2-install` function so
--  the key material travels machine→Vault without passing through anything
--  else; rotating it is one more call of the same installer.

-- ── 1 · the credential, in Vault, behind service_role ─────────────────────

create or replace function public.tdg_cloud_b2_store(p_key_id text, p_app_key text)
returns void
language plpgsql security definer
set search_path to 'public', 'vault'
as $$
begin
  if coalesce(btrim(p_key_id), '') = '' or coalesce(btrim(p_app_key), '') = '' then
    raise exception 'tdg: bad credential' using errcode = '22023';
  end if;
  delete from vault.secrets where name in ('tdg_cloud_b2_key_id', 'tdg_cloud_b2_app_key');
  perform vault.create_secret(p_key_id, 'tdg_cloud_b2_key_id',
    'Backblaze B2 application key id for the TDG Cloud bucket (bucket-scoped).');
  perform vault.create_secret(p_app_key, 'tdg_cloud_b2_app_key',
    'Backblaze B2 application key for the TDG Cloud bucket (bucket-scoped).');
end;
$$;
revoke all on function public.tdg_cloud_b2_store(text, text) from public, anon, authenticated;
grant execute on function public.tdg_cloud_b2_store(text, text) to service_role;

create or replace function public.tdg_cloud_b2_credentials()
returns jsonb
language sql stable security definer
set search_path to 'public', 'vault'
as $$
  select jsonb_build_object(
    'key_id',  (select decrypted_secret from vault.decrypted_secrets where name = 'tdg_cloud_b2_key_id'),
    'app_key', (select decrypted_secret from vault.decrypted_secrets where name = 'tdg_cloud_b2_app_key')
  );
$$;
revoke all on function public.tdg_cloud_b2_credentials() from public, anon, authenticated;
grant execute on function public.tdg_cloud_b2_credentials() to service_role;

-- ── 2 · one whole-account remove, so delete-all is one call ───────────────

--  `cloud-storage` deletes the account's objects from B2 in batches, then
--  settles the books with this single verb instead of one round trip per
--  file. Reservations go too — a promise to upload into a store the person
--  just emptied is not worth keeping.
create or replace function public.tdg_cloud_account_remove_all(p_uid uuid)
returns void
language sql security definer
set search_path to 'public'
as $$
  delete from public.tdg_cloud_files        f where f.user_id = p_uid;
  delete from public.tdg_cloud_usage        u where u.user_id = p_uid;
  delete from public.tdg_cloud_reservations r where r.user_id = p_uid;
$$;
revoke all on function public.tdg_cloud_account_remove_all(uuid) from public, anon, authenticated;
grant execute on function public.tdg_cloud_account_remove_all(uuid) to service_role;

-- ── 3 · retire the Supabase Storage write path ────────────────────────────

drop trigger if exists tdg_cloud_object_guard  on storage.objects;
drop trigger if exists tdg_cloud_object_change on storage.objects;
drop function if exists public.tdg_cloud_object_guard();
drop function if exists public.tdg_cloud_object_change();
drop function if exists public.tdg_cloud_parse_name(text);

drop policy if exists tdg_cloud_objects_select on storage.objects;
drop policy if exists tdg_cloud_objects_insert on storage.objects;
drop policy if exists tdg_cloud_objects_update on storage.objects;
drop policy if exists tdg_cloud_objects_delete on storage.objects;

--  The bucket is empty (nothing ever launched). The platform may refuse the
--  row delete; an empty refused bucket costs nothing and is simply noted.
do $$
begin
  delete from storage.buckets where id = 'tdg-cloud';
exception when others then
  raise notice 'tdg-cloud bucket row kept (platform refused: %)', sqlerrm;
end;
$$;

-- ── 4 · the repair verb re-derives from the catalogue now ─────────────────

--  With the bytes in B2, `tdg_cloud_files` IS the row of record — written
--  only by the broker after it has seen the object with its own HEAD — so a
--  recount rebuilds the per-app counters from the catalogue. (An audit of
--  catalogue-vs-B2 is `cloud-maintenance`'s job, which can actually list
--  the bucket.)
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
  select p_target, f.app, coalesce(sum(f.bytes), 0), count(*)::integer
    from public.tdg_cloud_files f
   where f.user_id = p_target
   group by f.app;

  perform public.tdg_admin_log(p_target, 'cloud-recount', null);
  return (select coalesce(jsonb_agg(jsonb_build_object('app', u.app, 'bytes', u.bytes, 'files', u.files)), '[]'::jsonb)
            from public.tdg_cloud_usage u where u.user_id = p_target);
end;
$$;

comment on table public.tdg_cloud_files is
  'The catalogue of what TDG Cloud hosts: one row per object in the B2 bucket, written only by the cloud-storage Edge Function after it has verified the object landed (HEAD) — clients never write here. meta is the client''s own annotation slot (content hash, client mtime, kind) via tdg_cloud_annotate_file; it is what makes delta sync possible without downloading. Owner read-only.';

comment on table public.tdg_cloud_usage is
  'Per-account, per-app totals over tdg_cloud_files, adjusted by tdg_cloud_account_upsert/remove in the same transaction as the catalogue row. Kept as a table so quota checks and the Account page''s breakdown are O(apps) reads; tdg_admin_cloud_recount(user) rebuilds it from the catalogue if it is ever doubted.';

-- ── 5 · the plans priced for B2: profit even at 100% utilization ──────────

--  Worst case = a subscriber storing every byte of quota from day one, after
--  Stripe's 2.9% + 30¢ and ~2% version/API overhead on B2's $6/TB-month:
--    Standard 250 GB  $2.99/mo → +$1.07 · $29.99/yr → +$0.87 per month
--    Studio     2 TB $14.99/mo → +$1.72 · $159.99/yr → +$0.38 per month
--  Annual keeps a real discount (Standard two months free; Studio $19.89)
--  without ever dipping under cost. Typical utilization sits far below the
--  cap, so realistic margin is much higher — the point of the change is
--  that the FLOOR is now above water too.
--
--  cloud-provision re-run after this migration creates the Studio prices
--  and links at the new amounts (retiring the 1299/12999 links) and writes
--  the fresh Stripe ids over the stale ones kept here.
update public.tdg_cloud_config
   set doc = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(doc,
       '{plans,standard,quota_gb}',      '250'),
       '{plans,studio,monthly_cents}',   '1499'),
       '{plans,studio,annual_cents}',    '15999'),
       '{economics}', doc->'economics' || jsonb_build_object(
         'storage_usd_per_gb_month', 0.006,
         'egress_usd_per_gb',        0.01,
         'b2_free_egress_x_stored',  3
       )),
       '{storage}', jsonb_build_object(
         'backend',    'b2',
         'bucket',     'TDG-Cloud-Backblaze',
         'bucket_id',  '9aed679876225a87ad0a021f',
         'region',     'us-west-004',
         's3_endpoint','https://s3.us-west-004.backblazeb2.com'
       )),
       updated_at = now();
