import { lazy, Suspense, useEffect, useRef } from 'react'
import { clamp01, onFrame } from '../lib/motion'
import { usePointer } from '../hooks/usePointer'
import { CrossGlyph } from './CrossGlyph'
import { Moon } from './scene/Moon'
import { Stage } from './scene/Stage'
import { StillArt } from './scene/ThemedArt'
import { Starfield } from './hero/Starfield'
import { Tagline } from './hero/Tagline'
import './Hero.css'

/* The model and its twelve form definitions are the largest thing on the page
   and none of it is needed to paint the hero. Split it out. */
const PointCloud = lazy(() =>
  import('./hero/PointCloud').then((m) => ({ default: m.PointCloud })),
)

/* ── the shape of this section, because the CSS alone will not tell you ─────
 *
 * The hero is a valley at night that STAYS WHERE IT IS while the page moves
 * over it. That is the one architectural idea taken from the reference the
 * site owner named — a backdrop that does not scroll, with ordinary sections
 * riding up over it — and on this site it is `scene/Stage`, whose header
 * carries the sticky mechanics and the traps.
 *
 * Three boxes, and each is doing a job the other two cannot:
 *
 *   .hero          min-height 230svh, `overflow: clip` (NOT hidden — see
 *                  Hero.css; hidden is a scroll container and kills sticky)
 *     Stage        absolute, adds nothing to flow. Its pin holds still for
 *                  230 − 100 = 130svh of scrolling: the whole beat. Measured
 *                  at 1440x900: the pin's top read 0 at scroll 0, 60, 117,
 *                  175, 234, 400, 700, 1000 and 1134, and only then began to
 *                  track. Origin's top climbed 1134 → 0 across that.
 *     .hero__above 130svh of ordinary flow. Its BOTTOM EDGE is the seam —
 *                  #origin is pulled up onto it with margin-top: -100svh, so
 *                  Origin's ceiling and this box's floor are the same line.
 *       .hero__frame  sticky, 100svh, the copy + the model + the strip. It
 *                  pins for 130 − 100 = 30svh, which is the runway the copy
 *                  has to dissolve in, and it releases exactly as Origin's
 *                  top reaches the viewport bottom.
 *
 * **The −100svh overlap is what makes this read like the reference rather
 * than like a tall hero.** Without it a stage releases the instant Origin
 * appears, so the scenery scrolls away underneath Origin at the same speed
 * Origin arrives — which is an ordinary page. With it, Origin climbs a full
 * viewport over a backdrop that has not moved a pixel. It costs no extra
 * page height at all: the hero's last 100svh is exactly the 100svh Origin's
 * negative margin takes back, so the document is the same length as a plain
 * 130svh hero would be.
 *
 * ── what moves, and how fast ───────────────────────────────────────────────
 * Everything in the stage is pinned, so a layer's speed IS its drift against
 * a still frame. Over the 130svh the pin lasts, as a fraction of the scroll,
 * at 1440x900:
 *
 *   rear ridge   0.022   26px          the far range, all but welded to the sky
 *   main ridge   0.048   56px          the horizon
 *   tall pine    0.092   0.12vh        the near foreground — see below
 *   moon         0.231   0.30vh up, 0.22vh left
 *   lamppost     1.0     — it is not in here at all. It belongs to #origin,
 *                          stands on Origin's ground and therefore travels at
 *                          exactly page rate. See Origin.tsx.
 *
 * The previous pass used 0.034 and 0.062 for its two layers and nothing
 * visibly moved against anything; these are deliberately an order of
 * magnitude apart end to end.
 *
 * ── one rect, six layers ───────────────────────────────────────────────────
 * All of it comes off ONE `getBoundingClientRect` per frame, on `.hero__above`
 * — the box whose height is the pin's travel and whose bottom edge is the
 * seam. `useSectionProgress` was the obvious driver and is not used here: its
 * `p` runs over `vh + height` with the section entirely off screen at both
 * ends, so recovering "how far through the runway am I" from it needs the
 * height and the viewport back again, which is the measurement it was meant
 * to save. One rect, read once, is cheaper and exact.
 */

/** Ridge lift over the whole pin, px. The horizon barely moves. */
const RIDGE_LIFT = 56
/** Rear range lift, px. Half the ridge's, because it is twice as far away. */
const REAR_LIFT = 26
/** Light shafts, as a fraction of the viewport height. Atmosphere, not terrain. */
const SHAFT_LIFT = 0.05
/**
 * The near foreground, as a fraction of the viewport height.
 *
 * Deliberately SMALL for something this close, and the reason is the frame
 * rather than the physics. A near layer in a pinned stage has to travel a long
 * way to read as near, and this one stands on the floor — so a lift big enough
 * to be convincing lifts its cut base into view, and a tree hovering over a
 * clean horizontal edge is worse than a tree that barely moves. What makes it
 * read as near here is the MOUSE: 26px against the moon's 7 and the ridge's
 * nothing. The layer that really travels at page rate is the lamppost, which
 * can afford to because it is planted on ground that travels with it.
 */
const PINE_LIFT = 0.12
/** The moon's exit: up this much of the viewport, and left this much of it. */
const MOON_LIFT = 0.3
const MOON_DRIFT = 0.22
/** How far the copy is blurred once it has finished dissolving, px. */
const COPY_BLUR = 6.5

/* Pointer amplitudes, in px, at the extremes of the viewport.
 *
 * THREE layers respond and no more. `usePointer` is damped and shared, so the
 * cost of a fourth is not the reason — the reason is that everything moving
 * with the mouse is seasickness, and depth reads from a DIFFERENCE. The pine
 * is near and moves like it; the moon is far and barely stirs; the ridge and
 * the sky do not answer the mouse at all, which is what makes the pine look
 * near. The lamppost's own amount is in Origin.css/Origin.tsx, because the
 * lamppost lives in that section — and it is small because it is spent out of
 * the same budget that keeps its ink 30px clear of the wordmark. */
const PINE_POINT_X = 26
const PINE_POINT_Y = 11
const MOON_POINT_X = 7
const MOON_POINT_Y = 3

/** 3t² − 2t³. Zero slope at both ends, so nothing starts or stops with a jerk.
 *  This is the SCENERY's curve: travel, which should ease in and out. */
const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * The COPY's curve, and it is not the same one.
 *
 * A symmetric ease is wrong for a dissolve. Measured with `smooth` in place at
 * 1440x900, where the runway is 270px: the CTA row and the bottom strip were
 * at zero by 117px of scroll and the wordmark was at half opacity with a
 * 3.2px blur — a wheel notch and a half, which reads as the copy being yanked
 * rather than dissolving. The trouble is `smooth`'s steepest slope is in the
 * MIDDLE, so the words lose most of their opacity in the middle third and the
 * reader never gets a stretch where the hero is visibly held and visibly
 * going.
 *
 * An ease-IN puts the steep part at the end. At 1.85 the wordmark is still at
 * 0.92 after 60px, 0.72 after half the runway and 0.41 at three quarters,
 * which is the shape of something fading rather than something being switched
 * off. 2 was a shade too abrupt at the end; 1.85 keeps a little slope there.
 */
const dissolve = (t: number) => Math.pow(t, 1.85)

/** Per-frame lerp rate expressed per second, so 144Hz feels like 60Hz. The
 *  same shape `useParallax` and `usePointer` use: one settle on this site. */
const settle = (rate: number, dt: number) => 1 - Math.pow(1 - rate, dt * 60)

/**
 * Below this the damped progress can no longer change a painted pixel.
 *
 * The largest thing progress drives is the moon, at 0.3vh — 324px on a tall
 * window. 0.00012 of that is a twentieth of a pixel, and every other layer is
 * smaller. Snapping here is what lets `hold()` stop, which is what lets the
 * loop park, which is the whole reason `motion.ts` measures 0.1ms/s parked.
 */
const EPSILON = 0.00012

export function Hero() {
  const section = useRef<HTMLElement | null>(null)
  const above = useRef<HTMLDivElement | null>(null)
  const frame = useRef<HTMLDivElement | null>(null)
  const moon = useRef<HTMLDivElement | null>(null)
  const rear = useRef<HTMLDivElement | null>(null)
  const ridge = useRef<HTMLDivElement | null>(null)
  const pine = useRef<HTMLDivElement | null>(null)
  const shafts = useRef<HTMLDivElement | null>(null)
  const bloom = useRef<HTMLDivElement | null>(null)
  const pointer = usePointer()

  useEffect(() => {
    const box = above.current
    const host = section.current
    const fr = frame.current
    if (!box || !host || !fr) return

    /*
     * `cur` is the DAMPED scene progress, and the damping is the difference
     * between a moon and a moon-shaped scrollbar. Welded straight to scroll
     * position, every layer here inherits the trackpad's own judder: two
     * momentum events a frame apart with different deltas move the moon by
     * different amounts on consecutive frames, which the eye reads as
     * stuttering rather than as gliding. A lerp toward the target smooths the
     * input without adding lag anybody can name — about 17 frames to settle,
     * the same rate the parallax hooks use.
     *
     * The copy does NOT go through it. A fade is not travel: damping it only
     * makes the words linger a fifth of a second after the reader has stopped,
     * which reads as the page being slow rather than as the copy having
     * weight.
     */
    let cur = 0
    let seeded = false
    let paintedScene = ''
    let paintedCopy = ''
    let eclipsed: boolean | null = null

    return onFrame(({ vh, mi, dt, hold }) => {
      const r = box.getBoundingClientRect()

      /* ── covered ─────────────────────────────────────────────────────────
         `.hero__above`'s bottom edge IS Origin's top edge (the negative margin
         above), so `bottom <= 0` is exactly "Origin has reached the top of the
         viewport and nothing of the hero can be seen any more".

         `Stage`'s own `data-covered` cannot answer this. It watches the
         SECTION, and the section runs a further 100svh below the seam by
         construction — so without this the stage, the starfield and every
         breathing gradient in here would go on painting for two full viewports
         of scrolling behind an opaque Origin. It is a paint guard, not an
         animation, so it reads no `mi` and behaves identically under reduced
         motion. It starts absent, so a hero that never gets a frame is a hero
         you can see. */
      const covered = r.bottom <= 0
      const flip = covered === eclipsed ? null : covered
      if (flip !== null) eclipsed = covered

      /* Reduced motion: the section is 100svh (Hero.css), there is no runway
         and there is nothing to drive. Write the identity — no fade, no blur,
         every layer at the resting position it was composed in — and return
         without holding. The scenery stays visible and still, which is what
         guardrail 5 of the art kit asks for. */
      if (mi === 0) {
        const copy = '0|none'
        const scene = 'rest'
        const cw = copy === paintedCopy ? null : copy
        const sw = scene === paintedScene ? null : scene
        if (cw === null && sw === null && flip === null) return
        paintedCopy = copy
        paintedScene = scene
        return () => {
          if (cw !== null) {
            fr.style.setProperty('--hero-out', '0')
            fr.style.setProperty('--hero-blur', 'none')
          }
          if (sw !== null) {
            for (const el of [moon, rear, ridge, pine, shafts, bloom]) {
              if (el.current) el.current.style.translate = ''
            }
          }
          if (flip !== null) {
            if (flip) host.setAttribute('data-eclipsed', 'true')
            else host.removeAttribute('data-eclipsed')
          }
        }
      }

      /* The pin's travel is the box's whole height (it is 130svh in a 100svh
         window, so `sticky` holds for height − vh and the last vh is Origin
         climbing over it); the COPY's runway is height − vh, which ends exactly
         as Origin's top touches the viewport bottom. Both fall out of the one
         rect. */
      const span = r.height || 1
      const runway = Math.max(1, r.height - vh)
      const target = clamp01(-r.top / span)
      const out = dissolve(clamp01(-r.top / runway))

      if (!seeded) {
        // A reload halfway down the page, or a #origin link followed from
        // another route, must not glide the scenery in from the top of the
        // run. Land on the truth for the first frame and damp from there.
        cur = target
        seeded = true
      } else {
        const d = target - cur
        if (d > EPSILON || d < -EPSILON) {
          hold()
          cur += d * settle(0.16, dt)
        } else {
          cur = target
        }
      }

      const e = smooth(cur)
      const px = pointer.x
      const py = pointer.y

      // Every layer's whole `translate` in one string, so nothing here has to
      // read back what another writer left. Two writers on one element is the
      // bug ThemedArt.tsx's header is about; there is exactly one here.
      const moonT = `${(-MOON_DRIFT * vh * e + px * MOON_POINT_X).toFixed(1)}px ${(-MOON_LIFT * vh * e + py * MOON_POINT_Y).toFixed(1)}px`
      const bloomT = `${(-MOON_DRIFT * vh * e * 0.72).toFixed(1)}px ${(-MOON_LIFT * vh * e * 0.72).toFixed(1)}px`
      const rearT = `0 ${(-REAR_LIFT * e).toFixed(1)}px`
      const ridgeT = `0 ${(-RIDGE_LIFT * e).toFixed(1)}px`
      const pineT = `${(px * PINE_POINT_X).toFixed(1)}px ${(-PINE_LIFT * vh * e + py * PINE_POINT_Y).toFixed(1)}px`
      const shaftT = `0 ${(-SHAFT_LIFT * vh * e).toFixed(1)}px`

      const scene = `${moonT}|${bloomT}|${rearT}|${ridgeT}|${pineT}|${shaftT}`
      const blur = out > 0.008 ? `blur(${(out * COPY_BLUR).toFixed(2)}px)` : 'none'
      const copy = `${(1 - out).toFixed(4)}|${blur}`

      const sw = scene === paintedScene ? null : scene
      const cw = copy === paintedCopy ? null : copy
      if (sw === null && cw === null && flip === null) return
      paintedScene = scene
      paintedCopy = copy

      return () => {
        if (sw !== null) {
          if (moon.current) moon.current.style.translate = moonT
          if (bloom.current) bloom.current.style.translate = bloomT
          if (rear.current) rear.current.style.translate = rearT
          if (ridge.current) ridge.current.style.translate = ridgeT
          if (pine.current) pine.current.style.translate = pineT
          if (shafts.current) shafts.current.style.translate = shaftT
        }
        if (cw !== null) {
          fr.style.setProperty('--hero-out', out.toFixed(4))
          fr.style.setProperty('--hero-blur', blur)
        }
        if (flip !== null) {
          if (flip) host.setAttribute('data-eclipsed', 'true')
          else host.removeAttribute('data-eclipsed')
        }
      }
    })
  }, [pointer])

  return (
    <section id="top" ref={section} className="hero stage-host">
      {/* ── the valley, and it does not move ────────────────────────────────
          Everything in here is pinned by `Stage`. Back to front, which is DOM
          order inside one stacking context at z-index 0:

            sky · moon · rear ridge · main ridge · shafts · dust · bloom ·
            tall pine · grain · vignette

          That is the art kit's own hero order (guardrail 3 of
          public/assets/parallax/README.md) with the fog veil taken OUT and the
          rear ridge put in its place. The fog was the "other smooth mountains
          behind the mountains" the site owner asked to be rid of: soft blurred
          bands that read as vague hills rather than as a range. The rear ridge
          is a properly faceted distant range in the main ridge's own language,
          and it is held to being unmistakably FAR — paler (--art-far), lower,
          and drifting at less than half the main ridge's rate.

          The moon is BEHIND the ridges and in front of the sky, which is what
          "resting on the horizon" has to mean: the mountains cut its lower
          limb. It is the page's connecting thread — it leaves here and turns
          up again behind the cross in Faith — so its exit is the one piece of
          motion in this section that is still running when the reader arrives
          in the next one.

          The tall pine is the near foreground and it sits AFTER the atmosphere
          on purpose: a near silhouette should be in front of the haze, not
          behind it. It is cropped by the frame at the right edge, alone, with
          no other pine family anywhere near it.

          Nothing here recolours a pixel: -dark and -light are separate
          artwork, and the opacity is an --art-* token per theme. */}
      <Stage className="hero__stage">
        <div className="hero__sky" />

        <div ref={moon} className="hero__moon-drift">
          <Moon className="hero__moon" />
        </div>

        <div ref={rear} className="hero__rear-drift">
          <StillArt art="landscapes/mountain-ridge-rear" className="hero__rear" />
        </div>
        <div ref={ridge} className="hero__ridge-drift">
          <StillArt art="landscapes/mountain-ridge" className="hero__ridge" />
        </div>

        <div ref={shafts} className="hero__shafts">
          <div className="hero__shaft" />
          <div className="hero__shaft-core" />
          <div className="hero__shaft-far" />
        </div>

        <Starfield />

        <div ref={bloom} className="hero__bloom" />

        <div ref={pine} className="hero__pine-drift">
          <StillArt art="props/tall-pine" className="hero__pine" />
        </div>

        <div className="hero__grain" />
        <div className="hero__vignette" />
      </Stage>

      {/* ── the 130svh whose floor is the seam ──────────────────────────────
          Nothing is drawn on this box. It exists so the frame below has a
          containing block that ends where Origin begins, and so the one rect
          the effect above reads answers both questions at once. */}
      <div ref={above} className="hero__above">
        {/* ── the part that dissolves ──────────────────────────────────────
            Pinned, so it does not slide anywhere — the site owner's whole
            note about the reference was that the hero "looks like it's staying
            the same position but fading away from the bottom", and a layer
            that slides is doing the opposite of that. The `useHeroParallax`
            that used to move this column is gone for exactly that reason.

            The fade runs bottom-up because the fade RATES differ per element,
            not because anything is masked: the strip goes first, then the
            CTAs, then the tagline, then the wordmark with the column itself.
            One custom property drives all four (see Hero.css), so this is one
            style write a frame and no second subscriber. */}
        <div ref={frame} className="hero__frame">
          {/* The model loads in the background, with no fallback UI on mobile
              or slow networks */}
          <Suspense fallback={null}>
            <PointCloud />
          </Suspense>

          <div className="hero__content">
            <div className="hero__inner">
              <div className="hero__eyebrow-row">
                <span className="hero__eyebrow-rule" />
                <span className="hero__eyebrow">The Disciples of God</span>
              </div>

              {/* the cross glyph is the "T", so the heading's only text is "DG".
                  Name it explicitly or the page's h1 reads as "DG" */}
              <h1 className="hero__wordmark" aria-label="TDG">
                <span className="hero__cross">
                  <CrossGlyph variant="hero" />
                </span>
                <span className="hero__dg">DG</span>
              </h1>

              <Tagline />

              <div className="hero__ctas">
                <a href="#apps" className="hero__cta">
                  Explore our work{' '}
                  <span className="hero__cta-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
                <a href="#origin" className="hero__cta hero__cta--ghost">
                  Our origin
                </a>
              </div>
            </div>
          </div>

          <div className="hero__strip">
            <div className="hero__strip-inner">
              <div className="hero__meta">
                <span>Est. 2016</span>
                <span className="hero__meta-div" />
                <span>Apps · Tools · Games</span>
                <span className="hero__meta-div" />
                <span>Jesus Is King</span>
              </div>
              <div className="hero__meta">
                <span>Scroll</span>
                <span className="hero__scroll-arrow">↓</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
