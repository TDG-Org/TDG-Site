import { useEffect, useRef, useState } from 'react'
import { onFrame } from '../../lib/motion'
import { onDprChange } from '../../lib/dpr'
import { useTheme } from '../../theme/ThemeProvider'
import { buildShapes } from './shapes'

/**
 * The reference draws 4200 points. Scale it to what the device can comfortably
 * paint. The form stays legible well below the full count.
 */
function pointBudget() {
  if (typeof window === 'undefined') return 4200
  const cores = navigator.hardwareConcurrency ?? 4
  const narrow = window.innerWidth < 1100
  if (cores <= 4 || narrow) return 2400
  if (cores <= 8) return 3400
  return 4200
}

const FOV = 38
const CAM_Z = 7.4
const POINT_SIZE = 15
const HOLD = 2.15
const MORPH = 1.45
const MIN_PX = 1
const MAX_PX = 9

/**
 * The cloud drifts at ~0.16 rad/s and a morph takes 1.45s. Neither needs
 * display refresh rate; at 30Hz the motion is identical to the eye and the
 * work halves. A drag is different, because it tracks a hand, so it runs uncapped.
 */
const IDLE_HZ = 30

/**
 * The point profile, straight out of the reference's fragment shader:
 * smoothstep(0.5, 0.06, d) where d is distance in point-size units.
 * Indexed by (r / radius)² so the hot loop never calls sqrt.
 */
const LUT_N = 256
const PROFILE = new Float32Array(LUT_N + 1)
for (let i = 0; i <= LUT_N; i++) {
  const u = Math.sqrt(i / LUT_N) // r / radius, 0..1
  const t = Math.max(0, Math.min(1, (0.5 - u * 0.5) / 0.44))
  PROFILE[i] = t * t * (3 - 2 * t)
}

/** Pack an RGB triple the way a Uint32 view over ImageData expects it. */
function packRGB(r: number, g: number, b: number) {
  const probe = new Uint8ClampedArray(4)
  probe[0] = r
  probe[1] = g
  probe[2] = b
  probe[3] = 0
  return new Uint32Array(probe.buffer)[0]
}

/**
 * The hero model: a point cloud that morphs between twelve forms on a loop.
 *
 * Interaction contract: it rotates *only* while the left mouse button is held
 * and dragged, never on hover. The drag carries inertia and X rotation is
 * clamped so the form can never tumble past readable.
 *
 * Rendering: every point is splatted into one alpha buffer and the frame is
 * handed to the canvas as a single putImageData over the region that actually
 * changed. The obvious implementation, one drawImage per point, spent 72% of
 * the page's entire CPU budget on canvas call overhead alone.
 */
export function PointCloud() {
  const { theme } = useTheme()
  const wrap = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const [label, setLabel] = useState({ index: 1, name: 'Jesus' })
  const [labelVisible, setLabelVisible] = useState(true)
  const themeRef = useRef(theme)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    const cv = canvas.current
    const holder = wrap.current
    if (!cv || !holder) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const COUNT = pointBudget()
    const shapes = buildShapes(COUNT)
    const pos = new Float32Array(shapes[0].pts)
    const from = new Float32Array(shapes[0].pts)
    const to = new Float32Array(shapes[0].pts)
    const scales = new Float32Array(COUNT)
    // per-point brightness is fixed; the theme's base opacity is applied at
    // draw time (0.92 additive on dark, 0.72 over on light, matching the reference's
    // uOpacity uniform)
    const alphas = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const s = 0.6 + Math.random() * 0.8
      scales[i] = s
      alphas[i] = Math.min(1, 0.45 + s * 0.5)
    }
    const DARK_OPACITY = 0.92
    const LIGHT_OPACITY = 0.72

    const WHITE = packRGB(255, 255, 255)
    const INK = packRGB(20, 20, 26)

    let index = 0
    let next = 0
    let phase: 'hold' | 'morph' = 'hold'
    let clock = 0
    let pending = 0 // unrendered time, for the frame cap
    let settled = false // reduced motion: one frame painted, nothing more to do
    let labelTimer = 0 // cleared on unmount so a late swap cannot outlive us

    // rotation: an ambient drift plus whatever the visitor has dragged in
    const drag = { on: false, x: 0, y: 0, vx: 0, vy: 0, rx: 0, ry: 0 }

    // ── buffers ───────────────────────────────────────────────────────────
    let W = 0
    let H = 0
    let dpr = 1
    let acc = new Float32Array(0)
    let image: ImageData | null = null
    let img32 = new Uint32Array(0)
    // region of the canvas that currently holds ink
    let px0 = 0
    let py0 = 0
    let px1 = -1
    let py1 = -1

    const resize = () => {
      const cw = holder.clientWidth
      const ch = holder.clientHeight
      // Below 640px the wrapper is display:none. Substituting a 520px default
      // here allocated ~4 MB of canvas buffers on every phone for a model that
      // is never painted. No layout means no buffers; the ResizeObserver fires
      // again if it ever gains one.
      if (!cw || !ch) {
        W = 0
        H = 0
        return
      }
      // A soft point cloud gains nothing from 2x, and it costs 4x the fill.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const nw = Math.round(cw * dpr)
      const nh = Math.round(ch * dpr)
      if (nw === W && nh === H) return
      W = nw
      H = nh
      cv.width = W
      cv.height = H
      acc = new Float32Array(W * H)
      image = ctx.createImageData(W, H)
      img32 = new Uint32Array(image.data.buffer)
      px0 = 0
      py0 = 0
      px1 = -1
      py1 = -1
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(holder)
    // Dragged onto a monitor with different OS scaling, the CSS size of the
    // canvas has not moved, so the observer above never fires. See lib/dpr.ts.
    const unwatchDpr = onDprChange(resize)

    // ── drag ──────────────────────────────────────────────────────────────
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      // Without this, a drag that crosses the label underneath starts a native
      // text-selection instead of rotating the model, or as well as.
      e.preventDefault()
      drag.on = true
      drag.x = e.clientX
      drag.y = e.clientY
      drag.vx = 0
      drag.vy = 0
      holder.style.cursor = 'grabbing'
      try {
        holder.setPointerCapture(e.pointerId)
      } catch {
        /* capture is a nicety, not a requirement */
      }
    }
    const move = (e: PointerEvent) => {
      if (!drag.on) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      drag.x = e.clientX
      drag.y = e.clientY
      drag.ry += dx * 0.0058
      drag.rx += dy * 0.004
      drag.vx = dx * 0.0058
      drag.vy = dy * 0.004
    }
    const up = () => {
      if (!drag.on) return
      drag.on = false
      holder.style.cursor = 'grab'
    }
    holder.addEventListener('pointerdown', down)
    holder.addEventListener('pointermove', move)
    // Release is bound to the window, not the element: pointer capture is
    // best-effort, and a release outside the model would otherwise latch
    // drag.on true forever, defeating the frame cap and pinning the loop.
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)

    // ── frame ─────────────────────────────────────────────────────────────
    /*
     * The model fades on the COPY's clock, not the section's.
     *
     * `#top` is 230svh tall now and pinned — `Hero.css`'s `min-height` on
     * `.hero` is where that is declared, so read it there — which means
     * `-#top.top / vh` would take more than two viewports of scrolling to
     * reach 1 and the model would still be at two-thirds opacity when Origin
     * had already covered it. That is both wrong to look at and 100svh of 3D
     * projection painted behind an opaque section. `.hero__above` is the box
     * whose height is the pin's travel and whose bottom edge is the seam, and
     * `height - vh` is the runway the copy dissolves over. Fading on that
     * puts the model out at the same moment the wordmark goes, and the
     * `opacity <= 0` return below then stops every point of the work.
     *
     * `?? #top` is the fallback for a PointCloud mounted outside that box.
     */
    let hero: HTMLElement | null = null
    const focal = 1 / Math.tan(((FOV * Math.PI) / 180) / 2)
    let lastFade = -1
    let lastGrab = -1

    const stop = onFrame(({ vh, mi, dt, now, hold }) => {
      // Below 640px the wrapper is display:none. Never pay for a hidden model.
      if (!W || !H || !holder.offsetParent) return

      // the model fades out as the hero sinks; stop grabbing once it is faint
      hero ??= holder.closest('.hero__above') ?? document.getElementById('top')
      let opacity = 1
      if (hero) {
        const r = hero.getBoundingClientRect()
        const runway = Math.max(1, r.height - vh) || vh || 800
        const p = Math.max(0, Math.min(1, -r.top / runway))
        opacity = Math.max(0, 1 - p * 1.35)
      }
      const grabbable = opacity > 0.2 ? 1 : 0
      // CSS multiplies --fade by --model-cap so the tablet dim-down still fades.
      // Only touch the DOM when the value actually changed.
      const applyFade =
        opacity === lastFade && grabbable === lastGrab
          ? undefined
          : () => {
              lastFade = opacity
              lastGrab = grabbable
              holder.style.setProperty('--fade', opacity.toFixed(3))
              holder.style.pointerEvents = grabbable ? 'auto' : 'none'
            }
      if (opacity <= 0) return applyFade

      // Reduced motion means still, not slower: paint the form once and let the
      // loop park. Without this the model kept drifting AND held the loop awake
      // forever for exactly the people who asked for less of both.
      const still = mi === 0 && !drag.on
      if (still && settled) return applyFade
      if (!still) hold()

      pending += dt
      if (!drag.on && !still && pending < 1 / IDLE_HZ) return applyFade
      const step = pending
      pending = 0
      settled = still

      // Proportional in mi, not affine: at mi = 1 these are identical to the
      // reference (0.35 + 0.65, 0.3 + 0.7, 0.4 + 0.6 all reach 1.0), and at
      // mi = 0 they are genuinely zero instead of 35% speed.
      clock += step * mi

      if (phase === 'hold' && clock >= HOLD) {
        clock = 0
        phase = 'morph'
        from.set(pos)
        next = (index + 1) % shapes.length
        to.set(shapes[next].pts)
        setLabelVisible(false)
        window.clearTimeout(labelTimer)
        labelTimer = window.setTimeout(() => {
          setLabel({ index: next + 1, name: shapes[next].name })
          setLabelVisible(true)
        }, 250)
      } else if (phase === 'morph') {
        const p = Math.min(1, clock / MORPH)
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
        const swirl = Math.sin(e * Math.PI) * 0.55 * mi
        for (let k = 0; k < pos.length; k += 3) {
          const x = from[k] + (to[k] - from[k]) * e
          const y = from[k + 1] + (to[k + 1] - from[k + 1]) * e
          const z = from[k + 2] + (to[k + 2] - from[k + 2]) * e
          const a = k * 0.013 + e * 3.0
          pos[k] = x + Math.sin(a) * swirl * 0.34
          pos[k + 1] = y + Math.cos(a * 1.3) * swirl * 0.34
          pos[k + 2] = z + Math.sin(a * 0.7) * swirl * 0.5
        }
        if (p >= 1) {
          pos.set(to)
          index = next
          phase = 'hold'
          clock = 0
        }
      }

      const drift = now * 0.00016 * mi
      if (!drag.on) {
        drag.ry += drag.vx
        drag.rx += drag.vy
        // decay per second of wall clock, not per frame, so the throw feels the
        // same at 30Hz, 60Hz and 144Hz
        const decay = Math.pow(0.945, step * 60)
        drag.vx *= decay
        drag.vy *= decay
        if (Math.abs(drag.vx) < 1e-5) drag.vx = 0
        if (Math.abs(drag.vy) < 1e-5) drag.vy = 0
      }
      drag.rx = Math.max(-1.15, Math.min(1.15, drag.rx))
      const ry = drift + drag.ry
      const rx = Math.sin(drift * 0.7) * 0.16 + drag.rx

      const light = themeRef.current === 'light'
      const baseOpacity = light ? LIGHT_OPACITY : DARK_OPACITY

      // clear only what we inked last time
      if (px1 >= px0) {
        for (let y = py0; y <= py1; y++) {
          acc.fill(0, y * W + px0, y * W + px1 + 1)
        }
      }
      const oldX0 = px0
      const oldY0 = py0
      const oldX1 = px1
      const oldY1 = py1

      let nx0 = W
      let ny0 = H
      let nx1 = -1
      let ny1 = -1

      const cosY = Math.cos(ry)
      const sinY = Math.sin(ry)
      const cosX = Math.cos(rx)
      const sinX = Math.sin(rx)
      const halfW = W / 2
      const halfH = H / 2
      const scale = focal * halfH
      const minD = MIN_PX * dpr
      const maxD = MAX_PX * dpr
      const sizeK = POINT_SIZE * dpr

      for (let i = 0, k = 0; i < COUNT; i++, k += 3) {
        const x0 = pos[k]
        const y0 = pos[k + 1]
        const z0 = pos[k + 2]
        // rotate Y, then X, matching the reference's Euler order
        const x1 = x0 * cosY + z0 * sinY
        const z1 = -x0 * sinY + z0 * cosY
        const y1 = y0 * cosX - z1 * sinX
        const z2 = y0 * sinX + z1 * cosX
        const depth = CAM_Z - z2
        if (depth < 0.2) continue
        const inv = 1 / depth
        const cx = halfW + x1 * inv * scale
        const cy = halfH - y1 * inv * scale

        let d = sizeK * scales[i] * inv
        if (d < minD) d = minD
        else if (d > maxD) d = maxD
        const r = d * 0.5

        let bx0 = Math.ceil(cx - r)
        let bx1 = Math.floor(cx + r)
        let by0 = Math.ceil(cy - r)
        let by1 = Math.floor(cy + r)
        if (bx0 < 0) bx0 = 0
        if (by0 < 0) by0 = 0
        if (bx1 > W - 1) bx1 = W - 1
        if (by1 > H - 1) by1 = H - 1
        if (bx0 > bx1 || by0 > by1) continue

        if (bx0 < nx0) nx0 = bx0
        if (by0 < ny0) ny0 = by0
        if (bx1 > nx1) nx1 = bx1
        if (by1 > ny1) ny1 = by1

        const a = alphas[i] * baseOpacity
        const invR2 = 1 / (r * r)
        for (let y = by0; y <= by1; y++) {
          const dy = y - cy
          const row = y * W
          const rest = r * r - dy * dy
          if (rest <= 0) continue
          for (let x = bx0; x <= bx1; x++) {
            const dx = x - cx
            const r2 = dx * dx + dy * dy
            if (r2 > r * r) continue
            const v = PROFILE[(r2 * invR2 * LUT_N) | 0] * a
            const at = row + x
            if (light) {
              // source-over: each point lays over what is already there
              const prev = acc[at]
              acc[at] = prev + v * (1 - prev)
            } else {
              // additive, exactly like the reference's 'lighter' blend
              acc[at] = acc[at] + v
            }
          }
        }
      }

      px0 = nx0
      py0 = ny0
      px1 = nx1
      py1 = ny1

      // repaint the union of what we cleared and what we drew
      const ux0 = oldX1 >= oldX0 ? Math.min(oldX0, nx0) : nx0
      const uy0 = oldY1 >= oldY0 ? Math.min(oldY0, ny0) : ny0
      const ux1 = oldX1 >= oldX0 ? Math.max(oldX1, nx1) : nx1
      const uy1 = oldY1 >= oldY0 ? Math.max(oldY1, ny1) : ny1
      if (ux1 < ux0 || uy1 < uy0 || !image) return applyFade

      const rgb = light ? INK : WHITE
      for (let y = uy0; y <= uy1; y++) {
        const row = y * W
        for (let x = ux0; x <= ux1; x++) {
          const at = row + x
          const v = acc[at]
          if (v <= 0) {
            img32[at] = 0
          } else {
            const alpha = v >= 1 ? 255 : (v * 255 + 0.5) | 0
            img32[at] = (alpha << 24) | rgb
          }
        }
      }

      const frame = image
      const rx0 = ux0
      const ry0 = uy0
      const rw = ux1 - ux0 + 1
      const rh = uy1 - uy0 + 1
      return () => {
        applyFade?.()
        ctx.putImageData(frame, 0, 0, rx0, ry0, rw, rh)
      }
    })

    return () => {
      stop()
      ro.disconnect()
      unwatchDpr()
      holder.removeEventListener('pointerdown', down)
      holder.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
      window.clearTimeout(labelTimer)
    }
  }, [])

  return (
    <div ref={wrap} className="hero__model">
      <canvas ref={canvas} className="hero__model-canvas" aria-hidden="true" />
      <div className="hero__model-label" data-visible={labelVisible}>
        <span>{String(label.index).padStart(2, '0')}</span>
        <span className="hero__model-dash" />
        <span>{label.name}</span>
      </div>
    </div>
  )
}
