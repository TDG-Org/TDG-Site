# `src/feedback/` · sending feedback, and hearing back

The public half of TDG feedback, on this site. The other half — reading
everybody's reports, replying, statuses — is the Developer console's Feedback
tab (`src/dev/`), and the server contract both halves speak is
`supabase/migrations/20260823170000_user_feedback.sql`.

> The house rules are in [`AGENTS.md`](../../AGENTS.md). This file is
> authoritative for `src/feedback/`.

| File | What it is |
| --- | --- |
| `api.ts` | The `tdg_feedback_*` calls: submit, inbox, ack. Also the kind list's copy, the OS description (`describePlatform`), and the app id this site submits under (`tdg-site`). |
| `FeedbackDialog.tsx` | The send form: pick a kind (nothing pre-selected), write it, optionally leave a contact line. Opened from **Send Feedback** in the account menu (`Nav.tsx`). |
| `ReplyInbox.tsx` | The startup panel that delivers a developer's reply, quoted next to what the person originally wrote. Checks once per sign-in; renders nothing when nothing waits. |
| `Feedback.css` | Both dialogs' skin. Themed with the page — unlike the auth modal, which is always dark on purpose. |

## The loop, end to end

1. A signed-in visitor sends a report. Their identity rides the JWT — never a
   form field — with the site's version (`__TDG_SITE_VERSION__`, baked from
   `package.json` by `vite.config.ts`) and a readable OS string.
2. It appears in the Developer console's Feedback tab, marked `new`.
3. A developer replies there. The reply *is* the delivery: it waits in
   `tdg_feedback_replies` until this site's `ReplyInbox` (or the app's own
   equivalent) asks at boot, shows it, and the reader presses **Got It**.
4. Got It acks each reply (`tdg_feedback_ack`), which is what flips the
   console's NOT SEEN YET to SEEN. Escape and the scrim deliberately do
   **not** ack — a reflex dismissal costs nothing, the reply returns next
   visit, and the panel offers Show Me Next Time to make that a choice.

## Rules this folder lives by

- **Never import from `src/dev/`.** That folder is a lazy chunk only a
  developer's browser ever fetches; one import here would put the whole
  console in everybody's bundle. The one helper both sides want (an app id
  made readable) is four lines and is duplicated on purpose.
- **The server's refusals are shown, not rewritten.** They are worded to be
  read — "pick what kind of feedback this is" — and a network failure gets
  its own sentence, because "the server said no" and "the server never heard
  you" are different problems.
- **The kind ids are the server's** (`tdg_feedback_kinds()` in the migration);
  `FEEDBACK_KINDS` here holds only the words the picker shows. Add a kind in
  a migration first, then give it copy here.
- The inbox is opportunistic: a failed read shows nothing and tries again next
  boot. It must never put an error over a page that otherwise works.

## Giving another TDG app this feature

The ready-to-paste brief for an app's Claude session is
[`docs/feedback-app-prompt.md`](../../docs/feedback-app-prompt.md). This
folder is its reference implementation.
