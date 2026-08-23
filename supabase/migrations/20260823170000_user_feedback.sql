-- ═══════════════════════════════════════════════════════════════════════════
--  TDG user feedback · reports in, replies back
--  Applied 2026-08-23 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS IS
--  One place for every TDG app — Bible Educator, Makullveny, TDG Veditor,
--  DevFleet, the site itself — to put what its users tell us: a bug, a
--  suggestion, a question. And the way back: a developer replies from the
--  site's console, the reply waits in `tdg_feedback_replies`, and the app shows
--  it the next time that person opens it, then marks it seen so it is shown
--  once. The site's Developer console (src/dev/) reads the whole ledger.
--
--  WHY THE APP COLUMN IS OPEN RATHER THAN A LIST
--  The same reason the console discovers its Store apps instead of naming
--  them: a CHECK against today's products is a migration somebody forgets the
--  day the seventh app ships, and its cost is a feedback form that errors on
--  every send. Any well-formed id is accepted; the console renders an app it
--  has no copy for under a title made from its id, which is legible, honest,
--  and fixed by one entry in the site's STORE_APPS. The KINDS are a list,
--  because they are this system's own vocabulary, not a product catalogue.
--
--  WHY EVERY ACCESS IS A FUNCTION, AND THE TABLES HAVE NO POLICIES
--  Same boundary as everything else here: RLS is on and there are no client
--  policies at all, so the only doors are the SECURITY DEFINER verbs below.
--  A user can submit, read their own thread and mark their own replies seen —
--  nothing else, and never anybody else's. Developers go through `tdg_admin_*`
--  verbs that open with the same `bea_is_admin()` refusal as the rest of the
--  console, and every write a developer makes lands in the shared audit log.
--
--  WHY REPLIES ARE A TABLE AND NOT COLUMNS ON THE REPORT
--  A reply column holds exactly one reply, and the second message ("fixed in
--  1.4.3, sorry again") would overwrite the first, or need reply_2. A child
--  table keeps the whole exchange in order, and `seen_at` rides on each reply,
--  so a person who saw the first answer still gets shown the second.
--
--  THE RATE LIMIT
--  20 reports per account per day. Feedback is written by hand, so a real
--  person never notices; a stuck retry loop or a griefer fills one day's page
--  instead of the table. The refusal is worded to be shown, like every other
--  refusal in this family.

begin;

-- ── 0 · the vocabularies ───────────────────────────────────────────────────
--  In SQL rather than in any app's TypeScript so that the server validates
--  against exactly the list the pickers offer. The console reads both through
--  tdg_admin_catalog(); apps get the kinds written into their integration
--  brief, and an unknown kind is refused with a sentence.

create or replace function public.tdg_feedback_kinds()
returns text[] language sql immutable as $$
  select array['bug', 'suggestion', 'question', 'praise', 'other']::text[];
$$;

--  new      · nobody has looked at it
--  seen     · a developer read it and left it open
--  replied  · set by tdg_admin_feedback_reply, so it cannot be forgotten
--  resolved · dealt with; the console files it out of the way
create or replace function public.tdg_feedback_statuses()
returns text[] language sql immutable as $$
  select array['new', 'seen', 'replied', 'resolved']::text[];
$$;

revoke all on function public.tdg_feedback_kinds(), public.tdg_feedback_statuses()
  from public, authenticated;


-- ── 1 · the tables ─────────────────────────────────────────────────────────

--  ON DELETE SET NULL, not CASCADE: a bug report outlives the account that
--  filed it — the bug is still there. The console shows "deleted account" and
--  the reply verb refuses, because there is nobody left to deliver to.
create table public.tdg_feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null,
  app         text not null check (app ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  app_version text check (char_length(app_version) <= 64),
  os          text check (char_length(os) <= 128),
  kind        text not null check (kind = any (public.tdg_feedback_kinds())),
  message     text not null check (char_length(message) between 1 and 5000),
  --  Volunteered, free-form: "my instagram is @tdgluke". Never required, never
  --  parsed. The account's email is already beside it in the console.
  contact     text check (char_length(contact) <= 200),
  status      text not null default 'new' check (status = any (public.tdg_feedback_statuses()))
);

create index tdg_feedback_user_idx   on public.tdg_feedback (user_id, created_at desc);
create index tdg_feedback_at_idx     on public.tdg_feedback (created_at desc);
--  Partial, because 'new' is the only status anything counts: the overview
--  tile and the console tab badge both ask "how many are waiting?".
create index tdg_feedback_new_idx    on public.tdg_feedback (status) where status = 'new';

create table public.tdg_feedback_replies (
  id          bigint generated always as identity primary key,
  feedback_id bigint not null references public.tdg_feedback (id) on delete cascade,
  --  The developer who wrote it. SET NULL for the same reason as above; the
  --  reader-facing name falls back to 'TDG'.
  author_id   uuid references auth.users (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 5000),
  created_at  timestamptz not null default now(),
  --  When the person's app confirmed it was SHOWN, not when it was written.
  --  Null means it is still waiting in their inbox, and the console says so.
  seen_at     timestamptz
);

create index tdg_feedback_replies_fb_idx on public.tdg_feedback_replies (feedback_id);

alter table public.tdg_feedback         enable row level security;
alter table public.tdg_feedback_replies enable row level security;
--  No policies on purpose, and no direct grants either: the functions below
--  are the entire surface. Supabase's default privileges would otherwise hand
--  `authenticated` a table with RLS and no policies — a locked door that still
--  invites rattling.
revoke all on table public.tdg_feedback         from anon, authenticated;
revoke all on table public.tdg_feedback_replies from anon, authenticated;


-- ── 2 · what a signed-in user may do ───────────────────────────────────────

--  Send one report. The caller's identity comes from their JWT, never from a
--  parameter, so nobody can file feedback as somebody else. Returns the new
--  report's id so an app can say "sent — reference #142".
create or replace function public.tdg_feedback_submit(
  p_app         text,
  p_kind        text,
  p_message     text,
  p_app_version text default null,
  p_os          text default null,
  p_contact     text default null
)
returns bigint
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid     uuid := auth.uid();
  v_app     text := lower(btrim(coalesce(p_app, '')));
  v_kind    text := lower(btrim(coalesce(p_kind, '')));
  v_message text := btrim(coalesce(p_message, ''));
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
  v_recent  integer;
  v_id      bigint;
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  if v_app !~ '^[a-z0-9][a-z0-9-]{1,31}$' then
    raise exception 'tdg: bad app id — lowercase letters, numbers and hyphens'
      using errcode = '22023';
  end if;
  if not (v_kind = any (public.tdg_feedback_kinds())) then
    raise exception 'tdg: pick what kind of feedback this is' using errcode = '22023';
  end if;
  if v_message = '' then
    raise exception 'tdg: write the feedback itself before sending' using errcode = '22023';
  end if;
  if char_length(v_message) > 5000 then
    raise exception 'tdg: that message is too long — 5,000 characters is the limit'
      using errcode = '22023';
  end if;
  if char_length(coalesce(v_contact, '')) > 200 then
    raise exception 'tdg: keep the contact line under 200 characters' using errcode = '22023';
  end if;

  select count(*) into v_recent
    from public.tdg_feedback f
   where f.user_id = v_uid and f.created_at > now() - interval '24 hours';
  if v_recent >= 20 then
    raise exception 'tdg: that is a lot of feedback for one day — thank you, and send the rest tomorrow'
      using errcode = '54000';
  end if;

  --  Version and OS are machine-supplied, so they are clamped rather than
  --  refused: a build string that grew past the cap is not the user's mistake
  --  and must not cost them the report they typed.
  insert into public.tdg_feedback (user_id, app, app_version, os, kind, message, contact)
  values (v_uid, v_app,
          nullif(left(btrim(coalesce(p_app_version, '')), 64), ''),
          nullif(left(btrim(coalesce(p_os, '')), 128), ''),
          v_kind, v_message, v_contact)
  returning id into v_id;

  return v_id;
end;
$$;

--  Every reply waiting for THIS caller, oldest first: the panel an app opens
--  at startup. A reply stays here until tdg_feedback_ack says it was shown.
--  The original report rides along so the panel can quote what it is
--  answering — a bare "fixed now!" with no context is a puzzle, not a reply.
create or replace function public.tdg_feedback_inbox()
returns table (
  reply_id    bigint,
  feedback_id bigint,
  app         text,
  kind        text,
  message     text,
  body        text,
  replied_at  timestamptz,
  replied_by  text
)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  return query
  select r.id, f.id, f.app, f.kind, f.message, r.body, r.created_at,
         coalesce(pr.display_name, pr.username, 'TDG')
  from public.tdg_feedback_replies r
  join public.tdg_feedback f on f.id = r.feedback_id
  left join public.profiles pr on pr.user_id = r.author_id
  where f.user_id = v_uid and r.seen_at is null
  order by r.created_at asc;
end;
$$;

--  "I showed it." Idempotent and silent on a reply that is already seen or is
--  not the caller's: an app acking twice in a race is normal, and an error
--  here could only teach a probe which reply ids exist.
create or replace function public.tdg_feedback_ack(p_reply_id bigint)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  update public.tdg_feedback_replies r
     set seen_at = now()
    from public.tdg_feedback f
   where f.id = r.feedback_id
     and r.id = p_reply_id
     and f.user_id = v_uid
     and r.seen_at is null;
end;
$$;

--  The caller's own reports, with the whole exchange on each: what an app's
--  "My Feedback" surface renders, so sending something never feels like
--  dropping it down a well. Replies seen or unseen are all here; the inbox is
--  only about what has not been SHOWN yet.
create or replace function public.tdg_feedback_mine(p_max_rows integer default 100)
returns table (
  id          bigint,
  created_at  timestamptz,
  app         text,
  app_version text,
  kind        text,
  message     text,
  contact     text,
  status      text,
  replies     jsonb
)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  return query
  select f.id, f.created_at, f.app, f.app_version, f.kind, f.message, f.contact, f.status,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', r.id, 'body', r.body, 'at', r.created_at,
                     'by', coalesce(pr.display_name, pr.username, 'TDG'),
                     'seen_at', r.seen_at)
                   order by r.created_at)
                     from public.tdg_feedback_replies r
                     left join public.profiles pr on pr.user_id = r.author_id
                    where r.feedback_id = f.id), '[]'::jsonb)
  from public.tdg_feedback f
  where f.user_id = v_uid
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_max_rows, 100), 500));
end;
$$;


-- ── 3 · what a developer may do ────────────────────────────────────────────

--  The whole ledger, newest first, every report with its full exchange. One
--  wide read like tdg_admin_accounts, for the same reason: the console's job
--  is one page that answers everything, not a round trip per column. Email is
--  included because the console already shows it everywhere else, and it is
--  the fallback route when a report gave no contact line.
create or replace function public.tdg_admin_feedback(
  p_target   uuid    default null,
  p_max_rows integer default 500
)
returns table (
  id          bigint,
  at          timestamptz,
  updated_at  timestamptz,
  user_id     uuid,
  who         text,
  username    text,
  email       text,
  app         text,
  app_version text,
  os          text,
  kind        text,
  message     text,
  contact     text,
  status      text,
  replies     jsonb
)
language plpgsql stable security definer set search_path to 'public', 'auth'
as $$
begin
  perform public.tdg_admin_uid();
  return query
  select f.id, f.created_at, f.updated_at, f.user_id,
         coalesce(pr.display_name, pr.username, u.email::text, 'deleted account'),
         pr.username,
         u.email::text,
         f.app, f.app_version, f.os, f.kind, f.message, f.contact, f.status,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', r.id, 'body', r.body, 'at', r.created_at,
                     'author_id', r.author_id,
                     'by', coalesce(ap.display_name, ap.username, 'deleted account'),
                     'seen_at', r.seen_at)
                   order by r.created_at)
                     from public.tdg_feedback_replies r
                     left join public.profiles ap on ap.user_id = r.author_id
                    where r.feedback_id = f.id), '[]'::jsonb)
  from public.tdg_feedback f
  left join public.profiles pr on pr.user_id = f.user_id
  left join auth.users u on u.id = f.user_id
  where p_target is null or f.user_id = p_target
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_max_rows, 500), 1000));
end;
$$;

--  Move a report along its ladder. Same-status writes return quietly rather
--  than writing an audit row that says nothing changed.
create or replace function public.tdg_admin_feedback_set_status(p_id bigint, p_status text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me     uuid := public.tdg_admin_uid();
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_user   uuid;
  v_old    text;
begin
  if p_id is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if not (v_status = any (public.tdg_feedback_statuses())) then
    raise exception 'tdg: unknown feedback status' using errcode = '22023';
  end if;

  select f.user_id, f.status into v_user, v_old
    from public.tdg_feedback f where f.id = p_id for update;
  if not found then
    raise exception 'tdg: no such feedback report' using errcode = '02000';
  end if;
  if v_old = v_status then
    return;
  end if;

  update public.tdg_feedback f set status = v_status, updated_at = now() where f.id = p_id;

  perform public.tdg_admin_log(
    v_user, 'feedback-status', '#' || p_id || ': ' || v_old || ' → ' || v_status);
  perform v_me;
end;
$$;

--  Answer one report. The reply is delivered by the person's own app calling
--  tdg_feedback_inbox() on its next start, so writing it here is the WHOLE
--  send — there is no push and no email. Also stamps the report 'replied', so
--  the status cannot say 'new' about a report that has an answer.
create or replace function public.tdg_admin_feedback_reply(p_id bigint, p_body text)
returns bigint
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me   uuid := public.tdg_admin_uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_user uuid;
  v_rid  bigint;
begin
  if p_id is null or v_body = '' then
    raise exception 'tdg: write the reply before sending it' using errcode = '22023';
  end if;
  if char_length(v_body) > 5000 then
    raise exception 'tdg: keep a reply under 5,000 characters' using errcode = '22023';
  end if;

  select f.user_id into v_user
    from public.tdg_feedback f where f.id = p_id for update;
  if not found then
    raise exception 'tdg: no such feedback report' using errcode = '02000';
  end if;
  if v_user is null then
    raise exception 'tdg: that account is gone, so there is nobody to deliver a reply to'
      using errcode = '22023';
  end if;

  insert into public.tdg_feedback_replies (feedback_id, author_id, body)
  values (p_id, v_me, v_body)
  returning id into v_rid;

  update public.tdg_feedback f set status = 'replied', updated_at = now() where f.id = p_id;

  perform public.tdg_admin_log(v_user, 'feedback-reply', '#' || p_id);
  return v_rid;
end;
$$;

--  Remove a report and its replies for good. For spam and abuse, not filing:
--  a real report that is dealt with is 'resolved', which keeps the record.
--  Logged before the delete, naming what it was, because afterwards the row
--  cannot say.
create or replace function public.tdg_admin_feedback_delete(p_id bigint)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me   uuid := public.tdg_admin_uid();
  v_user uuid;
  v_app  text;
  v_kind text;
begin
  if p_id is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  select f.user_id, f.app, f.kind into v_user, v_app, v_kind
    from public.tdg_feedback f where f.id = p_id for update;
  if not found then
    raise exception 'tdg: no such feedback report' using errcode = '02000';
  end if;

  perform public.tdg_admin_log(
    v_user, 'feedback-delete', '#' || p_id || ' · ' || v_app || ' ' || v_kind);

  delete from public.tdg_feedback f where f.id = p_id;
end;
$$;


-- ── 4 · the catalog and the overview learn about feedback ──────────────────

--  Same body as 20260823120000, plus the two feedback vocabularies, so the
--  console's filter dropdowns and its status control offer exactly what the
--  server will accept.
create or replace function public.tdg_admin_catalog()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  perform public.tdg_admin_uid();
  return jsonb_build_object(
    'core_tiers', to_jsonb(public.tdg_core_tiers()),
    'statuses',   to_jsonb(public.tdg_sub_statuses()),
    'mak_tiers',  to_jsonb(public.mak_known_tiers()),
    'mak_themes', to_jsonb(public.mak_known_themes()),
    'feedback_kinds',    to_jsonb(public.tdg_feedback_kinds()),
    'feedback_statuses', to_jsonb(public.tdg_feedback_statuses()),
    'apps', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id',                 a.app_id,
                'entitlements_table', a.entitlements_table,
                'events_table',       a.events_table,
                'packs',              to_jsonb(a.known_packs),
                'has_grants',         a.has_grants)
              order by a.app_id)
         from public.tdg_store_apps() a),
      '[]'::jsonb)
  );
end;
$$;

--  Same body as 20260823120000 with one column added: how many reports are
--  waiting. A `returns table` change means drop and recreate; the only caller
--  is src/dev/ on this site, updated in the same commit as this file.
drop function if exists public.tdg_admin_overview();

create function public.tdg_admin_overview()
returns table (
  accounts     integer,
  developers   integer,
  suspended    integer,
  hidden       integer,
  soft_deleted integer,
  unconfirmed  integer,
  new_7d       integer,
  new_30d      integer,
  active_7d    integer,
  core_paid    integer,
  mak_paid     integer,
  feedback_new integer,
  store_owners jsonb,
  gross_cents  bigint
)
language plpgsql stable security definer set search_path to 'public', 'auth'
as $$
declare
  r        record;
  v_n      bigint;
  v_owners jsonb  := '{}'::jsonb;
  v_gross  bigint := 0;
begin
  perform public.tdg_admin_uid();

  for r in select * from public.tdg_store_apps() loop
    execute format(
      'select count(*) from public.%I e where coalesce(array_length(e.owned_packs, 1), 0) > 0',
      r.entitlements_table) into v_n;
    v_owners := v_owners || jsonb_build_object(r.app_id, v_n);

    if r.events_table is not null then
      execute format('select coalesce(sum(e.amount_cents), 0)::bigint from public.%I e',
                     r.events_table) into v_n;
      v_gross := v_gross + v_n;
    end if;
  end loop;

  select coalesce(sum(e.amount_cents), 0)::bigint into v_n
    from public.mak_subscription_events e;
  v_gross := v_gross + v_n;

  return query
  select
    (select count(*) from public.profiles)::integer,
    (select count(*) from public.profiles p where p.is_admin)::integer,
    (select count(*) from auth.users u
      where u.banned_until is not null and u.banned_until > now())::integer,
    (select count(*) from public.bea_profile_state s
      where s.hidden_by_admin and (s.hidden_until is null or s.hidden_until > now()))::integer,
    (select count(*) from public.bea_profile_state s where s.deleted_by_admin)::integer,
    (select count(*) from auth.users u where u.email_confirmed_at is null)::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '7 days')::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '30 days')::integer,
    (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '7 days')::integer,
    (select count(*) from public.subscriptions s where s.tier <> 'free')::integer,
    (select count(*) from public.mak_subscriptions m
      where m.tier <> 'free' or m.candle_purchased_at is not null
         or coalesce(array_length(m.owned_themes, 1), 0) > 0)::integer,
    (select count(*) from public.tdg_feedback f where f.status = 'new')::integer,
    v_owners,
    v_gross;
end;
$$;


-- ── 5 · grants ─────────────────────────────────────────────────────────────
--  `authenticated` only, `anon` never, per the standing rule: a signed-out
--  caller could only ever collect refusals from these, and the user verbs all
--  begin with an identity. The dropped overview lost its grant with the drop.

revoke all on function
  public.tdg_feedback_submit(text, text, text, text, text, text),
  public.tdg_feedback_inbox(),
  public.tdg_feedback_ack(bigint),
  public.tdg_feedback_mine(integer),
  public.tdg_admin_feedback(uuid, integer),
  public.tdg_admin_feedback_set_status(bigint, text),
  public.tdg_admin_feedback_reply(bigint, text),
  public.tdg_admin_feedback_delete(bigint),
  public.tdg_admin_overview()
from public, anon, authenticated;

grant execute on function
  public.tdg_feedback_submit(text, text, text, text, text, text),
  public.tdg_feedback_inbox(),
  public.tdg_feedback_ack(bigint),
  public.tdg_feedback_mine(integer),
  public.tdg_admin_feedback(uuid, integer),
  public.tdg_admin_feedback_set_status(bigint, text),
  public.tdg_admin_feedback_reply(bigint, text),
  public.tdg_admin_feedback_delete(bigint),
  public.tdg_admin_overview()
to authenticated;

commit;
