# `src/components/scene/` · the shared vocabulary for the art layer

Two primitives and their stylesheets. Between them they are the only way art
from [`public/assets/parallax/`](../../../public/assets/parallax/README.md) and
the shaped boundaries between sections get onto this page.

**Nothing in this folder is used by anything yet, and that is deliberate.** It
was written first, on its own, so that the five sections that are about to grow
scenery all reach for the same three components rather than each inventing an
`<img>` wrapper with its own idea of what "decorative" means. A folder of unused
exports is normally a smell; this one is a vocabulary written before the
sentences, and the moment a section imports from it the smell goes away. If you
are reading this and the grep still says nothing imports it, that job has not
been done yet — do not delete it, and do not "tidy" it into the first section
that needs it.

| | |
| --- | --- |
| `ThemedArt.tsx` | `ThemedArt` · `ThemedHeroArt` · `StillArt` — one piece of the art kit, in the right artwork for the theme. |
| `Scene.css` | The one base class all three share. |
| `Seam.tsx` | `Seam` — a flat silhouette band on one edge of a section. |
| `Seam.css` | Where a seam sits and how tall it is. |

---

## `ThemedArt.tsx`

```tsx
/** A path under public/assets/parallax/, WITHOUT the theme suffix or the
 *  extension. e.g. 'landscapes/mountain-ridge' or 'props/pine-faceted-pair'. */
type ArtName = string

ThemedArt({ art: ArtName; className: string; factor: number })
ThemedHeroArt({ art: ArtName; className: string; factor: number })
StillArt({ art: ArtName; className: string })
```

All three render the same decorative `<img>`: `alt=""`, `aria-hidden="true"`,
`loading="lazy"`, `decoding="async"`, `draggable={false}`, and the `src`
resolved through `asset()` as `assets/parallax/<art>-<theme>.png`. `className`
is required rather than optional because a piece of this kit that is not
positioned and sized by its caller is an absolutely positioned image at 0,0 —
there is no useful default, so the type asks for one.

### Three components, not one with a mode prop

`useParallax` and `useHeroParallax` each own `element.style.translate`
outright. Both write the whole value every frame from their own lerp, and
neither reads what the other left there. Attach both to one element and the two
writes race inside a single frame: whichever ran second wins, which one that is
depends on effect order, and what you see is a layer stuttering between two
positions instead of doing either job.

A `mode` prop would not fix that, it would hide it. Hooks cannot be called
conditionally, so one component would have to call both hooks and then choose —
which is exactly the thing that breaks. Three components puts the choice where
components are already chosen, at the call site, and guarantees one hook per
element.

This is the part of the folder somebody will try to simplify. Merging them is
not a style preference with a cost of some duplication; it is a bug.

### Never a filter

The kit ships `-dark` and `-light` as **separate artwork**, and its own README
is explicit about why: the dark set carries a midnight-blue note, the light set
is paler mist and silver with a narrow graphite line, and the two exist because
the two themes have different contrast ranges to sit inside. A
`filter: invert()` or a `brightness()` on one file undoes the decision the
illustrator already made and produces art that is merely not-black rather than
art that belongs. So these swap the `src` and nothing here ever recolours a
pixel. `Scene.css` contains no `filter` for the same reason.

### The opacities are tokens, not per-section guesses

`--art-far`, `--art-mid`, `--art-near` in
[`../../styles/tokens.css`](../../styles/README.md), both themes, chosen inside
the ranges the kit's README gives (mountains 0.48–0.64 dark / 0.34–0.48 light,
props 0.50–0.72 dark / 0.38–0.56 light). Pick by how far back the layer reads:
`--art-far` for mountains and fog, `--art-near` for a prop close to the reader,
`--art-mid` for the band both families overlap in.

Write `opacity: var(--art-far)` in your own class. **Do not type a number.** The
restraint of this kit is one decision, and seven sections each guessing it is
how a page ends up loud in one band and invisible in the next.

### What a caller's class is for

Position, size, opacity, and where the art stops existing. `Scene.css` carries
only what is true of every piece: `position: absolute`, `pointer-events: none`,
`user-select: none`, `max-width: none` — that last one because `base.css` sets
`img { max-width: 100% }`, which is right for a screenshot in a column and
wrong for a mountain that is meant to run off both edges of the shell.
`will-change: translate` is on the two that move and not on the one that does
not, and comes off again under `prefers-reduced-motion`, where both hooks
resolve to a zero translate and the hint would be a promoted layer paid for and
never used.

---

## `Seam.tsx`

```tsx
Seam({
  shape: 'ridge' | 'dune' | 'peaks' | 'wave' | 'steps'
  /** Which edge of the section it sits on. */
  edge: 'top' | 'bottom'
  className?: string
})
```

An inline `<svg>` band: `viewBox="0 0 1440 120"`, `preserveAspectRatio="none"`,
`aria-hidden="true"`, one path per shape, filled with `currentColor`. Five
silhouettes in the art kit's flat low-poly voice — `ridge` a low mountain
profile, `peaks` the same idea taller and far more angular, `dune` two soft
swells overlapping through a shallow trough, `wave` one long lazy S, `steps` a
blocky terrace with no diagonal in it at all.

`preserveAspectRatio="none"` because a seam is a proportion of the viewport and
not a picture: it stretches to whatever width it is given and takes its height
from CSS. That is also why none of the paths carry a thin feature — a
1440-unit shape squeezed into 375px turns anything narrow into a spike.

All five are authored in the `edge="top"` orientation, mass along the top of
the band and the silhouette hanging down. `edge="bottom"` mirrors that same
path with `translate(0,120) scale(1,-1)`, so there is exactly one path per
shape and the two edges cannot drift into two slightly different mountains.

### The seam sets no colour, and this is the whole idea

A seam wears `currentColor`, so the section it lives in paints it — and what it
should be painted with is **that section's own band**, the flat colour of the
middle of the section. Sitting on the section's top edge in its own colour, it
reads as that section's mass rising up into the one above it: one band of
silhouette doing what a hard horizontal line cannot.

Painting it `--tint-top` instead would make it invisible, correctly — the
boundaries already meet on an identical value, which is the whole point of the
comment above `.section--blend` in `base.css`.

**That colour is already declared for you.** Every band of the page has a name
in `tokens.css` — `--band-hero`, `--band-origin`, `--band-apps`, `--band-tools`,
`--band-building`, `--band-faith`, `--band-outro`, `--band-foot` — and
`base.css` hands each section its own as `--seam-fill`. So the recipe is one
line in your own stylesheet:

```css
.origin__seam { color: var(--seam-fill); }
```

Both themes come for free, because the band does. No component stylesheet
writes a colour, which is rule 2, and the number stays in the one place it is
written down.

**The trap it saves you from:** `color: var(--tint-top)` on a seam gets you
nothing at all. `--tint-top`, `--tint-mid` and `--tint-bot` are registered with
`@property { inherits: false }` in `tokens.css` — that is what lets the theme
wave animate them instead of snapping — so a child of the section cannot read
them, and `var(--tint-top)` inside a seam resolves to the registered initial
value, `transparent`. The seam renders, correctly, as nothing. `--seam-fill` is
an ordinary custom property and inherits like any other.

**A seam that reaches across a boundary** — one on a section's *bottom* edge,
meant to read as the NEXT section climbing into this one — takes that
section's band directly: `color: var(--band-apps)`. The bands are on `:root`,
so any element can read any of them; `--seam-fill` is only the convenience for
the common case.

**Adding a new section?** Declare its band in `tokens.css`, both themes, and
its `--seam-fill` in `base.css` beside the others, in the same edit. Build its
`--tint-*` triple out of bands too, so its top is literally the same token as
the band above it.

### `--seam-fade`

A seam that should dissolve into the section rather than stop at a line masks
itself with a gradient, and `--seam-fade` in `tokens.css` is the alpha that
gradient is still at halfway down. It is a token so every seam on the page
dissolves at the same rate, and it is per theme because the dark tints are
near-black and a fade carries further there before it starts to read as a grey
smear across the boundary.

The mask is the caller's, because whether a seam is a hard silhouette or a
dissolve is a decision about that boundary. `Seam.css` deliberately does not
make it for you.

---

## The rules that came with the art

These are the kit's, from
[`public/assets/parallax/README.md`](../../../public/assets/parallax/README.md),
and they still apply on the other side of these components:

1. **At most one structural anchor per section** — a bridge, an arch, a
   wayfinder or a cross — plus optional low foliage or fog. Do not build a
   scene. A section that becomes an illustration has stopped being a section.
2. **Never over the copy.** Nothing goes over the `TDG` mark, the eyebrow, a
   CTA group, the nav, or the hero's bottom strip, and the art is what
   disappears first when vertical space runs out.
3. **At `max-width: 640px`, the peripheral props come off.** The lamppost and
   the bench in particular.
4. **`useParallax` / `useHeroParallax` only.** No new scroll listener, no
   direct `requestAnimationFrame`, no interval, no animation package, and no
   continuously animated filter — see [`../../hooks/`](../../hooks/README.md)
   and rule 9 of [`AGENTS.md`](../../../AGENTS.md).
5. **Reduced motion leaves the art composed and still**, visible where it
   landed. Both hooks already do this at `motionIntensity === 0`; do not add a
   rule that hides it instead.
