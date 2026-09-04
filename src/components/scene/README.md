# `src/components/scene/` · the shared vocabulary for the art layer

Five primitives and their stylesheets. Between them they are the only way art
from [`public/assets/parallax/`](../../../public/assets/parallax/README.md), the
shaped boundaries between sections, and anything drawn rather than photographed
get onto this page.

**This folder was written before anything used it, and that is deliberate.** It
came first, on its own, so that the sections about to grow scenery would all
reach for the same three components rather than each inventing an `<img>`
wrapper with its own idea of what "decorative" means. They now do — `Hero`,
`Origin`, `Apps`, `Tools`, `Games`, `Faith` and `Outro` all import from here,
and none of them builds its own. Keep it that way: a section that needs a piece
of the art kit imports one of `ThemedArt.tsx`'s three exports, and does not
write an `<img>` or a path of its own. That is what makes a change like the
`.webp` swap below one string instead of a hunt.

| | |
| --- | --- |
| `ThemedArt.tsx` | `ThemedArt` · `ThemedHeroArt` · `StillArt` — one piece of the art kit, in the right artwork for the theme. Since the Scene Editor they RESOLVE rather than render: each reads its slot's draft override once and returns one of four builders (`buildArt`, also exported). With no draft loaded — which is everybody — each returns exactly what it returned before. See [`src/scene/README.md`](../../scene/README.md). |
| `Scene.css` | The one base class all three share. |
| `Seam.tsx` | `Seam` — a flat silhouette band on one edge of a section. |
| `Seam.css` | Where a seam sits and how tall it is. |
| `Stage.tsx` | `Stage` — a backdrop that holds still while its section's content scrolls over it. |
| `Stage.css` | The two boxes a stage is, and the one line the section needs. |
| `Moon.tsx` | `Moon` — the disc, its bloom and three quiet patches of surface, as inline SVG. |
| `Snow.tsx` | `Snow` — falling snow on a 2D canvas, at about the cost of a gradient. |

## Who calls what

This is what `grep -rn "<Stage\|<Moon\|<Snow\|<Seam\|<ThemedArt\|<StillArt"
src/ --include=*.tsx` returns today. Re-run it rather than trusting the table —
the paragraph this replaced said `Stage`, `Moon` and `Snow` had no callers at
all, and two of the three had grown one by the time anybody read it; the
version after that named `Apps` in four rows and `Apps` draws none of them now.

**Every row here was counted while three other builders were editing the same
tree**, and the section that moved most was `#apps`, whose scenery went into
the new `Walk.tsx`. Treat the table as a snapshot with a grep beside it.

| Primitive | Drawn by |
| --- | --- |
| `ThemedArt` | `Games` ×5 (two stands of faceted pines, two fog veils, the wayfinding post) · `Origin` ×3 (far treeline, mist bank, pine row) · `Outro` ×3 (stone stair, garden arch, stepping stones) · `Tools` ×2 (footbridge, boulders) — **thirteen** |
| `ThemedHeroArt` | **Nobody.** Kept on purpose — see below. |
| `StillArt` | `Hero` ×8 (two moon clouds, the rear, mid and main ridges, valley fog, tall pine, near branch) · `Origin` ×2 (snow bank, lamppost) · `Outro` (lantern post) · `Tools` ×2 (bushes and reeds, fence rail) · `Walk` (window frost) — **fourteen** |
| `Seam` | `Games` · `Faith` ×2 — **three**, across two boundaries. One is `edge="bottom"` (Faith's rising range). The Outro no longer draws one; its stair and stepping stones are `ThemedArt` now. |
| `Stage` | `Hero` (the whole pinned valley) · `Walk` ×2 (`walk__stage`, the cabin that used to be `Origin`'s, and `walk__front`) |
| `Moon` | `Hero` (on the horizon) · `faith/Summit.tsx` (behind the cross) |
| `Snow` | `Walk` (the near flake layer, in front of the cabin) |

**The moon is the thread the page is strung on.** It rests on the hero's
horizon and it arrives five sections later behind the cross on the Faith
summit. That is the reason it is one component and not two drawings, and it is
the reason a stage clips at its section's edge rather than bleeding: the moon
is *handed over*, not carried across.

### Faith deliberately does not use `Stage`

Worth recording, because a reader who finds `Moon` inside `Hero`'s stage and
then finds the same `Moon` in Faith with no stage around it will assume
somebody forgot.

Faith's scenery is `faith/Summit.tsx`: a `position: absolute; inset: 0` sibling
of the `.shell`, not a pinned backdrop. The summit is **ground the reader has
arrived at**, not a backdrop they are scrolling past — its near ridge is what
they are standing on and travels with the section exactly, while the three
layers behind it lag the page by 13, 26 and 30px to read as distance. A stage
would pin all four to the viewport, which is the opposite motion, and the one
layer that must not move relative to the ground is the cross standing on the
crest.

Everything that follows from that is Faith's own problem, and it solved each
the way this folder would have: no `stage-host` (its section keeps `overflow:
hidden`), so `Summit` does its own rect check against its section at a 120px
margin — the same number `Stage` guards on and for the same reason, since an
`onFrame` subscriber cannot see an attribute. It also declares its own
section-level contract, `.faith-summit-host`, the way `Stage.css` ships
`.stage-host`, and its header says so.

### One export here has no caller, and it is kept

`ThemedHeroArt`, and only it. The rule it is kept under:

> **An export with no caller is kept only when its absence would push the next
> builder toward something worse — and only if this file says out loud that it
> has no caller and why. Otherwise it goes.**

**It costs no bytes, and that was checked rather than assumed.**
`ThemedHeroArt` is an unused export of a module that *is* imported, so Rollup
shakes the function out: a production build's sourcemaps map `ThemedArt.tsx`
lines 28–67, 91–102 and 139–141 into the bundle — `Art`, `ThemedArt` and
`StillArt` — and nothing in between, which is exactly `ThemedHeroArt`'s body.

What a dead export actually costs is a reader's confidence, and this section is
the price of keeping it.

**`Snow` used to be the second, and it has a caller now.** `Walk.tsx` mounts it
as `<Snow className="walk__flakes-canvas" density={NEAR_SNOW} />`, a near flake
layer in front of `origin/CabinScene.tsx`'s own in-scene snow — two depths at
one boundary rather than one. So the paragraph that used to sit here, ending
"if a later pass finds this still true and still has no caller, delete the
file", is answered: the file stays because something draws it. (It was
`Origin.tsx` that drew it until the pinned stage moved into `Walk.tsx`; the
component and its arguments did not change, only which file mounts it.)

**The bytes line went with it.** "Neither costs a byte" was true only while
nothing imported `Snow.tsx`; it is in the module graph now and a build's
sourcemaps name it. That is the kind of claim that goes stale in silence —
re-read it off a build rather than off this sentence.

**`ThemedHeroArt` stays because deleting it re-opens a bug.** The three art
components are not three conveniences; being three is the *mechanism* that
keeps `useParallax` and `useHeroParallax` off the same element — see **Three
components, not one with a mode prop** below, which is the longest section in
this file for a reason. Remove the hero variant and the next builder who wants
art tied to the hero has two moves left: reach for `ThemedArt`, which gives the
layer the wrong ride and merely looks slightly off; or add the `mode` prop,
which is the bug. The capability is still live either way — `Faith.tsx` calls
`useHeroParallax` directly on a `<div>` for its rays — so what would go is only
the safe way to spend it on a piece of the art kit.

**`Snow` is not in this section any more.** It sat here on the weaker version
of the same argument, while `origin/CabinScene.tsx`'s in-scene snow looked as
though it had made the DOM canvas unnecessary. It had not: the walk draws
both, the canvas in FRONT of the scene, because a near layer sized to the
section's own box is a different thing from flakes inside a 3D frustum. The
mistakes the file already answers — the 30Hz cap, `MAX_DPR`, the draw inside
the tick rather than in the write closure, the still field under reduced
motion, and the three ways a canvas silently blanks itself (a resize, a DPR
change, a theme swap) — are paying for themselves on the page now instead of
in a module nobody imported.

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

`StillArt` is not `ThemedArt` with `factor={0}` and the difference is not
cosmetic: `ThemedArt` at zero still subscribes to the frame loop and still
writes `element.style.translate` on every frame it is near the viewport, which
also means it still owns that property and a pointer layer still cannot share
the element. `StillArt` calls neither hook and writes nothing. Five layers on
the page take it — the hero's two ridges and its pine, Origin's snow bank and
its lamppost — and every one of them is a thing standing on ground rather than
scenery sliding past.

### `.webp`, and do not "fix" it back to `.png`

The kit ships both. The `.png` is the source art the illustrator's tool emits
and it stays in the repo; the `.webp` beside it is the same artwork with its
alpha channel intact (`yuva420p`), downscaled to the size it is actually
painted at. A single cutout is up to 2.10 MB as a PNG, at 2172px wide, for a
layer that lands at a few hundred CSS pixels; the WebP derivative is a ~93%
cut across the whole kit. The home page draws **sixteen** of these across five
sections — Faith draws none, it authors its own terrain — plus four more as
app-card covers. Counted with `grep -rn '<ThemedArt\|<StillArt' src/
--include=*.tsx`: eleven `ThemedArt` (Games 5, Origin 2, Outro 2, Tools 2)
and five `StillArt` (Hero 3, Origin 2).

It said thirteen across six sections until this pass, and the count moves for
two different reasons that are worth telling apart. One is a piece being drawn
a second time: `atmosphere/fog-veil` was, at `#games`'s boundary as well as
on its floor, and `props/pine-faceted-pair` now is too, at two sizes and two
opacities with the fog band between them — same file, same URL, same request,
so the byte figures do not move and the layer count does. The other is
sections trading scenery: `#apps` drew three of these at the start of this pass
and none at the end, its art having moved into `Walk.tsx`. Only the first kind
is free.

**The kit's own byte figures are in
[`public/assets/parallax/README.md`](../../../public/assets/parallax/README.md)
and deliberately not repeated here.** They move every time a piece is added,
and this file carried a stale pair for exactly that reason — 28 files and
28.0 MB, against a kit that had grown to 36 and 35.4 while nobody re-measured.
The argument does not depend on the number and the number belongs beside the
files.

Nothing catches a regression here. A typecheck cannot see a string, the build
copies whatever `public/` contains, and the page looks identical either way; the
only symptom is a visitor waiting. So the extension is typed in exactly two
places — `ThemedArt.tsx` for everything on the page, `KeyArt.tsx` for the app
covers — and the reason is written beside both. Nowhere else in `src/` should
name a file in that folder at all.

`public/assets/parallax/README.md` has the `ffmpeg` command that produced these,
which is what to run when new art arrives. Art added without its `.webp` 404s —
there is no fallback here, and a missing decorative image fails silently.

### `light=`: a slot may name a different piece for the light theme

Since 2.44.0 the light theme is Cebu — a different picture, not the winter one
in a paler ink — so `ThemedArt`, `ThemedHeroArt` and `StillArt` take an
optional `light` name beside `art`. The dark name stays the slot's identity
and the winter call sites are untouched; in light the `<img>` draws
`<light>-light.webp` instead of `<art>-light.webp`. The element also carries
`data-twin`, the OTHER theme's URL, which `theme/artPrefetch.ts` reads
instead of swapping the suffix on one name — the two themes are two names now.
The mapping itself is the table in
[`public/assets/parallax/README.md`](../../../public/assets/parallax/README.md).

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

### Never a filter that recolours

The kit ships `-dark` and `-light` as **separate artwork**, and its own README
is explicit about why: the dark set carries a midnight-blue note, the light set
is paler mist and silver with a narrow graphite line, and the two exist because
the two themes have different contrast ranges to sit inside. A
`filter: invert()` or a `brightness()` on one file undoes the decision the
illustrator already made and produces art that is merely not-black rather than
art that belongs. So these swap the `src` and **nothing here ever recolours a
pixel.**

`Scene.css` used to have no `filter` at all, and this line used to say so. It
has exactly one now — `filter: opacity()` on `.scene__art--crossing`, present
only while the theme wave is running — and the distinction is the rule, not an
exception to it. `opacity()` changes how much of a picture is drawn; it does
not change what colour any of it is. A `brightness()`, a `hue-rotate()` or an
`invert()` here would still be the bug this section is about.

### The theme cross-fade, and why it lives in `ThemeProvider`

An `<img>` swapping its `src` has no interpolable value: CSS can cross-fade a
colour and cannot cross-fade a file, so before this the whole page's scenery
hard-cut at the flip while everything around it waved. Measured in headless
Chrome at 1440x900, that cut was one composited frame in which 149 of 255 mean
RGB changed at once.

So `theme/ThemeProvider.tsx` clones each on-screen art element at the start of
the wave, leaves the clone showing the outgoing picture, and cross-fades the two
with `--cross` over `--t-art` — the same 0.6s and the same `--wave-delay` the
colours ride. At `WAVE_RESTORE` every clone is removed and the class comes off.
**At rest there is exactly one `<img>` per slot and no filter on it**, which is
the property to preserve if you touch any of this.

Three things about it belong here rather than there:

- **It clones instead of re-rendering.** `useParallax` captures `ref.current`
  in an effect keyed on `factor` alone, so replacing or re-keying an element
  under it leaves the hook writing `translate` to a detached node and that
  slot's drift is dead for the session. Cloning leaves every original element
  and every subscriber exactly where it was.
- **The clone is frozen**, in position, in size and in `opacity`. It keeps the
  inline `translate` the hook last wrote; its own computed `opacity` is pinned,
  because `--art-far` and friends change with the theme and a ghost that took
  the new theme's alpha would dim by a third on the first frame of the fade;
  and its six resolved geometry lengths — `top`, `right`, `bottom`, `left`,
  `width`, `height` — are pinned for a reason the winter kit never had.

  **Cebu is a different GEOMETRY, not only different art.** `.hero__rear`,
  `.hero__mid` and `.hero__ridge` are placed from `--terrain-w`, `--art-rise`
  and `--art-head`, and all three differ per theme, because a sea horizon and a
  mountain skyline do not stand at the same height. A ghost laid out by the new
  theme's rules therefore SNAPPED to the incoming composition on frame one and
  then cross-faded there — reported as "a weird visual where the mountains jump
  up". Pinned, the outgoing picture fades out where it was while the incoming
  one fades in where it belongs, which is a cross-dissolve between two
  compositions rather than one composition being yanked. `bottom` alone is not
  enough: `left` and `width` are built from `--terrain-w` too, so a ghost pinned
  only vertically slides sideways and changes size instead.
- **It never runs under reduced motion.** `toggle` returns before staging
  anything at `motionIntensity() === 0`, so the theme change is one instant,
  complete swap with no second element anywhere.

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
`aria-hidden="true"`, one path per shape, filled with `currentColor`. **Six**
silhouettes in the art kit's flat low-poly voice — `ridge` a low mountain
profile, `peaks` the same idea taller and far more angular, `dune` two soft
swells overlapping through a shallow trough, `wave` one long lazy S, `steps` a
stone stair in perspective descending to the left, and `firs` a conifer
treeline of eleven trees at four depths on one baseline.

`firs` is the newest and `steps` is the most rewritten. It was "a blocky
terrace with no diagonal in it at all" and at the height and colour a seam is
drawn at, that read as a row of flat grey rectangles — UI that had failed to
load rather than ground. Its own comment in `Seam.tsx` has the diagnosis; the
short version is that a shape whose every edge is level is the one shape a
level alpha ramp cannot dissolve. It descends monotonically now and spends
7.5% to 83.3% of the band, which is what lets one mask draw its far end pale
and its near end solid.

`preserveAspectRatio="none"` because a seam is a proportion of the viewport and
not a picture: it stretches to whatever width it is given and takes its height
from CSS. That is also why none of the paths carry a thin feature — a
1440-unit shape squeezed into 375px turns anything narrow into a spike.

All six are authored in the `edge="top"` orientation, mass along the top of
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
page drew when this was measured — `#origin` has since traded its seam for a
snow drift, see below — it puts a seam's fill at ΔL\* 5.0–6.1 in dark and 4.6–4.8 in
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

**Three boundaries carry one today** — `#games`, `#faith` and the Outro —
and that is three *joins* and **five** `<Seam>`s, because two of them carry two
bands. `grep -rn '<Seam' src/ --include=*.tsx` is the population: `#faith`
hangs a bank from above while a range climbs to meet it, and the Outro draws
its stair twice, the second copy a few pixels lower in a stronger ink so every
tread gets a lit nosing.

It was five joins and seven seams a pass ago, when `#apps` and `#tools` each
carried one. Both of those sections traded their scenery into `Walk.tsx` while
this was being written, which is the whole reason the paragraph above tells you
to re-run the grep.

**Four are `edge="top"`; one is not.** `#faith`'s rising range is
`edge="bottom"` — the only one on the page — because what it wants is the
mirrored path, mass at the bottom and silhouette rising, at a boundary that is
still a section's TOP. `Faith.css` flips the anchor back to the wrapper's own
origin for exactly that and says why. Do not read `edge` here as "which end of
the section"; read it as "which way the shape points".

**Where a boundary carries two bands, the second one takes `--seam-step-2`.**
94% is the primary band and 92% is the second, always the masked one — both
tokens in `tokens.css`, which carries the L\* table they were picked from. They
were two literal `92%`s in `Apps.css` and `Faith.css` until a later pass.

The Outro's second band is the exception and says so at its own rule: a lit
nosing 3–7px tall is not a band read against a band, it is a line, and a line
needs more separation than a wash before it is seen at all. It takes 88% —
declared privately in `Outro.css` with that argument beside it, per rule 2.

### The TOP of a seam is not an edge of anything, and it may not sit on a join

The newest rule here, and it was measured into existence. A `Seam` path is
solid from y = 0 down to its silhouette, so an `edge="top"` band carries a
straight horizontal top edge whether the shape has one or not — and the caller
puts that edge exactly on the boundary. Three seams did, and the cost was the
same in every one:

| join | dark | light |
| --- | --- | --- |
| `#tools` -> `#games` (`dune`) | +5.9 L\* at every column | -4.5 at every column |
| `#games` -> `#faith` (`ridge`) | +6.2 to +10.6 | -6.4 to -8.8 |

A step that is present at every column, with nothing varying on either side of
it, is not a ragged join — it is a ruled line drawn across the viewport, which
is the one thing a boundary treatment may not add. Both are masked at the top
now, `transparent` at their first stop, and both joins measure 0.00 in dark and
-0.07 in light across fifteen columns.

Two things follow and neither is optional:

- **A top-faded band needs no `--seam-lift`.** That token exists because a
  drift slides a solid top edge clear of the join; with `transparent` as the
  first stop there is no edge for the drift to expose, in either direction, at
  any scroll position. `.games__seam-drift::before` and
  `.faith__seam-drift::before` are both gone, and the Outro's band never had
  one — it has argued this since it was written.
- **The stops go against the SHAPE, not against round numbers.** Each of the
  three masks names the viewBox band its silhouette occupies and places its
  ramp so the shallow end reads at part alpha and the deep end reads solid.
  That is the dissolve and the aerial perspective out of one gradient.

The same rule reaches past seams. `.faith__field` and `.faith__rays` are
ambient gradients with no shape at all, and their radial masks did not reach
zero at their section's edges either: ablated one at a time, they were the
whole of what was left at the `#games` join once the seam was fixed. **Any
layer that spans a section has to be at zero alpha at both of its horizontal
edges, and that is arithmetic on the mask's own radius rather than a look.**

**`#origin` used to be the sixth and is not any more.** Its boundary is now the
`landscapes/snow-bank` cutout in `Origin.tsx`: a drift whose crest stands up
into the hero and whose body fills down into Origin, so the lamppost's foot
lands on something rather than on a colour change. Two silhouettes on one
boundary is mush, so the seam came off rather than sitting behind the drift.
The measurement two paragraphs above was taken while it was still there.

The hero and the footer draw no seam either, and that is a placement decision
rather than a gap in the palette: `base.css` declares a `--seam-fill` for the
hero, the footer **and `#origin`** alongside the five that use one, so putting
one back anywhere is a `<Seam>` and a `color:` line and nothing else.

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

## `Stage.tsx`

```tsx
Stage({
  /** Layers to draw. Positioned by the caller's own CSS. */
  children: React.ReactNode
  className?: string
})
```

A backdrop that stays put while its section's content scrolls over it. It is
`pointer-events: none`, `aria-hidden`, and it goes **beside** a section's
`.shell`, never around it.

```tsx
<section className="section stage-host walk">
  <Stage className="walk__stage">
    <CabinScene className="walk__cabin" />
  </Stage>
  <div className="shell"> … </div>
</section>
```

That is `Walk.tsx`, trimmed — the file that owns the cabin's pinned stage now;
it was `Origin.tsx` when every `#origin` measurement below was taken, and the
measurements are kept as they were because what they establish is a property of
`stage-host` rather than of that section. `Hero.tsx` is the other caller and
the fuller one — its stage holds the sky, the moon, three art-kit layers, the light
shafts, `Starfield`, the bloom, the grain and the vignette, all of them pinned
for 130svh while the copy dissolves over them. **Faith has no stage and that is
deliberate**; the reason is recorded under *Who calls what* above.

This is the one architectural idea taken from the reference the site owner
named: a fixed backdrop with ordinary sections scrolling over it, which is what
makes a hero look pinned while its copy fades away. That page does it with one
`position: fixed` full-viewport WebGL canvas behind the whole document. This
does it **per section**, because here each section owns its own scenery and a
single page-wide layer would need to be told which section's art to be showing,
which is a router for pictures. The price is that a stage is clipped at its
section's edges: scenery cannot bleed from one section into the next, so the
moon is handed over rather than carried across.

### Put `stage-host` on the section, or nothing sticks

`base.css` gives every `.section` `overflow: hidden`, and **an ancestor with
`overflow: hidden` is a scroll container** — so it becomes the sticky box's
scrollport, and since it never scrolls, the box never sticks. This is not a
theory. Measured on `#origin` with the section left as it is, the stage tracked
the page down instead of holding: `top` 72 → −228 → −1449 → −1863.

`overflow: clip` clips exactly the same content and is explicitly **not** a
scroll container, so sticky keeps the viewport as its scrollport. `Stage.css`
ships that one line as `.stage-host`. Same measurement with it in place: the
stage held a **constant** offset through 1521px of scroll and released at
1935px with its bottom sitting exactly on the section's bottom. (The constant
was 120 rather than 0, because the `useHeroTakeover` hook that existed when
this was measured translated `#origin` by up to `TAKEOVER_LAG` px while it
arrived, and a translate carries the whole section with it. **That hook has
since been deleted** — the hero pins and Origin climbs over it on a negative
margin, with nothing writing a transform to the section any more — so a fresh
reading will land on a different constant. Constant is the part that mattered
and it is the part that did not change. `Stage.tsx` and `Stage.css` carry the
same note, and both now say the hook is gone.)

It is a class rather than an edit to `.section` because only sections that hang
scenery in a stage need it, and because `clip` also removes a section's ability
to be scrolled programmatically — harmless here, and not a change worth making
page-wide without a reason.

(`body { overflow-x: hidden }` in `base.css` is **not** a problem for any of
this. `html`'s overflow is `visible`, so the body's value propagates to the
viewport and the body itself is treated as `visible`. Verified alongside the
above: a control sticky element with no overflow ancestor pinned correctly.)

### How long it stays pinned, and what decides that

`Stage` renders two boxes. The outer is `position: absolute; inset: 0`, so it
covers the section's padding box and adds **nothing** to the flow — measured,
`#origin` is 1935px tall with a stage and 1935px without one. That matters: a
sticky box is in normal flow, so a bare `height: 100svh` sticky element dropped
straight into a section would have pushed that section's copy down by a whole
viewport.

The inner box is the sticky one, and **a sticky box is confined to its
containing block** — here, the outer box, which is the section's padding box.
So the stage is pinned for `section height − 100svh` of scrolling, engaging as
the section's top edge reaches the viewport top and releasing exactly at its
bottom edge.

**In a section shorter than the viewport it never pins at all.** The sticky box
is taller than its containing block, so there is no travel: it is then a
viewport-tall backdrop clipped to the section, which is a perfectly good thing
to be, but do not tune an effect against it and call it pinning.

### It stops costing anything once it is covered

A full-viewport layer that stopped being visible near the top of the page goes
on being painted and composited all the way to the footer. That is exactly the
waste `motion.ts` and `useOffscreenPause` exist to remove, at viewport scale.

So the stage measures its own section's rect on the frame loop and stamps
`data-covered` on itself once the section is more than 120px outside the
viewport; `Stage.css` turns that into `visibility: hidden`, which costs no
paint and no compositing for the whole subtree.

`visibility`, and not the two bigger hammers, on purpose:

- `display: none` skips layout too, and it takes the measurements with it.
  Measured: it took a child canvas's `clientWidth` from 276 to 0 — and `Snow`
  sizes its backing store from exactly that, so every trip past the section
  would blank and re-seed the field, which is a visible re-randomisation of
  every flake.
- `content-visibility: hidden` left the same canvas measuring 276×414 here, but
  it applies size containment to the subtree, and a `ResizeObserver` on skipped
  content is specified to report a zero box — the same failure through the
  other door. **That half was not verified in this session** (ResizeObserver
  delivery needs a rendering lifecycle this browser was not running), so the
  guard uses the tool whose cost was actually measured. `visibility: hidden`
  left the pin's rect and the child canvas's client box byte-identical.
- An `IntersectionObserver` would be cheaper per frame and `useOffscreenPause`
  already runs one, but its callback is asynchronous: a backdrop that reappears
  a frame or more after the reader scrolled back to it pops in at viewport
  size. The rect read costs one measurement per frame **only while the loop is
  awake**, and this subscriber never calls `hold()`, so a parked reader pays
  nothing for it at all.

The guard reads `mi` nowhere, which is what makes it right under reduced
motion: it is a paint saving rather than an animation, so it behaves
identically at `motionIntensity() === 0` and the stage is visible whenever its
section is. It starts visible — the attribute is only ever added by a frame
that measured the section away — and it comes off in the frame the section
returns.

**It is a paint guard, not a work guard.** It cannot reach an `onFrame`
subscriber inside the stage, for the same reason `data-live` cannot: a tick
knows nothing about an attribute. Anything in a stage that draws from
JavaScript still does its own rect check. `Snow` does.

### One stacking context, at the section's floor

`.stage` carries `z-index: 0`, which is deliberate and is not the same as
having no `z-index`. It makes the stage a single stacking context under
`.shell`'s `z-index: 1`, so **nothing a caller puts inside a stage can paint
over the copy however it numbers itself** — guardrail 2 of the art kit made
structural instead of remembered. Leave it off and a layer with its own
`z-index` escapes into the section's stacking order and lands on the words.

It can never trap the content above it either, because it never contains it: it
is a sibling that takes no flow space, not a wrapper.

No `filter`, no `opacity` below 1 and no `will-change` on either box. A caller
wants those on its own layers, one at a time; here they would promote a
full-viewport compositor layer for every section that has a stage.

---

## `Moon.tsx`

```tsx
Moon({ className?: string })
```

The disc, a soft bloom around it, and three quiet patches of surface, as inline
SVG. `aria-hidden`, every colour from a token, no `filter`, nothing to load.

**The caller animates it.** There is no scroll behaviour in the file and there
should not be: the moon's job on this page is to be in a different place in
each section it appears in, and where it goes is a fact about that section.
Drive it from `useSectionProgress` and `usePointer` in the section that draws
it.

Two sections draw one, and between them they are the worked examples. `Hero`
puts it on the horizon inside its stage and lifts it 0.30vh while drifting it
0.22vh left across the pin, off the one rect that section reads per frame.
`faith/Summit.tsx` puts it behind the cross and drives it from
`useSectionProgress` and `usePointer` together, exactly as this paragraph asks
— and it sizes everything off `Moon`'s published geometry rather than off a
screenshot: the disc is half the box, so a box of 2.88 cross-heights gives a
disc of 1.44 and a radius of 0.72, which is how the whole cross is guaranteed
to sit inside the disc at every width. Each wraps the moon in its own `<div>`
and animates *that*, because `Moon` takes a `className` and nothing else — a
component that also handed out a ref would be inviting two owners for one
element's `translate`.

### Inline SVG, not an image

A raster moon is a raster halo. Scale it up for the "much bigger" the site
owner asked for and the bloom bands, and the whole point of a bloom is that it
has no edge. Vector also means one file rather than the two the `-dark` /
`-light` art kit needs, because everything here paints from tokens and the
tokens already flip.

### Sizing it

A 100×100 viewBox with `preserveAspectRatio` left at its default, so a
non-square box gets a centred circle rather than an ellipse. **The visible disc
is exactly half the box's width** — verified: a 400px box measured a 200px
disc. The remaining quarter on each side is bloom, and it is allowed to hang
off the section's edge; that is what the stage's clip is for.

An `<svg>` is an inline box, so it carries a descender gap under it if it is
ever laid out in flow — position it absolutely, or set `display: block` in your
class. `Seam.css` records the same lesson. `Moon` deliberately writes no inline
`display`, because an inline style would beat the `display: none` a caller
needs at 640px to take a prop off the page (art-kit rule 3).

### It is a moon in both themes, and in light it is a pale daytime one

`--glow` for the bloom, `--cross-glow` for the disc, `--invert-fg` for the
shading. No new token, no literal.

**It does not become a sun in the light theme**, and both halves of that were a
decision:

- The light theme here is the same scene in a different palette, not a
  different time of day. The art kit ships one set of mountains in two inks —
  midnight blue, and paler mist and silver with a narrow graphite line — and
  nothing on this page changes *what it is* when the theme flips. A moon that
  turned into a sun would be the only object that did, and it would do it
  behind the cross on the Faith ridge, where a sun is a different and much
  louder symbol than the one this page is telling.
- A sun also wants `--warm`, which in light is `#b8763a`: a burnt orange that
  would instantly be the loudest thing on a page whose light palette is greys.

A pale daytime moon in light is necessarily **darker** than the sky it sits in,
because that sky is near-white and nothing lighter than it can be seen. That is
the same conclusion `--seam-fill` reaches for the same reason, and
`--cross-glow` already carries the flip built in — measured in both themes:
`rgba(255,255,255,0.82)` dark, `rgba(20,20,26,0.45)` light. So the moon and the
seams agree by construction rather than by two people making the same judgement
twice.

### Why every paint goes through a gradient

`base.css` transitions `stop { stop-color }` on the theme wave, and
`ThemeProvider`'s `THEMED` selector includes `svg`, so the element gets its own
`--wave-delay` and every stop inside inherits it. A flat `fill: var(--token)`
would not: `svg`, `circle` and `path` are **not** in `base.css`'s
`transition: var(--t-theme)` list, so a filled shape snaps to the new theme
while the page around it crosses. Verified on a copy of this markup in the live
page: the stops resolve through `var()` and compute
`transition: stop-color 0.55s`. `CrossGlyph` paints through stops for exactly
this reason.

The soft shapes want gradients anyway. A moon with a hard rim is a sticker.

Gradient ids are per instance, from `useId`. SVG ids are document-global and
`url(#id)` resolves against the whole document, so a second `Moon` on one page
would otherwise paint itself with the first one's gradients.

**This file is the pattern for the rest of the site, and it now has company.**
`components/CrossGlyph.tsx` had a fixed id and the home page grew a second and
a third instance of it this pass — the hero's mark, the lit glyph above the
verse, and the silhouette on the Faith summit, the last two sharing a variant
and therefore an id. Verified in the live DOM: three `linearGradient`s, three
ids, each path resolving to its own sibling. `KeyArt.tsx` already did the same
thing for the five app covers. If you write a `<defs>` anywhere, copy the
four-line recipe out of `Moon.tsx` including the punctuation strip.

---

## `Snow.tsx`

```tsx
Snow({ className?: string; density?: number })
```

Falling snow on a 2D canvas. `hero/Starfield.tsx` is the pattern and the
budget, and everything expensive about a particle field is already answered
there: the Hz cap, `devicePixelRatio` capped at 1.5, and the draw done inside
the `onFrame` tick rather than in a returned write closure — a canvas draw
forces no layout, so it does not need the write phase and putting it there
would only delay it by a pass.

**The canvas takes its size from CSS and nothing else**, so the caller has to
give it one: a canvas with no CSS size is 300×150, and this will faithfully put
four flakes in it. `density` scales the count around 1 and is clamped to 0..3;
the count itself comes from the canvas area, `navigator.hardwareConcurrency`
and the viewport width, and is capped at 170. `Starfield` caps at 190 motes;
snow is bigger and more opaque per particle, so fewer.

30Hz, where `Starfield` uses 24. Same argument, different answer, because the
number is a property of the motion and not a house style: dust there crawls at
4–17 px/s, snow here falls at 14–60, and at 30Hz the fastest flake moves 2px
between frames — under its own diameter.

### It checks its own visibility, because nothing else can

`useOffscreenPause` stamps `data-live` and `base.css` turns that into
`animation-play-state: paused`; an `onFrame` subscriber never sees an
attribute. `Stage`'s `data-covered` cannot reach it either, for the same
reason. So `Snow` measures the section it lives in every frame and returns
before it draws **or** holds when the section is off screen. It is the same box
`Stage` guards on, so the two flip together.

Nothing catches up when it comes back. Time is only accumulated *after* the
visibility check, so a field left mid-fall resumes exactly where it stopped
rather than jumping forward by however long the reader spent elsewhere.

### "Still snow" under reduced motion

At `motionIntensity() === 0` the field is drawn **once**, with every
time-varying term evaluated at zero — no fall, no sway — and then the
subscriber returns without holding and the loop parks. The flakes rest at their
seeded positions, which are spread evenly through the box, so it reads as snow
suspended in the air. The section keeps its weather, which is what guardrail 5
below asks for.

What it is **not** is "stop drawing and leave whatever is on the canvas". That
is a claim about a canvas, and three things falsify it silently: a resize and a
DPR change both write `cv.width`, which blanks the canvas, and a theme swap
re-reads the colours and paints with none of them. A reduced-motion visitor who
resized the window would have lost the snow for the rest of the visit with no
code path left that could bring it back. So each of the three clears the
`settled` flag and calls `wake()` for one more frame.
`origin/OriginField.tsx` carried the long version of that bug and was deleted
this pass, so `Snow.tsx`'s own header is where it lives now. It is the same
bug either way, and `origin/CabinScene.tsx` — the three.js scene that replaced
that file — had to answer it again.

### Petals by day

The same canvas is snow at night and kalachuchi petals in the Cebu theme, from
three tokens read at mount and on the theme attribute: `--flake-ink` (the hue,
falling back to `--glow`'s as it always did), `--flake-scale` (a multiplier
on every flake's radius) and `--flake-drift` (on its fall rate). No re-seed at
the flip, no second component; tokens.css holds the two sets.

### The colour is read, not written

`--glow`, through `Snow.tsx`'s own `readRGB` helper — lifted from
`origin/OriginField.tsx` before that file was deleted this pass, so the helper
outlived its source — because only
the hue is wanted — the token carries this theme's own alpha (0.2 dark, 0.16
light) and each flake needs its own. Measured in both themes: the token
resolves to `rgba(255,255,255,0.2)` and `rgba(20,20,26,0.16)`, and the regex
takes the triple out of both. Writing `rgb(214,232,255)` instead would be right
in exactly one theme — rule 2.

A `MutationObserver` on `data-theme` re-reads it and wakes the loop for one
frame, which is what makes a theme swap land on a reduced-motion visitor's
still field.

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
