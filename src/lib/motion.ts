/**
 * One requestAnimationFrame loop drives the whole page.
 *
 * Everything reads element rects rather than a scroll offset, so the
 * choreography is independent of which element actually owns the scroll.
 */

export type Frame = {
  /** viewport height, measured once per frame */
  vh: number
  /** motion intensity multiplier, 0 when the visitor asked for less motion */
  mi: number
  /** high-resolution timestamp */
  now: number
  /** seconds since the previous frame, clamped to 50ms */
  dt: number
}

/**
 * A subscriber may return a write function. Every subscriber is measured
 * first, then every write runs — one layout flush per frame instead of one
 * per subscriber.
 */
type Tick = (frame: Frame) => void | (() => void)

const ticks = new Set<Tick>()
const writes: (() => void)[] = []
let rafId = 0
let last = 0
let frames = 0

/** How many frames the shared loop has run. Zero means rAF is parked. */
export const framesRun = () => frames

/** 0–1.5; scales parallax and takeover amounts. 1 is the designed feel. */
let intensity = 1
let reduced = false

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** The multiplier every motion consumer should respect. 0 disables motion. */
export function motionIntensity(): number {
  return reduced ? 0 : Math.max(0, Math.min(1.5, intensity))
}

export function setMotionIntensity(value: number) {
  intensity = value
}

function run(now: number) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  last = now
  frames++
  const frame: Frame = { vh: window.innerHeight || 800, mi: motionIntensity(), now, dt }

  // read phase — subscribers measure and stash their writes
  writes.length = 0
  for (const tick of ticks) {
    const write = tick(frame)
    if (write) writes.push(write)
  }
  // write phase — nothing here reads layout, so nothing forces a re-flow
  for (const write of writes) write()

  rafId = requestAnimationFrame(run)
}

/** Subscribe to the shared loop. Returns an unsubscribe function. */
export function onFrame(tick: Tick): () => void {
  ticks.add(tick)
  if (!rafId) {
    last = 0
    rafId = requestAnimationFrame(run)
  }
  return () => {
    ticks.delete(tick)
    if (ticks.size === 0 && rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }
}

if (typeof window !== 'undefined') {
  reduced = prefersReducedMotion()
  try {
    window
      .matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', (e) => {
        reduced = e.matches
      })
  } catch {
    /* older Safari — the initial read is good enough */
  }
}

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
