# `src/components/scene/` · the shared vocabulary for the art layer

Two primitives and their stylesheets. Between them they are the only way art
from [`public/assets/parallax/`](../../../public/assets/parallax/README.md) and
the shaped boundaries between sections get onto this page.

**This folder was written before anything used it, and that is deliberate.** It
came first, on its own, so that the sections about to grow scenery would all
reach for the same three components rather than each inventing an `<img>`
wrapper with its own idea of what "decorative" means. They now do — `Hero`,
`Origin`, `Apps`, `Tools`, `Building`, `Faith` and `Outro` all import from here,
and none of them builds its own. Keep it that way: a section that needs a piece
of the art kit imports one of these three, and does not write an `<img>` or a
path of its own. That is what makes a change like the `.webp` swap below one
string instead of a hunt.

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
resolved through `asset()` as `assets/parallax/<art>-<theme>.webp`. `className`
is required rather than optional because a piece of this kit that is not
positioned and sized by its caller is an absolutely positioned image at 0,0 —
there is no useful default, so the type asks for one.

### `.webp`, and do not "fix" it back to `.png`

The kit ships both. The `.png` is the source art the illustrator's tool emits
and it stays in the repo; the `.webp` beside it is the same artwork with its
alpha channel intact (`yuva420p`), downscaled to the size it is actually
painted at. The kit is 28.0 MB as PNG and 2.0 MB as WebP — the heaviest single
prop is 2.10 MB, and the widest piece is 2172px, for layers that land at a few
hundred CSS pixels. The home page draws twelve of them across seven sections,
plus four more as app-card covers, so the swap is roughly 3–4 MB off first load.

Nothing catches a regression here. A typecheck cannot see a string, the build
copies whatever `public/` contains, and the page looks identical either way; the
only symptom is a visitor waiting. So the extension is typed in exactly two
places — `ThemedArt.tsx` for everything on the page, `KeyArt.tsx` for the app
covers — and the reason is written beside both. Nowhere else in `src/` should
name a file in that folder at all.

`public/assets/parallax/README.md` has the `ffmpeg` command that produced these,
which is what to run when new art arrives. Art added without its `.webp` 404s —
there is no fallback here, and a missing decorative image fails silently.

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

### A seam is a shape that contrasts, not a colour that matches

This is the part to read before you place one, because the obvious thing does
not work and it fails silently.

A seam wears `currentColor`, and the section paints it from `--seam-fill`:

```css
.origin__seam { color: var(--seam-fill); }
```

`base.css` declares `--seam-fill` for every section already, so that one line
is the whole job and both themes come free.

**Why it is not simply the section's band.** It was, briefly, and it painted
nothing. `base.css`'s invariant is that adjacent bands meet on an identical
value — that is the point of the comment above `.section--blend`, and it is
why the page has no visible lines at its boundaries. But it also means a shape
drawn *at* a boundary, in *either* neighbour's colour, is drawn exactly where
the two colours are equal. Measured on `#apps`: `getComputedStyle` gave
`rgb(8, 8, 12)` for the seam and `rgb(8, 8, 12)` for the section behind it.
A flat section is the worst case, having only one value at all, but no blend
boundary is meaningfully better — a 44–90px seam sits inside the first ~3% of
a tall section, where the gradient has barely left `--tint-top`.

So `--seam-fill` is the section's band stepped `--seam-step` toward `--text`:

```css
--seam-fill: color-mix(in srgb, var(--band-origin) var(--seam-step), var(--text));
```

**Toward `--text` on purpose.** It makes one declaration correct in both themes
for one reason instead of two: the ink is near-white in dark, so the silhouette
lifts slightly above the sky; near-black in light, so it drops slightly below a
pale one. That is exactly how the kit's `-dark` and `-light` ridges are drawn
against their skies, so the seam and the art sitting beside it finally agree
with each other instead of being two unrelated decisions.

`--seam-step` is 94%, and `tokens.css` shows the working. Over the six seams the
page actually draws it puts a seam's fill at ΔL\* 5.0–6.1 in dark and 4.6–4.8 in
light — nowhere near the 9.6–10.6 dark and 7.7–8.0 light a 90% step gives, which
would be a grey stripe at every boundary that carries one. The plane it was
calibrated against is `.card`'s own face, the quietest thing on this site that is
still deliberately visible, because a masked seam paints most of its band at part
opacity and ought to read at least as clearly as a card does. **Take the card's
own figures from `tokens.css`, not from here** — clearing a card is a floor in
DARK only. In light `--surface` is opaque, so a card face is only as far from its
band as that band is from white, and the light seams on `#origin`, `#tools` and
`#faith` sit UNDER it. That is a property of an opaque light surface, not of the
step, and 94% stands either way.

**Six boundaries carry one today** — `#origin`, `#apps`, `#tools`, `#building`,
`#faith` and the Outro, every one of them `edge="top"`. The hero and the footer
draw no seam, and that is a placement decision, not a gap in the palette:
`base.css` declares a `--seam-fill` for both of them alongside the other six, so
adding one there is a `<Seam>` and a `color:` line and nothing else.

**One catch if you take the hero up on that.** `#top` is not the hero's id alone:
`About.tsx`, `AppPage.tsx`, `Store.tsx` and `DevConsole.tsx` all put `id="top"` on
their outer section, so on those four pages `--seam-fill` resolves to the HERO's
band — measured on `#/store` as `color-mix(in srgb, #030304 94%, #f2f2f5)`, a sky
belonging to a page the reader is not on. Harmless while none of them draws a
seam, and wrong the moment one does. `base.css` records it at the declaration; a
seam on any of those four pages should mix its own band by name rather than
trust `--seam-fill`.

**The other trap:** `color: var(--tint-top)` on a seam gets you nothing at all,
for a second and unrelated reason. `--tint-top`, `--tint-mid` and `--tint-bot`
are registered with `@property { inherits: false }` in `tokens.css` — that is
what lets the theme wave animate them instead of snapping — so a child of the
section cannot read them, and `var(--tint-top)` inside a seam resolves to the
registered initial value, `transparent`. `--seam-fill` and the bands are
ordinary custom properties and inherit like anything else.

**A seam that reaches across a boundary** — one on a section's *bottom* edge,
meant to read as the NEXT section climbing into this one — mixes that
section's band the same way:
`color: color-mix(in srgb, var(--band-apps) var(--seam-step), var(--text))`.
The bands are on `:root`, so any element can read any of them; `--seam-fill` is
the convenience for the common case.

**Adding a new section?** Declare its band in `tokens.css`, both themes, and
its `--seam-fill` in `base.css` beside the others, in the same edit, mixed the
same way. Build its `--tint-*` triple out of bands too, so its top is literally
the same token as the band above it.

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
