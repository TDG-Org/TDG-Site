import { useEffect, useRef } from 'react'
import { onFrame } from '../../lib/motion'

/**
 * A perspective-projected point field behind the story timeline. Same
 * hand-rolled 2D-canvas 3D technique as the hero's PointCloud (rotate,
 * project, splat), scaled down to an ambient count instead of a centrepiece.
 * No three.js, no WebGL. This is the site's own proven "reads as 3D"
 * approach, not the one from the rejected Passage section.
 *
 * The rotation has two parts: a slow ambient drift (like PointCloud's idle
 * spin) plus an offset tied to how far the visitor has scrolled through the
 * section, so the field visibly turns as you read, which is the "3D scrolling" ask.
 */
const COUNT = 130
const FOV = 50
const CAM_Z = 3.2
const HZ = 30
const MAX_DPR = 1.5
const WARM_SHARE = 0.32

function readRGB(el: Element, varName: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(varName).trim()
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  return m ? `${m[1]},${m[2]},${m[3]}` : fallback
}

export function StoryField() {
  const canvas = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const section = cv.closest('section')
    if (!section) return

    const xs = new Float32Array(COUNT)
    const ys = new Float32Array(COUNT)
    const zs = new Float32Array(COUNT)
    const sizes = new Float32Array(COUNT)
    const warm = new Uint8Array(COUNT)
    const order = new Int32Array(COUNT)
    const depthOf = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      xs[i] = Math.random() * 2 - 1
      ys[i] = Math.random() * 2 - 1
      zs[i] = Math.random() * 2 - 1
      sizes[i] = 0.5 + Math.random()
      warm[i] = Math.random() < WARM_SHARE ? 1 : 0
      order[i] = i
    }

    let coolRGB = '214,232,255'
    let warmRGB = '245,201,138'
    const readColors = () => {
      coolRGB = readRGB(section, '--glow', coolRGB)
      warmRGB = readRGB(section, '--story-glow-warm', warmRGB)
    }
    readColors()
    const mo = new MutationObserver(readColors)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    let W = 0
    let H = 0
    const resize = () => {
      W = cv.clientWidth || 1
      H = cv.clientHeight || 1
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)

    const focal = 1 / Math.tan((FOV * Math.PI) / 180 / 2)
    let pending = 0
    let settled = false
    let ry = 0
    let rx = 0

    const stop = onFrame(({ vh, mi, dt, now, hold }) => {
      const r = section.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= vh) return
      if (mi === 0 && settled) return
      if (mi > 0) hold()
      pending += dt
      if (mi > 0 && pending < 1 / HZ) return
      pending = 0
      settled = mi === 0

      // 0 as the section's top reaches the viewport bottom, 1 as its bottom
      // reaches the viewport top. How far the visitor has scrolled through it.
      const scrollP = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)))
      ry = now * 0.00003 * mi + scrollP * 1.4
      rx = Math.sin(now * 0.00002) * 0.1 * mi

      ctx.clearRect(0, 0, W, H)
      const halfW = W / 2
      const halfH = H / 2
      const scale = focal * halfH
      const cosY = Math.cos(ry)
      const sinY = Math.sin(ry)
      const cosX = Math.cos(rx)
      const sinX = Math.sin(rx)

      for (let i = 0; i < COUNT; i++) {
        const z1 = -xs[i] * sinY + zs[i] * cosY
        depthOf[i] = ys[i] * sinX + z1 * cosX
      }
      // farthest first, so nearer points draw over them
      const idx = Array.from(order)
      idx.sort((a, b) => depthOf[b] - depthOf[a])

      for (const i of idx) {
        const x1 = xs[i] * cosY + zs[i] * sinY
        const z1 = -xs[i] * sinY + zs[i] * cosY
        const y1 = ys[i] * cosX - z1 * sinX
        const z2 = depthOf[i]
        const depth = CAM_Z - z2
        if (depth < 0.3) continue
        const inv = 1 / depth
        const cx = halfW + x1 * inv * scale
        const cy = halfH - y1 * inv * scale
        if (cx < -20 || cx > W + 20 || cy < -20 || cy > H + 20) continue
        const size = Math.max(0.4, Math.min(3, sizes[i] * inv * 2.2))
        const alpha = Math.max(0, Math.min(0.8, inv * 0.5))
        ctx.fillStyle = `rgba(${warm[i] ? warmRGB : coolRGB},${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(cx, cy, size, 0, Math.PI * 2)
        ctx.fill()
      }
    })

    return () => {
      stop()
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  return <canvas ref={canvas} className="story__field" aria-hidden="true" />
}
