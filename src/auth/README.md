# `src/auth/` · signing in to TDG Core

A TDG account is one account across every TDG app. This folder is the site's end
of it: the session, the profile row, noticing a session that was ended
elsewhere, and what a refusal says.

| File | What it is |
| --- | --- |
| `AuthProvider.tsx` | The context: session, user, profile, and every sign-in / sign-up / reset call. |
| `sessionGuard.ts` | Noticing that a session was ended somewhere else. |
| `wording.ts` | What a refusal says, in one place. |

The server half is [`supabase/`](../../supabase/README.md). The client is
[`../lib/supabase.ts`](../lib/README.md).

---

## Why sign-in goes through an edge function

GoTrue only knows **email and password**. Turning a **username** into a session
needs something that can resolve a handle to an address first, and **a browser
may not do that** — a function that turns a public handle into somebody's email
address is an email-harvesting endpoint.

So `AuthProvider` posts to `tdg-site-account`, which is the only thing on this
site that may call `bea_login_identity`, and which never returns the address it
resolved: only a session, or a refusal.

Everything GoTrue *can* do directly — password reset completion, OAuth, sign-up
— still goes through supabase-js from the browser.

## Creating an account signs you in

**No TDG account waits on an email.** Signing up ends signed in, and signing in
never asks anybody to go and find a link first. That is the rule for every TDG
app, not just this one.

**It is kept in the database all the apps share**, not here:
`on_auth_user_confirm_email` in tdg-core, a `BEFORE INSERT` trigger on
`auth.users` that stamps `email_confirmed_at` as the row is written
(`supabase/migrations/20260828210000_accounts_never_wait_on_email.sql`, which
carries the full reasoning and the measurements). The obvious place would have
been GoTrue's own `mailer_autoconfirm`, but that is a **dashboard** switch — no
SQL and nothing in any TDG repo can move it, and it is still `false`. Ask
`/auth/v1/settings` if you want to see for yourself; it is public.

Measured on the live project rather than assumed: with the row already
confirmed, GoTrue sends **no** confirmation email and answers the sign-up
**with a session**. So `signUp` normally has nothing left to do.

**`signUp` finishes the job anyway when it has to.** No session back means one
password grant through `passwordSignIn` — the same helper the Login tab uses,
so there is one set of refusals for one situation. That branch does not run
today. It is there because the rule lives in a database this repo does not own,
and dropping that trigger would otherwise turn every sign-up back into "check
your email".

**Its two failures are deliberately different things.** `error` means nothing
was created. `pending` means the account is REAL and this browser is not signed
in to it, and it carries the endpoint's own sentence about why — an unconfirmed
email and a lost connection need opposite things done about them. Calling
`pending` an error would send somebody to sign up a second time on an address
that is now taken; `AuthModal` instead moves them to **Log in** with the
address already filled and prints the sentence there.

## Signing in with Google is only two-thirds of a sign-up

A TDG account needs an **email, a password and a username**. The Sign up form
collects all three at once, and tdg-core's `handle_new_user` reads the last two
out of `raw_user_meta_data` as the `auth.users` row is written. **A provider
sends neither of them.**

Measured on the live project rather than assumed. The one Google-only account
on it carries `iss sub name email picture full_name avatar_url provider_id
email_verified phone_verified` — no `username`, no `display_name` — so its
profile row was written with a null username and GoTrue never set a password.

That account has no handle to print (the console shows `no username`, the
account page falls back to its display name), has no
profile page at all (a TDG page is addressed by its handle), and **cannot log
in anywhere but the two apps that draw a Google button**: Bible Educator ships
`PUBLIC_SUPABASE_OAUTH` empty, and Music Everything, DevFleet and Makullveny
have no OAuth path at all, so all four offer username-or-email plus a password
to an account holding neither.

**So `signInWithOAuth` is not the end of a sign-up, and `setup` is what says
so.** `AuthProvider` asks `tdg_account_setup()` at every sign-in — not only
after a redirect, because somebody who dismisses the form once and comes back
next week on another machine still has the same half-built account — and
`AuthModal` grows a third mode beside `recovery` to collect what is missing.
`App.tsx` opens it when the answer arrives, and the account menu keeps a
**Finish Setting Up** door so a dismissal is never final.

Three rules hold this together:

- **The answer comes from Postgres, never from the client.**
  `auth.users.encrypted_password` is readable by nothing here, and
  `user.identities` answers a different question — which providers are linked,
  never whether a password grant would work.
- **The missing fields are asked for, never invented.** A username derived from
  an email address publishes half of somebody's address as a public handle, and
  the provider's `name` is their real name. It is offered as a prefilled,
  editable box; there is no suggested username at all.
- **The username goes through `tdg_claim_username`, not an update.** The
  check-then-write the Sign up tab does has a race in it, and this is the form
  where losing it would be worst — somebody arriving from Google with nothing,
  told the name was theirs, still with no handle. The unique index decides and
  the refusal arrives as a code; `claimRefusal` in `wording.ts` says what each
  one means.

`refreshProfile()` re-reads `setup` alongside the profile row, because the
Account page can satisfy it too: a username typed into Your Details is the same
act as one typed into this form.

## `wording.ts` · match on codes, never on message text

This is not a style preference. It is the difference between a right answer and a
wrong one.

GoTrue's messages **overlap**. Refusing a password you are already using reads
`New password should be different from the old password.`, which contains the
substring `password should be` that a too-short check would look for. A table of
substrings therefore answers *"use at least six characters"* to somebody who
typed twelve, and which arm wins is decided by nothing more principled than the
order they happen to be written in.

A code cannot be a prefix of another code. Match `error_code`.

**Two vocabularies meet in this file.** `tdg-site-account` answers with a
deliberately tiny set — `invalid_credentials`, `email_not_confirmed`,
`rate_limited`, `server_error`, `bad_request` — chosen so it can never reveal
whether an account exists. supabase-js answers with GoTrue's own codes. Both land
here, so the site says one thing about one situation however it found out.

**A fetch that never landed is not bad credentials.** Saying so would send
somebody to reset a password that was right all along, which is why
`OFFLINE_MESSAGE` exists.

**A THIRD vocabulary arrives with `claimRefusal`, and it is Postgres's.**
`tdg_claim_username` is an RPC, so its refusals come through PostgREST as
`error.code`: `PT422`, `PT409`, `PT429`, `28000`. None of those are codes an
auth server can send, so they get their own function rather than four more arms
of `authMessage` — the discipline in that switch is that every arm answers a
code something real can actually produce. `PT429`'s own message is passed
through, because the server writes the date the cooldown ends into it.

**A refusal the browser makes has no code to match**, because no request was
sent. Those are `FORM_REFUSAL` in the same file — a plain object, deliberately
not extra arms of `authMessage`, because an arm with an invented code that no
server can send is an arm the next reader cannot tell from a real one.
`usernameShapeProblem` and `USERNAME_RULE` are the same idea: the check and the
sentence explaining it are one fact, and `USERNAME_RULE` is composed from
`USERNAME_MIN` and `USERNAME_MAX` so the prose cannot drift from the numbers.
`AuthModal.tsx` imports all of it and states none of it.

**There is no password length anywhere in this folder or in the modal.** The
minimum is a Supabase dashboard setting that can move with no build here, so
the only refusal that stays true is GoTrue's own `weak_password` sentence,
passed through. The modal's strength meter is an opinion, not a gate.

## `sessionGuard.ts` · the hour nothing can reach into

"Sign Out Everywhere" in the Developer console deletes every row the account has
in `auth.sessions`, and the cascade takes its refresh tokens. From that instant
the refresh grant answers `refresh_token_not_found`.

**What nothing can do is expire an access token already in a browser.** It is a
signed JWT with a one-hour life, and PostgREST accepts it on its signature alone
— it never asks whether the session behind it still exists. supabase-js restores
it from storage on boot and only talks to the server when it is near expiring.

So the honest description of the old behaviour: sign out everywhere ended every
session in the database and the tab stayed signed in for up to another hour,
reloads included. Measured, not guessed.

**`/auth/v1/user` is the one thing that checks.** The token carries a
`session_id` claim and that endpoint answers `403 session_not_found` once the
session is gone. That call is `supabase.auth.getUser()`. It is **not**
`getSession()`, which reads storage and returns whatever it finds.

This module asks at the four moments a person would expect an answer: **boot, tab
foreground, back online, and every 5 minutes.** Foreground is the one that
matters — a reload or a click back onto the tab is the moment somebody finds out,
which is what "sign out everywhere" is expected to mean.

**A failed request is never a revocation.** Only an answer from the server
counts, so nobody is signed out for walking into a lift.

The other TDG apps run the same guard: Bible Educator in
`src/services/account/sessionGuard.ts`, TDG Veditor in
`src/main/accounts/session-guard.ts`.

## `profile.is_admin`

Readable here **only because `profiles_select_own` lets an account read its own
row** — nobody learns anybody else's. It is the same column `bea_is_admin()`
reads, so this and the server always agree about who is a developer.

It gates whether the Developer tab is even rendered. **It gates nothing else.**
Every read and write the console makes goes through a Postgres function that
checks for itself. Never move a permission decision into this folder.

## The profile is read once, and re-read exactly once more

`AuthProvider` fetches the profile row when the session arrives and holds it for
the life of the tab. That was right while nothing on this site could change it.

The Account page can (`src/account/`), so the context now exposes
**`refreshProfile()`**, and that page calls it after every field it saves.
Without it, saving a display name would leave the nav's account menu, the
account page's own title and everything else reading `profile` showing the old
one until the next sign-in.

**It is a re-READ, not a setter taking the new values**, and that is the whole
point. `public.profiles` has triggers on it: `recovery_email` is lowercased and
trimmed on the way in, and `username_changed_at` is stamped by
`touch_profile_timestamps` on a column no client may write. What was sent is
therefore not always what was stored, and a client that assumed otherwise would
show a value the database does not agree with. Ask.

A failed refresh leaves the previous profile standing. Stale and true beats
blank: it runs right after a save, and blanking somebody's own name because the
follow-up request lost the network would look exactly like the save having
destroyed it.

`PROFILE_COLUMNS` grew with the page — `bio`, `recovery_email` and
`username_changed_at` joined it, because a form that cannot read the current
value can only offer an empty box, and an empty box beside a saved value reads
as the value having been lost. All three are readable for the same reason
`is_admin` is: `profiles_select_own` lets an account read its OWN row. Keep the
list explicit; **never `select('*')` against a table four other apps share.**

## Rules for changing anything here

- **Never reveal whether an account exists — with one named exception, at
  sign-up.** Sign-in and password reset must not, and `tdg-site-account`'s
  vocabulary is deliberately small so that they cannot; keep any new error
  inside it. The exception is in `AuthProvider.tsx`, with its reasoning written
  beside it: GoTrue answers a sign-up for an address it already knows with a
  success shaped exactly like a new one — a user object, no session, and an
  empty `identities` array as the only tell — so left alone the form tells
  somebody who already has an account to go and wait for a confirmation email
  that is never coming. Saying so plainly costs the anti-enumeration property,
  which is a trade worth making on a site this size. **That is the only place
  the trade is made.** Anything else that would leak existence needs its own
  paragraph of reasoning before it ships, or it is an oversight wearing the
  same clothes.
- **Never put a secret in this folder.** The publishable key is not one; a
  service-role key would be, and there is no place for it in a static site.
- **A new refusal gets a code and an entry in `wording.ts`**, never an inline
  string in a component.
- The auth modal is always dark and does not reskin with the page. That is
  deliberate — see [`../components/README.md`](../components/README.md).
