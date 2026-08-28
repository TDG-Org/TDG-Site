# `src/account/` · your TDG account, and who may see it

One TDG account signs you in to every app we make. This folder is the page that
shows you what that account **is**, what it has added up to, and — control by
control — **who can see each part of it**.

The server half is
[`supabase/migrations/20260828090000_tdg_privacy_and_table_merges.sql`](../../supabase/migrations/README.md)
and the small `..._093000_tdg_privacy_groups.sql` beside it. Between them they
are the authority for every sentence below.

> The house rules are in [`AGENTS.md`](../../AGENTS.md). This file is
> authoritative for `src/account/`.

| File | What it is |
| --- | --- |
| `types.ts` | `Audience`, `PrivacyControl`, `PrivacyGroup`, `AccountStats`. **No key, audience or app id is written down here.** |
| `api.ts` | The six calls: `privacyAudiences`, `privacyGroups`, `myPrivacy`, `setPrivacy`, `setPrivacyMany`, `myAccountStats`. |
| `useAccount.ts` | `useAccountStats()` and `usePrivacy()`. |
| `format.ts` | `fmtDay`, `fmtRelative`, `prettyId`, `fmtCount`. A deliberate twin of `src/dev/format.ts` — see below. |
| `AccountPage.tsx` | The page at `#/account`, in its own lazy chunk. |
| `Account.css` | Only what is new here: the privacy list and the counters. |

```ts
const stats = useAccountStats()  // 'checking' | 'signedOut' | 'error' | 'ok'
const panel = usePrivacy()       // the same four, plus saving / problem / setOne / setAll
```

---

## The route is not gated, and that is the point

`#/account` is a real route that answers for itself. A signed-out reader who
opens it — or who follows a link somebody sent them — is told to sign in, in
words, on the page they asked for.

That is the **opposite** of what `#/dev` does, and the difference is
deliberate. `#/dev` renders home for anybody who is not a developer, because a
console nobody should know about has to answer exactly what an unknown hash
answers. This page is linked from the nav on every page of the site; rendering
home for it would answer *"is there something here?"* with a silence that is
simply wrong.

## Privacy is three words, not a switch

Every control is set to one of `public` · `friends` · `self`, and the whole
reason the model changed is that a boolean could only ever say **everyone or
nobody** — never the one thing people actually want to say, which is *my
friends, and not the internet*.

`friend_requests` is the one control whose middle value means something else —
friends **of** friends — because "only people already on your friends list may
ask to be your friend" is a sentence that cannot be true. **This folder does
not know that.** The catalogue marks the control `kind: 'contact'`, and the
audience carries a second line of copy for exactly that case, so a second
contact-shaped control needs no change here.

`kind` also decides gating: a `content` control is gated by the `profile`
control above it — a page nobody may open cannot show a streak — and a
`contact` control is not, because a private profile still has to be able to
receive a friend request. Bible Educator settled that one first and on purpose.

## Nothing in this folder names a control, an audience, a group or an app

The vocabulary lives in `tdg_privacy_catalog()`, `tdg_privacy_audiences()` and
`tdg_privacy_groups()` in Postgres. The counters name no app either: the server
derives `packs` from `tdg_store_apps()` and `apps` and `streaks` from whatever
has actually written a row.

Same rule, same reason, as [`../badges/README.md`](../badges/README.md): the
server validates a save against **exactly** the catalogue the page was drawn
from, so the two cannot drift, and an option the page offers that the database
then refuses does not read as a bad id — it reads as *the page is broken*.

So **a new privacy control is a migration and no TypeScript**, and it appears
in every TDG app at once.

The other half of that rule is that **an id this build has never seen still
gets a face** (AGENTS.md rule 17). An unknown audience draws as an option with
a label made from its id; an unknown group draws as a heading made from its id,
with its controls under it. A list that quietly dropped what it could not name
would be a privacy screen that does not show you all of your privacy, which is
the one thing it exists not to do.

## Why a failed read is its own state, and why it matters most here

`api.ts` answers **null** on any failed read, and both hooks have an `error`
state beside `ok`. This is the rule
[`../store/useOwnedPacks.ts`](../store/README.md) settled first and
[`../badges/README.md`](../badges/README.md) repeats.

It matters more on this page than anywhere else on the site, because the
invented answer would be **"your profile is public."** A panel drawn from a
failed read would show a row of default switches — which for a fresh account is
Everyone — and tell somebody their profile is open when the site has no idea
what it is. So the panel says, in words, that it could not read them, and draws
no controls at all.

The three privacy reads land **together or not at all**, for the same reason: a
panel with controls but no audiences, or rows but no headings, is a half-drawn
list that looks like a working one.

## Writes throw. Reads do not.

A refused write **throws with the server's own sentence**, and the page shows
it where the press was made. `tdg_set_privacy` refuses an audience a control
does not allow with a line written to be read, and a control that silently did
nothing would be worse than one that says no.

**Do not pre-empt that check here.** The boundary is in Postgres and only in
Postgres (rule 12).

A press paints immediately and un-paints on a refusal, restoring the value
captured **before** the press rather than re-reading the list — so a refusal on
one control cannot also throw away a different control that saved successfully
while it was in flight. There is no silent revert: a value going back with
nothing said would read as the site undoing the reader's choice for reasons of
its own.

`setAll` sends one call rather than a loop, because the server validates every
key before it writes any key: a batch containing one value a control does not
allow changes nothing rather than half of something. It also only sends
controls that **allow** the audience — one that does not would refuse the whole
batch and take the other seven down with it.

## The menu and the page are one feature

The account menu in the nav (`src/components/Nav.tsx`) answers *who am I signed
in as* and now carries three figures and a date, then one button to here. That
is all a 280px panel hanging off a fixed bar can honestly hold; eight privacy
controls and nine counters in it would be unreadable on a phone.

The menu's glance and its badge shelf each reserve a fixed height across all
four of their states, because a panel that grows under the pointer as a read
lands reads as a page still loading — the same floor `.store__action` keeps.

## Why `format.ts` is a copy and not an import

`src/dev/format.ts` has the same three helpers. It is the **Developer
console's**, its header says so, and it carries a dozen other things about
moderation standings and Stripe amounts that this page has no business
knowing — so a page every reader opens would be depending on a folder
documented as internal. Thirty lines repeated is cheaper than a shared module
that then belongs to neither, which is the reason
[`../feedback/README.md`](../feedback/README.md) already gives about coupling
folders.

**The one thing the twins must agree on is `TDG`.** `prettyId` exists because
ids are kebab-case everywhere, and `tdg-site` rendered as "Tdg Site" would
misspell the project's own name on its own account page. If that changes, it
changes in both files.

## It wears the app page's clothes

`.appview` and its shell, head, back control, grid texture and ghost buttons
come from `AppPage.css`, which `Folded.tsx` already imports — the same decision
`About.tsx` records, and for the same reason. `Account.css` holds only the
privacy list and the counters.

The one thing it overrides is the shell width: `.appview__shell` caps at 900px,
which is right for a column of prose and wrong for a column of rows with a
control at the right-hand edge of each. It widens to 1040px from **one**
variable, on this page and nowhere else.

## Rules for changing anything here

- **A new privacy control is a migration**, not an edit to this folder. The
  label, the blurb, the allowed audiences and the default come with it.
- **Never write a control id, an audience id, a group id or an app id in
  TypeScript**, and never gate a feature on one.
- **Never draw an invented setting.** `error` means we could not find out, and
  the honest render of that is a sentence, not a control.
- **Never move a permission decision into this folder.** Every verb here is
  callable by anybody signed in; they refuse from inside, and that refusal is
  the boundary.
- The server's refusals are **shown, not rewritten** — they are worded to be
  read.
