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
 * `CrossGlyph` is the site's own mark, already drawn in the hero and at the
 * top of this very section, and having the page's own cross be the thing
 * standing on the summit is the point of the beat rather than a saving. It
 * is one path, it scales to any height for nothing, and its fill crosses on
 * the theme wave (see `Summit.css`).
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
 *   same fraction of the viewBox (0.62 x 1440 = 892.8).
 * - **The whole cross is inside the moon's disc.** The disc's radius is
 *   0.72 x the cross's height and its centre sits 0.62 x that height above
 *   the crest, so the disc's top clears the cross's top by 0.34 of a cross
 *   height and its bottom tucks 0.10 of one behind the hill. `Summit.css`
 *   carries the worst-case-drift version of that sum.
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
 * The two are one element here: `.faith__crest` wraps the crest path and the
 * cross and takes a single translate, so the foot cannot come off the ridge
 * line however the section moves. Giving the cross a drift of its own would
 * either lift it off the crest or, if the crest matched it, be invisible. It
 * takes no pointer response either, and that half is a judgement rather than
 * a constraint: a cross that leans toward the cursor is the one object in
 * this section that must not.
 *
 * The pointer reaches exactly two layers — the moon and the far ridge — and
 * by a few pixels. `usePointer` is 0,0 on a coarse pointer and 0,0 under
 * reduced motion, so a phone cannot shove the scenery sideways with a swipe
 * and a visitor who asked for less gets the composed frame.
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
 * ground, so the ladder runs 30 / 26 / 13 / 0 and never crosses.
 *
 * They are small on purpose. The section runs about 1700px of scroll from
 * p = 0 to p = 1, so 30px is under two per cent of the travel — the summit
 * should read as a place you have arrived at, not as scenery sliding past.
 *
 * The moon's 30 and the crest's 13 are also the number that decides the shot.
 * Their difference is what the moon's disc slides against the cross standing
 * in front of it: +-8px of scroll and +-4px of pointer, against a disc radius
 * of 0.72 cross-heights (72.6px at 1440). `Summit.css` carries the worst case
 * worked through. Take these numbers apart and re-do that sum.
 */
const MOON_RISE = 30
const FAR_RISE = 26
const CREST_RISE = 13

/** Pointer amplitudes, in px. Two layers only, and single digits on both. */
const MOON_PX = 7
const MOON_PY = 4
const FAR_PX = 9
const FAR_PY = 3

/**
 * Every amplitude above is quoted at this width, and scaled to whatever the
 * section actually is.
 *
 * The scene is sized in `vw` — the crest, the cross and therefore the moon's
 * radius all shrink on a phone — but a drift stated in flat pixels would not,
 * so the same 12.5px of moon-against-cross travel is a sixth of the disc's
 * radius at 1440 and a third of it at 375. Measured on the narrow end: flat
 * amplitudes left the cross's top only 5.8px inside the disc at 375px, where
 * scaling leaves it 12.1. The width is already being read every frame for the
 * off-screen guard, so this costs a divide.
 *
 * The clamp's floor keeps a 320px reader from losing the drift altogether; its
 * ceiling exists because the scene stops growing at 1543px (both clamps in
 * `Summit.css` top out there) and the motion should stop growing with it.
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
  /* The distant range: two long shallow swells that never rise past y = 200,
     which is what keeps them clear of the moon's disc at every width. Visible
     to the left and right of the crest hill and hidden behind it in the
     middle, which is the whole of the depth effect. */
  far: 'M0 400 L0 236 C150 231 250 206 396 202 C530 198 626 236 772 240 C900 243 1010 214 1150 208 C1268 203 1352 226 1440 242 L1440 400 Z',
  /* The summit. One broad dome with its apex at (892.8, 100) — 0.62 of the
     width, the same fraction `--summit-x` puts the cross and the moon at. The
     control points either side of the apex are both horizontal and both 64.8
     units out, so the crest is smooth through the one point that matters and
     stays smooth after a 3.84x horizontal squeeze at 375px. */
  crest:
    'M0 400 L0 368 C118 362 246 348 368 314 C500 275 604 231 700 168 C762 127 828 100 892.8 100 C957.6 100 1012 124 1074 172 C1176 251 1290 318 1440 352 L1440 400 Z',
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
        <Moon className="faith__moon-disc" />
      </div>

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

        {/* The crest and the cross are ONE element, and that is the weld: a
            single translate carries both, so the foot cannot come off the
            ridge line however the reader scrolls. */}
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
          <span className="faith__summit-cross">
            <CrossGlyph variant="faith" />
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
