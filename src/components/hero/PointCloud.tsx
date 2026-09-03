import { useEffect, useRef, useState } from 'react'
import { onFrame, wake } from '../../lib/motion'
import { MAX_DPR, onDprChange } from '../../lib/dpr'
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
 * How long the canvas may go without having its WHOLE picture pushed, in
 * seconds of painted time.
 *
 * See `resync` below for what this is defending. It is a heartbeat, not the
 * mechanism: every cause anyone has a name for — a theme flip, a tab coming
 * back, a lost 2D context, a bfcache restore — pushes the full frame on the
 * spot. This is what catches the one nobody has a name for yet, and it turns
 * "corrupt until reload" into "corrupt for under two seconds".
 *
 * It costs one full `putImageData` per 2s against ~30 partial ones per second,
 * and only while the model is on screen and painting at all.
 */
const RESYNC_S = 2

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
 *
 * Because only that region is pushed, the canvas is the accumulation of many
 * frames rather than the product of one, and the pixels between them are the
 * browser's to keep. It does not always keep them — see the `resync` ref,
 * which is what repairs the surface when it does not.
 */
export function PointCloud() {
  const { theme } = useTheme()
  const wrap = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const [label, setLabel] = useState({ index: 1, name: 'Jesus' })
  const [labelVisible, setLabelVisible] = useState(true)
  const themeRef = useRef(theme)
  /**
   * A theme change asks for the very next frame, cap or no cap.
   *
   * The sky behind this canvas is a `background-image` and snaps on the frame
   * `data-theme` changes (Hero.css says why), while the points are painted at
   * IDLE_HZ from an accumulator — so the next paint could be anywhere from 0
   * to 33ms away, and for those frames the cross sat white on a pale sky, or
   * ink on a dark one. One flag: set here, honoured once by the tick below,
   * and it bypasses the cap AND the reduced-motion "painted once, stop" rest,
   * because a visitor who asked for less motion still asked for the right
   * colour.
   */
  const repaint = useRef(false)
  /**
   * Push the WHOLE picture on the next paint, not just the rectangle that
   * changed.
   *
   * ── the bug this exists for ──────────────────────────────────────────────
   * Every other canvas on this site — `hero/Starfield`, `scene/Snow` — opens
   * its frame with `clearRect` and redraws all of it, so whatever the browser
   * did to the backing store between frames is gone by the next one. This one
   * does not: it splats into `acc`, colours only the union of what it cleared
   * and what it drew, and hands the canvas that one rectangle. Every pixel
   * outside it is *trusted to still be there* — which is a promise the app
   * cannot keep, because it is not the only writer. A GPU context loss, a
   * driver reset, the canvas hibernation Chrome runs on a tab that has been in
   * the background, a compositor tile dropped under memory pressure: any of
   * them can leave the surface holding something the app never painted, and
   * because the next frames only ever push their own small rectangle, the
   * damage is PERMANENT. What that looks like was reported after a light/dark
   * switch and is exactly diagnostic: the model's box goes flat black, and the
   * cross eats a ragged, staircase-edged hole in it as the dirty rects of the
   * following seconds punch through one at a time.
   *
   * ── why one flag is the whole fix ────────────────────────────────────────
   * `image` is not a scratch buffer — it is a pixel-exact mirror of what the
   * canvas is supposed to be showing. Every write to `img32` is followed by a
   * `putImageData` of that same rectangle, and nothing else ever draws here,
   * so the invariant "the canvas equals `image`" is either true or the browser
   * broke it. `ctx.putImageData(image, 0, 0)` therefore repairs any damage
   * exactly, at any moment, for the cost of one full upload — no re-projection,
   * no re-splatting, no state to rebuild.
   *
   * So the fast path stays exactly as it was, and the full push is asked for
   * whenever the surface stops being trustworthy: a theme change (below), the
   * tab becoming visible, a bfcache restore, a lost-and-restored 2D context,
   * a resize, and a RESYNC_S heartbeat for everything unnamed.
   */
  const resync = useRef(true)
  useEffect(() => {
    themeRef.current = theme
    repaint.current = true
    // The reported failure followed a toggle, so the toggle is the one moment
    // this must not be merely likely to heal.
    resync.current = true
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
    // draw time, and the two numbers are NOT the same because the two themes
    // are not the same blend — see below.
    const alphas = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const s = 0.6 + Math.random() * 0.8
      scales[i] = s
      alphas[i] = Math.min(1, 0.45 + s * 0.5)
    }
    const DARK_OPACITY = 0.92
    /**
     * ── the light cloud is LIT now, and that changed the blend with it ────
     *
     * It used to be `INK` — near-black specks composited source-over, because
     * a dark speck on a pale sky is the only thing that can be seen if the
     * speck is not allowed to glow. The site owner's verdict on the result was
     * "the black on it that it currently has looks horrible", and they are
     * right: the cross in the Cebu hero is the ONE object in the frame the
     * page is actually about, and it was rendered as soot.
     *
     * So it is white-into-gold now (`TOP`/`FOOT` below), and the moment the
     * ink is brighter than the sky the blend has to follow. Source-over caps a
     * pixel at the alpha of the brightest point that touched it, so a bright
     * cloud drawn that way is a haze that never builds; additive is what makes
     * two points on one pixel worth twice one point, and the crowded middle of
     * a bar burn out solid. That bloom IS the glow — no filter, no shadow,
     * just the same accumulation dark has used since this file was written.
     *
     * 1 rather than dark's 0.92, and it is the pale sky that asks for the
     * extra: dark's white burns against L* 6, light's against L* 84, so the
     * same accumulation buys far less separation here. `.hero__model` carries
     * the other half — a radial of the section's own text ink behind the
     * canvas (Hero.css) that takes the sky under the cross down about
     * fourteen points of L*. Between the two the cross reads as a light
     * source; with either one alone it reads as a smudge, which is measured
     * rather than guessed: at 0.86 with no ground behind it the render showed
     * a gold spray with no form in it at all.
     */
    const LIGHT_OPACITY = 1

    const WHITE = packRGB(255, 255, 255)
    /* ── the light theme's ramp, top of the canvas to the bottom ───────────
       White at the head and warm gold at the foot, so the cloud carries the
       same top-down gradient the wordmark's own `CrossGlyph` does and reads as
       lit from the sky rather than tinted flat. Two packed colours and a lerp
       per row — the inner loop indexes a row's colour once, so this costs one
       table lookup per scanline and nothing per pixel. */
    const TOP = { r: 255, g: 255, b: 255 }
    const FOOT = { r: 255, g: 209, b: 122 }

    let index = 0
    let next = 0
    let phase: 'hold' | 'morph' = 'hold'
    let clock = 0
    let pending = 0 // unrendered time, for the frame cap
    let sinceSync = 0 // painted time since the last full push; see RESYNC_S
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
      // That argument is the one `lib/dpr.ts` states for the whole site, and
      // it was written from this file — where it used to be a bare literal
      // with no name on it, in the one place that owned the reasoning.
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
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
      // `image` is a new buffer and the canvas a new surface; the two are only
      // known to agree once one full frame has crossed between them.
      resync.current = true
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(holder)
    // Dragged onto a monitor with different OS scaling, the CSS size of the
    // canvas has not moved, so the observer above never fires. See lib/dpr.ts.
    const unwatchDpr = onDprChange(resize)

    // ── surface repair ────────────────────────────────────────────────────
    // The named ways the backing store stops matching `image`. See the
    // `resync` ref above for what goes wrong when none of these is wired and
    // why re-pushing the mirror is the whole repair.
    const repair = () => {
      resync.current = true
      // bypasses the frame cap and the reduced-motion "painted once" rest
      repaint.current = true
      // the loop parks when nothing is moving, and a lost surface is not
      // something it can observe on its own
      wake()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') repair()
    }
    document.addEventListener('visibilitychange', onVisible, { passive: true })
    window.addEventListener('pageshow', repair, { passive: true })
    // A 2D context restores itself unless the loss event is cancelled, and the
    // canvas comes back blank — so take the default and repaint into it.
    cv.addEventListener('contextrestored', repair)

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
      if (still && settled && !repaint.current) return applyFade
      if (!still) hold()

      pending += dt
      if (!drag.on && !still && pending < 1 / IDLE_HZ && !repaint.current) return applyFade
      const step = pending
      pending = 0
      settled = still
      repaint.current = false

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
        // Rule 9's exemption, taken: a one-shot delay before a React state
        // flip, not a paint — the label's fade is CSS, and its text should
        // change once the old one has gone, a quarter-second after the morph
        // starts. Counting that on this tick's clock would work too; a timer
        // keeps a state write out of the paint path. Cleared on the next
        // morph and on unmount, so it never outlives the canvas.
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
            // additive in BOTH themes now, exactly like the reference's
            // 'lighter' blend. Light used to be source-over because its ink
            // was darker than its sky; it is brighter than its sky now, and a
            // bright cloud that cannot compound is a haze. See LIGHT_OPACITY.
            acc[at] = acc[at] + v
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

      // One full push every RESYNC_S of painted time, on top of the named
      // repairs. `sinceSync` counts the same `step` the animation does, so a
      // model that is parked or faded out is not paying for a heartbeat.
      sinceSync += step
      if (sinceSync >= RESYNC_S) {
        sinceSync = 0
        resync.current = true
      }
      const pushAll = resync.current

      if (!image) return applyFade
      // A frame with nothing to redraw still owes the canvas a full push if one
      // is pending — that is the case where the model has come to rest and the
      // damage would otherwise sit there.
      if (!pushAll && (ux1 < ux0 || uy1 < uy0)) return applyFade

      /* One colour per SCANLINE in light — white at the top of the canvas
         easing to gold at the bottom — and one colour for the whole cloud in
         dark. The lerp is hoisted out of the x loop, so the per-pixel cost is
         identical to the single-constant version it replaces. */
      const denom = H > 1 ? H - 1 : 1
      for (let y = uy0; y <= uy1; y++) {
        const row = y * W
        let rgb = WHITE
        if (light) {
          const t = y / denom
          rgb = packRGB(
            (TOP.r + (FOOT.r - TOP.r) * t) | 0,
            (TOP.g + (FOOT.g - TOP.g) * t) | 0,
            (TOP.b + (FOOT.b - TOP.b) * t) | 0,
          )
        }
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
        if (pushAll) {
          // cleared here rather than at the read above, so a repair asked for
          // on a frame that never reached its write survives to the next one
          resync.current = false
          ctx.putImageData(frame, 0, 0)
        } else {
          ctx.putImageData(frame, 0, 0, rx0, ry0, rw, rh)
        }
      }
    })

    return () => {
      stop()
      ro.disconnect()
      unwatchDpr()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', repair)
      cv.removeEventListener('contextrestored', repair)
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
