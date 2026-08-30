# `src/data/` · the catalogue, and every page drawn from it

**Everything this site says about a product lives in this folder.** Not in a
component, not in a translation file, not in a CMS. Every app, tool and game —
its card, its chips, its page, its packs — plus the About page, the Store
catalogue and all its prose, the nav links and the Origin chapters. Adding an
app is an entry here. Fixing a line of a guide is one string here. A component
that renders content knows nothing about which app it is drawing, which is the
only reason eleven pages have stayed consistent with each other.

**A section's own headline is not in this folder, and never has been.** The
`.kicker`, the `.h2` and the `.lede` that `Hero.tsx`, `Origin.tsx`, `Apps.tsx`,
`Tools.tsx`, `Building.tsx`, `Faith.tsx`, `Outro.tsx`, `Store.tsx` and
`Footer.tsx` open with are written where the section is written. That is the
rule, not a backlog.

## Where the line falls, and why there

One test: **does the component that draws it know what it is drawing?**

`AppPage.tsx` does not. It draws whatever page it is handed, eleven times
over, and that is exactly why the eleven stay consistent with each other and
why a twelfth is a content edit rather than a component. Anything a component
draws *N* of belongs here, and the moment it does not, the eleven start to
drift.

`Apps.tsx` draws its own heading once and will never draw a second one. Moving
`Apps we're building.` into a data file buys nothing — there is no second
instance for it to agree with — and costs the thing that makes a section
legible, which is that its words and its layout are read in one file. A
`HEADINGS` map keyed by section id is a lookup table with one row per key and a
second file to open before either half makes sense.

| In `src/data/` | With the component |
| --- | --- |
| Every app, tool and game: card, chips, page, facts, guide | The kicker, heading and lede a section opens with |
| The About page, in the same block vocabulary | The words on one control: a button label, a field label, a tab name |
| The Store catalogue, and every sentence about the money | An empty, loading or error state's own line |
| The nav links, the hero taglines, the Origin chapters | The Faith verse and its citation — that section *is* the quote |

Two other folders keep their own words, for the same reason and with the same
"one place" discipline: refusal copy is
[`../auth/wording.ts`](../auth/README.md) and the feedback form's copy is
[`../feedback/api.ts`](../feedback/README.md). Those sentences are facts about a
mechanism, and the mechanism is what has to stay in step with them — a refusal
filed here would sit one folder further from the code that decides when it is
shown.

**Still the wrong folder, always:** an app's name, a price, a chip, a fact row,
a status, or a paragraph of a guide, typed into a `.tsx`. That half of the rule
has never bent, and it is the half that costs money when it does.

---

## The files

| File | What it holds |
| --- | --- |
| `content.ts` | The home page's catalogue: nav links, the hero taglines, the seven Origin chapters, the Apps / Tools cards, the MARANATHA panel the Building section draws, what is queued next, and the shared `Shot` and `IconShape` types. Every card names its own `page:` slug. The sections' own headings and ledes are in the section components, per the line above. |
| `appPages.ts` | One page per app, tool and game. The biggest file here (~2,300 lines) and deliberately so — it is content, and it is lazily loaded. **Do not hand-write a `links` entry pointing at `#/store/<app>`** — `AppPage.tsx` derives that control from `STORE_APPS` and drops a duplicate, so a typed one is a second copy to keep true (rule 17). |
| `about.ts` | The About page, in the same block vocabulary as an app page. |
| `pageBlocks.ts` | The block types a folded page is built from. Small on purpose. |
| `store.ts` | **The shop catalogue: what is sold, what it costs, and the live Stripe links.** Read its header before touching a number. |
| `storeAnswers.ts` | The Store's prose — the whole money side, the shared **Billing Link Missing** notice, and not one amount in it. |
| `cloud.ts` | TDG Cloud's built-in copy: the two plans' names, quotas, prices and unlock lists, plus the byte/quota formatters and the saving that is computed rather than typed. **The failure mode, not the source** — TDG Core's `tdg_cloud_config` owns the live numbers, this is what renders when that read has not answered, and it can never sell anything: payment links only ever come from the server. See [`src/cloud/`](../cloud/README.md). |

## `pageBlocks.ts` is a vocabulary, and it stays small

Seven block types: `text`, `steps`, `features`, `facts`, `qa`, `signpost`,
`note`. `appPages.ts` and `about.ts` both write in this vocabulary and
`components/Folded.tsx` draws it.

**Do not add a block type for one paragraph.** A block type per layout idea is
how a content file turns back into a component, and at that point adding an app
stops being a content edit. If a section will not fit the vocabulary, the usual
answer is that the copy wants rewriting, not that the vocabulary wants extending.

Every `PageSection` needs a `what`: the one line its closed row carries. A shut
page is meant to read as an index, and a section that says nothing while shut is
a bug.

## The copy rules `appPages.ts` follows

Its header states them and they are worth repeating, because they are what make
the pages usable:

- **Two sentences at the top decide it.** Somebody who has never heard of the app
  should know from `lede` alone whether it is for them.
- **A Guide is for somebody who has not installed it yet.** Every page's first
  section starts from nothing: what you need, how you get it, what the first five
  minutes look like. A feature list written for somebody already running the app
  is a spec sheet, not help.
- **Only what it does today.** Anything planned goes in a "coming" section and
  says so in those words. Where an app's own README described intent without
  marking it as intent, the line was left out rather than guessed at.

`about.ts` adds one more: **every answer is checkable against something in this
repo**, and where there is no answer yet it says so. An honest "we have not built
that" is worth more than a reassurance nobody could verify.

## `store.ts` is the one file where a mistake costs money

Read the header. It is long because the situation is:

- A static page cannot ask Stripe what a price is. There is no secret key here
  and there may never be one, so the literal in this file is the only option.
- **The same number is written down in four places plus Stripe**, two of them in
  a different repository. The header lists all four. Change them in one sitting.
- `metadata.app` / `kind` / `pack` on the Stripe link is what that app's webhook
  reads to decide whose account a payment lands on.
- A pack sold several ways carries `plans[]`, and **the first entry must match
  the pack's own `priceCents` and `paymentLink`** — the primary plan stays those
  two fields rather than becoming a fifth place to state them.
- Anything derived is computed. `annualSavingCents()` exists so `Save $22.88`
  cannot disagree with the two prices it is about. **How a multi-plan pack is
  presented is not a design choice either** — it is rule 11 of
  [`AGENTS.md`](../../AGENTS.md), and it is the same in every app.
- Ownership is never decided here. It lives in `<app>_entitlements` on TDG Core,
  written only by that app's Stripe webhook, read back over RLS by
  `store/useOwnedPacks.ts`. This file only names the things ownership is about.
- **The Developer console reads this file too**, for the names and prices beside
  its grant switches. It does not read it for *which apps exist* — it asks the
  database that — so an app here with no `<app>_entitlements` table shows up at
  `#/dev` as a red **NO TABLE** panel. That is the shop selling something a
  payment has nowhere to land, and it is meant to be loud. See
  [`src/dev/README.md`](../dev/README.md).

`isSubscription()` asks the *plans*, not the pack id, so the answer stays true
when another pack gains a subscription. `isTestLink()` reads the mode straight
off the URL, because a test link is not broken — it is a real checkout that
refuses every real card, and a customer who meets one is told nothing about why.

**`storeAnswers.ts` names no amount at all, on purpose.** "The price on the card"
is not a hedge; it is the only way to still be right in a year. Keep it that way.

**But it does now carry a policy, and the policy lives in two places.** Payments
are not refundable, and that is stated both in the `refunds` section here and in
the `Before You Pay` block above the cards in `components/Store.tsx` — short
version above the fold, long version under it, and **both on every Store view**,
because the Buy button now lives on the app's own page at `#/store/<app>`. They are not derived from each
other and nothing will catch them drifting, so change them in the same sitting.
Same for the completeness promise: the block says what a card lists is
everything you get, which makes every pack's `unlocks` in `store.ts` a claim
rather than a summary.

TDG Veditor's Pro Export limits are part of that completeness promise. The
card states both sides of every numeric gate: 12,000 kbps remains free; the pack
raises the target ceiling to 400,000 kbps and the manual spike ceiling to
800,000 kbps, while project and export frames may use the editor's full
16,384 × 16,384 range. Keep those numbers aligned with
`src/shared/store/catalog.ts`, `ProjectPresetFields.tsx` and
`SettingsFields.tsx` in the TDG Veditor repo.

## Adding an app, end to end

1. Card in `APPS` or `TOOLS` in `content.ts`, with a `page:` slug and its icon.
2. Icon art in `public/assets/`, referenced through `lib/asset.ts`.
3. Entry in `APP_PAGES` in `appPages.ts` using the same slug.
4. Packs in `store.ts` only if it sells something.

Give the card a `repo:` too — the repository's exact name in TDG-Org. That is
what lets the card answer for itself whether the app is live: `src/live/`
checks GitHub at runtime and a deployed app's status caption becomes a real
`Open` / `Download` button with no further edit here. A hand-written
`download` (or a tool's `href`) always outranks what discovery finds. The
field's own doc in `content.ts` has the details, including why a wrong name
fails quietly.

**An app can also appear here before anyone does any of the above**: a public
TDG-Org repository tagged with the `tdg-app` topic gets a derived card at the
end of the Apps grid — title from its name, copy from its description, a
button when something is deployed. That card is the app's face until its real
entry is written; writing the entry (whose `repo:` claims the repository)
is what retires it. See [`../live/README.md`](../live/README.md).

No component changes, and no router changes: `lib/route.ts` takes its accepted
slugs from the *cards*, so a page with no card is unreachable and a card with no
page loses its link visibly. That is deliberate — it means the two lists cannot
drift silently.

**And no Developer-console changes either.** `#/dev` finds an app by scanning
tdg-core for `public.<app>_entitlements`, so creating the table the app needs in
order to sell anything is also what gives it a panel, grant switches, an
overview tile and a Purchases filter. Step 4 above then supplies the name and
the prices that panel shows. If you are editing `src/dev/` to make a new product
appear, you are doing it the old way.

## `backend` · the one place an app's database id meets its name

Every app card may carry a `backend` — `bea`, `veditor`, `devfleet`,
`makullveny` — which is what that app calls itself when it writes to the shared
TDG database: the `app` column of `tdg_badges`, `tdg_streaks` and
`tdg_feedback`, and the id `tdg_store_apps()` discovers.

It is here because the Account page draws rows the DATABASE named, and printing
them raw would tell somebody they have a `Bea` streak. The name of a product is
copy, and copy lives in this folder (rule 1) — the alternative was a lookup
table inside a component, which is the thing rule 1 exists to prevent.

**Optional, and a missing one is not a bug.** An app that has never written a
row has nothing to map, and an id nothing here has heard of still gets a face:
`prettyId` in `src/account/format.ts` turns `music-everything` into
`Music Everything` and `tdg-site` into `TDG Site`.

**What it must never be is wrong.** Only ids actually observed in the database
are written here. A guessed one produces a mapping that silently never matches,
which reads exactly like not having it at all — and there is nothing on screen
to tell the two apart.

## This folder is the default, not the last word

Since 2.0.0 the Developer console's **Content** tab can override any of it at
runtime: the order of the product cards, whether each is shown, its words, its
icon, its cover, its access button, and every section of its own page. That
overlay is one jsonb row in tdg-core and it is read by
[`src/content/`](../content/README.md), which merges it over what is written
here.

Nothing about this folder's job changed. It is still where a product's words are
WRITTEN, it is still what every visitor sees when the overlay says nothing, and
it is still the fallback when the read fails — so a field nobody has overridden
goes on tracking this file, and an outage renders the built-in site exactly.

What DID change: `shotForPage`, `iconForPage` and `chipsForPage` are no longer
in `appPages.ts`. They read a page's own card, and a card can now be renamed or
re-covered from `#/dev`, so they moved to `src/content/resolve.ts` beside the
overlay they have to read. MARANATHA's three chips moved to its entry in
`content.ts` at the same time, which `chipsForPage` had asked for in as many
words.
