# `src/badges/` · what a TDG account is, and how many there are

A **badge** is one global mark on a TDG account — true in every TDG app at
once, not per app and not per device. Bug Hunter for the friends who go looking
for what we broke, Playtester for the people who saw a build before anybody
else, Developer for us, Subscriber for anyone on a paid plan.

The server half is
[`supabase/migrations/20260826120000_tdg_account_badges.sql`](../../supabase/migrations/README.md),
and it is the authority for every sentence below.

> The house rules are in [`AGENTS.md`](../../AGENTS.md). This file is
> authoritative for `src/badges/`.

| File | What it is |
| --- | --- |
| `types.ts` | `Badge` and `AdminBadge`. No badge id is written down here. |
| `api.ts` | The four calls: `myBadges`, `publicStats`, `adminBadges`, `adminSetBadge`. |
| `useBadges.ts` | `useMyBadges()` for the signed-in account, and `useAccountCount()`, which has no caller today — see below. |

```ts
const state = useMyBadges()        // 'checking' | 'signedOut' | 'error' | 'ok'
const accounts = useAccountCount() // number, or null while unknown
```

---

## Not to be confused with `tdg_badges`

`public.tdg_badges` in tdg-core is something else and is older: per-app
**achievement** state, written by `tdg_badge_sync()` from inside an app while
somebody uses it. These live in `public.tdg_account_badges`, which nothing but
the four verbs above can read or write. Two different facts sharing one table
would mean a schema change made for one silently rewriting the other, on a
table an app writes every session.

## Why the catalogue is in SQL

Which badges exist, what each is called, and what each one's line of copy says
all come from `tdg_badge_catalog()` in Postgres. **No badge id is typed into
this folder.**

The reason is the one `tdg_feedback_kinds()` already gives: the server must
validate against exactly the list the picker offered. A badge the Developer
console can switch on and the database then rejects does not read as a bad id —
it reads as *the console is broken*. A catalogue written twice will eventually
disagree with itself, and the copy is the half that gets edited.

So a new badge is a **migration first**, and this folder needs no change at all
to render it. That is the same rule AGENTS.md rule 17 keeps about products: a
surface that lists what we have derives the list.

## Why derived badges are not stored

Two of the six are computed and marked `derived`:

| Badge | What it actually reads |
| --- | --- |
| Developer | `profiles.is_admin` |
| Subscriber | `subscriptions.tier`, wherever it is not `free` |

Both of those already have exactly one authority. A row saying the same thing
would be a **second opinion that goes stale the moment the flag flips** — take
somebody's developer permission away from `#/dev` and a stored Developer badge
would go on printing until a person remembered a table nobody was looking at.
So they are read from their own source on every call.

Nothing can grant one and nothing can revoke one. `adminSetBadge` asked for a
derived badge **throws with the server's own sentence** — *"Developer follows
the account's developer flag; it is not granted by hand"* — rather than
quietly doing nothing, because a switch that silently does nothing is worse
than one that says no. Do not pre-empt that check in the client; the boundary
is in Postgres and only in Postgres (rule 12).

`grantedAt` and `note` are `null` on a derived badge. There was no moment
anybody awarded it, and nobody wrote a reason.

## Why a failed read is its own state

`myBadges()` and `publicStats()` answer **`null` when the read failed**, and
`useMyBadges()` has an `error` state beside `ok`.

`ok` with an empty list is a real answer: an account that has not been given
anything yet. `error` is the different fact that **we do not know**, and a
caller must draw it as something other than an empty shelf. This is the rule
[`../store/useOwnedPacks.ts`](../store/README.md) settled first, for the same
reason — an answer invented from a failed request is the one mistake these
pages may not make.

Neither hook can throw during a render. Any error at all comes back as `null`,
including PostgREST's `PGRST202` for an RPC a project has not been given yet,
so a deploy that lands ahead of its migration renders a page with one line
missing rather than a blank screen.

The two **admin** calls are the opposite and throw, because their refusals are
the point: the console shows what the server said.

## `useAccountCount()`, and why it is kept with no caller

`useAccountCount()` returns how many TDG accounts exist — the server's own
count of `public.profiles`, which is the same number the Developer console's
overview calls `accounts`. One fact, one source.

**The site footer used to print it and no longer does.** The owner asked for it
gone on 2026-08-27; the hook, `api.ts`'s `publicStats` and the SQL behind them
were left in place rather than torn out with it, and that is a decision rather
than an oversight. `tdg_public_stats` is **one of the three functions on this
project granted to `anon`** (with `tdg_site_content` and
`tdg_cloud_public_config`, each identity-free for the same reason), and it was
written, granted and audited for exactly this
shape of question — a number about the whole system that carries no identity.
Dropping the client would leave that grant standing with nothing to justify it,
which is a worse state than an unused hook: the next person reading the grants
would find an anon-callable function and no reason for it.

So this is the one export in `src/` allowed to sit without a caller. If the
count is never coming back, remove all four together — this hook, `publicStats`
in `api.ts`, the row in the table above, and the `anon` grant in the migration —
and say so in the migration that does it.

## Rules for changing anything here

- **A new badge is a migration, not an edit to this folder.** Add it to
  `tdg_badge_catalog()`; the label and the blurb come with it.
- **Never write a badge id in TypeScript**, and never gate a feature on one
  read from here. A badge is a mark, not an entitlement — what somebody has
  paid for lives in `<app>_entitlements` and is read by
  [`../store/`](../store/README.md).
- **Never move a permission decision into this folder.** `adminBadges` and
  `adminSetBadge` are callable by anybody signed in; they refuse from inside,
  and that refusal is the boundary.
- **Never print an invented number.** `null` means we could not find out, and
  the honest render of that is nothing.
- The server's refusals are shown, not rewritten — they are worded to be read.
