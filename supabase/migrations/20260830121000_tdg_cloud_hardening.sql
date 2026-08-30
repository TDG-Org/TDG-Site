-- ═══════════════════════════════════════════════════════════════════════════
--  TDG Cloud · hardening the accounting primitives the advisor caught.
--  Applied 2026-08-30 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  20260830120000 revoked client execute from every INTENDED entry point and
--  forgot the plumbing: the two accounting primitives the storage triggers
--  call, the trigger functions themselves, and the name parser all kept the
--  default PUBLIC execute grant. The two primitives were the real hole —
--  SECURITY DEFINER, no auth check of their own (their caller is a trigger,
--  which IS the check), and reachable at /rest/v1/rpc/, so any signed-in
--  account could have written arbitrary usage counters or phantom file rows
--  for any uuid. Caught by the security advisor the same hour, before any
--  client shipped; nothing ever called them.
--
--  The four sql helpers also take the search_path pin, for the reason
--  20260823235000 pinned the feedback helpers: none is exploitable today —
--  every reference is schema-qualified or built-in — but the pin is the only
--  thing KEEPING that true, and unexplained exceptions teach the next reader
--  that the rule is optional.

begin;

--  The plumbing nobody may call directly. The storage triggers run these as
--  the function owner; no role needs execute on any of them.
revoke all on function public.tdg_cloud_account_remove(uuid, text, text) from public, anon, authenticated;
revoke all on function public.tdg_cloud_account_upsert(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.tdg_cloud_parse_name(text) from public, anon, authenticated;
revoke all on function public.tdg_cloud_object_change() from public, anon, authenticated;
revoke all on function public.tdg_cloud_object_guard() from public, anon, authenticated;
revoke all on function public.cloud_entitlements_sync_owned() from public, anon, authenticated;
grant execute on function public.tdg_cloud_account_remove(uuid, text, text) to service_role;
grant execute on function public.tdg_cloud_account_upsert(uuid, text, text, bigint) to service_role;

--  The pins. Bodies untouched.
alter function public.cloud_known_packs() set search_path to 'public';
alter function public.tdg_cloud_valid_app(text) set search_path to 'public';
alter function public.tdg_cloud_valid_path(text, integer) set search_path to 'public';
alter function public.tdg_cloud_parse_name(text) set search_path to 'public';

commit;
