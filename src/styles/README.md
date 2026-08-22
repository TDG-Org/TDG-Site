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
| The flipping pair | `--invert-bg` / `--invert-fg` — a surface that swaps with the theme; the primary button is this |
| Fonts | `--font-serif` `--font-display` `--font-body` `--font-mono` |

`--live-*` is per theme deliberately: one hardcoded `#4ea36a` failed AA in both.

### Radii are tight, everywhere

2–3px. `.chip` is 2px, `.card` and every button are 3px. A rounded pill will
read as belonging to a different site.

### Four registered custom properties, and why

```css
@property --tint-top { syntax: '<color>'; ... }
```

`--tint-top`, `--tint-mid`, `--tint-bot` and `--story-glow-warm` are registered
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
light tokens and drops everything decorative. The reduced-motion block is not
optional — every component stylesheet carries its own, and anything you add with
a transform or an animation needs an entry.

### `overflow-wrap` on text elements

A single unbroken run of characters is the one thing a fluid layout cannot
reflow, and this site renders plenty a visitor chooses: a display name, a handle,
an email, a pasted URL. Breaking one is always better than a column that grows
past the edge of a narrow phone or a display at 300%.
