import { useEffect, useRef } from 'react'
import { onFrame, wake } from '../../lib/motion'
import { MAX_DPR, onDprChange } from '../../lib/dpr'

type Mote = { x: number; y: number; z: number; phase: number; speed: number; sway: number }

/** Density multiplier for the midnight hero look. */
const DENSITY = 1.7
const BEAM_ANGLE = 21
/** These crawl at 4–17 px/s. Nobody can tell 24Hz from 60Hz, and it is 2.5x
 *  less canvas work for an identical result. */
const HZ = 24

/**
 * Dust motes, visible only where the hero's light shaft rakes the frame.
 * Not a starfield in the literal sense. The beam is what makes them read.
 */
export function Starfield() {
  const canvas = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    // The BACKING store's size, which is what the same-size guard in `fit`
    // compares. Not the CSS box: a DPR change moves these two and leaves the
    // CSS box exactly where it was, so comparing the CSS box would let the one
    // resize that is not a resize through and stop the one that is.
    // `scene/Snow.tsx` and `hero/PointCloud.tsx` compare the same two numbers.
    let backW = 0
    let backH = 0
    let motes: Mote[] = []

    let pending = 0
    /* `settled` is a claim about what is currently ON this canvas, so anything
       that can falsify it has to say so. Three things can, and each one ends by
       calling `invalidate`: `fit` writing `cv.width`, the DPR watcher going
       through that same `fit`, and the theme swap below. `scene/Snow.tsx`'s
       header carries the long version of why a canvas is not a thing you can
       stop drawing and assume stays drawn. */
    let settled = false
    const invalidate = () => {
      settled = false
      wake()
    }

    /**
     * Which ink the motes are drawn in, kept current by the attribute the
     * colours actually hang off rather than by React.
     *
     * This was a `useTheme()` read mirrored into a ref by a second effect, and
     * the drawing effect below has `[]` dependencies — so the ref moved and
     * nothing ever asked it again. With motion on that is invisible: the next
     * of 24 frames a second picks the new value up. At `mi === 0` there is no
     * next frame. The tick draws once, sets `settled`, and returns forever, so
     * a reduced-motion visitor who toggled the theme kept the old theme's dust
     * for the rest of the visit. **A ref was never the thing missing — the
     * repaint was.** `scene/Snow.tsx` closes the identical hole this way, and
     * `origin/OriginField.tsx` did before it was deleted.
     *
     * The attribute is safe to read at THIS line, and that is worth checking
     * rather than assuming: `ThemeProvider` writes it from a parent effect,
     * which runs after this child's, but `index.html` has already set it from
     * `localStorage` in a blocking head script — "before first paint so there
     * is no flash of the wrong scene" — and `<html>` ships with
     * `data-theme="dark"` besides. So the first read is the real theme, and
     * the provider's later write is a re-assert of the same value. The
     * observer is armed for the toggle, and would catch a wrong first read
     * anyway: its callback is a microtask, which lands before the frame the
     * `fit` below just woke.
     */
    let isLight = false
    const readTheme = () => {
      isLight = document.documentElement.getAttribute('data-theme') === 'light'
    }
    readTheme()
    const mo = new MutationObserver(() => {
      readTheme()
      invalidate()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    /** One mote, at a position the caller picks. Everything else about it is
     *  the mote's own identity — depth, drift rate, sway, phase — and it
     *  survives a resize, which is the whole point of splitting this out. */
    const makeMote = (x: number, y: number): Mote => ({
      x,
      y,
      z: Math.random(),
      phase: Math.random() * Math.PI * 2,
      speed: 0.06 + Math.random() * 0.22,
      sway: 6 + Math.random() * 22,
    })

    /**
     * The box changed size — which is NOT the same event as "seed a new
     * field", and this file used to treat them as one.
     *
     * The `ResizeObserver` was handed the seeding function directly, so every
     * callback rebuilt all 190 motes out of `Math.random()`: dragging the
     * window wider re-dealt the entire field, repeatedly, mid-drag, in the
     * hero — where it is the most visible canvas on the site rather than the
     * least. `scene/Snow.tsx` had exactly this bug and its own header carries
     * the long version; this is that fix, brought back to the file it was
     * copied from. Three things follow from splitting the two jobs apart.
     *
     * **Nothing already drifting is thrown away.** Every mote keeps its
     * identity and its position is scaled into the new box, so the field
     * re-FITS. Only the count follows the area budget: surplus motes are
     * trimmed off the end and a box that grew is topped up, seeded across the
     * whole box because a handful arriving among a hundred and ninety is
     * invisible beside the thing this replaced.
     *
     * **A resize that is not one costs nothing.** `ResizeObserver` always
     * fires once on `observe`, so before the guard, mounting did two full
     * seeds and two array allocations. The guard compares the BACKING store,
     * so a DPR change still gets through while a CSS-box no-op does not.
     *
     * **And a resize that IS one has to invalidate the reduced-motion
     * frame.** Assigning `cv.width` blanks the canvas whether or not the value
     * changed, and at `mi === 0` this subscriber returns early forever once
     * `settled` is true — so a reduced-motion visitor who resized the window
     * would have lost the dust for the rest of the visit with no code path
     * left to bring it back. `Snow.tsx` names this as one of the three ways a
     * canvas silently blanks itself. Clearing `settled` and waking the loop
     * for one frame is the answer there and is the answer here.
     */
    const fit = () => {
      const cw = cv.clientWidth
      const ch = cv.clientHeight
      // No layout, no buffers, and no re-deal. This also means a box that is
      // briefly zero — print, a hidden ancestor — comes back with the field it
      // left rather than a new one.
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
        for (const m of motes) {
          m.x *= sx
          m.y *= sy
        }
      }
      const n = Math.min(190, Math.round(((w * h) / 11000) * DENSITY))
      if (n < motes.length) motes.length = n
      while (motes.length < n) motes.push(makeMote(Math.random() * w, Math.random() * h))
      // the two width/height writes above just blanked the canvas
      invalidate()
    }
    fit()

    const ro = new ResizeObserver(fit)
    ro.observe(cv)
    // The observer cannot see a scaling change on its own. See lib/dpr.ts.
    const unwatchDpr = onDprChange(fit)

    const tan = Math.tan((BEAM_ANGLE * Math.PI) / 180)
    // The hero is pinned, so this canvas's own rect stays in the viewport for
    // as long as the section is anywhere near it — which is a poor guard, and
    // by construction the section runs a whole viewport PAST the point where
    // Origin has covered everything in it. `data-eclipsed` is Hero.tsx's
    // answer to exactly that, and an onFrame subscriber cannot see the
    // `visibility: hidden` Hero.css turns it into. An attribute read forces no
    // layout, so this is cheaper than the rect below it.
    const host = cv.closest('.hero')

    const stop = onFrame(({ now, mi, dt, hold }) => {
      if (host?.hasAttribute('data-eclipsed')) return
      // the hero is the only place these are visible, so stop once it scrolls away
      if (cv.getBoundingClientRect().bottom <= 0) return
      // Reduced motion: paint the field once and let the loop park. The motes
      // freeze in place already, but their brightness used to keep oscillating.
      if (mi === 0 && settled) return
      if (mi > 0) hold()
      pending += dt
      if (mi > 0 && pending < 1 / HZ) return
      pending = 0
      settled = mi === 0
      const t = now * 0.001
      const span = h + 40
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = isLight ? 'rgb(20,20,26)' : 'rgb(214,232,255)'

      for (const m of motes) {
        const y = mi === 0 ? m.y : (m.y - ((t * m.speed * 60) % span) + span) % span
        const sway = mi === 0 ? 0 : Math.sin(t * 0.5 + m.phase) * m.sway
        const px = m.x + sway
        // horizontal distance from the beam's centreline at this height
        const beamX = w * 0.604 + y * tan
        const d = Math.abs(px - beamX) / (w * 0.17)
        const inBeam = Math.max(0, 1 - d * d)
        if (inBeam < 0.02) continue
        // the third motion term, gated like y and sway, or reduced motion still twinkles
        const flicker = mi === 0 ? 0.85 : 0.55 + 0.45 * Math.sin(t * 1.1 + m.phase)
        ctx.globalAlpha =
          Math.min(1, inBeam * flicker * (0.18 + m.z * 0.62)) *
          (1 - y / (h * 1.35)) *
          (isLight ? 0.5 : 1)
        ctx.beginPath()
        ctx.arc(px, y, 0.35 + m.z * 1.25, 0, Math.PI * 2)
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
  }, [])

  return <canvas ref={canvas} className="hero__stars" aria-hidden="true" />
}
