import { useEffect, useRef, useState } from 'react'
import { onFrame } from '../../lib/motion'
import { useTheme } from '../../theme/ThemeProvider'
import { buildShapes } from './shapes'

/**
 * The reference draws 4200 points. That is a lot of sprite blits per frame, so
 * scale it to what the device can comfortably paint — the form stays legible
 * well below the full count.
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

/**
 * Sprite atlas.
 *
 * Drawing 4000 points meant 4000 `globalAlpha` writes and 4000 *scaled*
 * drawImage calls a frame, which is what a canvas is worst at. Instead every
 * combination of brightness and on-screen size is pre-rendered once, so the
 * hot loop is a straight 1:1 blit with no state changes at all.
 */
const ALPHA_STEPS = 6
const SIZE_STEPS = 12
const MIN_PX = 1
const MAX_PX = 9

/** Falls out of the reference's fragment shader: smoothstep(0.5, 0.06, d). */
const PROFILE: [number, number][] = [
  [0, 1],
  [0.12, 1],
  [0.3, 0.895],
  [0.5, 0.606],
  [0.7, 0.278],
  [0.85, 0.077],
  [1, 0],
]

type Atlas = { sprites: HTMLCanvasElement[][]; px: number[] }

function buildAtlas(color: string, maxAlpha: number, dpr: number): Atlas {
  const px: number[] = []
  const sprites: HTMLCanvasElement[][] = []
  for (let a = 0; a < ALPHA_STEPS; a++) {
    const alpha = (maxAlpha * (a + 1)) / ALPHA_STEPS
    const row: HTMLCanvasElement[] = []
    for (let s = 0; s < SIZE_STEPS; s++) {
      const cssSize = MIN_PX + ((MAX_PX - MIN_PX) * s) / (SIZE_STEPS - 1)
      if (a === 0) px.push(cssSize)
      const dim = Math.max(2, Math.round(cssSize * dpr))
      const c = document.createElement('canvas')
      c.width = dim
      c.height = dim
      const g = c.getContext('2d')!
      const grad = g.createRadialGradient(dim / 2, dim / 2, 0, dim / 2, dim / 2, dim / 2)
      for (const [at, profile] of PROFILE) {
        grad.addColorStop(at, `rgba(${color},${(profile * alpha).toFixed(4)})`)
      }
      g.fillStyle = grad
      g.fillRect(0, 0, dim, dim)
      row.push(c)
    }
    sprites.push(row)
  }
  return { sprites, px }
}

/**
 * The hero model: a point cloud that morphs between twelve forms on a loop.
 *
 * Interaction contract — it rotates *only* while the left mouse button is held
 * and dragged, never on hover. The drag carries inertia and X rotation is
 * clamped so the form can never tumble past readable.
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
    // brightness is fixed per point, so its atlas row can be resolved once
    const alphaRow = new Uint8Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const s = 0.6 + Math.random() * 0.8
      scales[i] = s
      const rel = Math.min(1, 0.45 + s * 0.5)
      alphaRow[i] = Math.min(ALPHA_STEPS - 1, Math.max(0, Math.round(rel * ALPHA_STEPS) - 1))
    }

    let index = 0
    let next = 0
    let phase: 'hold' | 'morph' = 'hold'
    let clock = 0

    // rotation: an ambient drift plus whatever the visitor has dragged in
    const drag = { on: false, x: 0, y: 0, vx: 0, vy: 0, rx: 0, ry: 0 }

    let atlas: Record<'dark' | 'light', Atlas> | null = null
    const buildAtlases = (dpr: number) => {
      atlas = {
        dark: buildAtlas('255,255,255', 0.92, dpr),
        light: buildAtlas('20,20,26', 0.72, dpr),
      }
    }

    let w = holder.clientWidth || 520
    let h = holder.clientHeight || 520
    let dpr = 1
    const resize = () => {
      w = holder.clientWidth || 520
      h = holder.clientHeight || 520
      // A soft point cloud gains nothing from 2x, and it costs 4x the fill.
      const next = Math.min(window.devicePixelRatio || 1, 1.5)
      if (next !== dpr || !atlas) buildAtlases(next)
      dpr = next
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(holder)

    // ── drag ──────────────────────────────────────────────────────────────
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
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
      drag.ry += dx * 0.0072
      drag.rx += dy * 0.005
      drag.vx = dx * 0.0072
      drag.vy = dy * 0.005
    }
    const up = () => {
      if (!drag.on) return
      drag.on = false
      holder.style.cursor = 'grab'
    }
    holder.addEventListener('pointerdown', down)
    holder.addEventListener('pointermove', move)
    holder.addEventListener('pointerup', up)
    holder.addEventListener('pointercancel', up)

    // ── frame ─────────────────────────────────────────────────────────────
    let hero: HTMLElement | null = null
    const focal = 1 / Math.tan(((FOV * Math.PI) / 180) / 2)

    const stop = onFrame(({ vh, mi, dt, now }) => {
      // Below 640px the wrapper is display:none — never pay for a hidden model.
      if (!cv.width || !cv.height || !holder.offsetParent) return

      // the model fades out as the hero sinks; stop grabbing once it is faint
      hero ??= document.getElementById('top')
      let opacity = 1
      if (hero) {
        const p = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / (vh || 800)))
        opacity = Math.max(0, 1 - p * 1.35)
      }
      // CSS multiplies this by --model-cap so the tablet dim-down still fades
      const applyFade = () => {
        holder.style.setProperty('--fade', String(opacity))
        holder.style.pointerEvents = opacity > 0.2 ? 'auto' : 'none'
      }
      if (opacity <= 0) return applyFade

      clock += dt * (0.35 + mi * 0.65)

      if (phase === 'hold' && clock >= HOLD) {
        clock = 0
        phase = 'morph'
        from.set(pos)
        next = (index + 1) % shapes.length
        to.set(shapes[next].pts)
        setLabelVisible(false)
        window.setTimeout(() => {
          setLabel({ index: next + 1, name: shapes[next].name })
          setLabelVisible(true)
        }, 250)
      } else if (phase === 'morph') {
        const p = Math.min(1, clock / MORPH)
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
        const swirl = Math.sin(e * Math.PI) * 0.55 * (0.4 + mi * 0.6)
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

      const drift = now * 0.00016 * (0.3 + mi * 0.7)
      if (!drag.on) {
        drag.ry += drag.vx
        drag.rx += drag.vy
        drag.vx *= 0.945
        drag.vy *= 0.945
      }
      drag.rx = Math.max(-1.15, Math.min(1.15, drag.rx))
      const ry = drift + drag.ry
      const rx = Math.sin(drift * 0.7) * 0.16 + drag.rx

      const light = themeRef.current === 'light'
      const { sprites, px } = (light ? atlas?.light : atlas?.dark) ?? { sprites: [], px: [] }
      if (!sprites.length) return applyFade

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter'

      const cosY = Math.cos(ry)
      const sinY = Math.sin(ry)
      const cosX = Math.cos(rx)
      const sinX = Math.sin(rx)
      const halfW = w / 2
      const halfH = h / 2
      const sizeSpan = (SIZE_STEPS - 1) / (MAX_PX - MIN_PX)

      for (let i = 0, k = 0; i < COUNT; i++, k += 3) {
        const x0 = pos[k]
        const y0 = pos[k + 1]
        const z0 = pos[k + 2]
        // rotate Y, then X — matches the reference's Euler order
        const x1 = x0 * cosY + z0 * sinY
        const z1 = -x0 * sinY + z0 * cosY
        const y1 = y0 * cosX - z1 * sinX
        const z2 = y0 * sinX + z1 * cosX
        const depth = CAM_Z - z2
        if (depth < 0.2) continue
        const inv = 1 / depth
        const sx = halfW + focal * x1 * inv * halfH
        const sy = halfH - focal * y1 * inv * halfH

        let step = ((POINT_SIZE * scales[i] * inv - MIN_PX) * sizeSpan + 0.5) | 0
        if (step < 0) step = 0
        else if (step >= SIZE_STEPS) step = SIZE_STEPS - 1

        const half = px[step] * 0.5
        // 1:1 blit — no scaling, no per-point state change
        ctx.drawImage(sprites[alphaRow[i]][step], sx - half, sy - half, px[step], px[step])
      }

      return applyFade
    })

    return () => {
      stop()
      ro.disconnect()
      holder.removeEventListener('pointerdown', down)
      holder.removeEventListener('pointermove', move)
      holder.removeEventListener('pointerup', up)
      holder.removeEventListener('pointercancel', up)
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
