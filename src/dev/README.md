# `src/dev/` · the TDG Core Developer console

The internal page at `#/dev`. One place to see and change any account across
**all** of TDG Core (Bible Educator, Makullveny, TDG Veditor and DevFleet) and
the money and moderation trail behind it — and, on its **Content** tab, what
this site says about our own products and which of them it shows at all.

Bible Educator has its own Developer tab and it stays what it is: it manages
Bible Educator. This one manages the shared project all four apps sign into.

> The house rules for building anything on this site are in
> [`AGENTS.md`](../../AGENTS.md). This file is authoritative for `src/dev/`.

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

## The list down the left

Everybody, down the left, and the one you picked opening on the right. Three
things decide what that list looks like, and they are deliberately independent
of each other: every account's **number**, your own **shortlist**, and the
**order** the rest are in.

### Every account has a number

Each row opens with `#3`, and it means the third account ever made on TDG Core.
`#1` is the first. It is in the account's own header too, beside the handle, so
the rail and the panel are talking about the same person out loud.

A uuid is not something two people can say to each other and a display name is
not unique, so this is the thing you use when you are asking somebody else to
look at the same row. The header still carries the uuid with its Copy button —
that is what a SQL query and a Stripe customer want, and it is not going
anywhere.

**It is ranked in Postgres, over the whole of `profiles`, and that is not an
implementation detail.** `tdg_admin_accounts` both filters — the search box
re-queries it — and caps, at `p_max_rows`. A number counted from the rows this
browser happens to be holding would therefore change as you typed, and a number
that moves is worse than no number, because it looks like a fact. So
`signup_no` comes back as its own column, ordered by `created_at` with
`user_id` breaking the tie, and it is the same value whatever you searched for.

Joining is also the only ordering of this table that never changes afterwards:
a rename moves a row in an alphabetical list, a sign-in moves it in a recency
list, and nothing moves an account that has already joined. Which is why every
sort below ends on it — see the next two sections.

### Pinning: your own shortlist, at the top, in your own order

The star on a row puts that account in a **Pinned** group above everything else,
and the group is drawn in the order YOU gave it. Press the star again to take it
off. It is on every row, pinned or not, because it is the only thing on this
page that says pinning exists and it may not be the control that appears once
you have already found it. There is one place to do this and it is that star —
the account's own panel deliberately has no second copy.

**Reorder a pinned row by dragging it, or with the two arrows beside its star.**
Both, and not one: a drag is what the hand reaches for, and the arrows are what
a keyboard has. The arrow at the end of the list fades rather than disappearing,
because a control that vanishes at the top of a list is a control you go looking
for. A drag lands the row after the one you dropped it on when you dragged down,
and before it when you dragged up.

**A new pin goes to the END of the list, never the top.** Dropping it on top
would rearrange a list you arranged by hand every single time you pinned
somebody, which is the one thing a hand-arranged list may not do to itself. The
server appends for the same reason, so what you see and what the table holds
cannot disagree about it.

**The pins live in Postgres, not in this browser.** `tdg_dev_pins` is one row
per (developer, account), private to the developer who made it: the person
pinned is never told, and neither is the other developer. Table with RLS on and
**no policy in either direction**; the whole surface is `tdg_admin_pins`,
`tdg_admin_set_pin` and `tdg_admin_reorder_pins`, each opening with
`tdg_admin_uid()`. That is the opposite call to `devMode.ts`, which is
localStorage and per device — and the two really are opposites. "Hide the tab
before I share a screen" is a fact about this screen. A shortlist is WORK: you
build it while you are dealing with somebody, and losing it by opening the
console on the other machine is the same loss as losing a bookmark folder.

**It is not in the audit log**, and that is a decision rather than an omission.
Every other write from this page is logged because every other write changes
something about somebody else's account. A pin changes nothing about the account
it names. Logging it would put lines in a log whose whole value is that every
line in it matters.

**Every press is optimistic and every press re-reads.** The star lights in the
frame you clicked it — a star that waits for a round trip reads as a star that
did not work — and the re-read afterwards is what makes the optimism honest: if
the server refused, the row goes back where it was and the refusal is said out
loud in a toast. Reorders are sequenced, so two quick drags cannot land in the
wrong order.

**A shortlist that failed to LOAD is not an empty shortlist.** The rail says so
in a warning with a Try Again beside it, rather than quietly drawing no pins,
because those two states look identical and mean opposite things.

`tdg_admin_reorder_pins` takes the whole order in one call and is forgiving in
both directions, because this browser's copy can be a moment behind the table:
an id it names that is not pinned is ignored, and a pin it fails to name keeps
its relative place after the ones it did. So a stale list can reorder, but it
can neither invent a pin nor drop one.

### Sorting: the rest of the list, and one press to put it back

Under the count sits one picker and a **Clear Sort** button:

| | |
| --- | --- |
| **Newest First** | The order the server sends. The default, and what Clear Sort returns to. |
| **Oldest First** | `#1` at the top, then everybody in the order they joined. |
| **Name A–Z** | By the name the account shows, case-insensitively. |
| **Recently Seen** | By last sign-in to any TDG app. Never-signed-in last, not first. |
| **Most Owned** | By how many packs and products the account holds. |

**The sort never touches the pinned group.** That is the whole point of pinning:
a sort you change to answer one question must not carry off the four people you
were working with. It is also why Clear Sort says what it clears — the search
box has its own `×` two inches above it, and one button called "Clear" between
them would be a coin toss.

**Every comparator ends on `signup_no`.** A sort with ties is a list that
reshuffles under you every time a write re-reads a row, and the number an
account joined with is the only thing about it that is both stable and unique.

The sort is remembered with the tab, the search and the open sections, and dies
with the browser tab like they do — see `viewState.ts`. The pins do not, because
they are not a view.

**The search still narrows both groups.** A pinned account that does not match
what you typed is not drawn, because a rail whose rows and whose count disagree
is a count nobody can check.

## Reading it

**Every section starts collapsed**, and there is an Expand All / Collapse All
row at the top with a live count of how many are open. The count is only ever
about sections currently on screen. Switching tabs changes it, because the two
buttons only act on what you can see.

A shut section still carries its title, the sentence saying what it is, and a
summary tag on the right: the tier, the pack count, how many badges are held,
`DEVELOPER`, `SUSPENDED`, whether there are unsaved edits. So the closed page is
a readable index of the account rather than ten mystery headings, and one click
gets you into the one you wanted instead of scrolling past nine you did not.

Which sections are open follows you between accounts. Expanding Makullveny and
then clicking the next person shows Makullveny open again, which is what makes
comparing two accounts bearable.

### The order an account reads in, and the two folds

Six sections, in the order you actually need them: who this is, what we have
done to the account, then what they hold.

| | |
| --- | --- |
| **Identity** | Who the account is. The read-only facts it was created with, the name, handle, bio and privacy we can change, and — in a fold of its own — **Permissions**. |
| **Standing & Access** | Account management: suspend, hide, soft-delete, sign out everywhere, delete forever. It is what you reach for when somebody reports abuse, so it is near the top rather than under a screen of pack switches. |
| **Badges** | The global marks, under the two panels owning the facts a derived badge follows. |
| **TDG Core & Cloud** | The two subscriptions that belong to the ACCOUNT rather than to one app: the tier every TDG app can gate on, and the TDG Cloud plan with the storage behind it. Directly above the apps that gate on them. |
| **Apps** | One fold holding Makullveny and every pack Store, each with its own fold inside. |
| **This Account's History** | Every payment, grant and moderation action, for this account. |

**At A Glance is not its own panel any more.** It was eight read-only rows about
the same account Identity edits, sitting immediately above it, so reading a join
date before editing a username meant two sections open to look at one person.

**The apps are one fold rather than seven panels.** Makullveny plus one Store
per app the console discovers — a list that grows by one every time a product
ships — used to sit in the middle of the account and push Standing & Access
below a screen and a half of pack switches. Shut, the run of sections is short
enough to read as an index. Open, every app is inside it exactly as it was, and
Expand All still reaches all of them, because `sections.tsx` holds one open set
for the whole page rather than a flag per panel.

**Cloud is discovered like an app and drawn like a subscription.**
`cloud_entitlements` is registry-shaped, so `tdg_store_apps()` finds it and it
gets the same Store panel every app gets — the same pack pickers, the same
revocation switch, the same reset. What changed is where that panel is mounted:
`AccountDetail` lifts it out of the Apps fold and into **TDG Core & Cloud**,
because it is not a thing you can do inside one app. Everything else in that
fold is *what this person can do inside DevFleet, inside Veditor*; Core and
Cloud are true of the whole account whatever they open, and reading one to
decide about the other used to mean scrolling past four apps. The lift is one
filter at the one place both lists are built, so no panel can be drawn twice or
dropped.

Above the plan controls sit Cloud's own numbers — plan, storage used against
quota, files, this month's metered downloads, any quota override, and the
retention standing when there is one. They come from `tdg_admin_cloud_account`,
the console's own verb: `tdg_cloud_status()` takes the uuid from the caller's
token and never from a parameter, which is exactly what makes it safe to grant
to every account, so it cannot answer about somebody else. A failed read says so
and leaves the plan controls alone — they read the account payload and are
unaffected — rather than drawing a plan as absent.

**A parent fold cannot hide a matching child.** A `Panel` that does not match
the page search removes itself, so the Apps fold counts its children's own
haystacks and reports that as its `matchCount`: searching a pack id opens the
fold, prints how many apps inside it matched, and shows only those.

### Developer asks before it moves

Developer grants full read and write over every account, purchase and
subscription in TDG Core, and it used to be one click in the same run of
switches as Public Friend List. It now opens a confirm in place — the same shape
rule 11 of `AGENTS.md` sets for the Store's money presses: in the panel, not in
a second dialog over the first. The switch keeps showing what is TRUE while the
question is open, because a switch that moves on the ask has already told you it
did something.

It asks in **both** directions. Granting hands somebody the console; revoking
takes a working account away from one of us mid-session.

**Two accounts skip it**, listed as `NO_CONFIRM_ACCOUNTS` in
`AccountDetail.tsx`: the developer test accounts we flip on purpose while
working on this page. A confirm on the switch you are toggling twenty times is
one you learn to click through without reading, which is worse than not having
it. It is a convenience and never a permission — the server refuses a
non-developer either way, and the two OWNER accounts are held by a trigger this
list cannot reach.

### The header carries the id

The account's uuid is in the header beside the name, handle and email, with a
Copy button. It is what every other tool on this project asks for — a SQL query,
a Stripe customer, a log line, a message to whoever is looking at the same
account — and having to open a panel to get it made the one thing you always
need the one thing you had to go and find.

## The search says which section the matches are in — on the tabs

One box filters the section you are standing in, and there are six of them. So
while the box has something in it, **every tab wears its own hit count**: a
small badge beside the tab's name saying how many of that section's rows match
what you typed. Pressing it goes there with the query intact, because pressing a
tab is what going there has always been.

There used to be a second control for this — a **Search in** row under the
search box, one button per section, each with its count. It offered the same six
destinations as the tab strip immediately below it, so the page asked twice for
one decision. The counts were the part worth keeping, so they moved onto the
tabs and the duplicate row went. The toolbar still answers in a sentence
(`12 matches across the sections below`); the badges say where.

**Content and Cloud show a dot rather than a number.** Content filters its own
panels as you type and Cloud is settings and figures rather than a filterable
list, so neither has an honest count to give ahead of time, and a zero would be
a claim rather than an absence. Every tab is still derived from the same `TABS`
list, and `sectionCounts` is keyed by `Tab`, so a section added later cannot be
left without an answer.

## Which build you are looking at

The header prints one quiet line under the lede: **`Build <version> · <when it
was built> · <how long ago>`**. The version is `package.json`'s, baked in by
`vite.config.ts`; the time is when that bundle was built.

It is there because this page can lie to you in a way nothing on it would show.
Push to `main` deploys, GitHub Pages caches `index.html`, and a tab left open
never asks again — so a browser can be running a bundle that disagrees with the
database it is talking to, and look entirely normal doing it. When
`tdg_admin_accounts` changed shape, that cost most of a day: loading the same URL
in a second browser proved nothing about what the FIRST one had loaded, and
there was no way to ask.

**The timestamp is the half that matters**, which is why the version alone was
not enough. `AGENTS.md` §6 requires a bump on every commit, and the failure worth
catching is exactly the one where a rule got skipped — two deploys sharing a
version look identical, and their build times do not.

So: if the page is behaving oddly, read that line first and compare it against
`package.json` and the last deploy. If it is older than the deploy, hard-reload
before debugging anything else. In `npm run dev` it reads as when the dev server
came up, which is the same fact for a bundle Vite is serving from memory.

It is deliberately the quietest thing in the header — mono at 11px, no border,
no fill. The live-project warning underneath it is the loud one and has to stay
that way.

## Refreshing without losing your place

The data goes stale while you read it — a payment lands, somebody else grants a
pack, you are watching a suspension take. **The Refresh button floats halfway
down the right-hand side**, so it is reachable from anywhere on a page that is
several screens long. It is on every tab, and it re-reads everything: the
overview numbers, the roster, both whole-project ledgers and the open account's
own history.

It is a labelled tile, not a bare icon: it says **Refresh**, and under that how
old the page is — `4m ago` — which is usually the answer to whether it is worth
pressing at all. That line only moves when a read actually came back, so it
cannot say "fresh" while every call is being refused.

**It has a lane; it does not float over the page.** This page is nothing but
switches, and a control big enough to read is big enough to hide one somebody
was about to press. So the section reserves a strip down its right-hand side as
its own `padding-right`, and the tile rides the shell's right edge one gap
inside it — measured at 1094, 1920 and 2560px wide, the gap between the content
and the tile stays 9–14px and never goes negative. Below 761px there is no width
to give away: the lane goes back to the page and the tile shrinks to a 46px
circle, floating, with the whole sentence in its label.

It is built from the console's own `--bg2` / `--border` / `--accent` tokens, the
same ones the panels and toasts use, **not** the inverted primary fill. A white
slab on a dark console reads as something that has landed on the page rather
than part of it, and it was wrong in exactly one of the two themes at any given
moment.

**It is not a reload, and it does not cost you your place.** The element at the
top of your screen is measured before the reads go out and put back where it was
as they land, so a roster that returns four rows shorter moves nothing you were
looking at. If you are reading somebody's DevFleet Store packs when you press it,
you are still reading them afterwards, at the same offset, with the same sections
open. A write does the same thing, for the same reason.

**And when you really do press F5.** A page cannot intercept that, so instead the
whole arrangement — the tab, the account, what is in the search box, which
sections are open, and the anchor — is written to `sessionStorage` and put back
on the next boot. The arrangement has to come back first: the panel you were
looking at only exists once the right account is selected and the right section
is open. Restoring gives up the instant you touch the wheel, a key or the
scrollbar, because a page that scrolls itself back under somebody who is
scrolling away from it is worse than one that never tried.

`sessionStorage`, deliberately: it dies with the browser tab, so tomorrow starts
clean and shut, the way this page always has. And only the first console mount
of a page load reads it, so **clicking Developer in the nav still opens at the
top with nothing selected** — a reload is the case being fixed, not a habit being
installed. See `viewState.ts` for the anchor algorithm and why it is anchors
rather than scroll offsets.

## The page grows its own app panels

**Nothing on this page names an app.** There is no `veditor` panel and no
`devfleet` panel in the source; there is one Store panel component, rendered
once per app the database turns out to have. The overview tiles, the Purchases
filter, the roster's owned count and the page search all derive from the same
answer.

**An app registers itself by having the table it needs anyway.** To sell
anything, a TDG app must create:

```sql
public.<app>_entitlements (user_id uuid, owned_packs text[],
                           stripe_customer_id text, …)
```

`tdg_store_apps()` scans for exactly that and reports what it finds. So the
whole job of adding a product to this console is a job you had already done:
create the table, and the panel, the grant switches, the ledger, the overview
tile and the audit trail all appear. **Write no TypeScript and no second
migration.** Two refinements are picked up the same way if the app offers them —
`<app>_known_packs()` becomes the list the tiles offer and grants are checked
against, `<app>_purchase_events` joins the merged Purchases ledger — and neither
is required to start.

Views are skipped **for the entitlements table**, so `veditor_entitlements_live`
does not become a second TDG Veditor. And the shape test wants all three columns:
a table that merely ends in `_entitlements` cannot half-register and render a
panel whose switches fail on contact.

The LEDGER lookup deliberately accepts a view as well, since 2026-09-01: the four
per-app ledgers merged into `tdg_purchase_events` and `<app>_purchase_events` is
now a compatibility view over it. Had that lookup stayed tables-only, every app's
`events_table` would have gone null in silence — the panels would have kept
working and the Purchases ledger would simply have emptied.

### Two sources, and the console shows you where they disagree

The database answers *what can be granted*. `src/data/store.ts` answers *what is
sold*, because prices and prose cannot be derived from a schema. `src/dev/apps.ts`
merges them, and every way they can disagree has a face rather than a silence:

| What you see | What it means |
| --- | --- |
| A panel with names from ids and no prices | On the server, not in the shop. A product being built: grantable, not buyable. |
| A red **NO TABLE** panel, switches dead | In the shop, not on the server. **An alarm** — the site is selling something a payment has nowhere to land. |
| A tile marked `not sold` | A pack on the account that neither the app's list nor the shop mentions. Switch it off; revoking is never held to the known list. |
| A tile with `ends 23 Sep` | A rented pack. `Owned` is not the whole truth about a thing that lapses, so the date is what the tile says. |

An app nobody wrote copy for is titled from its id — `musiceverything` reads as
`Musiceverything` — which is deliberately a bit ugly. It is legible, it is
honest, and giving the app an entry in `STORE_APPS` fixes it in one edit.

## What it can do

Search by name, `@username`, email or user id, then for the account you pick:

- **Identity:** display name, username, bio, and their two profile-privacy
  flags. Blank clears a field; anything you do not touch is left alone.
- **Permissions:** grant or revoke Developer. Never on yourself, in either
  direction: that rule is what stops the last developer locking everyone out.
  Never on `@luke` or `@nm8` either, in the revoking direction (see below).
- **TDG Core Subscription:** the tier every TDG app can gate on. Free grants,
  no Stripe. Flags duplicate `subscriptions` rows, which apps read as a fault.
- **Badges:** one global mark on the account — Bug Hunter for a friend who goes
  looking for what we broke — on or off, with a reason. Two of them are
  computed and are shown rather than switched. See below.
- **Makullveny:** its own tier and status, the Candle bundle, the supporter
  badge, and each marketplace theme.
- **Every pack Store:** each pack on or off, for anybody, in every app that has
  one — one panel per app, discovered rather than listed. (The existing
  `veditor_admin_set_pack` only ever touched your own account.)
- **How a recurring pack is HELD**, when its app records that: bought outright,
  renewing, cancelled and running out, in a trial, behind on a payment, or
  ended. One dropdown per held subscription-capable pack, named the way the
  Store's own card names the state. A one-time item in the same app remains a
  plain on/off grant — see below for why the distinction is structural.
- **Standing:** suspend (locks sign-in across every TDG app and ends every live
  session), hide from Bible Educator's public surfaces, sign out everywhere (see
  below for what that does and does not reach), soft delete, restore, and
  permanent deletion behind a typed confirmation.
- **History:** every payment, free grant and moderation action on that account.

Four more tabs cover the whole project: **Cloud** (below), **Feedback**
(below), **Purchases** (below) and **Audit Log** (every developer action in
every app).

## Purchases: real money, test money and grants are three different questions

The Purchases tab merges every app's money ledger into one list, and it carries
**two filters, not one**. The first picks the app. The second picks the KIND of
entry, as four buttons that partition the whole ledger:

| Button | What it is | How a row is told apart |
|---|---|---|
| **Everything** | The default. All three below, in one list. | — |
| **Real** | A live payment. Real money, from a real card. | Neither of the two below. |
| **Test** | Stripe test mode. Nobody was charged. | The recorded `event_type` ends `#test`. |
| **Grants** | Nobody paid — a pack switched on from this console or an app's own tools. | The `event_id` is `admin:…` rather than a Stripe event id. |

Every entry is exactly one of the three, so this can hide a row from you but
never from itself, and each button carries the count of what it would show —
after the app filter and the page search, so a button never promises rows the
next click cannot produce. A kind with nothing in it fades but stays live:
pressing a zero to confirm for yourself that there really are no test payments
is a legitimate thing to do.

The reason the split exists is that **a test sale carries an amount**. Mixed in
with the real ones it reads as revenue that was never taken, so the count line
above the list reports the **real** total on its own, says how many test entries
are in scope and counted in no total, and every test row's amount is struck
through with the tag `TEST` where a real one says `PAID`.

The `#test` suffix is a convention every TDG webhook writes — see
`supabase/functions/cloud-stripe-webhook/index.ts`, where the ledger's type is
deliberately a **second** name so a test event still matches the branches that
process it. `eventKind` in `format.ts` falls back to `real` rather than testing
for it positively: an app whose webhook forgets the suffix then shows its test
sale in with the real ones, which is visible and wrong, rather than quietly
hiding a real sale from the filter somebody is using to count the money.

## One thing, one control

**Nothing on this page has to be turned on before it can be configured.** That
sentence is the rule the Store panels and the Makullveny panel were rebuilt
around in 2.1.0, and it is worth stating because the page broke it in two
different ways at once.

### Two nested folds, and the CSS rule that keeps them honest

Panels nest here — every app sits inside **Apps**, and Permissions sits inside
**Identity** — and until 2.11.0 that was broken in a way that looked like a
different bug. `DevConsole.css` wrote its open-state rules as
`.dev__panel[data-open] .dev__panel-region`, a DESCENDANT selector, so opening
the Apps fold matched every panel inside it as well as the fold itself: each
app rendered fully expanded, with its chevron rotated and its rule drawn, while
React went on rendering `aria-expanded="false"` and `inert` on that child's
region.

The result was a fold that looked open, would not shut, and whose visible
controls did nothing — and the only thing that put a section right was shutting
the whole Apps fold and opening it again. Every open-state rule on this page is
written with child combinators all the way down now, and the comment above them
says so. **Never `.dev__panel[data-open] .anything` in this file.**

### A pack is one picker, and `Not Owned` is its first option

A Store pack used to wear two controls: a switch for whether the account had it,
and — rendered only once that switch was on — a dropdown for how it was held. To
make somebody a subscriber you first had to grant them the pack outright, which
wrote a perpetual grant and a purchase-event row nobody wanted, and only then
could you say what you actually meant. The first press was a toll, not a
decision, and there was a wrong state in between.

Now there is one picker per pack whose first option is `Not Owned`, and every
choice is a single write. `tdg_admin_set_pack_grant` writes the grant whether or
not the account already held the pack — `veditor_entitlements_sync_owned`, a
BEFORE trigger, derives `owned_packs` from it through
`<app>_packs_in_force()` — so Not Owned straight to `Ends Soon` is one call.

**The options are whatever that pack can actually be.** A pack the shop sells on
a recurring plan is offered the six Store states; a one-time pack is offered
`Not Owned` and `Owned`, because `Subscribed` on a pack that cannot recur is an
option that exists only to be wrong. The answer comes from the pack's `plans`,
not from the app merely having a `grants` column: TDG Veditor's Pro Export Pack
can recur while its Theme Pack beside it cannot.

**`Revoked` is the last option on every pack, and `Restore What Was Taken` is
offered while it is the answer.** See *Revoking a product* below for what it
means; it is in the same picker rather than in a switch beside it because
`Not Owned` and `Revoked` are the same absence and opposite decisions, and a
reader has to be able to tell them apart on the tile.

**`Reset To What Was Paid For` is last of all**, and it is the one entry in the
list that is not a state — see *Resetting a product* below. It sits with
`Restore` while a pack is revoked, and at the bottom otherwise, so it can never
sit where the eye looks for the pack's current value.

The sentence under each picker is what the Store's own card will say in that
state, from the same `src/dev/grantShapes.ts` both ends read — so choosing a
state is choosing a card, and the two cannot drift.

### Ownership stages, and one press writes it

**This is the second surface that stages, and the reason is not the Content
tab's.** Content stages because it publishes to everybody and is edited by
typing. Ownership stages because it is not one fact: setting somebody up is a
plan, a standing, a bundle and two or three packs, and written one press at a
time those land as separate events, in an order nobody chose, each with its own
ledger row and its own moment where the account was in a state nobody meant.

The reported version of that: Makullveny's plan was moved to Hearth and saved,
and the Candle Bundle switch did not follow — because they were two writes and
only one of them had been pressed. Both stage now.

So the Makullveny panel and every Store panel carry a **save bar**: the list of
what is waiting in plain words (not a count — a count tells you something is
waiting and not what), a `Tell Them What Changed` tick, and one `Save Changes`.
A tile whose value has been chosen and not written says `NOT SAVED` on itself.

**Standing, badges, permissions, the Supporter Badge and the individual themes
still write on the press**, and each of those is genuinely one fact whose result
is visible immediately. The hints on them say so, so the difference does not
read as an inconsistency.

### Telling them what we did

Beside Save is one tick box. Ticked, the save also writes a **notice** to the
account: a subject, and the words the developer typed — prefilled from the
staged changes and editable, because "we ended your Pro Export Pack because the
payment was reversed" is not derivable from a status column.

It waits in `tdg_notices` until the person's own app asks for it, exactly the
way a feedback reply waits in `tdg_feedback_replies`, and it counts as read only
when they press Got It. On this site both arrive through the same panel —
`src/feedback/ReplyInbox.tsx` — because two dialogs opening over each other at
boot is worse than either. `tdg_admin_notify` is the verb;
[`src/notices/`](../notices/README.md) owns the client.

Off by default. Sending a message is the one thing on this page that cannot be
taken back.

### Revoking a product

**Revoking is not switching a pack off, and the difference is the whole point.**
Off says "they do not have this right now", and the Store's next move is to
offer to sell it again — right for a refund or a lapse, exactly wrong for an
account that must not have the product at all. A revocation is a standing row
with its own reason and its own date, and it survives everything a purchase can
do.

| | |
| --- | --- |
| **One pack** | `Revoked`, the last option in that pack's own picker. |
| **A whole app** | `Revoke The Whole Of <App>`, its own switch under the tiles. Every pack at once; the pack pickers go dead while it stands, and say why. |
| **Makullveny** | The same switch, in its own panel. Makullveny has no entitlements table, so the block records the decision and takes nothing off the row — and the panel says exactly that rather than implying an access change it did not make. |

**It takes the access away and remembers what it took.** `held_before` on the
row carries the exact grant the block removed — dates, and `since`, the day the
account first got the pack — and lifting writes it straight back. So restoring
is a recovery and not a guess, which is why the picker offers `Restore What Was
Taken` as its own option: every other option in that list would be somebody
choosing a state for a pack whose real one only the server still knows.

**A reason box** sits under the tiles whenever something is staged to revoked.
It is written for the person it is about — they read it on their own Store card
and in the app — and it is the Standing & Access box's opposite in that respect.

What the block reaches, today: the entitlement is gone, so every TDG app's
existing gate is already right, and TDG Cebu's Store draws a `Revoked` card with
the reason and the date instead of a Buy button. What it does not reach on its
own is the *explaining* inside each app — that is
[`docs/revocation-app-prompt.md`](../../docs/revocation-app-prompt.md), one
paste per repo.

**A block whose app has no panel is still drawn.** `storeApps` grows a panel for
every app a revocation names, and anything that still lands nowhere is listed at
the bottom of the Apps fold with the SQL to lift it — because a block nobody can
see is a block nobody can lift.

### Resetting a product

**This console's whole job is trying states out on real accounts, and until now
there was no way back.** Three days of testing leave a row full of hand-made
grants and lifted-and-relaid blocks, and putting it right by hand means
remembering which of them was real — which nothing on this page records. So
there is a reset, and what it means is *forget we touched this*.

| | |
| --- | --- |
| **One pack** | `Reset To What Was Paid For`, the last option in that pack's picker. It stages and saves with everything else, because at that scale it composes with the other packs' decisions. |
| **A whole app** | `Reset <App>`, its own block under the Save bar. It asks first and **does not wait for Save** — there is nothing to preview, because the server decides what survives. |

**What survives is what Stripe is on the record for**, decided in Postgres by
two signals that already existed and neither of which is a new column to keep in
step:

- a `subscriptionId` on the grant. Only a webhook ever writes one — the section
  above is why — so a grant carrying one is Stripe's, including one a developer
  has since edited to move a period end for support;
- a row in `<app>_purchase_events` for that pack whose `stripe_event_id` is not
  an `admin:<uuid>` one. Admin writes stamp themselves that way; a real delivery
  carries Stripe's own `evt_…`.

Anything either signal claims is kept. **The reset only ever removes**, so a
purchase Stripe has already taken back stays taken back: there is no shape of
this that hands somebody a pack they did not pay for.

**Blocks come off first, and hand back what they took.** A block does not merely
mark a pack — it lifts the grant off the row into `held_before` — so filtering
first would read a row with the interesting part missing: a revoked real
purchase would silently stay gone, and a revoked hand grant would disappear
without being counted, so the answer would say "nothing removed" about a press
that changed what the account owns. Blocks off, what they held back on, then one
filter over the lot. Both halves of the promise fall out of that order.

**It refuses for an app with no ledger**, in a sentence, and the option is
absent rather than dead: with no record of what Stripe granted, a reset there
would be a guess wearing the word reset.

**It says what it did afterwards**, in the server's own answer — what was taken
back, how many blocks were lifted, and what Stripe is on the record for on that
account, which is why anything survived. A toast saying "done" would be the
console declining to say what it had just done to somebody's purchases, and this
is the one press here whose outcome was not knowable before it.

### Why the states had to be reachable at all

There is not a single live Stripe subscription on this project — both apps are
pre-release and every `stripe_customer_id` is null — so the entire half of the
Store that renews, ends and lapses had never been seen outside a screenshot.
Every pack any developer had ever granted was perpetual, because a bare pack id
is read by the app's trigger as bought outright, which is the historically true
reading and the right default.

### It never writes a Stripe subscription id

`tdg_admin_set_pack_grant` carries over whatever was already on the grant and
refuses to invent one, in both directions: nudging a real subscriber's period
end must not detach their row from Stripe, and a hand-made subscription must not
look like one the Store could cancel — `tdg-site-billing` acts on that id alone,
so a fake one would be a Cancel button reaching into a live Stripe account for
something that was never there.

The consequence is visible rather than permission-gated. On the Store, every
account holding a current subscription-shaped grant gets **Manage or Cancel
Plan**, whether that account is a Developer or not. A hand-made grant opens the
same panel with **Billing Link Missing** above its rows. Turning Developer on or
off changes the Developer console only; it never adds or removes a customer
billing control.

**`Ended` makes the pack leave.** Writing it drops the pack out of
`owned_packs` immediately, which is `<app>_packs_in_force()` doing its job and
not the grant failing. The Store then offers to sell it again — with a line
saying what ended and when, so a card that went back to Buy is not silent about
why.

### Makullveny: two facts, one of which was a mirror of the other

`mak_subscriptions` carries `tier` (free · candle · lantern · hearth) and
`candle_purchased_at`. The panel offered a dropdown for the first and a switch
for the second, unrelated — so `candle` sat in a list of subscription rungs
looking exactly like the thing that grants the bundle.

**It grants nothing.** Makullveny's own `src/entitlements.js` unlocks every
piece of Candle content — the five marketplace themes, the Journal, the Scroll,
the raised capacity limits — on `candlePurchased || tier >= hearth`, and never
on `tier === 'candle'`. Its comment says why: Candle is a one-time purchase, and
ranking it inside `TIER_ORDER` would hand it to every Lantern subscriber because
`lantern(2) > candle(1)`.

There is a live row on this project with `tier = 'candle'` and no flag — an
account somebody believes they gave the bundle to, which has never had it. That
row is what the rebuild was measured against, and the panel now names it in a
warning with the one press that fixes it.

So: two axes, one control each.

| | |
| --- | --- |
| **Candle Bundle** | One switch, over `tdg_admin_set_mak_candle`, which writes the flag AND the tier mirror in one statement — the same pair the app's own Stripe webhook writes. It deliberately leaves the Supporter Badge alone: a real purchase sets that too, and one press quietly moving a second switch is the coupling this rebuild removed. |
| **Plan** | Only the rungs that are actually rent: No subscription, Lantern, Hearth. `candle` is not offered, because it is not a plan — it is how the ladder reports the bundle. Saving a plan of *No subscription* with the bundle on writes `candle`, which is `higherTier()` from the webhook spelled out. |
| **Standing** | Only asked when there is a plan to be standing in. With no subscription it is written as `active`, where every account rests, because `free / past_due` is a sentence about nothing. The TDG Core panel does the same. |
| **Individual Themes** | Still one switch each, because that purchase is a real separate fact. A theme the account has by another door says which — `Unlocked by Candle`, `Unlocked by Hearth` — so switching it off never looks like it will take a theme away that it cannot. |

### And the sentence the two controls could not say between them

All of the above was true and the panel still could not be read. Set the plan to
Hearth, save, and the Candle Bundle switch stays off — correctly, because the
flag genuinely has not moved — while the account now has every single thing the
bundle grants, because **Hearth clears the same gate**. Two honest controls, and
between them a false answer to the only question a developer is actually asking:
*does this person have Candle content?*

So the panel answers that itself, first, at the top, computed with Makullveny's
own rule (`candlePurchased || tier >= hearth`) and nothing else. The theme tiles
had been saying `Unlocked by Hearth` since the rebuild; what was missing was the
same sentence about the bundle those themes come in.

**Lantern is the one that surprises people, so it says so out loud.** Read as a
price list the tiers look cumulative, and they are not: only Hearth clears the
Candle gate. A Lantern account without the bundle gets a line saying it has no
marketplace themes, no Journal, no Scroll and the ordinary limits, and that one
press above fixes it. This console will not claim Lantern includes the bundle
while `entitlements.js` says it does not — a page that disagreed with the app
would be lying about what happens when that person opens it. If the ladder is
meant to be cumulative, that is one line in the Makullveny repo, and this panel
starts agreeing with it the same day.

## Badges

A **badge** is one global mark on a TDG account — true in every TDG app at
once, not per app and not per device. Bug Hunter for the friends who go looking
for what we broke, Playtester for the people who saw a build before anybody
else, Developer for us, Subscriber for anyone on a paid plan. It is a mark, not
an entitlement: what somebody has *paid for* lives in `<app>_entitlements` and
is granted from the Store panels, and nothing anywhere should gate a feature on
a badge.

The panel is a **switchboard, not a list**. `tdg_admin_badges` returns every
badge in the catalogue with `held` set true or false, so the panel draws the
whole set — a console that could only show what somebody already has could not
be used to give them anything. A shut panel says how many are held, or `NONE`.

**Nothing in `src/dev/` names a badge.** Not one id, anywhere. The names, the
copy and which of them are computed all come back from `tdg_badge_catalog()` in
tdg-core, which is the same discipline `apps.ts` keeps about products and rule
17 keeps about every list on this site. **Adding a badge is a migration and
nothing else** — no TypeScript, no second edit, and it renders here the day it
lands.

The consequence is that this panel cannot recognise anything, and that is the
point. Where a catalogue row arrives without a label or without a blurb, the
panel makes a name out of the id — `bug-hunter` reads as `Bug Hunter` — draws
the row anyway, and says at the bottom which ids it could not read. Deliberately
a bit ugly, and honest: a badge this site cannot name is still a badge it can
award, and a list that quietly drops what it cannot read is a list you cannot
trust about anything else on it.

### Why the computed ones have no switch

Two of today's six are `derived`: **Developer** follows `profiles.is_admin` and
**Subscriber** follows the account's `subscriptions.tier`. Each of those facts
already has exactly one authority, so a badge row repeating it would be a second
opinion that goes stale the moment the flag flips.

The server refuses to set one by hand — `23514`, with a sentence naming the fact
it follows — so the panel draws those two as **state**: the name, the copy, and
a `HELD` / `NOT HELD` tag, with a paragraph saying that changing the fact is
what moves the badge and that the two facts live in panels directly above. A
switch that can only ever fail is worse than no switch, which is the position
`tdg_admin_uid`'s own comment takes and the one `storeAnswers.ts` keeps when it
draws no `Manage Plan` button and says out loud why it is missing.

**That is a drawing decision and not a permission one.** `adminSetBadge` on a
derived badge still refuses in Postgres, whoever calls it and by whatever route.
Nothing in the client decides who may grant a badge; a non-developer gets `42501`
from both verbs, and that refusal is the boundary (rule 12).

### The reason box, and the note it writes

One optional line — *found the DevFleet pane crash* — goes onto whichever badge
you switch on next. It is the difference between a badge and a memory, and it is
worth typing.

It is **not private**. `tdg_my_badges()` hands an account its own badges with
their notes, so the person it is about can read it. The Reason box in **Standing
& Access** is the one only a developer ever sees; these two boxes look alike and
do not mean the same thing.

For a badge somebody already holds, a **Save Note** button appears next to it as
soon as the box says something different. It rewrites the note alone and leaves
the date it was awarded and who awarded it exactly where they were, which is
what the server does when it is sent a badge that is already on. Without it the
only way to fix a typo would be to revoke and re-grant, which moves the award
date and puts two more rows in the ledger to correct one word. It is only ever
offered when there is something to write, so it can never be the button that
empties a reason: an empty box means "no change", never "clear it".

### Where the trail is

**In the audit log, and nowhere else.** Every grant, revoke and note edit goes
through `tdg_admin_log`, so it appears in **This Account's History** and in the
whole-project **Audit Log** tab, tagged `badge-grant`, `badge-revoke` and
`badge-note`, with the badge id and the reason in the detail. There is no second
history on the panel, because a fourth copy of one fact is the first one to
disagree with the other three.

Nothing is confirmed before it fires, on purpose: a badge is trivially
reversible — the switch that gave it takes it back, and the write is idempotent
in both directions — so it is the pack tiles' shape, not Delete Forever's.

### Reading it, and refreshing it

Four states, and each has a face: **reading** (skeleton rows, one per badge the
last read had, so the panel does not reflow when the answer lands), **unreadable**
(the server's own sentence, shown whole), **read with none awarded**, and the
switchboard itself. The panel carries a `min-height` so it does not change size
between them.

The read hangs off `readAll` with the other five, so **Refresh re-reads badges
along with everything else** and holds your place while it does. It is also
re-read after *every* write on the page, not only after a badge write: the two
derived badges follow facts other panels own, so granting Developer two panels
up has to move the Developer badge here in the same breath. One extra round trip
per write is the whole cost of never showing a stale second opinion.

The two verbs come from [`src/badges/api.ts`](../badges/README.md) rather than
from `api.ts` here. Badges are a whole-site surface — the footer counts them and
every TDG app reads them — so the folder that owns them owns the client, and
this console is one of its callers.

## Content · what the site says about our own apps

The **Content** tab is the one place that changes the public site rather than
somebody's account. It manages every product card the site draws — the six under
Apps, the three under Tools, and the game in Building now — and behind each of
them, that product's own page.

What it can change, per product:

| | |
| --- | --- |
| **Whether it is on the site** | One switch. The card leaves its grid; its own page stays exactly where it was, at `#/app/<slug>`, because a link somebody has already shared should not start answering "nothing here". |
| **Where it sits** | Move Up / Move Down on every row, plus Move To Front and Move To Back in the panel. The order in the roster is the order on the home page. |
| **Its words** | Number, title, copy, status caption, chips — and for the game, its heading, live tag, note and count. |
| **Its icon and its cover** | The icon file and whether it is drawn as a tile or a glyph; and the cover as key art (title, line, facts, one of five scenes) or a screenshot (file, both widths, alt, crop) or nothing, with a live preview of each. |
| **Its access button** | The words on it and the link it opens — *"Download Makullveny"* to *"Visit!"*, pointed anywhere — with a preview of the button in both of its states. An app card can be given a button or have it taken away; the game had never had a link at all and can now be given one. |
| **Its own page** | Title, lede, intro, group, Back, the at-a-glance facts, the links row, and every folding section: its title, its shut-row line, its tag and every block inside it, in all seven block kinds. |

### It stages, and it is the only tab that does

Every other switch on this console writes the moment it is pressed, because
every other switch changes one person's account and that person can see the
result. This changes the public home page, for everybody, and it is edited by
typing — so a live write per keystroke would publish `Downlo` to the internet on
the way to `Download`.

So edits are held until **Publish Changes**. The bar saying how much is waiting
is sticky at the top of the tab, the tab itself carries an `N UNSAVED` badge so
work behind an unopened tab is still visible, and closing the browser with a
dirty draft asks first. The draft is held by `DevConsole` rather than by the
tab, so a trip to Accounts and back does not lose a half-written page.

### The repo is still the source, and there are four ways back to it

`src/data/content.ts` and `src/data/appPages.ts` are where the words are
written; this writes an overlay of only what somebody changed. Every field shows
`BUILT-IN` or `EDITED` with the repo's own value printed underneath, and a field
typed back to its built-in text drops its override so it goes on tracking the
repo rather than freezing at a copy of today's wording.
[`src/content/README.md`](../content/README.md) has the merge rules and why an
unreadable document degrades to the built-in card.

Undoing is at four grains, because the thing you want to put back is usually not
the thing the one available button would have reset:

| | |
| --- | --- |
| **One field** | The `Reset` beside its `EDITED` tag. Fields nested inside a composite — the cover's Title, a section's Tag — carry their own too, in a lighter frame with no standing `BUILT-IN` badge: four of those per section across eight sections is thirty-two badges reporting that nothing happened, which is how the one that means something stops being seen. |
| **One row** | The `↺` on a page section, matched to the repo **by id** rather than by position — a section moved up the page is still that section, and index matching would offer to reset it to whichever one now sits where it used to. It is drawn only where it would do something: never on a section added here, never on one already identical to its built-in twin. |
| **One panel** | `Reset Card Words`, `Reset Icon And Cover`, `Reset Access Button`, `Reset Page Header`, `Reset Page Sections`, `Reset On The Site`. Each clears exactly the fields its own panel owns and says how many that is before it is pressed, from the same count its shut-state tag shows. Disabled at zero rather than hidden: a control that vanishes when there is nothing to do is one you have to remember exists. |
| **One product** | `Reset This Product To Built-In`, in the Overrides panel, which still asks you to type the product's name. |

Two of those are their own kind of undo, because they are not per-field:

- **`Restore The Built-In Order`** puts a whole grid back, not one card. An
  order is one list, and a single card cannot be returned to its built-in place
  without saying where the others go — so the button says which grid it affects.
- Editing a LIST back into agreement with the repo drops its override too, the
  same way a text field does. It is what makes the small resets add up: reset
  the last edited line of a cover and the cover as a whole stops being an
  override, rather than becoming a frozen copy that quietly stops following
  `src/data/`.

The page facts and links lists have no per-row reset, deliberately: their rows
have no stable identity, so "the repo's version of row 3" is a question with no
honest answer once rows have been added or reordered. The list's own Reset and
each row's Remove are what they get.

### Two states you could reach and could not see

**Taking both covers away** left no field on screen to reset, so `No Cover` used
to be a one-way door for anybody who did not know about the panel reset. It now
offers `Put The Built-In Cover Back` whenever the repo has one.

**A screenshot removed while the card draws key art** is invisible from the
cover editor — that editor only renders in screenshot mode — and it is not
harmless: `shotForPage` is what puts the picture at the top of the product's own
PAGE, which the card's cover has nothing to do with. That state now says so and
carries `Put The Screenshot Back`.

Both were found by the same press. `No Cover` followed by `Screenshot` wrote
`art: null` and then the shot in two `setCard` calls that each read the SAME
draft out of one render's closure, so the second built its card from a document
without the first's change and silently dropped it — key art stayed, key art
wins on a card, and the button appeared to do nothing at all. `setCardKeys`
writes both in one go.

### If two of us edit at once

The draft remembers the published version it started from. A Refresh that finds
a different one while there are unsaved edits says so, out loud, and offers the
two honest answers — publish yours whole, or discard yours and take theirs.
Nothing is merged, because only a person can say which sentence the site should
carry. Every publish keeps the version it replaced, up to fifty of them, in
`tdg_site_content_history`.

## Cloud · the launch switch, the plans, and the economics

TDG Cloud ships built and dormant, and this tab is the one place it is turned
on, tuned and watched. Everything on it edits or reads ONE document —
`tdg_cloud_config` on tdg-core — which every Cloud surface derives from: the
Store shelf's plans and prices, the apps' upload gate, the webhook's price
map, the retention clock.

- **Launch & Availability** stages its edits and saves them in one press, the
  Content tab's discipline for the same reason: a price and the availability
  flag are one decision. Flipping `Available` on IS the launch — the Store
  starts selling within a minute — so a save that would do it stays dead until
  an extra tick confirms the Stripe payment links were activated first (they
  were created DEACTIVATED, and stay so until launch day). `Developer Testing`
  opens the whole path early for developer accounts; `Allow Retention Purges`
  ships off, and while it is off nothing hosted is ever deleted automatically.
- **Metrics & Economics** is `tdg_admin_cloud_metrics()`: subscribers and MRR
  by cadence, total/average/median/P90/P95/P99 stored, per-app and heavy-user
  tables, metered egress, the marginal infrastructure cost and the margin
  after Stripe and a configurable tax haircut — every dollar computed from the
  cost assumptions in the config document, so a Supabase price change is an
  edit there, not a deploy. Reading it also snapshots the day's numbers into
  `tdg_cloud_metrics_daily`, which is where the growth series comes from.
- **Retention** lists every account hosting bytes with no plan in force —
  read-only until its deadline, purge-ready after — and says out loud that
  purging is never a side effect here: it is the `cloud-maintenance` Edge
  Function, run on purpose, and refused while the purge flag is off.
- **Backblaze Bucket** is the only place the two sides of TDG Cloud are ever
  held against each other. Everything above it is TDG's own account of itself
  — the config says the quota, the catalogue says the bytes, the metrics
  multiply them by a price — and none of it has asked Backblaze. So an object
  in the bucket that no catalogue row claims bills nobody and costs us every
  month forever, and a catalogue row with no object behind it charges somebody
  quota for a file that would 404. Neither is visible from any other screen.
  The panel names them ORPHAN and GHOST, adds size mismatches and the
  old-version/hide-marker tax, and reports the real counts rather than the
  length of the 200-row lists it shows. It is a BUTTON, not part of Refresh:
  the read is a full `ListObjectVersions` walk, and opening a tab should not
  cost one. It reports and never sweeps — what to do about a discrepancy is a
  decision, not a cleanup.

The `cloud` app's PANEL — granting a plan to an account, revoking Cloud —
needed no work at all: `cloud_entitlements` is registry-shaped, so the
Accounts tab, the Purchases filter and the overview tile grew it the way they
grow every app. The verbs live in [`src/cloud/api.ts`](../cloud/README.md),
with the surface that owns them.

## Feedback

Everything users send from inside the apps — a bug, a suggestion, a question —
lands in `tdg_feedback` through `tdg_feedback_submit`, which any signed-in TDG
account can call from any app. The tab shows the whole ledger: when, what kind,
which app and version, the OS, who sent it (name, `@username`, compacted id),
whatever contact line they volunteered, the message, and where the report
stands. The migration and the app-side contract live in
`supabase/migrations/20260823170000_user_feedback.sql` and
`20260823210000_feedback_rate_limits.sql`; the brief an app's Claude session
needs to join in is `docs/feedback-app-prompt.md`.

- **Every column sorts** and three dropdowns narrow by type, app and status.
  The lists they offer are the server's catalog, in the server's ORDER —
  which is what the Type and Status sorts rank by, so `new` really does come
  before `seen` before `replied` — with anything the rows hold that the
  catalog does not mention appended, so a kind added tomorrow is filterable
  the same day. There is a copy of both lists in `FeedbackTab.tsx` as a floor
  for when the catalog read has not landed; without it a failed catalog left
  the status control offering one option and no explanation.
- **Everything copies at every grain**: one field (in the report dialog), one
  report (the Copy on its row), or any set of them as review text, full text or
  JSON — because a bug report's destination is usually a chat or a Claude
  session, and retyping an OS string is how a detail gets lost.
- **Tick reports and act on all of them at once.** A box on every row, a
  select-all with a real mixed state above the list, and **Select Unread**,
  which is the one you actually press: it ticks everything on screen still
  marked `new`. Every bulk button then says the number it is about to act on —
  `Copy 12 For Review`, `Mark 12 As Read` — because a button that names its
  count can be pressed without counting the list first, and `Mark All` cannot.
  With nothing ticked the buttons act on **everything the filters and the
  search have left on screen**, which is the same rule stated in the bar in
  front of them.

  A selection is NOT pruned when the filters change: narrowing to one app,
  ticking four, then narrowing to another and ticking three more is a real way
  to build a set. What it costs is that some ticked reports can be off screen,
  so every action takes the intersection with what is shown and the bar says
  `3 more ticked but not in this filter, and left alone`.
- **Mark As Read is one write, and only ever `new → seen`.** A report already
  `replied` or `resolved` is further along than read, and dragging it back
  would be the button undoing work, so it is skipped.
  `tdg_admin_feedback_set_status_many` answers how many actually MOVED rather
  than how many ids were sent, which is why the toast is a fact. It writes one
  audit line naming the count and the ids: forty lines saying the same thing at
  the same second is a log nobody reads past. The client sends the exact ids on
  screen rather than a filter, so nothing is marked that the developer never
  saw — including anything that arrived since the page loaded.
- **Copy For Review is the one to paste into a Claude session.** The point of
  feedback is to fix things, and the shortest route from a report to a fix is a
  model reading it. So this format carries only what changes a review's answer
  — the type, the app and version, the OS, the date, and the words the person
  wrote — under a header naming the fields, with any reply we have already sent
  marked `> already replied:` so nothing proposes what somebody has already
  been promised.

  It carries **no identity at all**: no name, no username, no email, no user
  id, no contact line. None of it changes what should be built, all of it is
  somebody else's personal information, and a paste into a third-party model is
  exactly the moment not to send it. The `#id` stays, so a finding can be traced
  back to the report on this page. Copy Full and Copy JSON are unchanged and
  still carry everything, for a chat with the other developer.
- **A click opens the report over the page** — Escape, the ×, or the scrim
  puts you back exactly where you were. All three go through `lib/modal.ts`,
  which also keeps Tab inside the card. The scrim wants a press that starts AND
  ends on it: a drag-select that finishes outside the card used to close the
  dialog and take the reply draft with it.
- **Reply from the dialog and the message is delivered by their own app**: it
  waits in `tdg_feedback_replies` until the app calls `tdg_feedback_inbox()`
  at startup, shows it, and acks it. Until then the console says NOT SEEN
  YET, because "sent" and "seen" are different promises. Replying stamps the
  report `replied` on its own.
- **Statuses** are `new → seen → replied → resolved`. Delete exists for spam
  and takes a confirmation; a real report that is dealt with is `resolved`,
  which keeps the record. Both write the audit log.
- The tab itself carries a `n NEW` tag and the overview a Feedback tile, so a
  waiting report is visible from every tab, not only this one. Both read the
  same server-side count (`tdg_admin_overview`), not the loaded rows, so they
  cannot disagree once the ledger outgrows the read's cap.
- **The table scrolls sideways rather than clipping.** Eight columns and the
  tick need about 1005px; below that the panel gives you a scrollbar, and below 720px
  each report stacks into a small card instead. A wide table that clips is a
  lie about how many columns it has.
- **What a sender is allowed to send**, so a thin-looking ledger is not read
  as a broken form: 60 seconds between reports, 5 an hour, 10 a day, per
  account, and an identical resend inside 10 minutes is folded into the
  original rather than filed twice. One consequence worth knowing at the
  Delete button: the counts are taken from the rows, so deleting somebody's
  spam also hands their allowance back. For a repeat offender, suspend the
  account first and delete after — otherwise the tidying is what lets them
  start again.

This site is also a submitter: **Send Feedback** in the account menu files
under the app id `tdg-site`, and `src/feedback/ReplyInbox.tsx` is the
reference implementation of the startup reply panel the other apps copy.

## Files

| File | What it is |
| --- | --- |
| `DevConsole.tsx` | The page: header, the overview numbers, the five tabs, the roster, and the one action runner every write goes through. |
| `AccountDetail.tsx` | The panels for one account, in six top-level sections. Three of them nest: Permissions sits inside Identity, Cloud's own Store panel sits inside TDG Core & Cloud, and Makullveny plus a Store panel per remaining app sit inside Apps. Each states what it is and names the table it writes. |
| `CloudTab.tsx` | The Cloud tab: the staged config editor with its launch confirmation, the metrics and economics readout, the retention report, and the Backblaze bucket audit (`BucketPanel`) that holds B2's own listing against the catalogue. Its verbs come from `src/cloud/api.ts`. |
| `ContentTab.tsx` | The Content tab: the product roster with its reordering, and the seven panels that edit one product's card and its page. Holds no state of its own — `useSiteContentDraft` lives here and is called by `DevConsole`, so a draft survives a tab switch. |
| `contentEdit.tsx` | The editing primitives that tab is built from: the `BUILT-IN` / `EDITED` override frame, the shared add-reorder-remove list, and the asset preview that gives a missing file a face. |
| `FeedbackTab.tsx` | The Feedback tab: the sortable, filterable report table, the tick-and-act bulk bar, the report dialog, the reply composer with its delivery state, and copying at every grain — including the identity-free **review** format built for a model to read. |
| `apps.ts` | **Which apps exist, merged from the server's discovered list and the site's shop, plus every revocation on the account, and what to say when the sources disagree.** The reason no file here names a product — except `MAK_APP_ID` and `CLOUD_APP_ID`, whose comments say why those two exceptions exist. |
| `controls.tsx` | Panel, SectionControls (the search box and Expand / Collapse All), Field, Fact, TextInput, Select, Combo, Switch, **Check**, Button, Tag, OwnTile, HoldingTile, **SaveBar** with `useSaveNotice`, TypeToConfirm, toasts, and the fixed **RefreshRail**. Shared so fifteen switches cannot drift into fifteen switches. |
| `search.tsx` | The page search: the query context, the matching helpers, and `Highlight`. Client-side by design, which is what makes it instant. |
| `roster.ts` | The list down the left: the five sorts and their comparators, the `usePins` shortlist with its optimistic writes, and `groupRows`, which is where the two groups are decided. |
| `viewState.ts` | Keeping your place: the `data-dev-anchor` capture-and-restore, and the session record a real reload is put back from. |
| `../lib/sections.tsx` | Which sections are open. Lives in `src/lib/` because the public app pages fold the same way and use the same state. Shared state rather than a flag per panel, because Expand All has to reach the ten inside an account's detail, panels the page itself never renders. This page is the only one that passes `initialOpen`, to put a reload back the way it was. |
| `api.ts` | Every `tdg_admin_*` call, typed — including `setRevocation`, `resetProduct` and `notify`. No table access anywhere. Two exceptions, both for the same reason — a whole surface of this site owns its own client: the badge verbs are in [`../badges/api.ts`](../badges/README.md), and the site-content verbs are in [`../content/api.ts`](../content/README.md). The account's side of a notice is [`../notices/api.ts`](../notices/README.md). |
| `format.ts` | Dates, money, the derived one-line **standing** for an account, and the ban/hide durations. |
| `devMode.ts` | The show-the-tab switch. localStorage, per device — deliberately the opposite call to the pins, which are per developer and in Postgres. |
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

## Adding an app · there is nothing to do

Read this before you start editing, because the instinct is wrong and it used to
be right.

**Do not add a panel, a column, a dropdown option or a stat for a new TDG app.**
Create `public.<app>_entitlements` and this page grows all of them. If you find
yourself typing a product's name into a file in this folder, stop: that is the
bug this design removed, and putting one back re-opens it for every app after
yours.

It used to take eleven edits across two languages — the `returns table` of
`tdg_admin_accounts`, the `returns table` of `tdg_admin_overview`, the union in
`tdg_admin_events`, the object in `tdg_admin_catalog`, both arms of
`tdg_admin_set_pack`, `DevAccount`, `DevCatalog`, a `PacksPanel` line, an
overview stat, a `Select` option and the roster's search haystack. All eleven
had to agree and none of them failed loudly. A forgotten dropdown option is a
filter that hides an app's money; a forgotten panel is a product whose packs
nobody can grant, found out when a customer writes in.

What is still worth doing, and both are optional:

| | Why |
| --- | --- |
| `public.<app>_known_packs()` returning `text[]` | Gives the tiles a catalogue instead of only what an account happens to hold, and holds grants to that list. Without it any well-formed pack id is accepted. |
| `public.<app>_purchase_events` | Joins the merged Purchases ledger — and it is what makes **Reset** possible, because it is the only record of which grants came from Stripe rather than from this page. Without it the reset option is absent, with a sentence saying why. Since 2026-09-01 this is a view over `public.tdg_purchase_events`; either a table or a view registers. |
| An entry in `STORE_APPS` (`src/data/store.ts`) | Gives the panel the app's real name, its prose and its prices. Without it the console titles the app from its id. |

Neither blocks the other and neither blocks the console. See `apps.ts`.

## Adding a new kind of verb

For something that is *not* another pack Store — a new permission, a new ladder,
a moderation action:

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
5. If it re-reads anything, hang it off `readAll` rather than giving it its own
   button. One Refresh for the whole page is the point of the rail; a second
   button six inches away that refreshes LESS than it does is a bug in the
   interface, which is what the two per-tab Refresh buttons it replaced were.
6. Anything long enough to scroll past wants a `data-dev-anchor`. `Panel` and the
   roster rows already carry one, so a new section gets it free — but a bespoke
   surface that is not a `Panel` needs to say so, or Refresh will hold the wrong
   thing still. See `viewState.ts`.
