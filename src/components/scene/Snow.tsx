import { useEffect, useRef, type JSX } from 'react'
import { onFrame, wake } from '../../lib/motion'
import { onDprChange } from '../../lib/dpr'

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

/** Sub-pixel snow gains nothing from a retina backing store, and it costs the
 *  square of the ratio in fill. Same cap as `Starfield` and `PointCloud`. */
const MAX_DPR = 1.5

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
 * <Stage className="building__stage">
 *   <Snow className="building__snow" density={0.8} />
 *   <ThemedArt art="landscapes/mountain-ridge" className="building__ridge" factor={0.05} />
 * </Stage>
 * ```
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
 * the same reason. So this measures the section it lives in every frame and
 * returns before it draws OR holds when the section is off screen. It is the
 * same box `Stage` guards on, so the two flip together.
 *
 * Nothing catches up when it comes back. Time is only accumulated after the
 * visibility check, so a field that was left mid-fall resumes exactly where it
 * stopped rather than jumping forward by however long the reader spent
 * elsewhere.
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
    const readColors = () => {
      rgb = readRGB(cv, '--glow', rgb)
    }
    readColors()
    const mo = new MutationObserver(() => {
      readColors()
      invalidate()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const seed = () => {
      w = cv.clientWidth || 1
      h = cv.clientHeight || 1
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const n = flakeBudget(w, h, amount)
      flakes = Array.from({ length: n }, () => {
        // One depth drives everything, so a flake is never big and slow or
        // small and bright — which is what makes a flat field read as deep.
        const z = Math.random()
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          size: 0.6 + z * 2.1,
          speed: 14 + z * 46,
          alpha: 0.16 + z * 0.5,
          sway: 4 + z * 13,
          swayRate: 0.3 + z * 0.45,
          phase: Math.random() * TAU,
        }
      })
      // the two width/height writes above just blanked the canvas
      invalidate()
    }
    seed()

    const ro = new ResizeObserver(seed)
    ro.observe(cv)
    // The observer cannot see a scaling change on its own. See lib/dpr.ts.
    const unwatchDpr = onDprChange(seed)

    let pending = 0

    const stop = onFrame(({ vh, mi, now, dt, hold }) => {
      const r = box.getBoundingClientRect()
      // Neither draw nor hold while nobody can see it.
      if (r.bottom <= 0 || r.top >= vh) return
      if (mi === 0 && settled) return
      if (mi > 0) hold()

      pending += dt
      // Reduced motion skips the cap: there is exactly one frame to paint and
      // it should not wait a thirtieth of a second for it.
      if (mi > 0 && pending < 1 / HZ) return
      const step = pending
      pending = 0
      settled = mi === 0

      const t = now * 0.001
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = `rgb(${rgb})`

      for (const f of flakes) {
        if (mi > 0) {
          f.y += f.speed * step * mi
          if (f.y - f.size > h) {
            // Back to the top with a new x, so the field never settles into
            // visible columns the way a straight wrap does.
            f.y = -f.size
            f.x = Math.random() * w
          }
        }
        // The second motion term, gated exactly like the fall — leave it live
        // and reduced motion still drifts sideways forever.
        const x = mi === 0 ? f.x : f.x + Math.sin(t * f.swayRate + f.phase) * f.sway
        ctx.globalAlpha = f.alpha
        ctx.beginPath()
        ctx.arc(x, f.y, f.size, 0, TAU)
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
