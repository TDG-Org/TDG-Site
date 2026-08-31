--  ═══════════════════════════════════════════════════════════════════════
--  The maintenance arm can recognise a developer.
--  ═══════════════════════════════════════════════════════════════════════
--
--  `cloud-maintenance` gates every verb on `callerAllowed`, which resolves the
--  caller's token and then asks PostgREST, as the SERVICE, whether that
--  account has `profiles.is_admin`. That read has never once succeeded:
--
--      select has_table_privilege('service_role', 'public.profiles', 'SELECT')
--      → false
--
--  `service_role` holds only REFERENCES, TRIGGER and TRUNCATE on `profiles`
--  (`anon` the same) — the deliberate stance that a table of people's names,
--  emails and recovery addresses is not something the project's own key reads
--  wholesale. Correct stance. But it meant `callerAllowed` returned false for
--  EVERY human, so `report`, `reap` and `purge` — the entire enforcement arm
--  of retention, the thing that acts when a plan lapses — could be reached by
--  nobody except a caller holding the raw service key.
--
--  Verified live before this migration: a developer account with
--  `is_admin = true`, calling `{"action":"report"}` with a valid session
--  token, got `{"error":"unauthorized"}`.
--
--  The fix is NOT to grant `service_role` a read of `profiles`. It is to give
--  it the one question it actually asks, and nothing else: is THIS uuid a
--  developer? One boolean, one uuid in, no columns out, no way to enumerate.
--  The table stays exactly as unreadable as it was.
create or replace function public.tdg_cloud_is_developer(p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles p
     where p.user_id = p_user and p.is_admin
  );
$$;

comment on function public.tdg_cloud_is_developer(uuid) is
  'Is this account a TDG developer? The narrowest possible answer, for cloud-maintenance''s admin gate: service_role cannot read profiles (by design) and does not need to — it needs one boolean about one uuid it already holds.';

--  Only the service may ask. A signed-in caller asking about SOMEBODY ELSE is
--  a probe for who the developers are, and `tdg_is_admin()` already answers
--  the only version of this question a person is entitled to: their own.
revoke all on function public.tdg_cloud_is_developer(uuid) from public, anon, authenticated;
grant execute on function public.tdg_cloud_is_developer(uuid) to service_role;
