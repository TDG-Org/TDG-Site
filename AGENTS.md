# AGENTS.md · building on the TDG site

**Read this before you change a file.** It is written for an AI assistant
arriving cold — Claude, Codex, Cursor, Copilot, Gemini, anything — with no
memory of how this site got the way it is. Every rule below exists because
breaking it has a visible cost, and the cost is named beside the rule.

The short version, if you read nothing else:

> **The structure and the interface are the product. You extend them; you do not
> restyle them, simplify them, or replace them with something you would have
> chosen.** A change that looks like the rest of the site and is written the way
> the rest of the site is written is the only kind that ships here.

---

## 1 · Orientation

| | |
| --- | --- |
| **Stack** | React 19 · TypeScript 5.9 · Vite 7. Hand-written CSS, **no framework**, no CSS-in-JS, no component library. |
| **Backend** | Supabase (`src/lib/supabase.ts`), shared with the other TDG apps. See `supabase/README.md`. |
| **Hosting** | GitHub Pages, from `main`, at `/TDG-Site/`. Deploy is manual-only (`workflow_dispatch`) as of 2026-08-27 — see `.github/workflows/deploy.yml`. |
| **Router** | Hash routes, hand-rolled in `src/lib/route.ts`. No router library. |
| **State** | React context and hooks. No Redux, Zustand, Jotai, React Query, or anything else. |
| **Tests** | **There are none.** The typecheck and the build are the entire safety net. Read §7 before you claim anything works. |

```bash
npm install && npm run dev
```

| Command | What it is |
| --- | --- |
| `npm run dev` | Vite dev server on `http://localhost:5180`. |
| `npm run typecheck` | `tsc -b --noEmit`. Must be silent. |
| `npm run build` | `tsc -b && vite build`. Must be green. The 500 kB chunk warning is pre-existing and expected. |
| `npm run preview` | Serves the production build, so it sees the real `/TDG-Site/` base path. |
| `npm run verify:store` | Holds every advertised price and link in `store.ts` against what Stripe actually sells, plus the Cloud config and the webhook endpoints, via the `tdg-store-verify` Edge Function. Run it whenever a price moves, and before a release. |

Copy `.env.example` to `.env.local` and fill in the two Supabase values, or the
app throws on boot by design. The publishable key is not a secret; the
protection is RLS on the server.

### Where things live

| Path | What it is | Its own README |
| --- | --- | --- |
| `src/data/` | **All page copy and catalogue data.** Prices, app pages, About, the Store's prose. | [`src/data/README.md`](src/data/README.md) |
| `src/components/` | Every rendered surface, one `.tsx` + one `.css` per component. | [`src/components/README.md`](src/components/README.md) |
| `src/styles/` | `tokens.css` (the palette) and `base.css` (the shared primitives). | [`src/styles/README.md`](src/styles/README.md) |
| `src/content/` | The runtime overlay over `src/data/`: what `#/dev` has changed about our product cards, merged over the copy the repo ships. | [`src/content/README.md`](src/content/README.md) |
| `src/lib/` | Routing, the animation loop, sections state, Supabase client, asset paths. | [`src/lib/README.md`](src/lib/README.md) |
| `src/live/` | What is deployed right now, asked of GitHub at runtime: cards upgrade their status to a real link, and `tdg-app`-tagged org repos get derived cards. | [`src/live/README.md`](src/live/README.md) |
| `src/hooks/` | The five motion hooks every card and section uses. | [`src/hooks/README.md`](src/hooks/README.md) |
| `src/auth/` | Sign-in, the profile, session revocation, and what a refusal says. | [`src/auth/README.md`](src/auth/README.md) |
| `src/account/` | The account page at `#/account`: what the account is, what it counts, and who may see each part of it. | [`src/account/README.md`](src/account/README.md) |
| `src/people/` | Somebody else's account, at `#/user/<handle>`: who they are, where you stand with them, and what a block looks like when it is said out loud. | [`src/people/README.md`](src/people/README.md) |
| `src/badges/` | Global account badges, and the account count the footer prints. | [`src/badges/README.md`](src/badges/README.md) |
| `src/feedback/` | Send Feedback, and the panel that delivers our replies — and, with them, any notice about a change to what an account owns. | [`src/feedback/README.md`](src/feedback/README.md) |
| `src/notices/` | Messages about what an account owns, written from `#/dev` and waiting for the person they are about. | [`src/notices/README.md`](src/notices/README.md) |
| `src/store/` | Reading which packs an account owns, and which products it may not. | [`src/store/README.md`](src/store/README.md) |
| `src/cloud/` | TDG Cloud, built and dormant: the Store's plan shelf, the Account fold, and the console's launch/economics tab, all reading TDG Core's `tdg_cloud_config`. | [`src/cloud/README.md`](src/cloud/README.md) |
| `src/theme/` | The theme wave and the `data-theme` attribute. | [`src/theme/README.md`](src/theme/README.md) |
| `src/dev/` | The internal Developer console at `#/dev`. | [`src/dev/README.md`](src/dev/README.md) |
| `supabase/` | The edge function and the SQL migrations. Not part of the bundle. | [`supabase/README.md`](supabase/README.md) |

**A folder's README is authoritative for that folder.** Read it before editing
anything inside, and update it in the same commit as any change to that
folder's public surface. If a README disagrees with the code, the code wins —
fix the README.

---

## 2 · The eighteen rules

### 1. A catalogue is data. A section's own headline is not.

Everything this site says about a **product** lives in `src/data/`: every app,
tool and game — card, chips, page, facts, guide — plus About, the Store
catalogue and all its prose, the nav links and the Origin chapters.
`AppPage.tsx` knows nothing about any particular app; it renders whatever
`appPages.ts` holds. Adding an app is an entry in `APP_PAGES` plus a `page:` on
its card in `content.ts`. Fixing a line of a guide is one string.

**The test is whether the component drawing the words knows what it is
drawing.** `AppPage.tsx` does not, and it draws eleven — so the eleven live in data,
which is the only reason they have stayed consistent with each other.
`Apps.tsx` draws its own kicker, heading and lede once and will never draw a
second set, so those live in `Apps.tsx`. Every home-page section is written that
way: `Hero`, `Origin`, `Apps`, `Tools`, `Building`, `Faith`, `Outro`, `Store`,
`Footer`. Moving a one-off headline into a data file buys no consistency —
there is no second instance for it to agree with — and costs the thing that
makes a section legible, which is reading its words and its layout in one file.

Copy that belongs to a **mechanism** stays with the mechanism, one place per
fact: refusals in `src/auth/wording.ts`, the feedback form's words in
`src/feedback/api.ts`. Both folders' READMEs say so and say why.

**Never** hardcode a product's copy into a component — a name, a price, a chip,
a status, a fact row, a paragraph of a guide — and never add a component whose
only job is to render one app's content. That half is absolute; it is the half
that costs money when it bends. [`src/data/README.md`](src/data/README.md) has
the worked line.

**`src/data/` is the DEFAULT, and since 2.0.0 it is not the last word.** The
Developer console's Content tab can override any of it at runtime — the order
of the product cards, whether each is shown, its words, its cover, its access
button, every section of its own page — and that overlay is one jsonb row in
tdg-core, read and merged by [`src/content/`](src/content/README.md).

Nothing above bends for it. A product's words are still WRITTEN in `src/data/`,
that file is still what every visitor sees when the overlay says nothing, and it
is still what renders when the read fails — which is the only reason a static
marketing page is allowed to depend on a database at all. **So a surface that
draws a product reads it through `src/content/`, never from `content.ts`
directly**, or that surface goes on printing the words the site stopped saying
an hour ago. `Apps.tsx`, `Tools.tsx`, `Building.tsx`, `AppPage.tsx` and
`Store.tsx` are the five that do, and adding a sixth means doing the same.

### 2. Never write a colour, and never write a second one.

Every colour comes from a token in `src/styles/tokens.css`: `--bg`, `--bg2`,
`--surface`, `--text`, `--muted`, `--faint`, `--border`, `--border-hover`,
`--accent`, `--accent-soft`, `--warm`, `--invert-bg`/`--invert-fg`,
`--live-fg`/`--live-bg`/`--live-border`. Need a variant? `color-mix(in srgb,
var(--token) N%, transparent)`, the way `AppPage.css` does.

A literal hex in a component stylesheet is a bug even when it looks right,
because it will be right in exactly one theme.

### 3. Both themes, always, and never a colour defined only in one place.

Dark is the default on `:root`. Light is `[data-theme='light']`. If you add a
token you add both. Verify both — see §7; a value that only resolves correctly
in the theme you happened to be looking at is the single most common way a
change here breaks.

### 4. Reuse the primitives before you invent one.

`base.css` already owns: `.page`, `.shell`, `.section`, `.section--blend`,
`.kicker`, `.h2`, `.lede`, `.chip` / `.chips` / `.chip--hot`, `.card` with its
`.card__spot` / `.card__edge` / `.card__cover`, `.badge`, `.sr-only`. A section
that does not open with a `.kicker` and a `.h2` inside a `.shell` will not look
like this site. A box that is not a `.card` will not tilt, will not light its
edge, and will read as foreign the moment the cursor passes it.

`.card` is `overflow: hidden` with `transform-style: preserve-3d`, and
`base.css` forces every direct child to `position: relative`. **An absolutely
positioned overlay inside a card must be a grandchild** — anchor it to an inner
wrapper, not to the card itself. `Store.tsx`'s plan chooser is the worked
example.

### 5. Custom-style every interactive element and every state.

Nothing on this site ships wearing the browser's default look: not a select, not
a checkbox, not a scrollbar, not a stepper arrow, not a focus ring, not an
autofilled field. `base.css` already handles form controls and the autofill
highlight; `src/lib/chromeGuard.ts` handles extensions that try to repaint them.

Empty, loading and error states count as states. The Store card has eight —
`checking` · `signedOut` · `error` · `owned` · `waiting` · `buy` · `revoked` ·
`closed` — and a fixed `min-height` so it never changes size as answers arrive;
a shelf that jumps as answers land reads as a page still loading.

`revoked` is the one worth reading twice, because it looks like `buy` and means
the opposite. A product a developer has taken out of an account's reach is
unowned, and the card must never fall back to offering it: that would be the
shop taking money for something the database has already decided to refuse. It
says what, why and when instead — see [`src/store/`](src/store/README.md).

`closed` is the same argument about the APP rather than the account. **A pack
is a key, and this shop does not sell keys to doors that do not exist yet**: a
card whose app is not out draws no Buy button, and says which of the two
reasons it is — not shipped, or shipped and temporarily not answering — where
the button would have been. It replaces `buy` and `signedOut` and nothing else,
so an owner still sees `owned` and every **Manage or Cancel Plan** goes on
working while the shop is shut. The answer is derived at runtime from the same
resolution the app's own card uses, so launch day opens the shop with nothing
to edit and no deploy; `src/store/sale.ts` holds it, and the one written field
behind it (`released` in `src/data/store.ts`) may only ever raise the answer,
never lower it.

### 6. Symmetry is structural, never hand-tuned.

Anything paired or mirrored — two cards on a shelf, a header's left and right
clusters, a panel and the card it sits in — takes its padding, gaps, sizes and
radii from **one** set of variables on the common parent, applied in mirror
image. Never a literal on one side and a different literal on the other.

When you change one side, **measure the rendered result on both** and assert
they match. A lopsided pair is a bug even when neither number looks wrong alone.

### 7. Title Case for names. Sentence case for everything else.

Buttons, tabs, section titles, menu items, toggles, feature names, chips and
plan labels are **Title Case**: `Buy Theme Pack`, `Choose a Plan`, `Expand All`.

Descriptions, hints, helper text, errors and toasts are **sentence case**:
`Secure checkout by Stripe. Opens in a new tab.`

Proper nouns and acronyms keep their own form regardless — `TDG`, `Stripe`,
`FFmpeg`, `MARANATHA`.

### 8. Routes are hashes, and every route carries a leading slash.

`#/about`, `#/store`, `#/store/<app>`, `#/app/<slug>`, `#/dev`. The slash is not
decoration: a route that ate a section anchor would break the one-page scroll.
The rule was learned from one near miss — the home section used to be `#story`,
one letter from `#store`. That section is `#origin` now, so that particular pair
cannot clash any more, and the rule stands unchanged regardless: what it buys is
that no section anchor added in future collides with a route added today. Any
new route gets the slash and puts its variable part behind a segment.

An unrecognised route renders **home, with the hash untouched** — the same thing
`#/banana` does. Never a "not found" screen, never a redirect: both of those
answer the question "is there something here?".

A route may put its variable part behind a segment and open a different *page*
for each value: `#/store/veditor` is that app's own page of packs, not the Store
with somebody else's cards on it too. A link that has already said which app it
means must not make the reader find it again. (That route used to name a place
rather than a page — the Store was one scroll of shelves and it landed on one of
them. The hash did not change when the shelves became pages, which is the point:
every link ever written to it still opens the same app's packs.)

### 9. All motion goes through the one frame loop.

`src/lib/motion.ts` runs a single `requestAnimationFrame` loop for the whole
page, and it parks itself when nothing holds it. Measured: a reader parked
mid-article went from 71 ms of main thread per second to 0.1 ms.

Never call `requestAnimationFrame` directly, never add a scroll listener, never
add a `setInterval` for animation. Subscribe with `onFrame`, read element rects
rather than a scroll offset, and call `frame.hold()` only while genuinely
time-based work is outstanding.

**There is a narrow exemption, and taking it means documenting it at the call
site.** A legitimate one is all three of these at once: the work is **not
animation** — no tick of it repaints something that is moving; the shared loop
would be **worse**, because it would be held awake at 60 Hz to do something that
happens once a second or once a session; and it **ends by itself**, so nothing
is left running once the thing that wanted it is gone. A one-second countdown
qualifies. A lerp never does, however cheap it looks.

`src/feedback/FeedbackDialog.tsx`'s interval is the model to copy: its comment
names the rule, says why a clock does not belong on the loop, and says exactly
when the interval dies. Take the exemption without writing that paragraph and
the next reader cannot tell it from a mistake — which is how a rule broken
three times becomes a rule nobody applies.

Honour `prefers-reduced-motion` — `motionIntensity` is 0 when the visitor asked
for less, and every `@media (prefers-reduced-motion: reduce)` block in the
component stylesheets exists for the same reason. `useOffscreenPause` parks
decorative animation in sections nobody can see; leave it working.

### 10. A price is written down once, and this repo is not the only place.

`src/data/store.ts` is the single source for what is sold. Its header lists
**every other place the same number lives, including two other repositories**,
because a static page cannot ask Stripe what a price is. Change one and change
all of them in the same sitting.

Anything derived — a yearly saving, a discount, a total — is **computed**, never
typed. `annualSavingCents()` exists so `SAVE $22.88` can never disagree with the
two prices above it.

`storeAnswers.ts` deliberately names no amount at all. Keep it that way.

**Advertising one amount and charging another is the one mistake a shop may not
make.** Every chip, label and cadence on a card must agree with the plan it
describes.

**A pack's `unlocks` is the WHOLE list, not a highlight reel.** The Store says
out loud, above the cards, that what is on a card is everything you get — so a
feature left off because the list was getting long is the shop breaking a
promise it made in writing. If a pack gains something, it gains a line.

**And there are no refunds**, which is stated in the same place before anybody
presses Buy, because a rule discovered afterwards is a rule nobody agreed to.
That policy lives in exactly two places and they have to move together: the
`Before You Pay` block in `Store.tsx`, above the cards, and the `refunds`
section of `storeAnswers.ts` under them. **Both are drawn on BOTH Store views** —
the index and each app's own page — because Buy lives on the app's page now, and
a policy one click behind the button is a policy found the day it is wanted.
They are one component each (`BeforeYouPay`, `MoneyAnswers`) so the two views
cannot answer differently. The short version is above the fold on
purpose — a refund policy only reachable by opening a fold is one somebody finds
out about the day they want one. The two things that are NOT refunds and are
still fixed the day somebody asks — money taken that bought nothing, and a pack
on the wrong account — are named in that section so the no does not read as a
wall.

### 11. Every pack sold more than one way looks the same, in every app.

This is a fixed pattern, not a per-app design decision. TDG Veditor's Pro Export
Pack is the reference implementation; anything that sells a second plan copies
it rather than inventing beside it. A shop that looks different on each shelf
makes a reader re-learn how to buy.

**One button on the card, whatever the plan count.** The same `store__buy` a
one-time pack has, full width, in the same place — so two cards on a shelf line
up. Label it `Buy <Pack Name> · From <cheapest amount><cadence>` with a chevron.
Never a button per plan: unequal action rows on a shelf are visible immediately,
and the grid stretches the sibling card to match whichever grew.

**The plans open in a chooser drawn OVER the card, never expanded into it.**
Packs sit in a grid row and a grid row stretches its siblings to the tallest, so
an inline expansion grows *both* cards and leaves a hole under the other one's
button. The panel anchors to the card's action row — a grandchild, per rule 4 —
with a scrim out to the card's real edges.

**Every plan is priced before anything opens.** No plan is picked silently, and
no plan is dressed as the primary one: three identical rows, ordered cheapest
entry first. The row's own weight must not be what recommends it.

**One row, three parts:**

| Part | What it is |
| --- | --- |
| Name | Title Case, the plan's own name — `Monthly`, `Yearly`, `Lifetime`. |
| Note | Sentence case, one line, what the billing actually is: `Billed once a year. Cancel any time.` It never names an amount. |
| Money | The amount and its cadence, right-aligned, **with the saving directly under it**. |

**The saving sits under the amount it is about, and is set at reading size.**

It is a fact about the money, and a reader comparing plans reads *down* the
right-hand column — a saving printed over beside the plan's name is a number
they have to go and find. It is also the thing that decides the sale, so it is
**not** a `.chip`: the site's chips are 9px mono tags for a status nobody reads
twice. This is `700 12.5px` in the body face, in the `--live-*` green, in a 2px
pill. Sentence case with the amount: `Save $22.88`.

**And it is always computed, never typed** — `annualSavingCents()` derives it
from the two prices above it, so it cannot go stale when one of them moves. See
rule 10.

**The saving's box is reserved in every row.** A badge on one row alone makes
that row taller than the other two, which is the same unevenness the chooser
exists to remove, one level down. So the element renders in *all* rows whenever
the chooser has a saving to state — empty and `visibility: hidden` where there is
nothing to say — and it carries an explicit `height` so the reservation cannot
drift with the text. `display: none` gives the space back and defeats the point.
A chooser with no saving anywhere reserves nothing.

**The floor for the panel:** `role="dialog"` with an `aria-label` naming the
pack, `aria-expanded` and `aria-haspopup` on the button, focus into the first
plan on open, Escape closes and returns focus to the button, a click on the
scrim closes, and the chevron flips. Both themes, reduced-motion handled, and
the rows measured equal — see §7.

**A plan that can be started can be STOPPED, from the same card.** This half is
not optional and it is not a later feature. A shop that can take a recurring
payment and cannot stop one is a shop nobody should give a card to, and "email
us to cancel" is that shop wearing a politer sentence.

So an owned subscription's card carries **one button**, `Manage or Cancel Plan`,
in the same place and at exactly the same size as the Buy button its neighbour
has — measured, not assumed. It opens the SAME panel component as the chooser,
which is how rule 11's promise is kept mechanically rather than by two blocks of
JSX agreeing with each other. Behind it: change the plan, buy it outright where
that is sold, cancel, resume, and reach the card on file.

**Cancelling means the renewals stop. It never means access stops.** The
entitlement runs to the end of the period already paid for, in the app as much
as on this page, and the card names the exact date. That is not wording — it is
`<app>_packs_in_force()` in Postgres, which keeps a cancelled-but-unexpired
subscription in force and is the same function the app itself asks. The Store
sets `cancel_at_period_end` with one API call rather than sending anybody to
Stripe's own cancel flow, because that flow's behaviour is a **dashboard
setting**: flipped to "immediately" it would take days off somebody's purchase
silently, with nothing in this repo changed and nothing to notice it.

**Both of the money presses ask first**, in the panel, in place — not in a
second dialog over the first. And the confirm's two buttons are a mirrored pair
under rule 6: they take their padding from one variable on the row, because
`flex: 1 1 0` with `border-box` splits only what is left after each item's own
padding, and the site's ghost and buy paddings made them 241px and 249px.

**Every standing gets a face**, including the awkward ones: renewing, ending on
a date, in a free trial, behind on a payment, lapsed, and a `kind` this site has
not been taught to read. `Manage or Cancel Plan` is drawn for every current
subscription standing and every account, never according to Developer
permission. If the grant has no live Stripe subscription behind it — which is
what a pack granted by hand from `#/dev` looks like — the panel says **Billing
Link Missing** before its actions. The entrance stays visible so a broken
billing link cannot also hide the only cancellation route. A catalogue item
sold only once never gets that panel, even if stale data gives it an impossible
subscription-shaped grant.

### 12. The security boundary is in Postgres, and only in Postgres.

Every privileged read and write goes through a `tdg_admin_*` function that opens
with `bea_is_admin()` and raises `42501` otherwise. Entitlement tables have no
client write policies at all.

Hiding the Developer tab, lazy-loading its chunk and hashing its filename are
**tidiness, not a lock** — the files say so out loud. Never add anything that
relies on a page being secret, and never move a permission check into the
client. If you need a new privileged verb, it is a migration first.

### 13. Comments explain *why*, and say what does not work.

This codebase documents reasoning, not syntax. Look at any file header before
you write one. A comment here names the alternative that was tried, the failure
it produced, and the measurement that settled it — `useOwnedPacks.ts` on why a
failed read is its own state, `wording.ts` on why errors match codes and never
message text, `dpr.ts` on why a media query and not a ResizeObserver.

Do not strip these comments to "clean up". Do not replace them with restatements
of the code. When you change behaviour a comment describes, change the comment
in the same edit.

### 14. Accessibility is a floor, not a finish.

Keyboard reachable, visible `:focus-visible` outlines (`2px solid var(--accent)`
with an offset, everywhere), real ARIA on anything that opens (`aria-expanded`,
`aria-haspopup`, `role="dialog"` with an `aria-label`), Escape closes and
returns focus to whatever opened it, `.sr-only` for text a screen reader needs
and a sighted reader does not, and `aria-hidden` on decorative SVG.

### 15. Assets go through `asset()`.

The site is served from a subpath. Vite rewrites paths it can see in HTML and
CSS, but not strings assembled at runtime — which is every `srcSet` here. Use
`asset('shots/foo.webp')` from `src/lib/asset.ts`. A leading slash resolves
against the origin and 404s in production while working perfectly in dev, so
this breaks *only* after deploy.

### 16. Down to 320px, and up to 300% zoom.

Grid tracks use `minmax(min(100%, Npx), 1fr)` — a track whose minimum is wider
than its container overflows it, and at 320px the shell is 284px wide. Long
unbroken strings (a display name, a handle, a pasted URL) already break via
`overflow-wrap` in `base.css`. Keep both true.

### 17. A surface that lists our products derives the list. It never types it.

The Apps grid maps `APPS`. The Store's index maps `STORE_APPS`, and one app's
page maps that app's own `packs`. The Developer
console maps whatever tdg-core turns out to have. **Nowhere on this site is
there a place where adding a product means remembering to also add it here** —
and the reason is not tidiness, it is that forgetting does not fail loudly. A
missing card is a product nobody can find. A missing option in the Developer
console's Purchases filter is an app whose money is quietly left out of a total
somebody is reading to make a decision.

So when you add a surface that shows "all our apps", "all our packs", "every
ledger": derive it, and make it render the thing it does not recognise rather
than dropping it. **An unknown entry gets a face** — a title made from its id, a
sentence saying which source has not heard of it — because a list that silently
omits what it cannot name is a list you cannot trust about anything else on it.
`src/dev/apps.ts` is the worked example; `src/dev/README.md` explains what to do
instead of writing the app's name down.

The exception is a genuinely different *shape*, not a different instance of one.
Makullveny keeps a hand-written panel because it sells a tier ladder plus themes
plus two flags, which is not the pack-Store shape wearing a different name.

**Derive it through `src/content/`, not from `content.ts`.** The Apps grid, the
Tools shelf, the Building panel and the Developer console's own Content roster
all map `visibleApps()` / `visibleTools()` / `visibleGame()`, so a card hidden
in one place cannot still be printed in another. That is the same rule this one
already was — one derived list, no second copy — with one more thing folded into
the derivation.

### 18. The page says what it is called and what it looks like, everywhere.

A phone is allowed to keep this site. Safari's **Add to Home Screen** turns it
into a tile with a name and an icon, and both of those come from `<head>` — not
from anything on the page, and not from anything a visitor can correct.

Get either wrong and the failure is silent and permanent: the owner reported
this site arriving on an iPhone with **no icon at all** and called **"TDG · The
Disciples of God"**. Both were exactly what the markup asked for. The only icon
link was `favicon.svg`, and **Safari will not read an SVG for
`apple-touch-icon`** — with no raster to take, iOS makes the tile out of a
*screenshot of the page*. The name came from `<title>`, which held the lockup
rather than the name.

So four things, and they are checked together because three of them right is
still a wrong tile:

| | |
| --- | --- |
| **The name is the NAME** | `TDG Site`, in `<title>`, `apple-mobile-web-app-title`, `application-name`, and the manifest's `name` and `short_name`. A bookmark takes `<title>`; iOS takes the apple meta first and `short_name` after it. The lockup is a headline and it belongs on the share card, where `og:title` still carries it. |
| **The icon is a raster, and it is opaque** | 180 px for `apple-touch-icon`, 192 and 512 in the manifest. iOS masks the tile itself, so the file carries **no rounded corners and no alpha**: a baked radius gets masked twice into dark wedges, and an alpha channel is composited on black first. Both read as "the icon does not fit", which is the report this rule came from. |
| **The mark sits inside the safe circle** | Every platform mask is different and Android's is the tightest: the centred circle of 80% diameter. `scripts/icons.mjs` sizes the cross to 62% of the tile for that reason, and says so at the constant. |
| **`display` is a decision, not a default** | It is `browser` here on purpose. A standalone iOS web app keeps its **own** storage and sends every out-of-scope navigation to Safari — which is what `signInWithOAuth` does — so installed standalone, the round trip would leave the session in Safari and the tile still signed out. Say why in `index.html` if you ever change it. |

The icons are **generated and committed**, by `scripts/icons.mjs`, from
`CrossGlyph.tsx`'s own path and `tokens.css`'s `--cross-stop-*`. It needs
`sharp`, which is deliberately not in `package.json` — see the file's header for
why the tool stays out of a bundle that is already flagged at 500 kB, and rule 2
for why the colours are not typed a second time.

**This rule is about every TDG app, not only this one.** Each of ours that opens
in a browser owns the same four lines in its own `<head>`, with its own name and
its own art.

---

## 3 · The five jobs you will actually be asked to do

**Add an app, tool or game.** An entry in `APPS` / `TOOLS` in
`src/data/content.ts` with a `page:` slug, its icon art in `public/assets/`, and
a matching entry in `APP_PAGES` in `src/data/appPages.ts`. The router picks the
slug up from the card, so a page with no card is unreachable by design. No
component changes. Give the card a `repo:` naming its TDG-Org repository —
that is what lets `src/live/` notice the app deploying and turn its `Coming
soon` into a real button at runtime, with nothing here to edit on launch day.
(A public org repo tagged `tdg-app` gets a derived card before any of this is
written; see [`src/live/README.md`](src/live/README.md).)

The Content tab at `#/dev` picks it up with no edit at all: the roster maps the
same derived lists the site does, and a slug the stored order does not name
lands at the end of its grid on its own. So a new app is orderable, hideable and
editable on its first day without anybody republishing the content document.

If the app sells packs, add it to `STORE_APPS` in `src/data/store.ts` too — and
**that is the whole job, its Store page and the Developer console included.**
The Store's index maps `STORE_APPS`, so the entry is its card; `#/store/<id>`
becomes its own page of packs with no route to add, because the router accepts
any id the catalogue claims. `#/dev` finds apps by
scanning tdg-core for `public.<app>_entitlements`, so its panel, its grant
switches, its overview tile, its Purchases filter and its audit trail appear
from the table the app needed anyway. Do not add a panel or a column for it; see
[`src/dev/README.md`](src/dev/README.md).

**Add a section to an app or About page.** A `PageSection` in the same file. It
needs an `id`, a `title`, a `what` (the one line a closed row carries — a
section that says nothing while shut is a bug), an optional `tag`, and `blocks`
from the vocabulary in `src/data/pageBlocks.ts`. Do not invent a block type for
one paragraph; that is how a content file becomes a component.

**Add or change a pack in the Store.** `src/data/store.ts`, and read its header
first — the number lives in four places plus Stripe. `unlocks` is a complete
list and not a summary, because the Store promises it is (rule 10). A pack sold more than one
way gets a `plans[]` array whose **first entry must match the pack's own
`priceCents` and `paymentLink`**, so the primary plan is not a fourth place to
state it. The card renders one button whatever the plan count; see
`Store.tsx`'s chooser.

**Add a route.** `Route` union and `routeFromHash` in `src/lib/route.ts`, then a
branch in `App.tsx`. Leading slash, unknown values fall through to home, and
`same()` must be able to tell two of your routes apart or effects keyed on the
route will not re-run.

**Add a section to the home page.** A component in `src/components/` with its
own stylesheet, mounted in `App.tsx`'s home branch. It opens with a `.kicker`
and a `.h2` inside a `.shell`, takes its blend tints as `--tint-top` /
`--tint-mid` / `--tint-bot` the way `Store.css` does, and reveals with
`useReveal`. Register its id in `NAV_LINKS` if it belongs in the nav.

---

## 4 · Things that are not up for redesign

Do not "modernise", "simplify" or "clean up" any of these. Each was arrived at
deliberately and the reasoning is in the file:

- The hand-rolled hash router. No router library.
- Hand-written CSS with tokens. No Tailwind, no styled-components, no UI kit.
- The single `requestAnimationFrame` loop. No per-component animation libraries.
- The 2–3px radii, the tight letter-spacing, the mono chips, the four-font stack.
- The theme *wave* (colour crossing the page, not snapping) in `src/theme/`.
- The custom cursor, the card tilt, the pointer-lit card edge.
- Folded pages that open as an index, shared by app pages, About and `#/dev`.
- `#/dev` behaving exactly like an unknown hash for everybody else.
- The always-dark auth modal, which deliberately does not reskin with the page.
- `KeyArt.tsx`'s five drawn app covers, whose palette is fixed in both themes:
  they share a grid with Bible Educator's dark raster, which cannot flip, so a
  cover that went pale in light would read as broken art. The colours declared
  on `.keyart` in `KeyArt.css` are that decision, not tokens somebody forgot.

If a change genuinely requires breaking one of these, say so explicitly and
explain why before you do it. Do not do it quietly as part of something else.

---

## 5 · Dependencies

The runtime dependencies are `react`, `react-dom`, `@supabase/supabase-js` and
`three`. **Do not add another one** without being asked for it by name. A UI
library, an icon package, a date library, an animation library or a router would
each replace something this repo already does on purpose, and would land in a
bundle that is already flagged at 500 kB.

Icons are inline SVG components written where they are used (`Tick`, `Caret`,
`Cross` in `Store.tsx`, `Chevron` in `Folded.tsx`, the icon set in
`AuthModal.tsx`). Follow that pattern.

---

## 6 · Git

Work on `main`, commit in whole runnable steps, push. Checks green **before**
the commit, not after — on `main` a broken commit is everybody's, with nothing
between it and the next pull.

Never commit `.env.local`, machine-local settings, build output, or logs. The
tree is clean when you finish: `git status --porcelain` prints nothing.

Commit messages here are a sentence about what changed and why, not a
`feat(scope):` prefix. Read `git log` before writing one.

**Every change set you commit bumps `"version"` in `package.json`, in the same
commit.** It is the only file that carries the number — read it there rather
than from this sentence, which is the kind of copy that goes stale silently and
did: it named `1.0.0` for four releases after that stopped being true.
Deploys are manual (run `.github/workflows/deploy.yml` from the Actions tab),
but the version is still the only durable marker of which content went live
when — nothing on the page prints it and no build step reads it, which means
skipping the bump fails silently and forever. Patch
for copy, a fix, an image, small polish; minor for a new page, app entry,
section, component, or Supabase-backed feature; major for a change to the site's
structure or to a shape stored in Supabase that the other TDG apps share.
`package-lock.json` mirrors the version in two places at the top and
`npm install` fixes those. Never bump backwards, never reuse a number.

**Never hardcode another app's version on this site.** No page does today and it
must stay that way: a version typed into `src/data/appPages.ts` is stale the day
that app ships and nobody here will notice. Resolve a download's current release
at runtime from the GitHub releases API, the way `makullveny-site` does — copy
that pattern rather than pasting a number.

**GitHub Actions — one rule.** Never let a GitHub Actions workflow run, or
touch a workflow file, without being told to do that exact thing, right
then. No exceptions, nothing "routine." Build and test LOCALLY, always —
that's what costs zero of the usage we already burned through once,
org-wide, from workflows firing on their own. Only exception: told to make
a release ("make a new release," "ship it") — do it immediately, no extra
questions. Otherwise: don't run it, don't touch it, don't ask "should I."

---

## 7 · What "done" means here

There are no tests. That is not permission to skip verification; it means the
verification is manual and you have to actually do it.

1. **`npm run typecheck` silent, `npm run build` green.** Non-negotiable.
2. **Drive the real path in a browser.** Run the dev server, open the route you
   changed, and exercise the thing — click it, tab to it, press Escape.
3. **Measure; do not eyeball.** Symmetry, alignment and sizing claims come from
   `getBoundingClientRect()` or `offsetWidth`/`offsetHeight`, not from a
   screenshot. Use `offsetHeight` for layout: cards on this site carry a 3D tilt
   transform, so `getBoundingClientRect()` returns *projected* sizes that differ
   by a pixel or two between two identical elements at different heights on the
   card.
4. **Check both themes.** Toggle with the nav switch. Note that theme colours
   transition over ~600 ms via `--t-theme`, so read computed styles *after* it
   settles — in a non-compositing tab, transitions freeze at their start value
   and every reading will be the old theme's. Force them to land with
   `document.getAnimations().forEach(a => a.finish())`.
5. **Check the console.** No errors, no React warnings.
6. **Check 375px and 1440px.** The layout changes at 620px.
7. **Say what you did not verify.** Anything needing a human eye — a hover
   state, an animation's feel, a colour judgement — is "needs verification", not
   "verified".

---

## 8 · A worked example

The Store's Pro Export Pack is sold monthly, yearly and outright. It used to
print one button per plan, which gave its card a taller action row than the
one-time Theme Pack beside it: same row of the grid, same size card, buy buttons
that did not line up.

(The page around it has moved since. The Store was one scroll with every app's
shelf on it, and it is now an index of app cards over one page of packs per app
at `#/store/<app>` — but every word below is about the CARD, and the card is
unchanged. That is the point of the pattern: the pack card was liftable to a new
page without a line of it being re-decided.)

The fix shows most of this document at once:

- **One button**, the same `store__buy` its neighbour has, so the pair matches.
- The three ways moved into a chooser that **opens over the card**, not into it
  — the packs sit in a grid row, which stretches siblings to the tallest, so an
  inline expansion would have grown *both* cards and left a hole under the other
  one's button. The unevenness would have moved, not gone.
- The panel is a **grandchild** of the card, anchored to `.store__action`,
  because `base.css` forces every direct card child to `position: relative`.
- The saving is **computed** from the two prices, so it cannot go stale, and it
  sits under the amount it is about rather than beside the plan's name.
- Nothing is picked silently: the chooser prices every plan before anything
  opens.
- `role="dialog"`, `aria-expanded`, Escape closes and refocuses the button,
  scrim click closes, first plan takes focus on open.
- Both themes, reduced-motion handled, and the three plan rows made **exactly**
  equal — the saving's box is reserved in every row, because a badge on one row
  alone makes that row taller than the other two, which is the same bug one
  level down.
- Verified by measurement: card 419 px open and shut, buttons 507×45 px each,
  rows 69 px each, and the price and the saving sharing one right edge to the
  pixel in all three rows. **These are that session's readings, not a spec.**
  They are recorded here and nowhere else — `src/components/README.md` used to
  carry a second, different pair for the same button — and what carries forward
  is the *equality*, not the number: re-measure both buttons after anything that
  touches the action row rather than checking them against this line.

**Rule 11 is that pattern written down.** Any future app selling a second plan
copies it rather than designing beside it.

Read `src/components/Store.tsx`, `Store.css` and `src/data/store.ts` together
before touching the shop. Between them they demonstrate the data/component
split, the token discipline, the state machine, the copy rules and the
accessibility floor.

---

<div align="center">

**JESUS IS KING**

</div>
