# Giving a TDG app the feedback loop

The server side and the developer side of TDG feedback already exist: reports
land in tdg-core and we read, answer and manage them in the TDG Site Developer
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
`supabase/migrations/20260823170000_user_feedback.sql`; TDG-Site's
`src/feedback/` folder is a working implementation of both halves if you want
to read one).

Four RPCs, all called with this app's existing signed-in Supabase client. The
caller's identity comes from the JWT — there is no user id parameter anywhere,
and no table access; the functions are the whole surface:

- `tdg_feedback_submit(p_app text, p_kind text, p_message text, p_app_version
  text default null, p_os text default null, p_contact text default null)
  returns bigint` — files one report and returns its id, which is worth
  showing ("Sent — reference #142"). `p_kind` must be one of `bug ·
  suggestion · question · praise · other`. The message is 1–5,000 characters
  after trimming; the contact line is optional free text up to 200 ("My
  instagram is @tdgluke"); version and OS are clamped rather than refused.
  There is a rate limit of 20 reports per account per 24 hours.
- `tdg_feedback_inbox()` — every developer reply this account has NOT yet
  been shown, oldest first: `(reply_id, feedback_id, app, kind, message,
  body, replied_at, replied_by)`, where `message` is the user's original
  report, carried along so the panel can quote what it is answering. It
  returns replies to this account's feedback from EVERY TDG app, not only
  this one — show them all, and let `app` say where each came from.
- `tdg_feedback_ack(p_reply_id bigint)` — "I showed it." Idempotent and
  silent.
- `tdg_feedback_mine(p_max_rows int default 100)` — the account's own
  reports with status and the whole exchange (`replies` is a jsonb array of
  `{id, body, at, by, seen_at}`). Optional: it exists so a "My Feedback"
  surface can prove that sending something is not dropping it down a well.
  Use it if this app has a natural place for that; skip it if not.

Every refusal these raise is a sentence written to be shown, prefixed
`tdg: ` — strip the prefix and show the rest. All four require a signed-in
session and answer "sign in first" without one. A request that never reached
the server is not a refusal; tell those apart in the wording.

Semantics that matter and are invisible from the signatures:

- A reply stays in the inbox until acked, so ack ONLY after it actually
  rendered and the user confirmed reading it — a deliberate press, not a
  dismissal. Escape or clicking away should cost nothing: the reply comes
  back next launch. On TDG Site the panel's two buttons are "Got It" (acks)
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
no contact line, and it answers with a reference number. In the TDG Site
Developer console (`#/dev` → Feedback) that report shows this app's id, the
right version and OS, and my account. After a reply is written there, the
next launch of this app opens the panel with the reply quoted against what I
wrote; pressing Got It flips that reply to SEEN in the console, and the panel
does not return on the launch after that — while dismissing it without Got It
brings it back instead. And I found all of it without being told where
anything was.
