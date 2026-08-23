-- ═══════════════════════════════════════════════════════════════════════════
--  TDG user feedback · the rate limit, made real and made visible
--  Applied 2026-08-23 to project ddbksawvchsauiuiwvrl (tdg-core).
--  Amends 20260823170000_user_feedback.sql. Read that file first.
--
--  Two comments in here were reworded after applying, to match the text that
--  actually went to the project — `pg_get_functiondef` stores a function's
--  comments, so prose that differs is a file quietly disagreeing with the
--  database. Every statement below is byte-for-byte what is running.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT WAS WRONG WITH ONE NUMBER
--  20260823170000 shipped a single limit: 20 reports per account per 24 hours.
--  It stops a griefer from filling the table, and stops nothing else. Inside
--  those 20 there is no floor at all — a wedged retry loop, a leaning finger
--  on Send, or somebody amusing themselves can put all 20 in about four
--  seconds. What lands in the console then is twenty rows that are all one
--  event, which is the same amount of noise as an attack and costs the same
--  amount of reading to clear. And 20 hand-written reports in one day is not a
--  number anybody was ever going to reach honestly; it was picked to be out of
--  the way, not to be right.
--
--  THE SHAPE THAT REPLACES IT
--  Four rules, per ACCOUNT, all of them counted over rolling windows rather
--  than calendar days — a cap that resets at midnight is a cap that is twice
--  as large at 11:59.
--
--    1 · A 60-SECOND GAP between one report and the next.
--        Feedback is typed by hand. The fastest genuine second report — the
--        "oh, and one more thing" — is still more than a minute of writing
--        behind the first, so a real person never meets this. A double-click,
--        a wedged client retrying, or a finger held on Enter meets it on the
--        very next attempt. This is the rule that does almost all of the work,
--        because it converts a flood into a queue.
--
--    2 · FIVE REPORTS PER HOUR.
--        The gap alone still permits sixty an hour. Five is already a heavy
--        session — a tester working through a broken build files three or
--        four and then goes back to testing. Past five in sixty minutes, the
--        next thing being reported is usually the same thing again.
--
--    3 · TEN REPORTS PER 24 HOURS.
--        Down from twenty. Ten is more than the most enthusiastic real user
--        this site has ever had in a day, and it is a page of the console
--        rather than a screenful. Two full hourly bursts, with room left over.
--
--    4 · AN IDENTICAL RESEND INSIDE TEN MINUTES IS THE SAME REPORT.
--        Same account, same app, same kind, byte-identical message: the
--        original's id is returned and nothing is written. This is not really
--        a limit, it is the fix for the one failure mode the other three make
--        worse — a submission that SUCCEEDED and whose answer was lost on the
--        way back. Without it, the user's obvious next move (press Send again)
--        would be met with "wait 60 seconds" for a report we already have, and
--        the honest thing to show them is the receipt. Ten minutes, not a day,
--        so that a genuine second report of a recurring crash this evening is
--        still its own row.
--
--  WHY THE NUMBERS LIVE IN A FUNCTION
--  `tdg_feedback_limits()` is the only place any of them is written. The gate,
--  the refusal sentences and the quota read all ask it, so the number a person
--  is shown, the number they are held to, and the number the form counts down
--  from cannot drift apart. Changing a limit is one line here and no client
--  release: every app asks at runtime.
--
--  WHY THERE IS A QUOTA READ AT ALL
--  A limit a person cannot see is a refusal waiting to feel arbitrary. The
--  house rule on this site is that anything the app does on its own, or
--  refuses to do, says why, in words, where the reader is looking — so
--  `tdg_feedback_quota()` hands the form what it needs to say "3 more today"
--  before the wall, and "you can send the next one in 43 seconds" at it, with
--  a live countdown. It carries `server_now` so a client with a wrong clock
--  counts down against ours rather than its own.
--
--  WHY THE FORM STILL LETS YOU PRESS SEND
--  The quota read is for SAYING, never for gating. The gate is here, in
--  Postgres, the way every other boundary in this family is — a client that
--  disabled its own button would be one skewed clock away from locking
--  somebody out of a report they are perfectly entitled to file, and would
--  teach the next reader that the check lives in the browser.
--
--  WHAT THIS DOES NOT DEFEND AGAINST, SAID OUT LOUD
--  Everything here is keyed on the account, so somebody willing to confirm a
--  fresh mailbox per account can still file 10 more. That is the same boundary
--  the whole product has — signup costs an email round trip and every report
--  carries the account that filed it, so a repeat offender is one
--  `tdg_admin_feedback_delete` and one suspension away from gone. A global
--  per-app cap would fix it and is deliberately not here: it would let one
--  griefer take the feedback form away from everybody else, which is a worse
--  outcome than the noise it prevents.

begin;

-- ── 0 · the numbers, written once ──────────────────────────────────────────
--  Revoked like the other vocabularies: apps learn the limits from
--  tdg_feedback_quota(), which states them alongside where the caller stands.

create or replace function public.tdg_feedback_limits()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'cooldown_seconds', 60,
    'per_hour',          5,
    'per_day',          10,
    'dedupe_minutes',   10
  );
$$;

--  "43 seconds" · "12 minutes" · "3 hours". Rounded UP, always, so a wait we
--  quote is never shorter than the wait we enforce: telling somebody 2 minutes
--  and then refusing at 2 minutes is how a limit starts to feel like a lie.
--  Singular is handled because "1 minutes" reads as a bug in everything else
--  we wrote.
create or replace function public.tdg_feedback_wait_words(p_seconds integer)
returns text language sql immutable as $$
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

--  Where one account stands against all three windows, in one read. Both the
--  submit gate and the quota read call this, which is the whole point: the
--  sentence the form shows and the sentence the server refuses with are
--  computed from the same rows at the same instant.
--
--  Widest window first. If somebody is out for the day AND inside the minute,
--  the useful thing to say is the one that will actually keep them waiting;
--  "60 seconds" followed by "come back tomorrow" is two refusals for one wall.
--
--  `min(created_at)` inside a window is the row that falls OUT of it first, so
--  `min + window` is the exact instant the count drops below the cap. That is
--  what makes these rolling rather than fixed buckets.
create or replace function public.tdg_feedback_gate(p_uid uuid)
returns table (reason text, next_at timestamptz, sent_hour integer, sent_day integer)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_lim  jsonb   := public.tdg_feedback_limits();
  v_cool integer := (v_lim ->> 'cooldown_seconds')::integer;
  v_hcap integer := (v_lim ->> 'per_hour')::integer;
  v_dcap integer := (v_lim ->> 'per_day')::integer;
  v_last timestamptz;
  v_hmin timestamptz;
  v_dmin timestamptz;
  v_hn   integer;
  v_dn   integer;
begin
  select count(*)::integer, min(f.created_at)
    into v_dn, v_dmin
    from public.tdg_feedback f
   where f.user_id = p_uid and f.created_at > now() - interval '24 hours';

  select count(*)::integer, min(f.created_at), max(f.created_at)
    into v_hn, v_hmin, v_last
    from public.tdg_feedback f
   where f.user_id = p_uid and f.created_at > now() - interval '1 hour';

  if v_dn >= v_dcap then
    return query select 'day'::text, v_dmin + interval '24 hours', v_hn, v_dn;
  elsif v_hn >= v_hcap then
    return query select 'hour'::text, v_hmin + interval '1 hour', v_hn, v_dn;
  elsif v_last is not null and v_last > now() - make_interval(secs => v_cool) then
    return query select 'cooldown'::text, v_last + make_interval(secs => v_cool), v_hn, v_dn;
  else
    return query select 'ok'::text, null::timestamptz, v_hn, v_dn;
  end if;
end;
$$;

revoke all on function
  public.tdg_feedback_limits(),
  public.tdg_feedback_wait_words(integer),
  public.tdg_feedback_gate(uuid)
from public, anon, authenticated;


-- ── 1 · submit, with the gate in it ────────────────────────────────────────
--  Same signature and same validation as 20260823170000; what changed is
--  everything between the validation and the insert. Kept whole rather than
--  factored so that one read of this function is the whole answer to "what
--  happens when I press Send".

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
  v_lim     jsonb := public.tdg_feedback_limits();
  v_gate    record;
  v_wait    text;
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

  --  BEFORE the gate, deliberately. An identical resend is nearly always the
  --  same send arriving twice — the first answer was lost on the way back.
  --  Give them the receipt for the report we already hold; do not spend one
  --  of their reports on it, and never answer a successful submission with
  --  "wait 60 seconds".
  select f.id into v_id
    from public.tdg_feedback f
   where f.user_id = v_uid
     and f.app     = v_app
     and f.kind    = v_kind
     and f.message = v_message
     and f.created_at > now() - make_interval(mins => (v_lim ->> 'dedupe_minutes')::integer)
   order by f.created_at desc
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select * into v_gate from public.tdg_feedback_gate(v_uid);
  if v_gate.reason <> 'ok' then
    v_wait := public.tdg_feedback_wait_words(
                ceil(extract(epoch from (v_gate.next_at - now())))::integer);
    if v_gate.reason = 'cooldown' then
      raise exception 'tdg: one report at a time — you can send the next one in %', v_wait
        using errcode = '54000';
    elsif v_gate.reason = 'hour' then
      raise exception 'tdg: that is % reports in an hour, which is our limit — the next one can go in %',
        (v_lim ->> 'per_hour'), v_wait using errcode = '54000';
    else
      raise exception 'tdg: that is % reports in a day — thank you, and the next one can go in %',
        (v_lim ->> 'per_day'), v_wait using errcode = '54000';
    end if;
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


-- ── 2 · what the form is allowed to say about it ───────────────────────────
--  One row, always: where this caller stands and what the limits are, so no
--  app has to hardcode a number to explain a refusal it has not hit yet.
--
--  `wait_words` is computed here rather than left to each client, so five apps
--  in three languages of code all say the wait the same way. Clients still get
--  `next_allowed_at` and `server_now`, because a countdown has to tick and a
--  sentence cannot.

create or replace function public.tdg_feedback_quota()
returns table (
  sent_hour        integer,
  per_hour         integer,
  sent_day         integer,
  per_day          integer,
  cooldown_seconds integer,
  reason           text,
  wait_words       text,
  next_allowed_at  timestamptz,
  server_now       timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_uid  uuid  := auth.uid();
  v_lim  jsonb := public.tdg_feedback_limits();
  v_gate record;
begin
  if v_uid is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;

  select * into v_gate from public.tdg_feedback_gate(v_uid);

  return query
  select v_gate.sent_hour,
         (v_lim ->> 'per_hour')::integer,
         v_gate.sent_day,
         (v_lim ->> 'per_day')::integer,
         (v_lim ->> 'cooldown_seconds')::integer,
         v_gate.reason,
         case when v_gate.next_at is null then null::text
              else public.tdg_feedback_wait_words(
                     ceil(extract(epoch from (v_gate.next_at - now())))::integer) end,
         v_gate.next_at,
         now();
end;
$$;


-- ── 3 · grants ─────────────────────────────────────────────────────────────
--  `authenticated` only, `anon` never, per the standing rule. Submit is
--  re-granted because CREATE OR REPLACE keeps grants but saying so out loud
--  costs one line and a silently ungranted verb costs a feature.

revoke all on function
  public.tdg_feedback_submit(text, text, text, text, text, text),
  public.tdg_feedback_quota()
from public, anon, authenticated;

grant execute on function
  public.tdg_feedback_submit(text, text, text, text, text, text),
  public.tdg_feedback_quota()
to authenticated;

commit;
