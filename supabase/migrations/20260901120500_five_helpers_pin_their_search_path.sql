-- ═══════════════════════════════════════════════════════════════════════════
--  Five helpers pin their search_path
--
--  Every function this family has written since 20260823235000 carries
--  `set search_path to 'public'`, and that file says why: a function that
--  resolves names through the caller's search_path can be made to call the
--  wrong thing by a schema the caller controls. Five older helpers predate
--  the rule — the four catalogue lists in 20260821090000 (`tdg_core_tiers`,
--  `tdg_sub_statuses`, `mak_known_tiers`, `mak_known_themes`) and
--  `tdg_protected_account` in 20260822015840. None of them is exploitable as
--  written: they are `security invoker`, `immutable`, and their bodies name no
--  relation at all. The Supabase advisor still lists all five under
--  `function_search_path_mutable`, and a rule stated as absolute that is
--  broken five times is a rule the next reader treats as optional.
--
--  `alter function … set` changes nothing about the bodies or the grants. It
--  does stop Postgres inlining these five, which for a function that returns a
--  constant array costs nothing anybody could measure.
-- ═══════════════════════════════════════════════════════════════════════════

alter function public.tdg_core_tiers() set search_path to 'public';
alter function public.tdg_sub_statuses() set search_path to 'public';
alter function public.mak_known_tiers() set search_path to 'public';
alter function public.mak_known_themes() set search_path to 'public';
alter function public.tdg_protected_account(uuid) set search_path to 'public';
