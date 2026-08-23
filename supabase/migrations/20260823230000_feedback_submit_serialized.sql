-- ═══════════════════════════════════════════════════════════════════════════
--  TDG user feedback · one submit per account at a time
--  Applied 2026-08-23 to project ddbksawvchsauiuiwvrl (tdg-core).
--  Amends 20260823210000_feedback_rate_limits.sql. Read that file first.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT WAS WRONG
--  20260823210000 put four rules in front of `tdg_feedback_submit` and said
--  they convert a flood into a queue. They do — one caller at a time. Two
--  submissions in flight together defeat every one of them, because the whole
--  function is reads-then-write with nothing holding the account still in
--  between:
--
--    · Both run the dedupe SELECT before either INSERT has committed, so
--      neither can see the other's row and neither returns the receipt.
--    · Both then call `tdg_feedback_gate`, which counts the same rows and
--      reads the same `max(created_at)`, so both are told 'ok'.
--    · Both insert. Two identical reports, one second apart, past a 60-second
--      cooldown and a 10-minute dedupe.
--
--  It is not a theoretical race. It is the ordinary shape of the exact failure
--  the cooldown was written for: a double-click, or a wedged client retrying
--  before the first answer came back. This site's dialog happens to hold the
--  door with `if (sending) return`, but docs/feedback-app-prompt.md tells every
--  other TDG app NOT to gate client-side — correctly, since rule 12 puts the
--  boundary in Postgres — so the server was the only defence and it did not
--  hold.
--
--  THE FIX, AND WHY IT IS A LOCK RATHER THAN A CONSTRAINT
--  One advisory lock, keyed on the account, taken before the first read and
--  released when the transaction ends. The second caller waits, and by the time
--  it looks, the first report is committed and visible — so it takes the path
--  it should always have taken: the dedupe finds the row and hands back its id,
--  which is the receipt, not a refusal.
--
--  A unique index over (user_id, app, kind, message) would also stop the
--  duplicate, but it would stop it by raising a constraint violation — a
--  refusal with a Postgres error string in it, for a report that succeeded.
--  The whole reason the dedupe exists is that answering a successful send with
--  an error is the wrong answer. The lock makes the loser take the good path
--  instead of failing on the way to it.
--
--  It is per ACCOUNT, so two different people never wait on each other. The
--  hold is the length of one insert.
--
--  WHAT IS UNCHANGED
--  Every limit, every sentence, every validation, the dedupe window, the
--  signature and the grants. The only new line is the `pg_advisory_xact_lock`
--  and its comment; the rest is 20260823210000's body verbatim, because a
--  reader comparing the two should see exactly one difference.

begin;

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

  --  ONE SUBMIT PER ACCOUNT AT A TIME, and everything below it depends on this.
  --  The dedupe and the gate are both read-then-decide, so without a hold here
  --  two simultaneous callers each read a world in which the other has not
  --  written yet, and both are right, and both insert. Taken after the cheap
  --  validation — a malformed request should be refused without ever queueing —
  --  and released by the transaction ending, so there is nothing to unlock and
  --  nothing to leak if a later line raises.
  --
  --  Keyed on the account, namespaced by the verb's name so it cannot collide
  --  with an advisory lock some other TDG function picks the same uuid for.
  --  Two different people never wait on each other.
  perform pg_advisory_xact_lock(hashtextextended('tdg_feedback_submit:' || v_uid::text, 0));

  --  BEFORE the gate, deliberately. An identical resend is nearly always the
  --  same send arriving twice — the first answer was lost on the way back.
  --  Give them the receipt for the report we already hold; do not spend one
  --  of their reports on it, and never answer a successful submission with
  --  "wait 60 seconds".
  --
  --  With the lock above, this now also catches the twin that is still in
  --  flight rather than only the one that came back a minute ago: the loser
  --  waits, the winner commits, and the loser's SELECT sees it.
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

--  CREATE OR REPLACE keeps the existing grants; restated for the same reason
--  20260823210000 restates them — a silently ungranted verb costs a feature.
revoke all on function public.tdg_feedback_submit(text, text, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.tdg_feedback_submit(text, text, text, text, text, text)
  to authenticated;

commit;
