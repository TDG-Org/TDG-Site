-- Applied 2026-08-28.
--
-- ── tdg_site_deploys_seen: the memory behind "Temporarily unavailable" ────
--
-- The site's cards learn at runtime whether each app is deployed
-- (src/live/ in TDG-Site, asking the tdg-site-deploys edge function). The
-- probe alone can only say "answers" or "404" — and a 404 is two very
-- different sentences depending on history. An app that has NEVER been live
-- is honestly "Coming soon". An app that WAS live and stopped answering —
-- taken down for a rework, unpublished by mistake — must not quietly fall
-- back to "Coming soon", because that tells a visitor who used it yesterday
-- that it never existed. The difference IS this table: one row per repo name
-- that has ever been seen answering, written by the function when a probe
-- succeeds, read by it when one fails.
--
-- Server-side rather than in the browser deliberately: localStorage memory
-- would make the answer depend on who is asking — a returning visitor would
-- see "temporarily unavailable" while a first-time visitor saw "coming soon"
-- for the same app at the same moment. Two visitors reading one page must
-- read one truth.
--
-- RLS is ON with no policies, the same posture as tdg_feedback and
-- tdg_account_badges: no client reads this table and no client writes it.
-- The only writer and the only reader is the edge function through
-- service_role, and everything a visitor may learn from it arrives already
-- folded into the function's own answer.
--
-- The name is stored lowercase and shape-checked with the same alphabet the
-- function enforces on its input, so a row cannot exist that the function
-- could never have written.

create table public.tdg_site_deploys_seen (
  -- The repo name, lowercased: 'bible-educator'. Case folds because GitHub
  -- Pages URLs are case-insensitive about the repo segment and the function
  -- must not remember one site twice.
  name text primary key,
  first_live_at timestamptz not null default now(),
  last_live_at timestamptz not null default now(),
  constraint tdg_site_deploys_seen_name_shape
    check (name = lower(name) and name ~ '^[a-z0-9._-]{1,100}$')
);

comment on table public.tdg_site_deploys_seen is
  'Repo names ever seen answering on tdg-org.github.io, so the site can tell "taken down" from "never shipped". Written and read only by the tdg-site-deploys edge function.';

alter table public.tdg_site_deploys_seen enable row level security;

-- No policies on purpose: nothing but the edge function has any business
-- here, and it arrives as service_role, which bypasses RLS.
--
-- The grants below were applied straight to the project a few minutes after
-- the table, in the same sitting, and this file was corrected to match (the
-- rule in this folder's README). They exist because this project's default
-- privileges hand new tables DML for `authenticated` and almost nothing for
-- `service_role` — measured from information_schema right after CREATE:
-- service_role held only REFERENCES / TRIGGER / TRUNCATE, so the function's
-- first reads and writes were refused and its best-effort error handling
-- degraded every miss to `absent`, exactly as designed and exactly wrong.
grant select, insert, update on public.tdg_site_deploys_seen to service_role;
revoke all on public.tdg_site_deploys_seen from anon, authenticated;
