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
| `Hero.tsx` | The opening scene. Owns `useHeroTakeover`, which slides Origin up over it. Its canvases and its typed tagline are in `hero/`. |
| `Origin.tsx` | Seven chapters on a timeline that fills as you read. Backed by `origin/OriginField.tsx`. |
| `Apps.tsx` · `Tools.tsx` | The card grids. Every card carries its app's icon and opens that app's page. |
| `Building.tsx` | What is on our screens right now. |
| `Faith.tsx` | A slow gradient field and one verse. |
| `Outro.tsx` | The makers note and the GitHub card that close the page. |

### The routed pages

| | |
| --- | --- |
| `AppPage.tsx` | One app's own page. **Knows nothing about any particular app** — everything comes from `data/appPages.ts`. |
| `About.tsx` | About TDG. Deliberately the same page as an app page, and carries **no stylesheet of its own**: a second one would be the two starting to drift, and this page's whole job is to look like it belongs beside the ten it links to. |
| `Store.tsx` | The shop. Read it with `data/store.ts` and `store/useOwnedPacks.ts` — see below. |

### Always on screen

| | |
| --- | --- |
| `Nav.tsx` | The bar, the theme toggle, the account menu (identity, Send Feedback, the Developer Tab switch, sign out), and the Developer tab that appends itself for a signed-in developer with Developer Mode on. That tab is **not** in `NAV_LINKS`, because that array is the public navigation and is read by everything. |
| `Footer.tsx` | |
| `Cursor.tsx` | A dot that tracks the pointer and a ring that trails it, reacting to what it is over. Fine pointers only; on a coarse pointer it renders nothing. |
| `AuthModal.tsx` | Sign in and sign up. **Deliberately theme-independent** — the site's one always-dark glass scene, the same way the hero owns its own tokens. There was no light variant in the design, so rather than invent one it stays the one true look whatever the page theme is. |

### Shared pieces

| | |
| --- | --- |
| `Folded.tsx` | The folding, and the blocks inside it. Shared by the app pages and About so the two cannot drift into different ideas of what a section looks like. Runs on the same state as the Developer console, via `lib/sections.tsx`. Its stylesheet is `AppPage.css`. |
| `AppIcon.tsx` | One app's icon, drawn the same way in all four places it appears. One component rather than four copies, because the alignment is the whole difficulty and four copies is four chances to get it wrong differently. |
| `ImageSlot.tsx` | A picture slot: key art, else a real screenshot. `art` wins over `shot` and over a local drop, because the two are for different places — the card wants the cover, the app's own page wants the software. Its drop-to-fill authoring layer is gated on `import.meta.env.DEV` and **must never reach a visitor**. |
| `KeyArt.tsx` | An app card's cover, **drawn rather than photographed** — one inline SVG at the exact `1120×700` of Bible Educator's raster, so the five drawings and the one photo sit in the grid identically. Everything it says comes from `KeyArtSpec` in `data/content.ts`; a sixth app is a data entry, not a file. Its palette is **fixed in both themes** and the literal hexes in `KeyArt.css` are that decision, not a rule-2 miss — §4 of [`AGENTS.md`](../../AGENTS.md) and its own header say why. |
| `CrossGlyph.tsx` | The TDG cross. One path, one continuous gradient across both bars, so the light reads as a single fall across the whole glyph. |

### `hero/` and `origin/`

Hand-rolled 2D-canvas 3D — rotate, project, splat. `PointCloud.tsx` morphs
between the twelve forms in `shapes.ts`; `Starfield.tsx` is the dust;
`OriginField.tsx` is the same technique scaled down to ambient.

**No three.js and no WebGL in any of them**, despite `three` being a dependency.
This is the site's own proven approach. Point counts scale to what the device can
comfortably paint, and the dust runs at 24 Hz on a capped DPR because nobody can
tell and it is 2.5× less canvas work for an identical result.

`hero/Tagline.tsx` is the one file in there that draws no canvas: it types the
lines of `HERO_TAGLINES` out under the wordmark and swaps them from a shuffle
bag, so no line repeats until every line has had its turn. It is also the
worked example of a state machine living **inside** `onFrame` rather than on a
timer — it accumulates `dt`, holds the loop only while a character is actually
pending, and lets it park through the five-second rest. Under reduced motion
the first line renders whole, immediately, with no caret.

### `scene/`

`ThemedArt` / `ThemedHeroArt` / `StillArt` and `Seam`: the shared vocabulary for
the parallax art kit in `public/assets/parallax/` and for the shaped boundaries
between sections. It was written **before** the sections that use it, so that
seven of them would reach for the same primitives instead of each wrapping an
`<img>` its own way; `Hero`, `Origin`, `Apps`, `Tools`, `Building`, `Faith` and
`Outro` draw from it today — every section on the home page. Read
[`scene/README.md`](scene/README.md) before you decorate anything: it has the
reason there are three art components rather than one with a mode prop, and the
reason a seam cannot read `--tint-top`.

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
Owned — a shelf that jumps as answers arrive reads as a page still loading.

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

It is the file to read before you build anything new here, and its two choosers
are a **fixed pattern**: rule 11 of [`AGENTS.md`](../../AGENTS.md) writes it
down, and any future app that sells a plan copies it rather than designing
beside it. In one component:

- A **state machine** with six states, each with its own copy, and a fixed floor
  so the card never resizes between them.
- **One button per pack, in every state.** A pack sold three ways opens a
  chooser over the card rather than printing three buttons, and a pack already
  subscribed to opens a *manage* panel from a button of exactly the same size in
  exactly the same place — **measured** against its neighbour's Buy button, not
  assumed to match. The packs sit in a grid row and unequal action rows are
  visible immediately. (The numbers from that measurement are recorded once, in
  §8 of [`AGENTS.md`](../../AGENTS.md), because a size written down in two
  places is a size that will eventually disagree with itself — and it did:
  this line used to say 530×47 beside §8's 507×45, both presented as measured.)
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
