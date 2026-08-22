import { useEffect, useRef } from 'react'
import { onFrame } from '../../lib/motion'
import { onDprChange } from '../../lib/dpr'
import { useTheme } from '../../theme/ThemeProvider'

type Mote = { x: number; y: number; z: number; phase: number; speed: number; sway: number }

/** Density multiplier for the midnight hero look. */
const DENSITY = 1.7
const BEAM_ANGLE = 21
/** These crawl at 4–17 px/s. Nobody can tell 24Hz from 60Hz, and it is 2.5x
 *  less canvas work for an identical result. */
const HZ = 24
/** Sub-pixel dust gains nothing from a retina backing store. */
const MAX_DPR = 1.5

/**
 * Dust motes, visible only where the hero's light shaft rakes the frame.
 * Not a starfield in the literal sense. The beam is what makes them read.
 */
export function Starfield() {
  const { theme } = useTheme()
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const light = theme === 'light'
  const lightRef = useRef(light)
  useEffect(() => {
    lightRef.current = light
  }, [light])

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let motes: Mote[] = []

    const seed = () => {
      w = cv.clientWidth || 1
      h = cv.clientHeight || 1
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.min(190, Math.round(((w * h) / 11000) * DENSITY))
      motes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random(),
        phase: Math.random() * Math.PI * 2,
        speed: 0.06 + Math.random() * 0.22,
        sway: 6 + Math.random() * 22,
      }))
    }
    seed()

    const ro = new ResizeObserver(seed)
    ro.observe(cv)
    // The observer cannot see a scaling change on its own. See lib/dpr.ts.
    const unwatchDpr = onDprChange(seed)

    const tan = Math.tan((BEAM_ANGLE * Math.PI) / 180)

    let pending = 0
    let settled = false
    const stop = onFrame(({ now, mi, dt, hold }) => {
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
      const isLight = lightRef.current
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
    }
  }, [])

  return <canvas ref={canvas} className="hero__stars" aria-hidden="true" />
}
