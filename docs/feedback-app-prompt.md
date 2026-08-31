# Giving a TDG app the feedback loop

The server side and the developer side of TDG feedback already exist: reports
land in tdg-core and we read, answer and manage them in the TDG Cebu Developer
console (`#/dev` → Feedback). What each app still needs is its own two
user-facing halves — a way to send, and the panel that shows our reply.

**To wire an app up, paste everything below the rule into a Claude session in
that app's repo.** One session per app; the prompt is the same for all of them
(the app ids are listed inside). TDG-Site's `src/feedback/` is the reference
implementation both of you can point at.

---

WHAT I WANT

Users of this app can send us feedback from inside it — a bug, a suggestion, a
question — and get our answer back inside the same app. The server and the
developer console already exist and are live; this app's job is the two
user-facing halves: a way to send a report, and a panel that shows our reply
the next time the user opens the app. All of it clear on screen — a version
that works underneath but cannot be found, or that swallows a reply without
showing it, is not the feature I am asking for.

CONTEXT

This is a contract with another system, so the surface is stated here rather
than discoverable in this repo. Everything below is already applied and tested
in tdg-core, the shared Supabase project this app signs into (the migration
lives in the TDG-Site repo as
`supabase/migrations/20260823170000_user_feedback.sql`, with the limits in
`20260823210000_feedback_rate_limits.sql`; TDG-Site's
`src/feedback/` folder is a working implementation of both halves if you want
to read one).

Five RPCs, all called with this app's existing signed-in Supabase client. The
caller's identity comes from the JWT — there is no user id parameter anywhere,
and no table access; the functions are the whole surface:

- `tdg_feedback_submit(p_app text, p_kind text, p_message text, p_app_version
  text default null, p_os text default null, p_contact text default null)
  returns bigint` — files one report and returns its id, which is worth
  showing ("Sent — reference #142"). `p_kind` must be one of `bug ·
  suggestion · question · praise · other`. The message is 1–5,000 characters
  after trimming; the contact line is optional free text up to 200 ("My
  instagram is @tdgluke"); version and OS are clamped rather than refused.
  Rate limited — see below.
- `tdg_feedback_inbox()` — every developer reply this account has NOT yet
  been shown, oldest first: `(reply_id, feedback_id, app, kind, message,
  body, replied_at, replied_by)`, where `message` is the user's original
  report, carried along so the panel can quote what it is answering. It
  returns replies to this account's feedback from EVERY TDG app, not only
  this one — show them all, and let `app` say where each came from.
- `tdg_feedback_ack(p_reply_id bigint)` — "I showed it." Idempotent and
  silent.
- `tdg_feedback_quota()` returns one row —
  `(sent_hour, per_hour, sent_day, per_day, cooldown_seconds, reason,
  wait_words, next_allowed_at, server_now)`. Where this account stands
  against the limits, and what the limits are, so no app has to hardcode a
  number in order to explain a wall. `reason` is `ok` · `cooldown` · `hour` ·
  `day`; `next_allowed_at` is null when a report may go right now.
- `tdg_feedback_mine(p_max_rows int default 100)` — the account's own
  reports with status and the whole exchange (`replies` is a jsonb array of
  `{id, body, at, by, seen_at}`). Optional: it exists so a "My Feedback"
  surface can prove that sending something is not dropping it down a well.
  Use it if this app has a natural place for that; skip it if not.

Every refusal these raise is a sentence written to be shown, prefixed
`tdg: ` — strip the prefix and show the rest. All five require a signed-in
session and answer "sign in first" without one. A request that never reached
the server is not a refusal; tell those apart in the wording.

Semantics that matter and are invisible from the signatures:

- **The limits, and what they are for.** Per ACCOUNT, over rolling windows,
  enforced in Postgres: **60 seconds between reports**, **5 per hour**, **10
  per 24 hours**. On top of those, a byte-identical resend of the same kind
  to the same app inside **10 minutes** is treated as the same report — it
  returns the ORIGINAL report's id and writes nothing, because that case is
  almost always one send arriving twice after its answer got lost. So a retry
  after a timeout is safe and shows a receipt, not a refusal. Never build
  your own retry loop on top of submit; it will spend a real person's
  allowance on a network hiccup.
- **Show the limit before it bites.** Call `tdg_feedback_quota()` when the
  form opens and again after each send. While `next_allowed_at` is in the
  future, say so where the reader is looking, counting down —
  `next_allowed_at` minus `server_now` is the wait in milliseconds, and it is
  subtracted that way on purpose so a machine with a wrong clock still counts
  the right number of seconds. Once three or fewer reports are left for the
  day, say that too. Below that, say nothing: a form that greets a first-time
  visitor with a quota reads as though we expect trouble.
- **Do not gate on it.** The quota read is for SAYING; the gate is in
  Postgres. Leave the send control pressable during a wait — a client that
  disables itself on its own clock is one skewed machine away from refusing a
  report somebody is entitled to file, and the server's refusal is a sentence
  written to be shown anyway.

- A reply stays in the inbox until acked, so ack ONLY after it actually
  rendered and the user confirmed reading it — a deliberate press, not a
  dismissal. Escape or clicking away should cost nothing: the reply comes
  back next launch. On TDG Cebu the panel's two buttons are "Got It" (acks)
  and "Show Me Next Time" (does not).
- The developer console shows each reply as SEEN / NOT SEEN YET from exactly
  this ack, so an eager ack lies to us about whether the person ever saw the
  answer.
- `replied_by` is the developer's display name ('TDG' as fallback). Show it —
  an answer from a person reads differently from an answer from a system.

App ids for `p_app`: `bible-educator` · `makullveny` · `veditor` ·
`devfleet`. Lowercase letters, numbers and hyphens only. The console renders
an unknown id legibly, but keep to these so its filters group right.

Auto-collect what a reporter never knows how to answer: this app's own
version (from whatever this repo's release/version carrier is) into
`p_app_version`, and a human-readable OS/runtime line into `p_os` (≤128
characters, e.g. "Windows 11 · 10.0.26200"). Never make the user type either.

THE BAR

- Findable: sending feedback is reachable from where a user already is,
  without being told it exists — the same neighbourhood where this app keeps
  its other account-level things.
- Nothing pre-selected: the kind is a real choice, all five offered with a
  line each saying what they mean. A form that defaults to Bug files praise
  as bugs.
- The form says where the words go and that a reply will come back here, and
  which account it is sending as — a feedback form that does not say who
  reads it is a form people close.
- The contact line stays optional and says why it exists ("only if you want
  an answer somewhere else too — replies here work without it").
- Every state has a face: sending, sent (with the report number), refused
  (the server's own sentence), and could-not-reach (which is not a refusal
  and must not read like one).
- The limits have a face too: a wait is a live countdown in words next to
  the send control, and the last few reports of the day are counted down
  before the wall, not at it.
- The reply panel appears at startup only when something is actually waiting,
  quotes the user's original words (a bare "fixed!" with no context is a
  puzzle), and a failed inbox read shows NOTHING — it tries again next
  launch. It must never put an error over an app that otherwise works.
- Native to this app: its own controls, spacing, themes and dialog patterns,
  keyboard and screen-reader behaviour included. No foreign-looking screen,
  no unstyled control.
- Signed-out users get this app's normal pattern for account-gated features;
  feedback needs the account because the reply has to find its sender.

DONE WHEN

From a signed-in run of the real app: I send feedback with a chosen kind and
no contact line, and it answers with a reference number. Sending a second one
straight away is refused in a sentence I can read, with a countdown beside
the button that runs down and lets me send again — and pressing Send twice
on the SAME text gives me the same reference number, not two reports. In the TDG Cebu
Developer console (`#/dev` → Feedback) that report shows this app's id, the
right version and OS, and my account. After a reply is written there, the
next launch of this app opens the panel with the reply quoted against what I
wrote; pressing Got It flips that reply to SEEN in the console, and the panel
does not return on the launch after that — while dismissing it without Got It
brings it back instead. And I found all of it without being told where
anything was.
