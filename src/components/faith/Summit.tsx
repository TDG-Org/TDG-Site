import { useEffect, useRef, type JSX } from 'react'
import { onFrame } from '../../lib/motion'
import { usePointer } from '../../hooks/usePointer'
import type { SectionProgress } from '../../hooks/useSectionProgress'
import { CrossGlyph } from '../CrossGlyph'
import { Moon } from '../scene/Moon'
import './Summit.css'

/**
 * The summit: three smooth ridges, the moon low behind them, and the cross
 * standing on the crest with the disc directly behind it.
 *
 * This is the sixth beat of the walk the home page takes — a valley under a
 * lamppost, snow and a lit cabin, the treeline, a footbridge, the far bank,
 * and then the top of the hill. **The moon is the thread**: it rests on the
 * horizon in the hero and it arrives here, five sections later, behind the
 * cross. Everything in this file exists to make that one alignment true at
 * every width rather than at the width somebody happened to be looking at.
 *
 * ## Why the ridges are authored here and not taken from the art kit
 *
 * `landscapes/mountain-ridge` (and the rear range beside it) are faceted
 * low-poly with a pine fringe along the bottom. That is the hero's language
 * and it is deliberately the wrong texture for this: the reference the site
 * owner sent is soft, smooth, layered hills in flat tones, almost entirely
 * negative space, and a facet count is the fastest way to lose that. The
 * kit's own README now records the exclusion in as many words — "never use
 * it for Faith; Faith's terrain remains Claude-authored SVG".
 *
 * So the three paths below are inline SVG in `Seam.tsx`'s voice: a `viewBox`,
 * `preserveAspectRatio="none"`, one path per layer, `fill="currentColor"`
 * with the colour set by the caller's stylesheet. Seam's rule about thin
 * features applies here twice over — a 1440-unit shape squeezed into 375px
 * turns anything narrow into a spike — which is why every crest below is a
 * broad dome and there is not one sharp feature in any of the three.
 *
 * ## And `landscapes/far-range-soft`, which was drawn for the far one
 *
 * The kit gained a piece this pass that is exactly what `RIDGES.far` is:
 * smooth rounded hills, no facets, a wide 1600x533 frame, described as
 * "ultra-distant smooth hills for a bright-disc composition". It was read
 * before it was declined, and three of the four objections above do not apply
 * to it at all — it is smooth, it is the right shape, and it is the right
 * depth. What it cannot do is the job this particular layer has:
 *
 * - **Its top edge is a hard alpha edge, and the far ridge's whole purpose
 *   this pass is that it does not have one.** Read off the real alpha: the
 *   first row with any ink in it is 62.9% down the frame in dark and 45.4% in
 *   light, and full opacity is two rows below that in dark and one in light.
 *   The "top already hazed" it was commissioned with is TONAL — the hills are
 *   painted pale at the crest — and the alpha under it is a cut.
 *   `Summit.css`'s `.faith__ridge--far` carries a 47/53/63 fade in the layer's
 *   own ink for precisely this: the disc is 1.96 cross-heights across and the
 *   far range crosses its lower limb for most of the drift, and a crisp line
 *   laid over a bright disc is the one defect the whole pass exists to remove.
 *   Placing the raster means adding that same mask back on top of it, at which
 *   point it has bought nothing.
 * - **It cannot ride the theme wave, and this layer's colour is the section's
 *   own band.** The three ridges are `color-mix(var(--band-faith), var(--text))`
 *   through `currentColor`, so they are correct in both themes by construction
 *   and they cross on the wave for free. A raster is two fixed drawings whose
 *   `src` swaps on `data-theme`; every other art layer on the page accepts
 *   that because it is a prop standing IN a band, and this one would be a
 *   fixed blue-grey standing in for the band itself.
 * - **The two themes do not put the horizon in the same place.** Dark's first
 *   ink is at 62.9% of the frame and light's at 45.4% — 93 rows of a 533-row
 *   file apart. One CSS box therefore lands the crest at two different heights
 *   depending on the theme, so making the cross's foot sit on it would need a
 *   per-theme offset as well as a per-theme mask. `transitions/stone-stair` has
 *   the same problem in its aspect ratio and Outro.css pays a custom property
 *   for it; this layer is load-bearing geometry rather than a prop beside some,
 *   and it should not.
 *
 * None of that is a fault in the art. It is a piece drawn for a section that
 * paints its terrain from a raster, and this one paints it from its own band.
 * It stays a spare; the kit's README says an unplaced piece is not a bug.
 *
 * ## Why `CrossGlyph` and not `faith/hillside-cross`
 *
 * The kit's own Faith piece was read before this was decided. It is a
 * faceted low-poly hill with its cross in the LOWER RIGHT of its own frame
 * and a soft glow painted into its alpha channel, lighting the cross from
 * behind and to the right. Standing that on an authored crest would mean
 * fighting three things at once: facets against smooth silhouettes, a second
 * light source that does not agree with where this moon actually is, and a
 * hill inside the artwork that would have to be hidden behind the hill this
 * file draws. It is also a raster, so it cannot ride the theme wave and
 * cannot be resized without bytes.
 *
 * **That call was re-opened this pass and it held, on evidence rather than on
 * the earlier reasoning.** Both files were composited over `--band-faith`'s
 * actual value in both themes at the sizes any real placement would use — 180,
 * 300 and 520px wide, whole and cropped to the hill alone — and three things
 * came out of the picture that the argument above does not contain:
 *
 * - **The glow objection is the weakest of the four, not the strongest.** The
 *   halo is drawn at single-digit alpha, so over a near-black band it is
 *   invisible and over a near-white one it is invisible; the light source that
 *   "disagrees" never actually arrives on the page. Whatever this piece costs,
 *   it is not a second light.
 * - **Its hill is cut by its own frame**, so its base is a ruled horizontal
 *   line all the way across — the exact defect every seam on this page exists
 *   to remove, and one no placement can fix from outside the raster.
 * - **At any size where the facets stop reading, it reads as a sticker.** At
 *   180px it is a small whole hill floating in the band; at 520 it is the
 *   hero's texture arriving in the one section written to be smooth. There is
 *   no size in between where it is neither.
 *
 * And cropping the cross off to keep the section to one cross does not work
 * either: the stem runs down into the hill, so any crop that removes the arms
 * leaves a post standing on a ridge.
 *
 * `CrossGlyph` is the site's own mark, already drawn in the hero and at the
 * top of this very section, and having the page's own cross be the thing
 * standing on the summit is the point of the beat rather than a saving. It
 * is one path, it scales to any height for nothing, and its fill crosses on
 * the theme wave (see `Summit.css`).
 *
 * ## Where the backlight lands
 *
 * The cross stands in front of the moon, so it is lit from behind, and a
 * backlight has to land on something or the reader is told about it rather
 * than shown it. Three of the four obvious places are drawn here and the
 * fourth is deliberately absent:
 *
 * - **The shadow**, thrown forward down the near face of the crest. It is the
 *   same `CrossGlyph` path flipped about its own foot, stretched and sheared,
 *   so the crossbar is in the shadow too — a wedge would have been cheaper and
 *   would not have said "cross".
 * - **The wash**, a pool of moonlight spilling over the crest line either side
 *   of the foot. This is also the "halo where the disc meets the silhouette":
 *   the silhouette it meets is the HILL's, which is the only edge in the frame
 *   that has a dark side for a halo to be seen against.
 * - **The sky**, deepened in a soft pool behind the disc, so the moon is the
 *   brightest thing in the section rather than merely a pale thing on a pale
 *   band. `Summit.css` carries the L* figures; the light theme is what this is
 *   for.
 * - **A rim down one edge of the cross is NOT drawn, and that is a finding
 *   rather than an omission.** The whole cross is inside the disc at every
 *   width and at every point of its drift (the sum is in `Summit.css`), and
 *   the disc is `--moon-disc` white in BOTH themes — so a pale rim would be
 *   white on white and a dark one would just fatten the silhouette. A rim
 *   needs the object's edge to have something darker behind it, and here it
 *   never does. The light lands on the hill instead, where there is dark to
 *   land on.
 *
 * ## The alignment is arithmetic, not a screenshot
 *
 * Everything is derived from two custom properties on the section —
 * `--summit-crest` (how far the crest line sits above the section's bottom)
 * and `--summit-cross-h` — so the three claims that matter are true by
 * construction at every width:
 *
 * - **The cross's foot is on the crest line.** The crest ridge's apex is
 *   authored at viewBox y = 100 of 400, and `Summit.css` sizes the ridge box
 *   so that point lands exactly `--summit-crest` above the section's bottom.
 *   The cross's `bottom` is that same value. Neither can move without the
 *   other.
 * - **The cross and the moon share one x.** Both are positioned at
 *   `--summit-x` of the same box, and the crest's apex is authored at that
 *   same fraction of the viewBox (0.68 x 1440 = 979.2). Those two numbers are
 *   one decision in two places: `RIDGES.crest` below carries the second half
 *   and the scaling that moved it when the site owner asked for the group to
 *   sit further right.
 * - **The whole cross is inside the moon's disc.** The disc's radius is
 *   `--summit-disc-r` cross-heights and its centre sits `--summit-disc-c`
 *   above the crest — 0.98 and 0.52 today — so the disc's top clears the
 *   cross's top by half a cross height and its bottom tucks 0.46 of one behind
 *   the hill. `Summit.css` carries the worst-case-drift version of that sum,
 *   and the two ratios are named properties precisely so that re-doing it is
 *   a substitution rather than a hunt.
 *
 * ## What moves, and what does not
 *
 * One `onFrame` subscriber, one rect, one write closure for three elements.
 * No `requestAnimationFrame`, no scroll listener, no timer, and **no
 * `hold()` at all** — there is no lerp in here. `useSectionProgress` and
 * `usePointer` both hand back a frozen accessor read inside this tick;
 * `usePointer` owns the only damping on the page and holds the loop only
 * while its own lerp converges.
 *
 * The layers are ordered by how much they LAG the page, which is what reads
 * as distance: the moon lags most (it is the farthest object in the frame
 * and moves least on screen), then the far ridge, then the crest, and the
 * near ridge does not lag at all — it is the ground the reader is standing
 * on, so it travels with the section exactly.
 *
 * **The cross has no motion of its own, and the crest ridge is the reason.**
 * `.faith__crest` wraps the crest path, the wash, the shadow and the cross,
 * and takes a single translate, so the foot cannot come off the ridge line
 * and the shadow cannot come off the foot however the section moves. Giving
 * the cross a drift of its own would either lift it off the crest or, if the
 * crest matched it, be invisible. It takes no pointer response either, and
 * that half is a judgement rather than a constraint: a cross that leans
 * toward the cursor is the one object in this section that must not.
 *
 * The pointer reaches exactly two layers — the moon and the far ridge —
 * because those are the two that have somewhere to go. `usePointer` is 0,0 on
 * a coarse pointer and 0,0 under reduced motion, so a phone cannot shove the
 * scenery sideways with a swipe and a visitor who asked for less gets the
 * composed frame.
 *
 * ## Off screen it does nothing
 *
 * `useOffscreenPause` stamps `data-live` and `base.css` turns that into
 * `animation-play-state: paused`, but an `onFrame` subscriber never sees an
 * attribute — the same limitation `Stage`'s `data-covered` has. So this
 * measures its own section every frame and returns before it writes when the
 * section is more than `PARK_MARGIN` outside the viewport. Nothing is lost by
 * skipping the write: `progress.p` is clamped to 0 or 1 out there, and the
 * first frame back inside the margin reads and writes before the browser
 * paints, so there is no catch-up slide to see.
 */

/**
 * How far outside the viewport the summit keeps painting, in px.
 *
 * The 120 `useOffscreenPause` and `Stage` use, not `useParallax`'s 400.
 * That hook needs 400 because it spends ~17 frames settling a lerp and the
 * settle has to happen where nobody is looking. Nothing here converges — every
 * value is a direct function of `p` and the pointer — so being a frame early
 * costs a frame of a skipped write and being a frame late costs nothing at all.
 */
const PARK_MARGIN = 120

/*
 * ── the depth ladder ──────────────────────────────────────────────────────
 *
 * `RISE` is how far a layer LAGS the page across the whole of `p`, in px, so
 * a layer's actual excursion is half of it either side of the composed frame.
 * Bigger means it moves LESS on screen, which is what "farther away" looks
 * like: the moon is the farthest thing in the frame and the near ridge is the
 * ground, so the ladder runs 88 / 44 / 11 / 0 and never crosses.
 *
 * **It used to run 30 / 26 / 13 / 0 and that was the defect, not the
 * restraint.** The paragraph here defended those numbers as "a place you have
 * arrived at, not scenery sliding past", which is the right instinct and was
 * spent on the wrong quantity. What a reader can see is not a layer's absolute
 * lag — the whole section scrolls past either way — it is the RELATIVE travel
 * between two layers they can compare, and there is exactly one such pair in
 * this frame worth anything: the moon's disc against the cross standing in
 * front of it. At 30 and 13 that pair moved 17px across the entire section,
 * against a disc 145px across. Nothing moved. The reader got stillness, which
 * is not the same thing as arrival.
 *
 * At 88 and 11 the pair moves 77px — a fifth of the disc's new width — and the
 * disc visibly slides down behind the cross as you come over the crest. That
 * single relative movement IS the shot, and the ratio between the ends of the
 * ladder is 8x, which is the spread that reads as depth rather than as one
 * layer drawn twice.
 *
 * The near ridge stays at 0 and that half has not moved. It is the ground the
 * reader is standing on and it is the layer that covers the section's own
 * floor; a negative factor on it — the cheapest way to buy depth anywhere else
 * on this page — would lift it off the boundary it exists to hide. This
 * section takes its against-the-page motion at the OTHER end, at the pass:
 * `Faith.tsx` drifts the hanging band +0.034 and the rising one -0.018.
 *
 * Re-do `Summit.css`'s disc-clearance sum before changing any of these.
 */
const MOON_RISE = 88
const FAR_RISE = 44
/* NEGATIVE, and that is the whole of the owner's note: "move the mountain and
   the cross up slightly and smoothly and just a little while the user continues
   to scroll down to cover the moon behind it".

   Every other rung here is a LAG — a bigger number means the layer travels
   further DOWN across the section, which is what reads as distance. At +11 the
   crest lagged slightly too, so the moon (88) sank 77px past it and the disc
   drifted down behind a cross that was almost still. That already closed a
   little, and "a little" is what the owner is asking to be more of.

   At -24 the crest and the cross actually CLIMB 24px across the section while
   the moon sinks 88, so the hill closes 112px over the disc rather than 77 —
   half again as much, and in the direction a hill rises rather than the disc
   merely falling. The composed frame is untouched: `lag` is (p - 0.5), so every
   layer is at zero translate at p = 0.5 and the settled shot is the same
   picture it was.

   What it costs is the disc-clearance margin at the ENDS of the run, and that
   was re-derived rather than assumed. Worst case is p = 1: cross 12px up, moon
   44px down, 56px apart against a disc radius of 0.98 cross-heights (125px at
   1440, 65px at 375). The cross's top sits 0.34 cross-heights inside the disc's
   rim when centred, so it stays inside at 1440 and breaks the rim at 375 —
   which is the point of the beat, not a defect: at p = 1 the reader has left
   the section and the hill is meant to have taken the moon. */
const CREST_RISE = -24

/**
 * Pointer amplitudes, in px. Still two layers only.
 *
 * They went up with the ladder rather than being left behind it: at 7px
 * against a 77px scroll excursion the pointer would have been a rounding
 * error on the moon, and the whole point of giving those two layers a pointer
 * is that a reader who is not scrolling can still make the frame move.
 */
const MOON_PX = 12
const MOON_PY = 6
const FAR_PX = 16
const FAR_PY = 5

/**
 * Every amplitude above is quoted at this width, and scaled to whatever the
 * section actually is.
 *
 * The scene is sized in `vw` — the crest, the cross and therefore the moon's
 * radius all shrink on a phone — but a drift stated in flat pixels would not,
 * so an unscaled 44.5px of moon-against-cross travel is 0.36 of a cross height
 * at 1440 and 0.67 of one at 375, and the cross would swing straight out of
 * the disc at the narrow end. Scaled, the SAME fraction survives the whole
 * range: 0.359 of a cross height at 1440, 0.337 at 375, 0.382 at 1920. That
 * flatness is the whole reason the clearance sum in `Summit.css` can be stated
 * once in cross-heights instead of once per breakpoint. The width is already
 * being read every frame for the off-screen guard, so this costs a divide.
 *
 * The clamp's floor keeps a 320px reader from losing the drift altogether; its
 * ceiling exists because the scene stops growing at 1543px (--summit-crest
 * tops out at 1527 and --summit-cross-h at 1488) and the motion should stop
 * growing with it.
 */
const REF_WIDTH = 1440
const SCALE_MIN = 0.5
const SCALE_MAX = 1.1

/* The three ridges, back to front. All in one 1440x400 viewBox stretched to
   whatever box the stylesheet gives them, all closing on y = 400 so the box
   is filled to its own floor and an upward drift cannot open a gap under
   them — `--summit-dip` in Summit.css is the margin that buys.

   Read the y values as fractions of the band: 100 is the crest apex, and the
   band is sized so that 100 lands exactly on --summit-crest. Nothing here is
   narrower than about 60 viewBox units across, which is 15px once a 1440-unit
   shape has been squeezed into 375 — the floor Seam.tsx's header sets. */
const RIDGES = {
  /* The distant range: two long shallow swells that never rise past y = 200.
     Visible to the left and right of the crest hill and hidden behind it in
     the middle, which is the whole of the depth effect.

     **That 200 used to be justified as "what keeps them clear of the moon's
     disc at every width", and it no longer does.** The disc is 1.96 cross-
     heights across now rather than 1.44, so its lower limb sits about where
     this range's apex does and the two cross for most of the drift. That is
     not a regression to route around — a far range silhouetted against a low
     moon is the picture — but it does mean this layer meets a bright disc with
     a hard top edge, and a hard edge between two depth planes is the one thing
     this pass exists to remove. So the crossing is paid for with haze: the
     far ridge carries a fade across its own top in `Summit.css`, in its own
     ink, which is the aerial perspective the composition was missing and the
     reason this range finally has something to read against. */
  far: 'M0 400 L0 236 C150 231 250 206 396 202 C530 198 626 236 772 240 C900 243 1010 214 1150 208 C1268 203 1352 226 1440 242 L1440 400 Z',
  /* The summit. One broad dome with its apex at (979.2, 100) — 0.68 of the
     width, the same fraction `--summit-x` puts the cross and the moon at. The
     control points either side of the apex are both horizontal and both 64.8
     units out, so the crest is smooth through the one point that matters and
     stays smooth after a 3.84x horizontal squeeze at 375px.

     **The apex was at 892.8 (0.62) and moved with `--summit-x`, in the same
     edit, because the two are one decision.** The site owner asked for the
     moon and the cross a little further right; moving the custom property
     alone would have walked the cross off the top of the hill, since this
     literal is the only thing that says where the hill's top is.

     It is not a translate of the old dome — the flanks are different lengths
     now, so each was scaled about the apex rather than slid: every x left of
     the apex by 892.8 / 979.2 = 1.09677 and every x right of it by
     547.2 / 460.8 = 0.84211, y untouched. That keeps the profile's shape
     (a long shallow left rise, a shorter steeper right fall) instead of
     compressing the whole hill toward one edge, and it keeps both flanks
     monotonic. Measured against the far range behind it, whose apex is at
     y = 202: the crest crosses that line at x 705 and x 1175, so the far
     range still shows for the left 49% and the right 18% of the width, where
     it showed for 51% and 22% before. */
  crest:
    'M0 400 L0 368 C129.4 362 269.8 348 403.6 314 C548.4 275 662.5 231 767.7 168 C835.5 127 914.4 100 979.2 100 C1044 100 1079.6 124 1131.8 172 C1217.7 251 1313.7 318 1440 352 L1440 400 Z',
  /* The ground. A low swell at each edge dipping away in the middle, so it
     reads as foreground crossing IN FRONT of the crest hill's flanks rather
     than as a fourth line competing with them. It carries no drift at all —
     it is what the reader is standing on, so it travels with the section.

     Its line sits 30 units higher than it first did, and that was measured
     rather than nudged: the band's bottom fade is fully opaque about 32px
     above the section's floor at 1440, and at the original height this ridge's
     two visible ends were at 19 and 36 — so most of the only layer that
     touches the floor was being drawn at part alpha by the fade meant to hide
     the boundary UNDER it. At 292/262 the ends measure 38.0 and 54.7, clear
     of the fade, and still comfortably below the far ridge's 74–94. */
  near: 'M0 400 L0 292 C140 288 244 306 386 318 C520 329 640 336 800 336 C968 336 1120 312 1276 284 C1348 271 1400 266 1440 262 L1440 400 Z',
} as const

export function Summit({ progress }: { progress: SectionProgress }): JSX.Element {
  const pointer = usePointer()
  const root = useRef<HTMLDivElement | null>(null)
  // A wrapper, not the moon's own <svg>: `Moon` takes a className and nothing
  // else, which is right — its header says the caller animates it, and a
  // component that also handed out a ref would be inviting two owners for one
  // element's `translate`. The wrapper is the caller's, so the caller owns it.
  const moon = useRef<HTMLDivElement | null>(null)
  const far = useRef<SVGSVGElement | null>(null)
  const crest = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    // The section is the honest box to ask "can this be seen": the summit's
    // own layers are absolutely positioned inside it and one of them is a
    // moon whose bloom hangs off the edges. `?? el` is the same fallback
    // `Stage` uses for a layer that is not inside a section.
    const box: Element = el.closest('section') ?? el
    let painted = ''

    return onFrame(({ vh, mi }) => {
      const r = box.getBoundingClientRect()
      if (r.bottom < -PARK_MARGIN || r.top > vh + PARK_MARGIN) return

      /*
       * `mi` multiplies everything, so `motionIntensity() === 0` resolves to
       * three zero translates — which is the frame this scene was COMPOSED
       * at, not a frozen mid-motion one. The stylesheet places the crest, the
       * cross and the moon at their resting positions and this tick only ever
       * moves them away from it, so a visitor who asked for less motion sees
       * the same summit everybody else sees, standing still.
       *
       * `usePointer` already returns 0,0 at mi 0; the multiply is here so the
       * identity is stated once for all three layers rather than depended on.
       */
      const k = Math.min(SCALE_MAX, Math.max(SCALE_MIN, r.width / REF_WIDTH)) * mi
      const lag = (progress.p - 0.5) * k
      const px = pointer.x * k
      const py = pointer.y * k

      const moonT = `${(px * MOON_PX).toFixed(2)}px ${(lag * MOON_RISE + py * MOON_PY).toFixed(2)}px`
      const farT = `${(px * FAR_PX).toFixed(2)}px ${(lag * FAR_RISE + py * FAR_PY).toFixed(2)}px`
      const crestT = `0 ${(lag * CREST_RISE).toFixed(2)}px`

      // One string for all three, because they always change together: a
      // style write the browser has to recalculate is not free, and a parked
      // reader must not pay for three of them per frame.
      const next = `${moonT}|${farT}|${crestT}`
      if (next === painted) return
      painted = next

      return () => {
        if (moon.current) moon.current.style.translate = moonT
        if (far.current) far.current.style.translate = farT
        if (crest.current) crest.current.style.translate = crestT
      }
    })
  }, [progress, pointer])

  return (
    <div ref={root} className="faith__summit" aria-hidden="true">
      {/* Farthest first. The moon is behind every ridge — it has to be, or
          the crest cannot tuck its lower edge behind the hill — and in front
          of nothing but the section's own gradient field. */}
      <div ref={moon} className="faith__moon">
        {/* The sky, deepened behind the disc. It is a child rather than a
            sibling so it inherits the moon's translate for free — one more
            element to paint, but not one more style write per frame, and a
            pool that drifts WITH the moon is the only version that cannot
            slide off it. `Summit.css` has the L* figures and why the light
            theme is what this exists for. */}
        <div className="faith__moon-sky" />
        <Moon className="faith__moon-disc" />
      </div>

      {/* In front of the moon and behind the ridges, which is the only place
          it works: it exists to take the moon's BLOOM to nothing before the
          section's own floor cuts it, and it must not touch the ridges, which
          dissolve there on their own. `Summit.css` has the measurement. */}
      <div className="faith__floor" />

      {/* The three ridges share one box so they share one bottom fade. The
          box hangs `--summit-dip` below the section's floor, which is what an
          upward drift eats into instead of opening a gap. */}
      <div className="faith__ridges">
        <svg
          ref={far}
          className="faith__ridge faith__ridge--far"
          viewBox="0 0 1440 400"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d={RIDGES.far} fill="currentColor" />
        </svg>

        {/* The crest, the light it catches, the shadow it throws and the cross
            itself are ONE element, and that is the weld: a single translate
            carries all four, so the foot cannot come off the ridge line and
            the shadow cannot come off the foot however the reader scrolls.

            Order is paint order and it is the physics: the hill, then the
            moonlight spilling over its crest line, then the wedge of that
            light the cross blocks, then the cross. */}
        <div ref={crest} className="faith__crest">
          <svg
            className="faith__ridge faith__ridge--crest"
            viewBox="0 0 1440 400"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d={RIDGES.crest} fill="currentColor" />
          </svg>

          <span className="faith__crest-wash" />

          {/* The same glyph, flipped about its own foot and stretched. A
              trapezoid would have been one `clip-path` and no extra svg, and
              it would have thrown the shadow of a post: the crossbar is the
              whole reason the site owner could tell this cross was not
              finished, so it is in the shadow too. It paints through
              `CrossGlyph`'s own stops, which `Summit.css` redirects by
              redeclaring --summit-stop-* on this wrapper — the component
              writes `stopColor` as an inline style, so a stylesheet cannot
              beat it, and redefining what the inline style READS is the only
              override here that does not need `!important`. */}
          <span className="faith__cross-shadow">
            <CrossGlyph variant="summit" />
          </span>

          {/* `summit`, not `faith`. The variant above the verse is a LIT ramp
              that opens on white; in front of a white disc its crossbar was
              white on white. See CrossGlyph.tsx — and see `Summit.css` for the
              second half of that bug, which was that the ridge box's own mask
              was cutting the top 38% of this glyph off entirely. */}
          <span className="faith__summit-cross">
            <CrossGlyph variant="summit" />
          </span>
        </div>

        <svg
          className="faith__ridge faith__ridge--near"
          viewBox="0 0 1440 400"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d={RIDGES.near} fill="currentColor" />
        </svg>
      </div>
    </div>
  )
}
