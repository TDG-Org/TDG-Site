# `src/dev/` · the TDG Core Developer console

The internal page at `#/dev`. One place to see and change any account across
**all** of TDG Core (Bible Educator, Makullveny, TDG Veditor and DevFleet) and
the money and moderation trail behind it.

Bible Educator has its own Developer tab and it stays what it is: it manages
Bible Educator. This one manages the shared project all four apps sign into.

---

## Getting to it

Three things have to be true, and they do different jobs:

| | What it does | What happens without it |
| --- | --- | --- |
| `profiles.is_admin` on your account | The **only** thing that grants anything | Every read and write answers `42501` |
| Developer Mode (account menu) | Shows or hides the nav tab | `#/dev` still works; the tab is just not there |
| The `#/dev` hash | Picks the page | You are on the home page |

Turning Developer Mode off is for shoulders and screen shares. The switch lives
in the **account menu**, not on this page. A switch you can only reach through
the thing it hides is a switch you cannot un-flip.

## Reading it

**Every section starts collapsed**, and there is an Expand All / Collapse All
row at the top with a live count of how many are open. The count is only ever
about sections currently on screen. Switching tabs changes it, because the two
buttons only act on what you can see.

A shut section still carries its title, the sentence saying what it is, and a
summary tag on the right: the tier, the pack count, `DEVELOPER`, `SUSPENDED`,
whether there are unsaved edits. So the closed page is a readable index of the
account rather than nine mystery headings, and one click gets you into the one
you wanted instead of scrolling past eight you did not.

Which sections are open follows you between accounts. Expanding Makullveny and
then clicking the next person shows Makullveny open again, which is what makes
comparing two accounts bearable. Nothing persists across a reload, so every visit
starts shut.

## What it can do

Search by name, `@username`, email or user id, then for the account you pick:

- **Identity:** display name, username, bio, and their two profile-privacy
  flags. Blank clears a field; anything you do not touch is left alone.
- **Permissions:** grant or revoke Developer. Never on yourself, in either
  direction: that rule is what stops the last developer locking everyone out.
  Never on `@luke` or `@nm8` either, in the revoking direction (see below).
- **TDG Core Subscription:** the tier every TDG app can gate on. Free grants,
  no Stripe. Flags duplicate `subscriptions` rows, which apps read as a fault.
- **Makullveny:** its own tier and status, the Candle bundle, the supporter
  badge, and each marketplace theme.
- **TDG Veditor / DevFleet Store:** each pack on or off, for anybody. (The
  existing `veditor_admin_set_pack` only ever touched your own account.)
- **Standing:** suspend (locks sign-in across every TDG app and ends every live
  session), hide from Bible Educator's public surfaces, sign out everywhere (see
  below for what that does and does not reach), soft delete, restore, and
  permanent deletion behind a typed confirmation.
- **History:** every payment, free grant and moderation action on that account.

Two more tabs cover the whole project: **Purchases** (all three ledgers merged,
with `PAID` and `GRANTED` told apart) and **Audit Log** (every developer action
in every app).

## Files

| File | What it is |
| --- | --- |
| `DevConsole.tsx` | The page: header, the overview numbers, the three tabs, the roster, and the one action runner every write goes through. |
| `AccountDetail.tsx` | The nine panels for one account. Each states what it is and names the table it writes. |
| `controls.tsx` | Panel, SectionControls, Field, Fact, TextInput, Select, Combo, Switch, Button, Tag, OwnTile, TypeToConfirm, toasts. Shared so fifteen switches cannot drift into fifteen switches. |
| `search.tsx` | The page search: the query context, the matching helpers, and `Highlight`. Client-side by design, which is what makes it instant. |
| `../lib/sections.tsx` | Which sections are open. Lives in `src/lib/` because the public app pages fold the same way and use the same state. Shared state rather than a flag per panel, because Expand All has to reach the nine inside an account's detail, panels the page itself never renders. |
| `api.ts` | Every `tdg_admin_*` call, typed. No table access anywhere. |
| `format.ts` | Dates, money, the derived one-line **standing** for an account, and the ban/hide durations. |
| `devMode.ts` | The show-the-tab switch. localStorage, per device. |
| `DevConsole.css` | All of the above, themed from the site's own tokens. |

## The two accounts nobody can demote

`@luke` and `@nm8` keep Developer for good. Their profile row cannot be deleted
either, because deleting the row is the slower way of doing the same thing. The
console shows both as **PROTECTED**, renders the Developer switch locked with
the reason on it, and replaces Delete Forever with a sentence.

`@tdgl` is deliberately not on the list. Leaving one revocable developer means
the demote path stays exercised rather than becoming code nobody has run since
the day it was written.

**The refusing happens in a `BEFORE UPDATE OR DELETE` trigger on
`public.profiles`, not in the admin functions.** That distinction is the whole
point. Today `tdg_admin_set_admin` is the only thing in the database that
writes `is_admin`, and `authenticated` has no column grant on it, so a check
inside that one function would in fact hold. It holds because of two things
that are true right now and are not guaranteed to stay true: nobody has added a
second writer, and nobody has widened the grant. `service_role` bypasses RLS and
column grants completely, so any edge function added later is one line from
being a second writer and would not know this rule exists. A trigger does not
care which path the write came from. The guards inside `tdg_admin_set_admin`
and `tdg_admin_delete_forever` stay as well, because a trigger's error message
is a worse thing to read than a sentence written for the person reading it.

The list lives in `public.tdg_protected_account(uuid)` and matches on
`user_id`, never on the handle: `tdg_admin_set_profile` will happily rename
`@luke` from this very page, and a protection keyed on the name would come off
with the name. There is no button and no admin function for editing the list,
on purpose. Changing who is protected costs a migration, which is a decision
with a paper trail. See
`supabase/migrations/20260822015840_protected_developer_accounts.sql`.

**What this does not cover.** Suspend, hide and soft delete still work on a
protected account, because none of them touch the permission. A developer can
still lock `@luke` out for a week; they just cannot stop him being a developer
when he comes back, and any other developer can lift it. If you want those
blocked too, say so, because that is a different rule and it has a cost: the
suspend path is how you would deal with a genuinely compromised owner account.

## Sign Out Everywhere, and the hour it cannot reach into

`tdg_admin_moderate(..., 'sign_out_everywhere')` deletes every row the account
has in `auth.sessions`. The cascade on `auth.refresh_tokens.session_id` takes
its refresh tokens with it, so from that instant the refresh grant answers
`refresh_token_not_found` and no new access token can ever be minted.

**What no server can do is expire an access token already in somebody's app.**
A Supabase access token is a signed JWT with a one-hour life, and PostgREST
accepts it on its signature alone. It never asks whether the session behind it
still exists. supabase-js, for its part, restores that token from storage on
boot and only talks to the server when the token is near expiring. So for a
while this button ended every session in the database and every app carried on
exactly as before, reloads included. Measured, not inferred: with the sessions
deleted, `GET /rest/v1/profiles` still answered 200 with the account's own row.

The one thing that checks is GoTrue's own `/auth/v1/user`. The token carries a
`session_id` claim, and that endpoint answers `403 session_not_found` once the
session is gone. That call is `supabase.auth.getUser()`, and is not `getSession()`.
So each app now asks:

| App | Where | When |
| --- | --- | --- |
| This site | `src/auth/sessionGuard.ts` | boot, tab foreground, back online, every 5 min |
| Bible Educator | `src/services/account/sessionGuard.ts` | the same four |
| TDG Veditor | `src/main/accounts/session-guard.ts` + `resyncFromSession` | launch, window focus, every 5 min |

A failed request is never treated as a revocation. Only an answer from the
server counts, so nobody is signed out for losing their connection.

**What is still true, and is worth knowing before relying on this for a leaked
password:** somebody holding a stolen access token who is not running our client
can keep reading that account's own rows through the data API until the token
expires, which is at most an hour. Ending the session is what stops it being
renewed; it cannot un-sign a JWT. If that hour ever matters more than it does
today, the lever is the project's JWT expiry, not this function.

## How the security actually works

**The boundary is in Postgres, and only in Postgres.** Every function the
console calls opens with `bea_is_admin()` and raises `42501` otherwise. The
entitlement tables have no client write policies at all. Even a developer
cannot `UPDATE` them directly, so a grant can only happen through a function
that also writes the ledger row beside it. See
`supabase/migrations/20260821090000_tdg_core_admin_console.sql`.

**Everything else is camouflage, and it is honest about that:**

- The console is a dynamic `import()`, so its chunk is only ever fetched by a
  browser already told it is signed in as a developer.
- `chunkFileNames` in `vite.config.ts` publishes that chunk under a bare hash,
  so it is not named in the deployed asset list.
- `#/dev` without the flag renders the home page and leaves the hash alone, the
  same thing `#/banana` does. No notice, no redirect: both of those answer
  the question "is there something here?".

**What camouflage does not do.** This is a static site from a source-available
repo. Somebody who reads the main bundle finds the string `#/dev` and the word
`Developer`, because the nav has to be able to render that link for us. So the
console's *existence* is discoverable by anybody determined to look. Its
*contents* are not, and neither is a single one of its capabilities: without
`is_admin` the page renders nothing and every call comes back refused. Do not
add anything here that relies on the page being secret.

## Adding to it

1. Write the verb as a `tdg_admin_*` function in a new migration, guarded by
   `bea_is_admin()`, appending to the right ledger and calling `tdg_admin_log`.
2. Add the column to `tdg_admin_accounts`'s `returns table` **and** to
   `DevAccount` in `api.ts`, in the same sitting. There is no generated types
   package to catch a drift.
3. Give it a panel with a `what` sentence, a `writes` table name, a `right`
   summary tag, and `terms` naming the data it is about so the page search can
   find it. A list section passes `matchCount` instead, so its header can say
   how many of its rows matched. A control whose effect a tired developer at midnight cannot
   name is a bug, and a section that says nothing while shut is one too. Keep
   `right` non-interactive, because it renders inside the header button.
   Collapsing comes free from `Panel`; nothing to wire up.
4. Reuse `controls.tsx`. Nothing here ships wearing the browser's default look.
