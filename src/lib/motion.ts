/**
 * One requestAnimationFrame loop drives the whole page, and it parks itself.
 *
 * Everything reads element rects rather than a scroll offset, so the
 * choreography is independent of which element actually owns the scroll.
 *
 * The loop only runs while there is work. Most of what it drives is
 * scroll-linked: it has nothing to do until the page moves. Anything genuinely
 * time-based (the hero model, the dust, a lerp still converging) calls
 * `frame.hold()` to keep the loop alive for another frame; everything else
 * simply returns, and once no subscriber holds, the loop stops asking for
 * frames and the browser stops running its rendering lifecycle entirely.
 *
 * Measured on this page: a reader parked mid-article went from 71ms of main
 * thread per second to 0.1ms.
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
  /** "I am animating, so keep the loop running." */
  hold: () => void
}

/**
 * A subscriber may return a write function. Every subscriber is measured
 * first, then every write runs. That is one layout flush per frame instead of one
 * per subscriber.
 */
type Tick = (frame: Frame) => void | (() => void)

/**
 * How long to keep running after an input event. Long enough that a scroll-
 * linked subscriber always gets a frame after the last scroll event, and that
 * the gaps in trackpad momentum do not park the loop mid-glide.
 */
const GRACE_MS = 320

const ticks = new Set<Tick>()
const writes: (() => void)[] = []
let rafId = 0
let last = 0
let frames = 0
let held = false
let awakeUntil = 0
let wired = false

/** Total frames the loop has ever run; zero means it has not run yet. */
export const framesRun = () => frames

/** True while the loop is asleep because nothing needs a frame. */
export const isParked = () => rafId === 0

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
  wake()
}

function markHeld() {
  held = true
}

// One frame object, mutated in place. A fresh literal every frame is garbage
// the collector has to come back for sixty times a second.
const frame: Frame = { vh: 800, mi: 1, now: 0, dt: 0, hold: markHeld }

function run(now: number) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  last = now
  frames++
  held = false
  frame.vh = window.innerHeight || 800
  frame.mi = motionIntensity()
  frame.now = now
  frame.dt = dt

  // One subscriber throwing must not take the page's motion with it. Without
  // the finally, the throw escapes before the loop re-arms, and because rafId
  // still holds the id of the callback we are already inside, nothing can ever
  // restart it. Every animation on the page would stop, silently.
  try {
    // read phase: subscribers measure and stash their writes
    writes.length = 0
    for (const tick of ticks) {
      const write = tick(frame)
      if (write) writes.push(write)
    }
    // write phase: nothing here reads layout, so nothing forces a re-flow
    for (let i = 0; i < writes.length; i++) writes[i]()
  } catch (err) {
    console.error('[motion] subscriber threw', err)
  } finally {
    writes.length = 0
    if (held || now < awakeUntil) {
      rafId = requestAnimationFrame(run)
    } else {
      // nothing left to do, so stop asking the browser for frames
      rafId = 0
      last = 0
    }
  }
}

/**
 * Bring the loop back for at least `ms`. Call this after anything that changes
 * what the page should look like but that the loop cannot observe by itself.
 */
export function wake(ms: number = GRACE_MS) {
  if (typeof window === 'undefined') return
  const until = performance.now() + ms
  if (until > awakeUntil) awakeUntil = until
  if (!rafId && ticks.size) {
    last = 0
    rafId = requestAnimationFrame(run)
  }
}

/**
 * Everything that can change what the page should be showing. Miss one of
 * these and the page looks frozen, so they are deliberately generous.
 */
function wireWakeSources() {
  if (wired || typeof window === 'undefined') return
  wired = true
  const opts = { passive: true, capture: true } as const
  const bump = () => wake()

  // capture:true so a scroll inside any nested scroller counts too
  window.addEventListener('scroll', bump, opts)
  window.addEventListener('wheel', bump, opts)
  window.addEventListener('touchmove', bump, opts)
  window.addEventListener('pointermove', bump, opts)
  window.addEventListener('pointerdown', bump, opts)
  window.addEventListener('pointerup', bump, opts)
  window.addEventListener('keydown', bump, opts)
  window.addEventListener('resize', bump, { passive: true })
  window.addEventListener('orientationchange', bump, { passive: true })
  window.addEventListener('focus', bump, { passive: true })
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible') wake(600)
    },
    { passive: true },
  )

  // Layout can also move without any input: a lazy image arriving, a webfont
  // swapping in, a section growing. Any of those changes the rects the
  // scroll-linked subscribers read, so watch the document's own size.
  window.addEventListener('load', () => wake(600), { passive: true, once: true })
  try {
    document.fonts?.ready.then(() => wake(600))
  } catch {
    /* no font loading API, so the load listener covers it */
  }
  try {
    let first = true
    new ResizeObserver(() => {
      // the observer always fires once on observe; that is not a change
      if (first) {
        first = false
        return
      }
      wake()
    }).observe(document.documentElement)
  } catch {
    /* no ResizeObserver, and input events still cover every realistic case */
  }
}

/** Subscribe to the shared loop. Returns an unsubscribe function. */
export function onFrame(tick: Tick): () => void {
  ticks.add(tick)
  wireWakeSources()
  // a new subscriber always gets a first frame to establish itself
  wake()
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
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      reduced = e.matches
      wake(1000)
    })
  } catch {
    /* older Safari, where the initial read is good enough */
  }
}

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
