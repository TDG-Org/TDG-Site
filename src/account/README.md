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
| `api.ts` | Every call: the privacy catalogue and its two writes, the counters, the profile save, and the social graph — its seven verbs, the people search and the favourite toggle. |
| `People.tsx` | A person as a CARD, the grid they sit in, and the search pill. Bible Educator's Friends & Sharing, in this site's materials. |
| `SocialFold.tsx` | The Friends & Social panel: Find People, and the three views behind it. |
| *(from `src/cloud/`)* `CloudFold.tsx` | The TDG Cloud fold this page mounts between Your Stats and App Stats — Coming Soon until TDG Core opens the door, the plan/storage/data controls after. It lives with the rest of the Cloud surface; see [`src/cloud/README.md`](../cloud/README.md). |
| `Friends.tsx` | Everything about drawing the friends list, shared by the section and the See All panel: the sort, the search-and-sort bar, the count line, the column measurement, and the panel itself. |
| `graphRevision.ts` | One number that goes up when this account's social graph changes, and the hook that re-renders on it. What stops three surfaces drawing three different answers at once — see below. |
| `standing.ts` | Where you stand with somebody, and what you may do about it. Shared with [`../people/`](../people/README.md) so the two surfaces cannot draw different buttons for one standing. |
| `useAccount.ts` | `useAccountStats()`, `usePrivacy()`, `useSocial()`, `usePeopleSearch()`, `useProfileEditor()`. |
| `appNames.ts` | `useAppNames()` — what to call an app the DATABASE named. `useAppWhere()` — where to SEND somebody from it: that app's own page, and its packs when it sells any. Both derived through the content overlay, both allowed to answer nothing. |
| `format.ts` | `fmtDay`, `fmtRelative`, `prettyId`, `fmtCount`, `usernameFreeAt`. A deliberate twin of `src/dev/format.ts` — see below. |
| `AccountFold.tsx` | `AccountFold` and `AccountSub`: one section of the page, open or shut. A fold title accepts React content so a product-owned section such as TDG Cloud can carry its real mark while ordinary titles remain strings. |
| `AccountPage.tsx` | The page at `#/account`, in its own lazy chunk. |
| `Account.css` | Only what is new here: the fields, the counters, the people, the apps and the privacy list. |

```ts
const stats  = useAccountStats()   // 'checking' | 'signedOut' | 'error' | 'ok'
const panel  = usePrivacy()        // the same four, plus saving / problem / setOne / setAll
const social = useSocial()         // the same four, plus busy / problem / act / favorite / reload
const finder = usePeopleSearch(on) // 'idle' | 'checking' | 'error' | 'ok', plus query / busy
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

**A miss and a hidden account are the same answer** when looking somebody up. A
different sentence for the second would turn that box into a way to test
whether a handle exists, which is the property [`../auth/README.md`](../auth/README.md)
protects everywhere else on this site.

**The buttons themselves live in `standing.ts`, not here.** Two surfaces draw a
person now — these four lists and [`../people/`](../people/README.md)'s profile
page — and the moment each holds its own `switch` they start disagreeing: a
Block on one and not the other, an Accept that says "Confirm" over here. One
table, one set of buttons, wherever a person is drawn.

## Finding people, and arranging the ones you know

**This panel is Bible Educator's Friends & Sharing, and the shape is not a loose
resemblance.** It was built as a stack of full-width rows with a directory at
the top, and the report was two sentences: *"I should not be seeing every single
user with an account in Friends & Social"* and *"That app's friends list are
also in cards for each friend/user added. Make it look like that."* Both were
right. What follows is what that app actually does, read out of
`src/tabs/profile/friendsPanel.ts` rather than remembered.

### There is no directory, and there never was one over there

Bible Educator has a box you type a `@username` into and a box that searches the
friends you already have. It cannot page through the accounts on the project,
and neither can this any more: **Find People answers nothing until two
characters are typed.** A roll-call of everybody who has signed up is a fact
about other people, and it was published because it happened to be the easiest
thing to render.

The floor is in Postgres — `tdg_search_profiles` returns no rows below two
characters, see
[`20260829010000_a_people_search_is_not_a_directory.sql`](../../supabase/migrations/README.md)
— and the hook stops short of the round trip as well. A rule that lives only in
a React hook is a rule the next client does not have.

What the box keeps is everything the old **Add A Friend** did: an exact handle
still resolves, including one belonging to an account that keeps its page
private and one belonging to an account that has blocked you. It just answers
with the person's card in front of you instead of after the press.

### Three views behind one panel, and the counts ride the buttons

Friends, **Friend Requests** and **Blocked**, reached by two buttons that carry
their own counts — which is the whole point of putting them there: both are
answerable from the friends list without going in. Requests and blocks are
answered rarely, and three sections stacked down one panel made the two you are
not using into scenery.

The count on Friend Requests is the hot chip and the count on Blocked is quiet.
Accent means *this needs you*; a block needs nothing, and painting its count the
same colour would say the opposite of what a block is. Bible Educator's own note
says exactly that, and it is repeated here because the temptation to make both
counts look important is real.

### The friends list is one row, and See All is the rest of it

The section drew **every** friend, which is fine at three and is a wall at
forty: Privacy and Session moved a screen further down for every ten people
somebody knows, and the page stopped being scannable at exactly the point the
account got interesting. So the section draws the **first row** and nothing
else, with `See All Friends` under it.

**The first row is measured, not assumed.** `.acct__grid` is `repeat(auto-fill,
minmax(min(100%, 230px), 1fr))`, so how many fit is a question about the width
it is read at — four in the shell at 1002px, one on a phone. `useGridColumns`
asks the GRID, by counting the tracks in the used value of
`grid-template-columns`, rather than recomputing `floor((w + gap) / (min +
gap))` in JavaScript: a second copy of the grid, in a language that cannot see
it, is a copy that goes wrong the day `--acct-card-min` moves. `auto-fill` is
what makes the question askable at all — it keeps the empty tracks, so a grid
holding one card still reports the four that fit. Nothing measured yet means
*draw the whole list*, never *draw none*: a failed measurement must not look
like an account with no friends.

**The panel is the same list, not a second one.** Same `PeopleList`, same bar,
same count line, over the same `query` and `sort` state — type in the section,
press See All, and the panel opens on what you were already looking at. It does
NOT carry the Friend Requests and Blocked buttons: those swap the section for a
different view of the graph, and a button inside a panel that rearranged the
page behind it would be a trapdoor.

**It is portalled to `document.body`, and that had to be driven.** The other
four dialogs on this site are mounted in `App.tsx`, so their `z-index` is
measured in the page's root stacking context. This one opens from inside a
section, and `.shell` is `position: relative; z-index: 1` — a stacking context.
Built in place, the scrim covered the viewport exactly (measured: 0, 0, 1920,
945) and the fixed nav at `z-index: 60` still painted over the top of it, lit
and clickable, because 190 inside a context of 1 loses to 60 outside it. A
modal you can click the nav through is a modal that lets you leave a page whose
scroll it has locked.

**The See All button counts against the whole list, not the filtered one.**
`useModal` gives focus back to whatever opened a dialog and skips the restore
when that element has left the page. Counted against the matches, a search
typed INSIDE the panel could cut the list to one row, unmount the button, and
leave Escape putting focus on `<body>` — driven, and that is exactly what it
did. The one case that still takes the button away is a search matching nobody,
which is honest: there is no "all" to see, and the section says so in words.

### A person is a card

`People.tsx` — a monogram, a name, a handle, and the actions under them, in a
grid whose track floor is Bible Educator's own 230px. Friends, search results,
incoming requests, requests you sent and people you have blocked are **one
component with different actions**, because five lookalike cards would be five
chances for one to drift, and the drift always shows in the same place: a person
whose card offers different buttons depending on which list found them.

The one honest translation is the primary action. Over there a card leads with
**Share With**, because sharing Scripture is what that app's friends are for,
and Public Profile hangs underneath on its own row. This site has nothing to
share, so the profile IS the point of a card and it takes the lead. Copying a
Share button we cannot honour would have been copying the picture rather than
the reasoning.

**The card leads with the affirmative action and tucks the endings behind a
toggle.** Accept, Add Friend and Unblock are on the front; Unfriend and Block
are behind the three-dot button, exactly as they are over there, because a card
whose front row offers Unfriend and Block is a card about getting rid of
somebody.

**There is no avatar and the monogram is not a placeholder for one.** There is
nowhere to upload a picture on this project and nothing that stores one, so two
letters of somebody's own name is the whole picture — which says more than a
grey circle with a stranger's outline in it.

### Both endings ask first, in place

Bible Educator opens a confirm dialog for Unfriend and Block, and exports both
sentences so the two places that can start them cannot ask different questions.
This site asks the same two questions **in the card**, because AGENTS.md rule 11
settled that for the Store's money presses: the ask replaces the row it was
started from rather than opening a second thing over the first. Its two buttons
are a mirrored pair taking their padding from one variable on the row — measured
equal, 97px each.

### Sorting, and the one option that is missing

`Name (A–Z)` and `Name (Z–A)`, with **favourites floating to the top of both**.
That is Bible Educator's rule rather than a mode of its own: a star you press
should show in whatever order you are reading. `Array.prototype.sort` is stable,
so the name sort survives inside the starred and unstarred groups.

There is deliberately no **Recently Added**. That app has one because its friend
list arrives in the order friendships were made; `tdg_my_friends` answers
alphabetically and keeps no join date, so the same option here could only be a
guess wearing a real label.

**The friends filter and the sort are NOT reads.** `tdg_my_friends` hands over
`favorite` with every row and this is the handful of people somebody actually
knows — a round trip per keystroke to reorder twenty names would be a request
spent on arithmetic the browser already has. Find People is the opposite case
and is a real read, over accounts this browser holds none of.

**The star was dead until 2026-08-28.** `tdg_my_friends` returned `favorite`
false and `sort_order` null for every row — hardcoded — while
`tdg_set_favorites` and `tdg_set_friend_order` went on writing the two columns
those values come from. A star you press, that saves, and that is gone when you
come back. The read is fixed, and the press goes through `tdg_set_favorite`, a
verb that names ONE person and one direction: the plural takes the whole set,
and two presses in flight together each send a set computed before the other
landed, so the loser silently un-stars what the winner just starred.

## Your own profile, as everybody else sees it

**Two real buttons in their own row under the identity**: `View Public Page`
and `Copy Profile Link`. It was one small tinted link at the end of the row of
chips, and it was reported as hard to see — Bible Educator's banner carries the
same pair as buttons, and a control answering *what do people see about me* is
not a footnote on a row of tags.

Copy takes the address bar's **own** origin and path rather than a written one:
this site is served from a subpath in production and from a bare host in
development, and a copied link that only works on the machine it was copied
from is worse than no button. The confirmation is a moment, not a state — left
up it would still be claiming a copy made yesterday.

Without a handle there is no page, because a profile's address is
`#/user/<handle>` and there is no other one. So the row says how to get one
instead of offering a button that goes nowhere.

## An app is called what it is called, never what the column says

`tdg_my_account_stats()` answers keyed by app id — `bea`, `veditor`,
`tdg-site` — because that is what the rows carry. A page that printed those
would tell somebody they have a `Bea` streak, which is a Supabase column value
wearing a product's clothes and is not the name of anything anybody has opened.

`useAppNames()` resolves it through `backend` on each card in
`src/data/content.ts` — the data file where a product's copy lives (rule 1) —
read via [`../content/`](../content/README.md), so a product renamed from
`#/dev` is renamed here in the same breath. An id with no card falls back to
`prettyId`, which turns `tdg-site` into `TDG Cebu`; a list that dropped what it
could not name would under-report what somebody uses, and under-reporting is
the failure nobody notices (rule 17).

The App Stats section builds its rows from the UNION of three answers: what has
synced a badge, what owns a pack, and what has counted a day. An app can be in
any one without the others, so anything narrower would leave out an app whose
only mark on the account is a pack somebody bought.

Each row also carries the way OUT of it — the app's own page, and its packs in
the Store where it sells any — from `useAppWhere()`. Both links are derived
from the same card catalogue the names come from, so an app that starts selling
gets its Store link here without an edit, and an id with no card (`tdg-site`,
or one a migration added after this build shipped) keeps its row and its name
and simply gets no links. A row that says you own something and gives you
nowhere to open it is a dead end at the exact moment somebody wants to go and
use the thing.

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
