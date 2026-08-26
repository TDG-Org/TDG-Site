# `src/styles/` · the palette and the primitives

Two files, imported by `main.tsx` before anything else so they land ahead of
component CSS in the bundle. Component overrides are written as compound
selectors as well, so the order is belt-and-braces rather than the only thing
holding the cascade together.

| File | What it is |
| --- | --- |
| `tokens.css` | Every colour, every font, both themes, and the theme-transition variables. |
| `base.css` | The reset, the form controls, and the shared primitives every component builds on. |

---

## `tokens.css`

**Dark is the default scene**, declared on `:root`. Light is applied by
`[data-theme='light']` on the document element — see
[`../theme/`](../theme/README.md).

### The rule

**Never write a colour in a component stylesheet.** Every colour comes from a
token. Need a variant? `color-mix(in srgb, var(--token) N%, transparent)`, the
way `AppPage.css` does for its warm accents.

A literal hex in a component is a bug even when it looks right, because it will
be right in exactly one theme. If you add a token, you add it to **both** blocks
in the same edit.

### The set worth knowing

| | |
| --- | --- |
| Surfaces | `--bg` `--bg2` `--surface` `--surface-hover` |
| Text | `--text` `--muted` `--faint` |
| Edges | `--border` `--border-hover` `--edge-hi` `--edge-mid` |
| Accent | `--accent` `--accent-2` `--accent-soft` `--glow` `--warm` |
| Shadow | `--card-shadow` |
| "Playable" green | `--live-fg` `--live-bg` `--live-border` |
| Danger red | `--danger` `--danger-soft` `--danger-border` — destructive controls and bad standings; `src/dev/` is its only consumer today |
| The flipping pair | `--invert-bg` / `--invert-fg` — a surface that swaps with the theme; the primary button is this |
| The page's bands | `--band-hero` `--band-origin` `--band-apps` `--band-tools` `--band-building` `--band-faith` `--band-outro` `--band-foot` |
| The scene layer | `--art-far` `--art-mid` `--art-near` `--seam-step` `--seam-fade` `--terrain-haze` `--terrain-haze-rear` |
| Fonts | `--font-serif` `--font-display` `--font-body` `--font-mono` |

`--live-*` is per theme deliberately: one hardcoded `#4ea36a` failed AA in both.
`--danger` is per theme for the same reason. Its `-soft` and `-border` are
not — the red they are mixed from is the same in both — so they are declared
once on `:root` and are deliberately absent from the light block. `--seam-step`
is single for a better reason: it steps toward `--text`, which already carries
the theme, so one percentage is correct in both.

### The bands of the page

One name per horizontal band of the one-page scroll, top to bottom, and the
**only** place each of those colours is written down. `base.css` builds every
section's `--tint-top` / `--tint-mid` / `--tint-bot` out of them, so a section's
floor and the next section's ceiling are not two hexes that agree — they are
the same token. That is what turns the promise above `.section--blend` ("every
boundary meets on an identical value") into something the file enforces rather
than asserts.

`base.css` also hands each section a `--seam-fill`, for a `Seam` from
[`../components/scene/`](../components/scene/README.md) sitting on one of its
edges. It is **not** the band itself: because adjacent bands meet on an
identical value, a shape drawn at a boundary in either neighbour's colour is
drawn where the two are equal, and paints nothing at all — measured on `#apps`,
`rgb(8, 8, 12)` for both. So `--seam-fill` is the band stepped `--seam-step`
toward `--text`, which lifts the silhouette slightly above a dark sky and drops
it slightly below a pale one from a single declaration, the way the art kit's
two ridge files are drawn. See that folder's README.

Three of the eight are an alias rather than a value, because the number already
has an owner: `--band-hero` is `--hero-bg`, `--band-outro` is `--bg`,
`--band-foot` is `--bg2`. Those follow the theme through the token they point
at, so they are declared once on `:root` and are **deliberately absent** from
the light block. The five section bands have no other owner and are stated in
both, as rule 3 requires.

Adding a section: its band goes here in both themes, its `--seam-fill` goes in
`base.css` beside the others, in the same edit, and its tint triple reads bands
rather than hexes.

**One of the eight is taken off the artwork rather than chosen.**
`--band-origin` is the colour the hero ridge's foot actually composites to —
the sampled foot ink of `landscapes/mountain-ridge`, painted at `--art-far`
over the hero sky's floor — brought to the band's *own* lightness. That last
clause is the whole design: dark and light move on different axes because the
measurement says they must (the gap is `dL* 5.97` and hue-dominated in dark,
`dL* -64.56` and lightness-dominated in light), and a near-white section band
cannot give up lightness under seven chapters of prose. `tokens.css` shows the
working. Lightness is held to a tenth of a unit in both themes, which is why
`--seam-step`'s calibration did not have to be re-derived: that step is a fixed
6% blend toward `--text`, so it tracks lightness and nothing else.

### The scene layer tokens: three opacities, two dissolve rates, two inks

`--art-far` / `--art-mid` / `--art-near` are the opacities the transparent art
kit in `public/assets/parallax/` is drawn at, by how far back the layer reads,
and `--seam-fade` is the alpha a soft edge is still at halfway down, for
anything that dissolves into a section rather than stopping at a line. Those
four are plain **numbers** because they multiply artwork that is **already**
the right colour for the theme — the kit ships separate `-dark` and `-light`
files and its own README is explicit that a CSS filter must never stand in for
that swap.

`--terrain-haze` and `--terrain-haze-rear` are the two that are **colours**,
and they are here for the same reason the numbers are: they are properties of
the shipped files, read off them once. A cutout has a hard alpha edge wherever
its ink runs out, and both hero ridge files run out along a nearly horizontal
cut — the rear range's light artwork to within a single pixel across the whole
file. These are the ink each one stops on, sampled per column off the `.webp`
that is actually painted, so a gradient drawn under the art can start on
exactly that value and the step at the cut is zero rather than `dE00` 5 to 14.
Per theme, like everything else, because they come from two different files.
`Hero.css` is the only consumer today and carries the geometry.

They are tokens rather than per-section literals because the kit's restraint is
one decision, not seven. That README gives the ranges (mountains 0.48–0.64 dark
/ 0.34–0.48 light, props 0.50–0.72 dark / 0.38–0.56 light); these sit inside
them, light lower throughout, so no section has to re-guess and end up loud in
one band and invisible in the next. The primitives that consume them are in
[`../components/scene/`](../components/README.md).

### Radii are tight, everywhere

2–3px. `.chip` is 2px, `.card` and every button are 3px. A rounded pill will
read as belonging to a different site.

### Four registered custom properties, and why

```css
@property --tint-top { syntax: '<color>'; ... }
```

`--tint-top`, `--tint-mid`, `--tint-bot` and `--origin-glow-warm` are registered
so the section blend gradients can **animate** with the theme wave. An
unregistered custom property inside a gradient snaps instead of transitioning,
which would make the wave stop dead at every section boundary.

### `--t-theme` is declared on `*`, not on `:root`

```css
*, *::before, *::after { --t-theme: background-color 0.6s ease var(--wave-delay, 0ms), ... }
```

Each element has to substitute `--wave-delay` in its **own** context, because
the theme wave sets that delay per element from its distance to the toggle.
Declared on `:root`, the value would inherit already-substituted and the whole
change would snap at once.

**This matters when you verify a change.** Theme colours transition over ~600 ms.
Read computed styles after it settles, and be aware that in a tab that is not
compositing frames the transition freezes at its *start* value — every reading
will be the previous theme's. `document.getAnimations().forEach(a => a.finish())`
forces them to land.

---

## `base.css`

### The primitives

| | |
| --- | --- |
| `.page` `.shell` | The outer frame and the max-width column. |
| `.section` `.section--blend` `.section--flat` | A page band. `--blend` takes its three tint tokens from the section itself. |
| `.kicker` + `.kicker__num` `.kicker__rule` `.kicker__label` | The numbered eyebrow every section opens with. |
| `.h2` `.h2--serif` `.lede` | The heading and the paragraph under it. |
| `.chip` `.chips` `.chip--hot` | 9px mono tags. **A chip is a TAG, never a sentence** — a sentence wearing one reads as a code block bolted to the side. |
| `.card` + `.card__spot` `.card__edge` `.card__cover` | The box everything sits in: cursor-following spotlight, a 1px ring brightest nearest the pointer, and an optional full-card link. |
| `.badge` `.sr-only` | |
| `.texture` `.blob` | Decorative layers. |

### Three things about `.card` that will bite you

1. **Every direct child is forced to `position: relative`** by
   `.card > *:not(.card__spot):not(.card__edge):not(.card__cover)`. That rule is
   specific enough to beat what you will write, so an absolutely positioned
   overlay has to be a **grandchild**. The variable is `--card-layer`, so a part
   of a card can opt out of being its own stacking context — which is how
   Makullveny's download button stopped being clickable, and how it was fixed.
2. **`overflow: hidden`**, so an overlay scrim can bleed past the card padding
   to the real edges and be trimmed on the radius.
3. **`transform-style: preserve-3d`** plus the tilt hook, so
   `getBoundingClientRect()` returns *projected* sizes inside a card. Measure
   layout with `offsetWidth` / `offsetHeight`.

### `--nav-h`

The nav is fixed, so anything scrolled to its own top edge lands underneath it.
`--nav-h: 70px` is declared on `html` so the number is stated once — measured, the
bar is 70px at every width it is drawn at. Targets that begin at their own top
edge carry `scroll-margin-top` off it.

### Form controls, and the autofill wash

The browser paints an autofilled field in its **own** highlight, a pale near-white
wash, and no amount of `background-color` moves it. On a dark glass pill that
reads as the box having been bleached.

Two answers, both needed: `color-scheme` tells the browser which highlight to
reach for, and an inset shadow covers what is left, because a shadow paints over
a highlight where a background cannot. Each surface names its own
`--field-fill` / `--field-fg` pair, so a field on the light Store and a field on
the always-dark auth modal each come back as themselves.

`src/lib/chromeGuard.ts` is the rest of that defence.

### `@media print` and `@media (prefers-reduced-motion: reduce)`

Printing a dark page produces white-on-white, so the print block re-uses the
light tokens and drops everything decorative.

The reduced-motion block in `base.css` pauses **every** animation on the page —
`*, *::before, *::after { animation-play-state: paused !important }` — so a
component stylesheet needs no block of its own merely to stop a keyframe
animation, and most do not have one. What a component's own block is for is
what the global pause cannot reach: a transition, a transform on hover or
focus, and any animation whose 0% frame is not a resting state — the hero's
scroll arrow and shafts and the Faith rays are pinned back up in `base.css` for
exactly that reason. If what you added is a decorative keyframe animation
inside a section, it is already covered. If it moves on hover, on focus or on a
state change, write the block.

### `overflow-wrap` on text elements

A single unbroken run of characters is the one thing a fluid layout cannot
reflow, and this site renders plenty a visitor chooses: a display name, a handle,
an email, a pasted URL. Breaking one is always better than a column that grows
past the edge of a narrow phone or a display at 300%.
