import { useEffect, useRef, type JSX } from 'react'
import { onFrame, wake } from '../../lib/motion'
import { MAX_DPR, onDprChange } from '../../lib/dpr'

type Flake = {
  x: number
  y: number
  /** Depth, 0..1. Everything else about a flake is derived from it. */
  z: number
  size: number
  /** px per second */
  speed: number
  alpha: number
  sway: number
  swayRate: number
  phase: number
}

/**
 * Snow falls at 14-60 px/s here. Above about 30Hz that is identical to the eye
 * and the canvas work is proportional, so this is the cap. `Starfield` runs at
 * 24 because its dust crawls at 4-17 px/s; the same argument, a different
 * answer, because the number is a property of the motion and not a house
 * style. At 30Hz the fastest flake moves 2px between frames, which is under
 * its own diameter.
 */
const HZ = 30

/** One flake per this many CSS px² before the machine and density scaling. */
const AREA_PER_FLAKE = 13000

/** Ceiling however big the viewport or the density argument gets. `Starfield`
 *  caps at 190 motes; snow is bigger and more opaque per particle, so fewer. */
const MAX_FLAKES = 170

const TAU = Math.PI * 2

/**
 * How many flakes this machine should be asked to draw.
 *
 * Same shape as `PointCloud`'s `pointBudget`, and the same reasoning: the look
 * survives a much smaller count, so the count is what gives way on a machine
 * that cannot spare the fill. A narrow viewport is treated as a weak machine
 * because on this site it usually is one.
 */
function flakeBudget(w: number, h: number, density: number) {
  const cores = navigator.hardwareConcurrency ?? 4
  const narrow = window.innerWidth < 900
  const machine = cores <= 4 || narrow ? 0.55 : cores <= 8 ? 0.8 : 1
  const n = Math.round(((w * h) / AREA_PER_FLAKE) * machine * density)
  return Math.max(0, Math.min(MAX_FLAKES, n))
}

/**
 * Pull an `r,g,b` triple out of a token so a per-particle alpha can be applied
 * to it. The alternative is a literal colour in a component, which is right in
 * exactly one theme — rule 2.
 *
 * Lifted from `origin/OriginField.tsx`, which is gone: it was deleted this
 * pass and this helper outlived it. The live example of the same move is
 * `origin/CabinScene.tsx`'s `parseColor`/`readPalette` pair, which reads its
 * whole palette off the section the same way and for the same reason. It is
 * the one to copy if you need a third, and it is stricter than this: it
 * returns null rather than a fallback colour, on the grounds that a scene
 * that declines to draw beats a scene drawn in colours this site never chose.
 * This one takes a fallback instead, because a canvas that declines to draw
 * is a blank rectangle rather than an absence. What that fallback is and why
 * it is not a design colour is stated at the call site, not here.
 */
function readRGB(el: Element, varName: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(varName).trim()
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  return m ? `${m[1]},${m[2]},${m[3]}` : fallback
}

/**
 * Falling snow on a 2D canvas, at about the cost of a gradient.
 *
 * ```tsx
 * <Stage className="walk__stage">
 *   <CabinScene className="walk__cabin" />
 *   <div className="walk__flakes">
 *     <Snow className="walk__flakes-canvas" density={NEAR_SNOW} />
 *   </div>
 * </Stage>
 * ```
 *
 * That is `Walk.tsx`, and it is the only caller. It is worth reading as a
 * pair rather than as an example: the cabin's three.js scene draws snow of its
 * own with real depth, between the trees and in front of them, and this canvas
 * is the layer in front of ALL of it — a few larger, faster flakes crossing the
 * frame close to the reader. Two snowfalls at two depths, which is how layered
 * snow works and is not the same thing as drawing it twice. Order inside the
 * stage is the whole of the z-order: both canvases are `position: absolute` with
 * no `z-index`, so the later one paints over the earlier one, and `.shell`'s
 * `z-index: 1` keeps both of them off the copy. `Origin.css` has the density
 * and the per-theme opacity.
 *
 * It also means the section keeps its weather when WebGL does not arrive.
 * `CabinScene` needs a context and a browser may decline to give it one; this
 * needs a 2D canvas, so a visitor on the fallback path still gets snow rather
 * than a bare band. That makes "quiet and correct on its own" a requirement
 * here and not a nicety — do not tune this layer against the cabin's.
 *
 * The canvas takes its size from CSS and nothing else, so **the caller has to
 * give it one** — a canvas with no CSS size is 300x150 and this will faithfully
 * put four flakes in it. `density` scales the count around 1 and is clamped to
 * 0..3; the count itself comes from the canvas area, the core count and the
 * viewport width, and is capped.
 *
 * `hero/Starfield.tsx` is the pattern and the budget, and everything expensive
 * about a particle field is already answered there: capped Hz,
 * `devicePixelRatio` capped at 1.5, and the draw done inside the `onFrame`
 * tick rather than in a returned write closure — a canvas draw forces no
 * layout, so it does not need the write phase, and putting it there would only
 * delay it by one pass.
 *
 * ## It checks its own visibility, because nothing else can
 *
 * `useOffscreenPause` stamps `data-live` and `base.css` turns that into
 * `animation-play-state: paused` — and an `onFrame` subscriber never sees an
 * attribute. `Stage`'s own `data-covered` cannot reach it either, for exactly
 * the same reason. So this measures the box it lives in every frame and
 * returns before it draws OR holds when that box is off screen — the nearest
 * `section`, or the canvas itself when there is none, which is the walk's
 * case. And because the walk's canvas is a sticky pin that stays on screen
 * for the whole pinned run, it also parks while the wrapper its caller fades
 * has been written to nothing; the tick says why.
 *
 * Nothing catches up when it comes back — and for a while that sentence was
 * only half true, which is worth writing down because the half that was false
 * was invisible in every test short of leaving the section and returning.
 *
 * The FALL was always right: `pending` accumulates `dt` only after the
 * visibility check, so a field left mid-fall resumes exactly where it stopped
 * rather than jumping forward by however long the reader spent elsewhere. The
 * SWAY was not. It read `performance.now()` straight off the frame, so the
 * sideways term kept running while nothing was being drawn: come back after 40
 * seconds away and `sin(now * swayRate)` had advanced through several whole
 * cycles, and every flake's x jumped by up to `2 x sway` in the single frame
 * that painted next. The same jump fired on a reduced-motion `0 -> 1` flip,
 * where the term is gated off and the clock behind it was not.
 *
 * So the sway is driven by `elapsed`, which is integrated exactly the way the
 * fall is — one accumulator, advanced by the same `step * mi` inside the same
 * drawn frame, and by nothing else. A frame that returns early advances
 * neither. There is no wall clock left in this file.
 *
 * ## "Still snow", and why that is not the same as a paused animation
 *
 * At `motionIntensity() === 0` the field is drawn once, with every
 * time-varying term evaluated at zero — no fall, no sway — and then the
 * subscriber returns without holding and the loop parks. The flakes rest at
 * their seeded positions, which are spread evenly through the box, so it reads
 * as snow suspended in the air: the section keeps its weather, which is what
 * guardrail 5 of the art kit asks for ("reduced motion leaves the art composed
 * and still, visible where it landed").
 *
 * What it is NOT is "stop drawing and leave whatever is on the canvas". That
 * is a claim about a canvas, and three things falsify it silently — a resize
 * and a DPR change both write `cv.width`, which BLANKS the canvas, and a theme
 * swap re-reads the colours and paints with none of them. A reduced-motion
 * visitor who resized the window would have lost the snow for the rest of the
 * visit with no code path left that could bring it back. So each of the three
 * clears `settled` and calls `wake()` for one more frame.
 *
 * `origin/OriginField.tsx` used to carry the long version of this bug and was
 * deleted this pass, so the paragraph above is now where it lives — this file
 * is the record, not a pointer at one. `origin/CabinScene.tsx`, the three.js
 * scene that replaced that file, had to answer the same bug again from
 * scratch, which is the argument for writing it down here rather than in a
 * commit message.
 */
export function Snow({
  className,
  density = 1,
}: {
  className?: string
  density?: number
}): JSX.Element {
  const canvas = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const amount = Math.max(0, Math.min(3, density))
    // The section is what "can this be seen" is really about. A Snow inside a
    // Stage is sticky, so its own rect stays pinned to the viewport for as long
    // as the section is anywhere near it and would be a poor guard. `?? cv`
    // covers a Snow placed outside a section.
    const box: Element = cv.closest('section') ?? cv

    let w = 0
    let h = 0
    // The BACKING store's size, which is what the same-size guard in `fit`
    // compares. Not the CSS box: a DPR change moves these two and leaves the
    // CSS box exactly where it was, so comparing the CSS box would let the one
    // resize that is not a resize through and stop the one that is.
    let backW = 0
    let backH = 0
    let flakes: Flake[] = []

    /*
     * `settled` is a claim about what is currently ON the canvas, and anything
     * that can falsify it has to say so. See the header.
     */
    let settled = false
    const invalidate = () => {
      settled = false
      wake()
    }

    // Only the hue is wanted: --glow carries this theme's own alpha (0.2 dark,
    // 0.16 light) and each flake needs its own. Reading the token rather than
    // writing rgb(214,232,255) is what makes one line of code right in both
    // themes — rule 2. The fallback is a plain white, and it is a fallback for
    // a token that failed to resolve, not a design colour.
    let rgb = '255,255,255'
    /*
     * ── the three numbers that make snow into petals ──────────────────────
     * `--flake-ink` is the flake's hue (falling back to --glow's, which is
     * what this read was before the Cebu theme); `--flake-scale` multiplies
     * every flake's radius and `--flake-drift` its fall rate. All three live
     * in tokens.css per theme, so one canvas, one flake count and one loop
     * are snow at night and kalachuchi petals by day — bigger, slower, blush —
     * without a second component or a re-seed at the flip. Read at mount and
     * on the theme attribute, never in the tick.
     */
    let scale = 1
    let drift = 1
    const readNumber = (name: string, fallback: number) => {
      const n = Number.parseFloat(getComputedStyle(cv).getPropertyValue(name))
      return Number.isFinite(n) && n > 0 ? n : fallback
    }
    const readColors = () => {
      rgb = readRGB(cv, '--flake-ink', readRGB(cv, '--glow', rgb))
      scale = readNumber('--flake-scale', 1)
      drift = readNumber('--flake-drift', 1)
    }
    readColors()
    const mo = new MutationObserver(() => {
      readColors()
      invalidate()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    /** One flake, at a position the caller picks. One depth drives everything
     *  else, so a flake is never big and slow or small and bright — which is
     *  what makes a flat field read as deep. */
    const makeFlake = (x: number, y: number): Flake => {
      const z = Math.random()
      return {
        x,
        y,
        z,
        size: 0.6 + z * 2.1,
        speed: 14 + z * 46,
        alpha: 0.16 + z * 0.5,
        sway: 4 + z * 13,
        swayRate: 0.3 + z * 0.45,
        phase: Math.random() * TAU,
      }
    }

    /**
     * The box changed size — which is NOT the same event as "seed a new field",
     * and this file used to treat them as one.
     *
     * The `ResizeObserver` was handed the seeding function directly, so every
     * callback rebuilt all 170 flakes out of `Math.random()`: dragging a window
     * wider re-dealt the whole field, repeatedly, mid-drag. What a reader saw
     * was the snow blinking to a different snow rather than following the
     * window. Two things follow from splitting the two jobs apart.
     *
     * **Nothing already falling is thrown away.** Every flake keeps its
     * identity — its depth and the five values derived from it — and its
     * position is scaled into the new box, so the field re-FITS. Only the count
     * follows the budget: surplus flakes are trimmed off the end, and a box
     * that grew is topped up. The added ones are seeded across the whole box
     * rather than above its top edge, because a handful arriving among thirty
     * is invisible beside the thing this replaced, and the alternative is a
     * second code path for a case nobody watches.
     *
     * **A resize that is not one costs nothing.** `ResizeObserver` always fires
     * once on `observe`, so before the guard, mounting did two full resizes and
     * two array allocations. `lib/motion.ts` skips its own first callback for
     * exactly this and says so; `hero/PointCloud.tsx` compares the same two
     * backing-store numbers this does. (`hero/Starfield.tsx` is the pattern for
     * everything else in this file and was the one place that still had
     * neither. It has both now — this fix was carried back to it in a later
     * pass, which is why the two `fit`s read alike.)
     */
    const fit = () => {
      const cw = cv.clientWidth
      const ch = cv.clientHeight
      // No layout, no buffers — `hero/PointCloud.tsx`'s guard, for the same
      // reason. A canvas with no CSS size is 300x150, and this would
      // faithfully allocate for it and put four flakes in it. `Stage` hides a
      // covered stage with `visibility` precisely so this box stays
      // measurable, so inside one this only ever fires before first layout.
      if (!cw || !ch) return
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const bw = Math.round(cw * dpr)
      const bh = Math.round(ch * dpr)
      if (bw === backW && bh === backH) return
      backW = bw
      backH = bh
      // Read before w/h move. Zero on the very first fit, which is the one
      // call that has nothing to carry across.
      const sx = w ? cw / w : 0
      const sy = h ? ch / h : 0
      w = cw
      h = ch
      cv.width = bw
      cv.height = bh
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (sx) {
        for (const f of flakes) {
          f.x *= sx
          f.y *= sy
        }
      }
      const n = flakeBudget(w, h, amount)
      if (n < flakes.length) flakes.length = n
      while (flakes.length < n) flakes.push(makeFlake(Math.random() * w, Math.random() * h))
      // the two width/height writes above just blanked the canvas
      invalidate()
    }
    fit()

    const ro = new ResizeObserver(fit)
    ro.observe(cv)
    // The observer cannot see a scaling change on its own. See lib/dpr.ts.
    const unwatchDpr = onDprChange(fit)

    let pending = 0
    /**
     * The field's own clock, in seconds, and the only time this file keeps.
     *
     * It is advanced by the same `step * mi` the fall is, inside the same drawn
     * frame, so a frame that returns early — off screen, under the Hz cap, or
     * parked at `mi === 0` — advances neither. See the header for the bug this
     * replaced: reading `performance.now()` here teleported every flake
     * sideways after any pause.
     */
    let elapsed = 0

    const stop = onFrame(({ vh, mi, dt, hold }) => {
      const r = box.getBoundingClientRect()
      // Neither draw nor hold while nobody can see it.
      if (r.bottom <= 0 || r.top >= vh) return
      /*
       * ── parked behind a wrapper faded to nothing ──────────────────────────
       * `Walk.tsx` fades this layer out through the cabin door by writing
       * `opacity` on the wrapper around the canvas, and the wrapper stays at 0
       * for the whole of the interior — Apps and Tools, most of the pinned
       * run. The box guard above cannot see that: in the walk there is no
       * `section` ancestor, so the box is the canvas itself, which is the
       * sticky pin and is on screen for as long as the pin holds. Measured
       * before this line: parked on the Apps cards, the canvas was cleared
       * and redrawn thirty times a second and held the whole frame loop awake
       * to do it, for a layer nobody could see.
       *
       * The wrapper's INLINE opacity, read off `style` rather than computed:
       * no layout, no style flush, and it is the one writer's own value. An
       * empty string is the layer at its stylesheet rest — the reduced-motion
       * frame, or a wrapper nothing has written to yet — and is not parked.
       * Before `pending += dt`, so the fall resumes exactly where it stopped
       * when the reader scrolls back out to the approach: a park is a pause,
       * not a gap, which is the same rule the box guard keeps.
       */
      const veil = (cv.parentElement as HTMLElement | null)?.style.opacity ?? ''
      if (veil !== '' && Number(veil) <= 0) return
      if (mi === 0 && settled) return
      if (mi > 0) hold()

      pending += dt
      // Reduced motion skips the cap: there is exactly one frame to paint and
      // it should not wait a thirtieth of a second for it.
      if (mi > 0 && pending < 1 / HZ) return
      const step = pending
      pending = 0
      settled = mi === 0
      // The sway's clock, integrated exactly like the fall below it. Both
      // terms therefore stop and restart together, and neither can advance
      // through a frame that was never drawn.
      elapsed += step * mi

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = `rgb(${rgb})`

      for (const f of flakes) {
        if (mi > 0) {
          f.y += f.speed * step * mi * drift
          if (f.y - f.size * scale > h) {
            // Back to the top with a new x, so the field never settles into
            // visible columns the way a straight wrap does.
            f.y = -f.size
            f.x = Math.random() * w
          }
        }
        // The second motion term, gated exactly like the fall — leave it live
        // and reduced motion still drifts sideways forever.
        const x = mi === 0 ? f.x : f.x + Math.sin(elapsed * f.swayRate + f.phase) * f.sway
        ctx.globalAlpha = f.alpha
        ctx.beginPath()
        ctx.arc(x, f.y, f.size * scale, 0, TAU)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    })

    return () => {
      stop()
      ro.disconnect()
      unwatchDpr()
      mo.disconnect()
    }
  }, [density])

  return <canvas ref={canvas} className={className} aria-hidden="true" />
}
