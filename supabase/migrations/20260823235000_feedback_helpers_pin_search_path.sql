-- ═══════════════════════════════════════════════════════════════════════════
--  TDG user feedback · the four helpers pin their search_path like everything
--  else in the family
--  Applied 2026-08-23 to project ddbksawvchsauiuiwvrl (tdg-core).
--  Amends 20260823170000_user_feedback.sql and
--  20260823210000_feedback_rate_limits.sql. Read those first.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT WAS WRONG
--  Every function in this family is written `security definer set search_path
--  to 'public'` — except four small ones, which were written as bare `language
--  sql immutable` and picked up whatever search_path the session happened to
--  have:
--
--    · tdg_feedback_kinds()      · tdg_feedback_statuses()   (20260823170000)
--    · tdg_feedback_limits()     · tdg_feedback_wait_words() (20260823210000)
--
--  Supabase's own security advisor flags all four as
--  `function_search_path_mutable`, and it is right to.
--
--  WHAT IT IS NOT
--  Said plainly, because the fix is worth doing and the alarm is not: this was
--  not exploitable, and nobody could have reached it. All four are SECURITY
--  INVOKER, so they run with the caller's own rights and there is no privilege
--  to escalate to. All four are revoked from `public`, `anon` and
--  `authenticated`, so no client can call them at all. And the only callers —
--  tdg_feedback_submit, _gate and _quota — are themselves `security definer set
--  search_path to 'public'`, which means the path was already pinned to
--  `public` by the time any of these four ran.
--
--  WHY DO IT ANYWAY
--  The pin is the only thing keeping that true, and nothing in the file says
--  so. A fifth caller added tomorrow — a trigger, a view, a function somebody
--  forgets to pin — inherits whatever path it was called with, and
--  `tdg_feedback_limits()` deciding a rate limit against a shadowed
--  `jsonb_build_object` is a boundary quietly reading the wrong numbers. Four
--  functions out of a family of fifteen being the exception is also how the
--  next person learns the exception is allowed. One clause each; there is no
--  reason for the family to be inconsistent about it.
--
--  THE COST, SO IT IS NOT A SURPRISE
--  A SQL function carrying a SET clause cannot be inlined by the planner, so
--  these four become real calls rather than being folded into the query around
--  them. That matters for a function in an index expression or a hot join
--  predicate. It does not matter here: the four are called a handful of times
--  per submit, against a table read by user_id, and none of them touches a row.
--
--  WHAT IS UNCHANGED
--  Every body byte-for-byte — verified against `prosrc` in the live project
--  before this was written, not just against the files — every volatility
--  marker, every signature, and the grants, which are restated for the reason
--  the rest of this family restates them. The only new text is the SET clause
--  on four lines.

begin;

-- ── the two vocabularies (from 20260823170000) ─────────────────────────────

create or replace function public.tdg_feedback_kinds()
returns text[] language sql immutable set search_path to 'public' as $$
  select array['bug', 'suggestion', 'question', 'praise', 'other']::text[];
$$;

create or replace function public.tdg_feedback_statuses()
returns text[] language sql immutable set search_path to 'public' as $$
  select array['new', 'seen', 'replied', 'resolved']::text[];
$$;

-- ── the numbers and the words (from 20260823210000) ────────────────────────

create or replace function public.tdg_feedback_limits()
returns jsonb language sql immutable set search_path to 'public' as $$
  select jsonb_build_object(
    'cooldown_seconds', 60,
    'per_hour',          5,
    'per_day',          10,
    'dedupe_minutes',   10
  );
$$;

create or replace function public.tdg_feedback_wait_words(p_seconds integer)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when s < 60   then s::text || case when s = 1 then ' second' else ' seconds' end
    when s < 5400 then m::text || case when m = 1 then ' minute' else ' minutes' end
    else               h::text || case when h = 1 then ' hour'   else ' hours'   end
  end
  from (
    select greatest(1, coalesce(p_seconds, 0))                                  as s,
           greatest(1, (greatest(1, coalesce(p_seconds, 0)) + 59) / 60)         as m,
           greatest(1, (greatest(1, coalesce(p_seconds, 0)) + 3599) / 3600)     as h
  ) t;
$$;

-- ── grants ─────────────────────────────────────────────────────────────────
--  All four stay internal. CREATE OR REPLACE keeps the existing grants, and
--  these are restated for the same reason the rest of the family restates
--  them — except here the risk runs the other way: a helper that quietly
--  became callable is a number a client could read straight out of the
--  database instead of being told by tdg_feedback_quota().

revoke all on function
  public.tdg_feedback_kinds(),
  public.tdg_feedback_statuses(),
  public.tdg_feedback_limits(),
  public.tdg_feedback_wait_words(integer)
from public, anon, authenticated;

commit;
