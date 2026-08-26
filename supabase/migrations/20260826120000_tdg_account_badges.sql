-- ═══════════════════════════════════════════════════════════════════════════
--  TDG account badges · what an account IS, everywhere it signs in
--  Applied 2026-08-26 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS IS
--  One global mark on a TDG account, true in every TDG app at once: Bug
--  Hunter for the friends who go looking for what we broke, Playtester for
--  the people who saw a build before anybody else, Developer for us,
--  Subscriber for anyone on a paid plan. A badge is a fact about the ACCOUNT,
--  not about one app's progress inside it.
--
--  WHY THIS IS NOT `tdg_badges`
--  That name is taken, and by something else entirely. `public.tdg_badges` is
--  per-app ACHIEVEMENT state — `user_id, app, epoch, contributions,
--  measurements, earned` — the sibling of `devfleet_badges`, written by
--  `tdg_badge_sync()` from inside an app while somebody uses it. It has live
--  rows and nothing here touches it. Two different facts sharing one table
--  means a schema change made for one silently rewriting the other, on a
--  table an app writes every session.
--
--  WHY DERIVED BADGES ARE COMPUTED AND NEVER STORED
--  `developer` IS `profiles.is_admin`, and `subscriber` IS a paid
--  `subscriptions.tier`. Each of those already has exactly one authority, and
--  a row here repeating it would be a second opinion that goes stale the
--  moment the flag flips: take somebody's developer permission away from
--  #/dev and a stored Developer badge would go on printing until a person
--  remembered a table nobody was looking at. So the catalogue marks them
--  `derived` and every read computes them from their own source. Nothing can
--  grant one, nothing can revoke one, and there is nothing to keep in step.
--
--  WHY THE CATALOGUE IS IN SQL
--  The same reason `tdg_feedback_kinds()` is: the server must validate
--  against exactly the list the picker offered. A badge the console can
--  switch on and the database then rejects reads as "the console is broken",
--  and a catalogue written twice — once here, once in TypeScript — is a
--  catalogue that will eventually disagree with itself.
--
--  WHY THE TABLE HAS NO POLICIES
--  RLS is on and there are NO client policies at all, so the only doors are
--  the SECURITY DEFINER verbs below: the same boundary as `tdg_feedback` and
--  the entitlement tables. A signed-in account reads its own badges and
--  nothing else, and `tdg_my_badges()` deliberately takes no user id — a
--  function that answers "what does THAT account hold" is a profile-scraping
--  endpoint with a friendly name on it.
--
--  WHAT HAPPENS TO A BADGE WHEN THE ACCOUNT IS DELETED
--  ON DELETE CASCADE, which is the opposite of what `tdg_feedback` does, and
--  deliberately so. A bug report outlives its reporter because the BUG is
--  still there, so that column is SET NULL and the console prints "deleted
--  account". A badge is a sentence ABOUT an account and means nothing once
--  there is no account for it to be about, so it goes with it. `granted_by`
--  is SET NULL for a third reason again: the developer who awarded it may
--  leave, and the award stands.

begin;

-- ── 0 · the catalogue ──────────────────────────────────────────────────────
--  Every badge this project knows about, and which of them are facts the
--  database already holds. `derived = true` means it is computed from
--  something else and cannot be granted or revoked by hand; `derived = false`
--  means it is a real grant sitting in `tdg_account_badges`.
--
--  Labels are Title Case because they are names; blurbs are sentence case,
--  per AGENTS.md rule 7 — the same words the site prints, so the copy cannot
--  drift from what the server will accept.
--
--  Not granted to any client role. Both reading verbs return the catalogue
--  already joined to an account, so nothing outside this file needs to call
--  it, and the only doors opened are the ones that are used.
create or replace function public.tdg_badge_catalog()
returns table (id text, label text, blurb text, derived boolean)
language sql immutable set search_path to 'public'
as $$
  select * from (values
    ('developer',  'Developer',    'A TDG developer account.',                    true),
    ('subscriber', 'Subscriber',   'On a paid TDG plan.',                         true),
    ('bug-hunter', 'Bug Hunter',   'Found and reported a real bug in a TDG app.', false),
    ('playtester', 'Playtester',   'Played a TDG build before anyone else.',      false),
    ('supporter',  'Supporter',    'Paid for something we make.',                 false),
    ('early',      'Early Access', 'Here before the first release.',              false)
  ) as c (id, label, blurb, derived);
$$;

--  Which derived badges one account holds RIGHT NOW, read from the two
--  authorities themselves. This is the whole implementation of "derived": a
--  computed badge is a row in the catalogue above plus an arm here, and every
--  reader picks it up with no third place to remember.
--
--  Internal, like `tdg_admin_uid()`: called only from inside the SECURITY
--  DEFINER verbs below, where the effective role is the owner.
create or replace function public.tdg_derived_badges(p_user uuid)
returns text[]
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(array_agg(d.id order by d.id), array[]::text[])
  from (
    select 'developer'::text as id
     where exists (select 1 from public.profiles p
                    where p.user_id = p_user and p.is_admin)
    union all
    select 'subscriber'::text
     where exists (select 1 from public.subscriptions s
                    where s.user_id = p_user and coalesce(s.tier, 'free') <> 'free')
  ) d;
$$;

revoke all on function public.tdg_badge_catalog(), public.tdg_derived_badges(uuid)
  from public, anon, authenticated;


-- ── 1 · the table ──────────────────────────────────────────────────────────
--
--  WHY THERE IS NO CHECK TYING `badge` TO THE CATALOGUE
--  `tdg_feedback.kind` gets `check (kind = any (public.tdg_feedback_kinds()))`
--  because that vocabulary returns a scalar `text[]`. This catalogue returns
--  a SET, and a CHECK constraint may not contain a subquery — Postgres
--  refuses `check (badge in (select id from public.tdg_badge_catalog()))`
--  outright. Splitting the grantable ids out into a second, array-returning
--  function purely to win the constraint would put the list in two places,
--  which is the one failure the catalogue exists to prevent.
--
--  So the catalogue check lives in `tdg_admin_badge_set()`, which is the only
--  writer there is: RLS is on, there are no policies, and every client grant
--  is revoked below. The CHECK that remains is a shape floor, so the column
--  cannot hold a sentence or an empty string even from `service_role`.
create table public.tdg_account_badges (
  user_id    uuid not null references auth.users (id) on delete cascade,
  badge      text not null check (badge ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  granted_at timestamptz not null default now(),
  --  Who awarded it. SET NULL, not CASCADE: the award is about the person who
  --  received it, and it does not stop being true when the developer who gave
  --  it closes their account.
  granted_by uuid references auth.users (id) on delete set null,
  --  Why, in one line, for our own eyes: "found the checkout 404". Never
  --  required, never parsed, and never shown to anybody but a developer.
  note       text check (char_length(note) <= 200),
  primary key (user_id, badge)
);

--  The primary key already answers "what does this account hold". This one
--  answers the other question a console asks — "who holds Bug Hunter" —
--  which has no leading-column index to use.
create index tdg_account_badges_badge_idx on public.tdg_account_badges (badge);

alter table public.tdg_account_badges enable row level security;
--  No policies on purpose, and no direct grants either: the verbs below are
--  the entire surface. Supabase's default privileges would otherwise hand
--  `authenticated` a table with RLS and no policies — a locked door that
--  still invites rattling.
revoke all on table public.tdg_account_badges from anon, authenticated;


-- ── 2 · what a signed-in account may ask about itself ──────────────────────

--  This account's badges, derived and granted together, ready to render.
--
--  It takes NO user id, and it never will. The identity comes from the JWT,
--  so there is no parameter to point at somebody else — a badge list is a
--  small, cheap, complete answer about a person, and a verb that returns one
--  for an arbitrary uuid is an enumeration endpoint however politely it is
--  named. Somebody else's badges are a developer read (`tdg_admin_badges`),
--  guarded like every other developer read here.
--
--  `granted_at` and `note` come back null for a derived badge, because there
--  was no moment anybody awarded it and nobody wrote a reason.
--
--  Ordered derived first, then most recently granted: what the account IS
--  before what it has been given.
create or replace function public.tdg_my_badges()
returns table (id text, label text, blurb text, derived boolean,
               granted_at timestamptz, note text)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_uid     uuid := auth.uid();
  v_derived text[];
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  v_derived := public.tdg_derived_badges(v_uid);

  return query
  select c.id, c.label, c.blurb, c.derived, b.granted_at, b.note
  from public.tdg_badge_catalog() c
  left join public.tdg_account_badges b
    on b.user_id = v_uid and b.badge = c.id
  where case when c.derived then c.id = any (v_derived) else b.user_id is not null end
  order by c.derived desc, b.granted_at desc nulls last, c.id;
end;
$$;


-- ── 3 · the one public number ──────────────────────────────────────────────

--  How many accounts there are, and how many badges have been awarded. The
--  site's footer prints the first of those.
--
--  No identities, no emails, no usernames, and no per-badge breakdown that
--  could single anybody out: two integers, and there is nothing else in the
--  shape for a caller to ask for.
--
--  THIS IS THE ONE FUNCTION IN THIS FAMILY GRANTED TO `anon`, and it is a
--  deliberate exception to the standing rule in migrations/README.md. That
--  rule exists because every other verb here begins with an identity, so a
--  signed-out caller could only ever collect refusals and probe with them.
--  This one has no identity and no refusal in it — and the footer is on every
--  page, including all the pages nobody has signed in to read.
--
--  `accounts` counts `public.profiles`, which is the same count
--  `tdg_admin_overview()` calls `accounts`: one row per account, written by
--  `handle_new_user`. Counting `auth.users` instead would be a second way to
--  answer one question, and on the day the two disagree the footer and the
--  console would each be confidently right.
--
--  `badges_awarded` counts GRANTED badges only. A derived badge is not an
--  award — nobody gave it — and folding `is_admin` into a number the public
--  reads would be printing how many developers there are.
create or replace function public.tdg_public_stats()
returns table (accounts integer, badges_awarded integer)
language sql stable security definer set search_path to 'public'
as $$
  select (select count(*) from public.profiles)::integer,
         (select count(*) from public.tdg_account_badges)::integer;
$$;


-- ── 4 · what a developer may do ────────────────────────────────────────────

--  One account's whole switchboard: EVERY catalogue row comes back, `held`
--  true or false, so the console draws the full set of switches rather than
--  only the ones that are already on. A console that can only list what an
--  account has cannot be used to give it anything.
--
--  Derived rows come back with `held` computed and `granted_at` /
--  `granted_by` / `note` null, because there is no grant behind them. The
--  console renders them locked; `tdg_admin_badge_set` refuses them out loud
--  if it is asked anyway.
create or replace function public.tdg_admin_badges(p_target uuid)
returns table (id text, label text, blurb text, derived boolean,
               held boolean, granted_at timestamptz, granted_by uuid, note text)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_derived text[];
begin
  perform public.tdg_admin_uid();
  if p_target is null then
    raise exception 'tdg: name the account whose badges you mean' using errcode = '22023';
  end if;
  v_derived := public.tdg_derived_badges(p_target);

  return query
  select c.id, c.label, c.blurb, c.derived,
         case when c.derived then c.id = any (v_derived) else b.user_id is not null end,
         b.granted_at, b.granted_by, b.note
  from public.tdg_badge_catalog() c
  left join public.tdg_account_badges b
    on b.user_id = p_target and b.badge = c.id
  order by c.derived desc, c.id;
end;
$$;

--  Award one badge, or take it back. Idempotent in both directions: the
--  console sends the state it wants the switch to be in, not a delta, so a
--  double-click and a stale page both land on the same answer.
--
--  A DERIVED BADGE IS REFUSED WITH A SENTENCE, NOT IGNORED. Quietly doing
--  nothing is the failure `tdg_admin_uid()` refuses to make one level up: a
--  developer tool that silently does not do the thing is worse than one that
--  says no and says why. The `else` arm words a derived badge added later
--  that nobody wrote a sentence for — an unknown entry still gets a face.
--
--  Every call that CHANGES something writes to the shared audit log; nothing
--  privileged happens invisibly. A call that changes nothing — the switch was
--  already on and the note says the same thing, or it was already off —
--  returns quietly rather than writing a row that says nothing happened,
--  exactly as `tdg_admin_feedback_set_status` does.
create or replace function public.tdg_admin_badge_set(
  p_target uuid,
  p_badge  text,
  p_on     boolean,
  p_note   text default null
)
returns void
language plpgsql security definer set search_path to 'public', 'auth'
as $$
declare
  v_me       uuid    := public.tdg_admin_uid();
  v_badge    text    := lower(btrim(coalesce(p_badge, '')));
  v_note     text    := nullif(btrim(coalesce(p_note, '')), '');
  v_label    text;
  v_derived  boolean;
  v_held     boolean;
  v_old_note text;
begin
  if p_target is null or p_on is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 200 then
    raise exception 'tdg: keep the note under 200 characters' using errcode = '22023';
  end if;

  select c.label, c.derived into v_label, v_derived
    from public.tdg_badge_catalog() c where c.id = v_badge;
  if not found then
    raise exception 'tdg: there is no badge called %',
      coalesce(nullif(v_badge, ''), '(nothing)') using errcode = '22023';
  end if;

  if v_derived then
    raise exception 'tdg: %', case v_badge
      when 'developer'  then 'Developer follows the account''s developer flag; it is not granted by hand'
      when 'subscriber' then 'Subscriber follows the account''s TDG plan; it is not granted by hand'
      else v_label || ' is computed from the account itself; it is not granted by hand'
    end using errcode = '23514';
  end if;

  --  Checked rather than left to the foreign key: an INSERT for a missing
  --  account raises 23503 in Postgres's own wording, and a DELETE for one
  --  succeeds silently. Both of those answers are wrong in the same way.
  if not exists (select 1 from auth.users u where u.id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  select b.note into v_old_note
    from public.tdg_account_badges b
   where b.user_id = p_target and b.badge = v_badge
     for update;
  v_held := found;

  if p_on then
    if v_held and v_old_note is not distinct from v_note then
      return;
    end if;
    --  ON CONFLICT updates the note ONLY. `granted_at` and `granted_by` stay
    --  as they were, because editing why a badge was given does not make the
    --  editor the person who gave it, and does not move the day it happened.
    insert into public.tdg_account_badges (user_id, badge, granted_by, note)
    values (p_target, v_badge, v_me, v_note)
    on conflict (user_id, badge) do update set note = excluded.note;

    perform public.tdg_admin_log(
      p_target,
      case when v_held then 'badge-note' else 'badge-grant' end,
      v_badge || coalesce(' · ' || v_note, ''));
  else
    if not v_held then
      return;
    end if;
    delete from public.tdg_account_badges b
     where b.user_id = p_target and b.badge = v_badge;

    --  The note is named in the revoke line too: once the row is gone it
    --  cannot say what it was for, and the log is the only place left.
    perform public.tdg_admin_log(
      p_target, 'badge-revoke', v_badge || coalesce(' · ' || v_old_note, ''));
  end if;
end;
$$;


-- ── 5 · grants ─────────────────────────────────────────────────────────────
--  `authenticated` for everything with an identity in it, per the standing
--  rule; `anon` for `tdg_public_stats` alone, for the reason written above
--  it. The two admin verbs are granted to `authenticated` and refuse
--  non-developers from inside — the grant is not the boundary,
--  `tdg_admin_uid()` is.

revoke all on function
  public.tdg_my_badges(),
  public.tdg_public_stats(),
  public.tdg_admin_badges(uuid),
  public.tdg_admin_badge_set(uuid, text, boolean, text)
from public, anon, authenticated;

grant execute on function
  public.tdg_my_badges(),
  public.tdg_admin_badges(uuid),
  public.tdg_admin_badge_set(uuid, text, boolean, text)
to authenticated;

grant execute on function public.tdg_public_stats() to anon, authenticated;

commit;
