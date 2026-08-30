# `src/components/` · every rendered surface

One `.tsx` and one `.css` per component, the stylesheet imported by the
component that owns it. No CSS-in-JS, no framework, no component library. The
shared primitives every one of these builds on live in
[`../styles/`](../styles/README.md); the words they render live in
[`../data/`](../data/README.md).

---

## What is here

### The home page, top to bottom

| | |
| --- | --- |
| `Hero.tsx` | The opening scene, and a **pinned** one: a 230svh section whose `scene/Stage` holds still for 130svh while the copy dissolves over it and Origin climbs up on a `margin-top: -100svh`. Its own header draws the three boxes and names the trap in each; read it before you touch the seam. Its canvases and its typed tagline are in `hero/`. (It used to own a `useHeroTakeover` hook that slid Origin with a JS translate. That hook is gone — the overlap is CSS now, so there is nothing left to time.) |
| `Walk.tsx` | **Not a section — a wrapper around three of them.** It owns the one 3D backdrop the whole cabin walk is read against, and the `margin-top: -100svh` that pulls this half of the page onto the pinned hero. See below. |
| `Origin.tsx` | Seven chapters on a timeline that fills as you read, over the walk's `origin/CabinScene.tsx` — a cabin in the snow the reader walks toward as they read, and then goes inside. |
| `Apps.tsx` · `Tools.tsx` | The card grids. Every card carries its app's icon and opens that app's page. Both are read against the walk's camera — the projects over a table, the tools over a window — so neither paints a background of its own. Both ask `src/live/` at runtime whether each card's app is actually deployed, and a yes turns its status caption into a real link; the Apps grid also appends a derived card per `tdg-app`-tagged org repository the catalogue has not been taught (`OrgTile`, with a drawn-monogram stand-in for the icon GitHub cannot provide). |
| `Building.tsx` | What is on our screens right now. |
| `Faith.tsx` | A slow gradient field, one verse, and the summit below it — `faith/Summit.tsx`, where the page's moon finally arrives behind the cross. |
| `Outro.tsx` | The makers note and the GitHub card that close the page. |

### The routed pages

| | |
| --- | --- |
| `AppPage.tsx` | One app's own page. **Knows nothing about any particular app** — everything comes from `data/appPages.ts`. |
| `About.tsx` | About TDG. Deliberately the same page as an app page, and carries **no stylesheet of its own**: a second one would be the two starting to drift, and this page's whole job is to look like it belongs beside the eleven it links to. |
| `Store.tsx` | The shop, in **two views over one set of state**: `#/store` is an index of one card per app, `#/store/<app>` is that app's own page of packs with the buy and manage panels on them. Both open and close with the app pages' own `BackButton`. Read it with `data/store.ts` and `store/useOwnedPacks.ts` — see below. |

### Always on screen

| | |
| --- | --- |
| `Nav.tsx` | The bar, the theme toggle, the account menu (identity, **Finish Setting Up** while a provider account is still missing a username or a password, Send Feedback, the Developer Tab switch, sign out), and the Developer tab that appends itself for a signed-in developer with Developer Mode on. That tab is **not** in `NAV_LINKS`, because that array is the public navigation and is read by everything. Pressing the mark still goes home, and also turns the cross a quarter turn into a sword and rolls *Jesus Loves You* out along the line it points down, for four seconds; how much bar it has is measured, so on a full bar the phrase either shrinks to fit or the link row dims for it. |
| `Footer.tsx` | |
| `Cursor.tsx` | A dot that tracks the pointer and a ring that trails it, reacting to what it is over. Fine pointers only; on a coarse pointer it renders nothing. |
| `AuthModal.tsx` | Sign in, sign up, choose a new password after a reset link, and **finish an account a provider left half-built** — Google sends neither a username nor a password, so that third mode collects them (`src/auth/README.md` has the measurements). **Deliberately theme-independent** — the site's one always-dark glass scene, the same way the hero owns its own tokens. There was no light variant in the design, so rather than invent one it stays the one true look whatever the page theme is. |

### Shared pieces

| | |
| --- | --- |
| `Folded.tsx` | The folding, and the blocks inside it. Shared by the app pages and About so the two cannot drift into different ideas of what a section looks like. Runs on the same state as the Developer console, via `lib/sections.tsx`. Its stylesheet is `AppPage.css`. |
| `AppIcon.tsx` | One app's icon, drawn the same way in all four places it appears. One component rather than four copies, because the alignment is the whole difficulty and four copies is four chances to get it wrong differently. |
| `ImageSlot.tsx` | A picture slot: key art, else a real screenshot. `art` wins over `shot` and over a local drop, because the two are for different places — the card wants the cover, the app's own page wants the software. Its drop-to-fill authoring layer is gated on `import.meta.env.DEV` and **must never reach a visitor**. |
| `KeyArt.tsx` | An app card's cover, **drawn rather than photographed** — one inline SVG at the exact `1120×700` of Bible Educator's raster, so the five drawings and the one photo sit in the grid identically. Everything it says comes from `KeyArtSpec` in `data/content.ts`; a sixth app is a data entry, not a file. Its palette is **fixed in both themes** and the literal hexes in `KeyArt.css` are that decision, not a rule-2 miss — §4 of [`AGENTS.md`](../../AGENTS.md) and its own header say why. |
| `CrossGlyph.tsx` | The TDG cross. One path, one continuous gradient across both bars, so the light reads as a single fall across the whole glyph — and painted through `<stop>`s rather than a flat `fill` so it rides the theme wave. Three of them render on the home page, so its gradient id is per instance from `useId`, the way `scene/Moon.tsx` and `KeyArt.tsx` do it. |

### `Walk.tsx` — the one component here that is not a surface

Everything else in this folder draws something. `Walk` draws almost nothing: it
is a wrapper around `<Origin />`, `<Apps />` and `<Tools />` whose whole job is
to be the box a `scene/Stage` can pin inside for all three at once.

**Why it has to exist.** A `Stage` is a sticky pin inside an
`absolute; inset: 0` box, so it holds for `section height − 100svh` and
releases on that section's bottom edge. `CabinScene` lived in a stage inside
`#origin`, which meant it could not paint one pixel behind `#apps` or `#tools`
— and the shot the site owner asked for goes in through the cabin door during
Origin, settles on a table while the project cards are read, and pans to a
window while the tools are. One camera, three sections. The stage moves up a
level; nothing else can buy that.

`internal/checklists/cabin-interior-spec.md` is the authority for the shot and
CONTRACT W in it is the architecture. Four things are worth knowing before you
touch anything in this half of the page:

- **It hands `CabinScene` a `WalkProgress`**, not a section progress: `p` is
  the sticky pin's own travel, 0 when the wrapper's top reaches the viewport
  top and 1 when the pin releases, plus `apps` and `tools` — the p at which
  each of those sections' top edges arrive, measured from the live boxes so
  the camera's settled beats stay on the headings when a section's height
  changes. It is a frozen accessor over a ref, like `usePointer`, so nothing
  re-renders sixty times a second.
- **The three sections paint no background.** `#origin` is `z-index: 4` and the
  other two are positioned siblings of the stage, so any band on them is a lid
  on the canvas. The backdrop for all three is one gradient on `.walk`,
  underneath it — transparent at the top for the hero dissolve, `--band-building`
  at the floor so `#building` still meets an identical band.
- **The copy is plated, and a plate is a LOCAL object.** `.card` already had
  `--card-bg`; the five blocks of copy read against the room — Origin's intro,
  its seven chapter rows, the link that closes its timeline, and the heads of
  `#apps` and `#tools` — take one soft-edged plate each from **`.walk-plate`**,
  which is declared in `Walk.css` because that is the file that owns all three
  sections. Each is anchored to its own copy's column and has reached nothing
  240px past its own last glyph; a caller sets only `--plate-col`,
  `--plate-up`, `--plate-down` and `--plate-ink`. The version before it ran
  1350–1390px wide for copy 265–660px wide and two of the five were measurably
  rectangles — that is what "the cabin is being delivered as a grey gradient"
  was. `Walk.css` carries the alpha probe that measures a plate's own edge and
  the numbers each block is solved against.
- **`.walk` must not become a stacking context and must not be `overflow:
  hidden`.** Either one breaks something silently — the first re-orders the
  lamppost against the hero's wordmark, the second stops the pin sticking at
  all. Walk.css states both where they can be broken.

### `hero/` and `origin/`

`hero/` is hand-rolled 2D-canvas 3D — rotate, project, splat. `PointCloud.tsx`
morphs between the twelve forms in `shapes.ts`; `Starfield.tsx` is the dust.
**No WebGL in either**, and that is still the site's own proven approach: point
counts scale to what the device can comfortably paint, and the dust runs at
24 Hz on a capped DPR because nobody can tell and it is 2.5× less canvas work
for an identical result.

`hero/Tagline.tsx` is the one file in there that draws no canvas: it types the
lines of `HERO_TAGLINES` out under the wordmark and swaps them from a shuffle
bag, so no line repeats until every line has had its turn. It is also the
worked example of a state machine living **inside** `onFrame` rather than on a
timer — it accumulates `dt`, holds the loop only while a character is actually
pending, and lets it park through the five-second rest. Under reduced motion
the first line renders whole, immediately, with no caret.

`origin/` is the exception, and it is a recent one. `CabinScene.tsx` is **real
three.js on a `WebGLRenderer`** — the only file in `src/` that imports `three`,
and the reason that dependency is in `package.json` at all. It replaced
`OriginField.tsx`, a 2D projected point field standing in for depth this
section can now have properly, so there is one canvas in Origin where there
were two. The cabin is **built in code** rather than loaded: no `.glb`, no
loader, ~540 triangles in four draw calls, in the flat faceted language of the
art kit. Its header argues each of those and is the file to read first; it is
also lazy, behind a `Suspense`, so the chunk does not reach a reader who never
scrolls that far.

The folder name is now the one thing about it that is out of date: the cabin is
not `#origin`'s any more, it is the whole walk's. `Walk.tsx` mounts it, defers
its chunk and hands it the camera's progress — see above.

**What did not change is rule 9.** The cabin is one `onFrame` subscriber with
no `THREE.Clock` and no `setAnimationLoop`, it holds the loop only while
something is genuinely converging, and it returns before drawing when the
section is off screen. A rendering library is not a licence to bring its own
clock.

### `faith/`

`Summit.tsx` and `Summit.css`: the scene at the bottom of `Faith.tsx` — three
smooth ridges, the moon low behind them, and the page's own `CrossGlyph`
standing on the crest with the disc directly behind it. It is the sixth beat of
the walk the home page takes, and where the hero's moon ends up five sections
later.

**The ridges are authored SVG rather than art from the kit**, and the kit's own
README now records the exclusion from the other end: the faceted low-poly
mountains are the hero's language and the wrong texture for smooth layered
hills. The cross is `CrossGlyph` rather than `faith/hillside-cross` for the
same kind of reason plus a harder one — that artwork carries its own hill and
its own cross, which would be a second structural anchor in a section that is
allowed one.

Read it for the pattern it demonstrates: **an alignment held by arithmetic**.
Every number hangs off two custom properties on the section, so "the cross's
foot is on the crest line", "the cross and the moon share one x" and "the whole
cross is inside the disc" are true by construction at every width rather than
at the width somebody happened to open. Nothing in it is tuned per breakpoint,
and `Summit.css` shows the working for each claim including the worst case.
That is rule 6 — symmetry is structural, never hand-tuned — applied to a
composition instead of to a pair of buttons.

### `scene/`

The shared vocabulary for the parallax art kit in `public/assets/parallax/`,
for the shaped boundaries between sections, and for anything drawn rather than
photographed: `ThemedArt` / `ThemedHeroArt` / `StillArt`, `Seam`, `Stage`,
`Moon` and `Snow`. It was written **before** the sections that use it, so that
seven of them would reach for the same primitives instead of each wrapping an
`<img>` its own way; `Hero`, `Origin`, `Apps`, `Tools`, `Building`, `Faith` and
`Outro` draw from it today — every section on the home page.

Read [`scene/README.md`](scene/README.md) before you decorate anything. It
carries the caller map, the reason there are three art components rather than
one with a mode prop, the reason a seam cannot read `--tint-top`, the
`overflow: clip` a stage needs on its section, and why two of its exports have
no caller and are kept anyway.

---

## The rules for anything you add here

**Open with the site's own furniture.** A section is a `.section` containing a
`.shell`, opening with a `.kicker` and an `.h2`. A box is a `.card`. A tag is a
`.chip`. Anything else will read as foreign the moment the cursor passes it.

**Take your blend tints as variables.** A `.section--blend` sets `--tint-top`,
`--tint-mid` and `--tint-bot` on itself, and a `[data-theme='light']` rule
beside it sets the light three. `Store.css` is the short example.

**Reveal with `useReveal`, tilt with `useTilt`, drift with `useParallax`.**
Never a scroll listener, never your own `requestAnimationFrame`. See
[`../hooks/`](../hooks/README.md).

**Style every state.** Hover, focus-visible, active, disabled, empty, loading,
error. `:focus-visible` is `2px solid var(--accent)` with an offset, everywhere.
Nothing ships wearing the browser's default look.

**Keep a card's height stable across its states.** `.store__action` carries a
`min-height` so a card does not change size when it flips from Buy to Waiting to
Owned — a row of cards that jumps as answers arrive reads as a page still
loading.

**Icons are inline SVG components, written where they are used.** `Tick`,
`Caret` and `Cross` in `Store.tsx`, `Chevron` in `Folded.tsx`, the set at the top
of `AuthModal.tsx`. Give them `aria-hidden="true"`. Do not add an icon package.

---

## The `.card` trap, and how `Store.tsx` gets around it

`base.css` forces **every direct child of a `.card`** to `position: relative`
with a `z-index`, so that a link inside a card can rise above `.card__cover`.
The rule is `.card > *:not(.card__spot):not(.card__edge):not(.card__cover)`,
which is specific enough to beat anything you will reasonably write.

So **an absolutely positioned overlay cannot be a direct child of a card.**
Anchor it to an inner wrapper instead. The Store's plan chooser lives inside
`.store__action`, which is already the card's floor, and expands upward from
there.

Cards are also `overflow: hidden` and `transform-style: preserve-3d`. The
overflow is what lets an overlay scrim bleed past the card's padding to its real
edges and be trimmed neatly. The 3D transform is why **`getBoundingClientRect()`
returns projected sizes** inside a card: two identical elements at different
heights measure a pixel or two apart. Use `offsetWidth` / `offsetHeight` when you
are checking layout.

## Store.tsx is the worked example

### Two views, and what each of them owns

`#/store` draws `StoreIndex`: one `AppCard` per entry in `STORE_APPS`, each a
whole-card link to `#/store/<app>` with the app's packs listed as a contents row
(name and cheapest way in, both derived), an ownership line that has a sentence
for **every** state including "checking", "couldn't check" and "signed out", and
one real inner link to the app's own page above `.card__cover`.

**A pack this account owns says so on its own row**, printing `OWNED` where the
price would be — a price is what somebody has still to pay, and both would ask a
reader scanning a column of amounts to work out which of them still apply. Only
once that app's shelf is `ready`: asked while the read is in flight or after it
failed, the set is empty, and marking a row "not owned" from that would be the
one mistake this page may not make. The two states share one reserved height
(`--pack-right` on `.store__app-packs`) so a row does not change size the moment
a purchase lands — measured 39px against 40px before that reservation existed.

**A pack this account may not BUY says that instead of a price**, and the row's
name is struck through. `Not Owned` and `Revoked` are the same absence and
opposite decisions — the first should be sold, the second must never be — so the
index draws them differently, and an app revoked whole replaces its availability
line (an offer) with the block and its reason. See
[`../store/README.md`](../store/README.md) for where the answer comes from.

`#/store/<app>` draws `StoreApp`: the app's head, then its `PackCard`s
unchanged. Those cards were lifted from the old single-scroll Store without a
line of them being re-decided, which is the pattern paying for itself.

Three blocks are drawn on **both** and are one component each — `AccountStrip`,
`BeforeYouPay`, `MoneyAnswers` — so the two views cannot answer differently
about who is buying, what the refund policy is, or how the money works. The buy
watch (`pending`, and the five-minute poll after a checkout opens) lives in
`Store` itself, the parent of both, so walking back to the index mid-payment
does not throw the wait away.

### The two choosers

Its two choosers
are a **fixed pattern**: rule 11 of [`AGENTS.md`](../../AGENTS.md) writes it
down, and any future app that sells a plan copies it rather than designing
beside it. In one component:

- A **state machine** with seven states, each with its own copy, and a fixed
  floor so the card never resizes between them.
- **One button per pack, in every state.** A pack sold three ways opens a
  chooser over the card rather than printing three buttons, and a pack already
  subscribed to opens its subscription panel from an explicit **Manage or
  Cancel Plan** button of exactly the same size in exactly the same place —
  **measured** against its neighbour's Buy button, not assumed to match. The
  packs sit in a grid row and unequal action rows are visible immediately. (The
  numbers from that measurement are recorded once, in §8 of
  [`AGENTS.md`](../../AGENTS.md), because a size written down in two places is a
  size that will eventually disagree with itself — and it did: this line used to
  carry its own pair beside §8's, both presented as measured.)
- Chips and cadence that **agree with the plan**. Printing `ONE-TIME · YOURS FOR
  GOOD` over a monthly subscription is the one mistake a shop may not make.
- A **derived** saving, so `Save $22.88` cannot disagree with the two prices it
  is computed from — sitting under the amount it is about, in the body face at
  reading size, with its box reserved in every row so three rows stay one
  height. The reservation carries the **real text**, hidden where it is not
  true: an empty span reserved the height and not the width, which made the
  yearly row's money column 30px wider than the other two and its note a line
  taller at 375px.
- **Both panels are one component**, `PlanPanel`. Rule 11's promise that a pack
  looks the same wherever it is sold is kept mechanically rather than by two
  blocks of JSX agreeing.
- The accessibility floor: `role="dialog"` with an `aria-label` naming the pack,
  `aria-expanded` and `aria-haspopup` on the button, focus into the first row on
  open *and again when the panel swaps its rows for a confirm*, Escape closing
  and returning focus, and a scrim that is a real button and is hidden from
  screen readers because Escape is its keyboard equivalent.

- A **`Before You Pay` block above the cards**, carrying the three facts most
  likely to stop somebody pressing Buy: the card lists everything, a one-time
  pack stays bought, and payments are not refundable. It is above the cards
  rather than folded under them because a refund policy you find afterwards is
  one you never agreed to. Its long form is the `refunds` section of
  `storeAnswers.ts`; change one and change the other. Both are drawn on **both**
  Store views, as `BeforeYouPay` and `MoneyAnswers`, because Buy lives on the
  app's own page and the policy has to be readable from there.
- A **permission-independent subscription entrance**. Every current recurring
  standing draws **Manage or Cancel Plan** for its account holder; making that
  person a Developer cannot add it and removing Developer cannot take it away.
  When the entitlement has no Stripe subscription id, the same panel opens with
  **Billing Link Missing** above its rows. `#/dev`'s **Held As** dropdown is what
  creates those hand-made states, but it never controls who can see the Store
  panel. One-time catalogue items remain perpetual even if old data gives one an
  impossible subscription-shaped grant.

**These two panels deliberately do NOT use `useModal`.** That hook locks the
page's scroll, traps Tab and takes the focus, all of which a full-screen dialog
owes the page and none of which these do: they are anchored inside a card that is
a third of the page, they say `role="dialog"` without `aria-modal`, and the page
goes on scrolling behind them, which is the property they were kept out of
`useModal` to keep.

**They are members of its stack all the same, through `useEscape`.** That used to
be the same decision — the panels carried a `document` keydown listener each, so
a panel open under the auth modal took the same Escape as the modal in front of
it and closed something the reader could not see. The two properties came apart
instead of being traded: `modal.ts` counts the scroll lock over the members that
asked for it and traps Tab only for members that name a dialog element, so a
panel can hold a place in the Escape ordering and nothing else. Its layer is
`MODAL_LAYER.storePlan`, which mirrors `.store__plans` in `Store.css` and is
small because a panel inside a card genuinely paints under everything the page
puts over one — change one, change both.
