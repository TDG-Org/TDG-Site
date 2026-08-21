# `src/dev/` — the TDG Core Developer console

The internal page at `#/dev`. One place to see and change any account across
**all** of TDG Core — Bible Educator, Makullveny, TDG Veditor and DevFleet — and
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
in the **account menu**, not on this page — a switch you can only reach through
the thing it hides is a switch you cannot un-flip.

## What it can do

Search by name, `@username`, email or user id, then for the account you pick:

- **Identity** — display name, username, bio, and their two profile-privacy
  flags. Blank clears a field; anything you do not touch is left alone.
- **Permissions** — grant or revoke Developer. Never on yourself, in either
  direction: that rule is what stops the last developer locking everyone out.
- **TDG Core Subscription** — the tier every TDG app can gate on. Free grants,
  no Stripe. Flags duplicate `subscriptions` rows, which apps read as a fault.
- **Makullveny** — its own tier and status, the Candle bundle, the supporter
  badge, and each marketplace theme.
- **TDG Veditor / DevFleet Store** — each pack on or off, for anybody. (The
  existing `veditor_admin_set_pack` only ever touched your own account.)
- **Standing** — suspend (locks sign-in across every TDG app and ends every live
  session), hide from Bible Educator's public surfaces, sign out everywhere,
  soft delete, restore, and permanent deletion behind a typed confirmation.
- **History** — every payment, free grant and moderation action on that account.

Two more tabs cover the whole project: **Purchases** (all three ledgers merged,
with `PAID` and `GRANTED` told apart) and **Audit Log** (every developer action
in every app).

## Files

| File | What it is |
| --- | --- |
| `DevConsole.tsx` | The page: header, the overview numbers, the three tabs, the roster, and the one action runner every write goes through. |
| `AccountDetail.tsx` | The nine panels for one account. Each states what it is and names the table it writes. |
| `controls.tsx` | Panel, Field, Fact, TextInput, Select, Combo, Switch, Button, Tag, OwnTile, TypeToConfirm, toasts. Shared so fifteen switches cannot drift into fifteen switches. |
| `api.ts` | Every `tdg_admin_*` call, typed. No table access anywhere. |
| `format.ts` | Dates, money, the derived one-line **standing** for an account, and the ban/hide durations. |
| `devMode.ts` | The show-the-tab switch. localStorage, per device. |
| `DevConsole.css` | All of the above, themed from the site's own tokens. |

## How the security actually works

**The boundary is in Postgres, and only in Postgres.** Every function the
console calls opens with `bea_is_admin()` and raises `42501` otherwise. The
entitlement tables have no client write policies at all — even a developer
cannot `UPDATE` them directly — so a grant can only happen through a function
that also writes the ledger row beside it. See
`supabase/migrations/20260821090000_tdg_core_admin_console.sql`.

**Everything else is camouflage, and it is honest about that:**

- The console is a dynamic `import()`, so its chunk is only ever fetched by a
  browser already told it is signed in as a developer.
- `chunkFileNames` in `vite.config.ts` publishes that chunk under a bare hash,
  so it is not named in the deployed asset list.
- `#/dev` without the flag renders the home page and leaves the hash alone —
  the same thing `#/banana` does. No notice, no redirect: both of those answer
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
   `DevAccount` in `api.ts`, in the same sitting — there is no generated types
   package to catch a drift.
3. Give it a panel with a `what` sentence and a `writes` table name. A control
   whose effect a tired developer at midnight cannot name is a bug.
4. Reuse `controls.tsx`. Nothing here ships wearing the browser's default look.
