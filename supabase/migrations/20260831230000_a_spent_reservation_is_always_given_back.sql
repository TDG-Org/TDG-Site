--  ═══════════════════════════════════════════════════════════════════════
--  A spent reservation is always given back — including an empty file's.
--  ═══════════════════════════════════════════════════════════════════════
--
--  `tdg_cloud_account_upsert` clears the reservation an upload consumed, but
--  only `if p_bytes > 0`. That guard is a fossil of the Supabase Storage era:
--  the `tdg_cloud_object_change` trigger on `storage.objects` fired once when
--  the row appeared with NO size yet and again when the metadata landed, and
--  clearing the reservation on that first sizeless call would have released
--  it before the bytes were really there.
--
--  That trigger was dropped with the bucket in `20260831090000_tdg_cloud_b2`.
--  The only caller left is `cloud-storage`'s `upload-finish`, which passes a
--  size it read off B2 with its own HEAD — so `p_bytes` is now always the
--  truth, and 0 means "an empty file landed", not "we do not know yet".
--
--  Left as it was, every genuine zero-byte upload — a new empty project file,
--  an untouched log, a placeholder — books the file and then keeps holding
--  its reservation for the full 60-minute TTL. No quota is lost (the
--  reservation is 0 bytes) but each one burns one of the 64 open-reservation
--  slots, and an app that syncs empty files walks into `TDGC4 too many
--  uploads in flight` for an hour with nothing actually in flight.
--
--  Verified against the live project before this migration: a 0-byte
--  upload-begin → PUT → upload-finish round trip booked the file and left
--  `tdg_cloud_reservations` holding `probe/empty.txt` at 0 bytes.
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

--  `create or replace` keeps the grants from 20260830121000, but they are
--  restated so this file can be read on its own: the accounting primitives
--  are the service's, never a signed-in caller's.
revoke all on function public.tdg_cloud_account_upsert(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.tdg_cloud_account_upsert(uuid, text, text, bigint) to service_role;
