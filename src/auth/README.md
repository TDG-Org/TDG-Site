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

## Rules for changing anything here

- **Never reveal whether an account exists.** The endpoint's vocabulary is small
  on purpose; keep any new error inside it.
- **Never put a secret in this folder.** The publishable key is not one; a
  service-role key would be, and there is no place for it in a static site.
- **A new refusal gets a code and an entry in `wording.ts`**, never an inline
  string in a component.
- The auth modal is always dark and does not reskin with the page. That is
  deliberate — see [`../components/README.md`](../components/README.md).
