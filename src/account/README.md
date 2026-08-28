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
| `api.ts` | Every call: the privacy catalogue and its two writes, the counters, the profile save, and the social graph with its seven verbs. |
| `useAccount.ts` | `useAccountStats()`, `usePrivacy()`, `useSocial()`, `useProfileEditor()`. |
| `appNames.ts` | `useAppNames()` — what to call an app the DATABASE named. |
| `format.ts` | `fmtDay`, `fmtRelative`, `prettyId`, `fmtCount`, `usernameFreeAt`. A deliberate twin of `src/dev/format.ts` — see below. |
| `AccountFold.tsx` | `AccountFold` and `AccountSub`: one section of the page, open or shut. |
| `AccountPage.tsx` | The page at `#/account`, in its own lazy chunk. |
| `Account.css` | Only what is new here: the fields, the counters, the people, the apps and the privacy list. |

```ts
const stats  = useAccountStats()   // 'checking' | 'signedOut' | 'error' | 'ok'
const panel  = usePrivacy()        // the same four, plus saving / problem / setOne / setAll
const social = useSocial()         // the same four, plus busy / problem / act / ask / reload
const editor = useProfileEditor()  // one FieldState per editable field, plus set / commit / reset
const name   = useAppNames()       // 'bea' -> 'Bible Educator'
```

## Six sections, and every one of them folds

The page is `.fold` rows from `AppPage.css`, driven by
[`../lib/sections.tsx`](../lib/README.md) — the same machinery the app pages
and the Developer console use. So **Expand All and Collapse All reach every
section without being told any of them exist**, and a seventh added later joins
for free.

`AccountFold` is not `Folded.tsx`'s `Fold`. That one renders a `PageSection`'s
`blocks`, a vocabulary of prose written in `src/data/`, which cannot express a
form or a list of people with buttons on them. So this is the same ROW with
arbitrary children under it, sharing the stylesheet rather than copying it — a
second set of lookalike collapsible rows is how two surfaces that should feel
identical start drifting.

**The page does not open fully collapsed, which is a deliberate departure**
from what `sections.tsx` describes as the default. An app page is ten sections
of prose you browse; two of these six ARE the answer somebody came for — what
this account is, and what it has added up to. Every other row is one line and a
chevron.

A shut row still answers for itself: `what` is the line that makes a collapsed
page readable, and `count` is the one figure worth seeing without opening — how
many friends, or, when somebody is waiting on you, **that** instead. A section
that says nothing while shut is a bug.

## Your details are editable, one field at a time

Display name, username, bio and recovery email are a direct `update` on
`public.profiles` — not an RPC, because this is the one write on the page an
account genuinely owns, and `profiles_update_own` plus the column grants
already scope it exactly. A function here would re-implement a policy Postgres
is enforcing.

**Never name `updated_at` or `username_changed_at` in a patch.** Both are
trigger-maintained and neither is client-writable, and Postgres does not ignore
an ungranted column — it refuses the WHOLE statement with `42501`. That is what
silently broke every profile save in Bible Educator the day the column grants
were tightened, so `saveProfile` builds its row key by key and cannot spread
one in.

**One field, one save.** Not a form with a Save button: each commits when you
leave it, so a refused username never takes an unrelated bio edit down with it.
A Save button over four independent columns would have to decide what to do
when three succeed and one is refused, and every answer to that is worse than
not having the question.

**Commit on blur, never on keystroke.** A username is checked against a unique
index and a fourteen-day cooldown; one request per letter would spend that
cooldown on a half-typed name. Escape puts the stored value back, because a
field you can only correct by retyping what was there is one you cannot back
out of.

**The stored value is the truth, and it is re-read.** After a save the profile
is fetched again through `refreshProfile()` rather than patched locally,
because the row has triggers: `recovery_email` is lowercased and trimmed on the
way in, and `username_changed_at` is stamped. A refusal puts the field back to
what is stored and says why underneath it — leaving the rejected text in the
box would look like it had been accepted, and the hint reserves its height so
the swap moves nothing.

The four refusals are matched on `code`, never on message text, which is the
rule [`../auth/wording.ts`](../auth/README.md) settled and explains at length.
`PT429`'s own message is passed through untouched because it already names the
date the cooldown ends — and `usernameFreeAt` says that date BEFORE somebody
types a new name, which is the difference between a rule and an ambush.

## The social graph, and why every action re-reads

Friends, the requests in both directions, and blocks — read as four lists in
one call, changed through the seven `tdg_*` verbs. `tdg_profile_state` has no
client write policies at all, so those verbs are the whole surface: they
validate, they write both sides of a friendship, and they are where the
friend-request privacy control is enforced.

**A press runs the verb and then reads the graph again**, rather than patching
four arrays. One action moves a person between lists and often changes both
sides at once — blocking removes them from Friends AND adds them to Blocked AND
clears anything pending in either direction. Patching for each of seven verbs
is seven chances to get one arm wrong, and the failure is silent: a card in two
lists, or a friend who never appears. One round trip on an action somebody
takes a handful of times buys a panel that cannot disagree with the database.

**The buttons on a person come from where you already STAND with them.**
Somebody who asked you gets Accept and Decline; somebody you asked gets
Withdraw; a friend gets Unfriend and Block; a blocked account gets Unblock.
Drawing all seven and letting the server refuse five would be five buttons that
look like actions and are guaranteed to be errors — the mistake Bible
Educator's profile page made and fixed, and the reason its README spells the
standings out one by one.

**A miss and a hidden account are the same answer** when adding by username. A
different sentence for the second would turn that box into a way to test
whether a handle exists, which is the property [`../auth/README.md`](../auth/README.md)
protects everywhere else on this site.

## An app is called what it is called, never what the column says

`tdg_my_account_stats()` answers keyed by app id — `bea`, `veditor`,
`tdg-site` — because that is what the rows carry. A page that printed those
would tell somebody they have a `Bea` streak, which is a Supabase column value
wearing a product's clothes and is not the name of anything anybody has opened.

`useAppNames()` resolves it through `backend` on each card in
`src/data/content.ts` — the data file where a product's copy lives (rule 1) —
read via [`../content/`](../content/README.md), so a product renamed from
`#/dev` is renamed here in the same breath. An id with no card falls back to
`prettyId`, which turns `tdg-site` into `TDG Site`; a list that dropped what it
could not name would under-report what somebody uses, and under-reporting is
the failure nobody notices (rule 17).

The App Stats section builds its rows from the UNION of three answers: what has
synced a badge, what owns a pack, and what has counted a day. An app can be in
any one without the others, so anything narrower would leave out an app whose
only mark on the account is a pack somebody bought.

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
- **Never add a column to a `profiles` patch without checking its grant.** An
  ungranted column is not ignored — it refuses the whole save, and the failure
  looks like the page being broken rather than like a permission.
- **A new section is an `AccountFold`**, and it registers itself. Do not add it
  to a list somewhere for Expand All to find.
- The server's refusals are **shown, not rewritten** — they are worded to be
  read.
