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

/**
 * True while the loop is asleep because nothing needs a frame.
 *
 * Nothing on the page calls this and nothing should: it is here to be ASKED,
 * from a console or a check, because "did the loop actually park?" is the one
 * claim in the header above that a screenshot cannot settle. AGENTS.md §7 asks
 * for measurement rather than eyeballing, and this is the measurement.
 */
export const isParked = () => rafId === 0

/**
 * The intensity knob, and what it is worth today.
 *
 * `motionIntensity()` clamps to 0–1.5, and 1.5 is reachable only through
 * `setMotionIntensity` — which nothing in this repo calls. So on the shipped
 * site this value is exactly 1, or 0 for a visitor who asked for less motion,
 * and every subscriber's `mi` is one of those two numbers.
 *
 * The knob is kept rather than removed because the clamp is the contract for
 * anything that ever turns it: above 1.5 the hero takeover overshoots its own
 * section and below 0 layers travel the wrong way. Do not read the range as a
 * feature the page uses — read it as the range a future caller may use.
 */
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

/**
 * The only writer of `intensity`. Nothing calls it yet; see the note there for
 * why the knob is kept. It wakes the loop because a multiplier that changed
 * while the page was parked would otherwise not be painted until the next
 * scroll.
 */
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
  //
  // And the catch is PER SUBSCRIBER, not around the loop. One try around the
  // whole frame kept the loop alive but let the first throw skip every
  // subscriber after it and drop every write already collected — so a single
  // subscriber throwing every frame (a detached ref after a route change is
  // the usual shape) froze every layer registered after it, for the life of
  // the page, while the header promised the opposite. Now the one that threw
  // is the only one that misses its frame.
  try {
    // read phase: subscribers measure and stash their writes
    writes.length = 0
    for (const tick of ticks) {
      try {
        const write = tick(frame)
        if (write) writes.push(write)
      } catch (err) {
        console.error('[motion] subscriber threw', err)
      }
    }
    // write phase: nothing here reads layout, so nothing forces a re-flow
    for (let i = 0; i < writes.length; i++) {
      try {
        writes[i]()
      } catch (err) {
        console.error('[motion] write threw', err)
      }
    }
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

/**
 * A per-frame lerp rate, expressed per second, so 144Hz feels like 60Hz.
 *
 * ```ts
 * current += (target - current) * settle(0.16, dt)
 * ```
 *
 * The naive form is `current += (target - current) * 0.16` — a fixed fraction
 * of the remaining distance every FRAME, which makes the settle a function of
 * the display rather than of time. 0.16 per frame leaves 3% of the error after
 * twenty frames: a third of a second at 60Hz and 0.14s at 144Hz. The same code
 * reads as weight on one machine and as a snap on another, and the machine it
 * is written on is usually the fast one.
 *
 * Raising the per-frame survival `(1 - rate)` to `dt * 60` makes `rate` mean
 * "this fraction of the remaining distance per sixtieth of a second", so the
 * curve through real time is the same at 30, 60 and 144Hz. `dt` is already
 * clamped to 50ms above, so a backgrounded tab cannot make this jump.
 *
 * **It is here because it had five copies.** `hooks/useParallax`,
 * `hooks/usePointer`, `components/Hero`, `components/origin/CabinScene` and
 * `components/Cursor` each reached the identical expression on their own, and
 * two of them carried a comment asserting there was "one settle on this site"
 * — which is what builders who cannot see each other write. A correction to
 * the curve would have landed in one copy and silently not the other four, and
 * **the divergence is only visible above 60Hz**: correct on the machine of
 * whoever changed it, wrong on every faster one.
 *
 * **`Cursor` was the fifth and was found last, which is the whole failure mode
 * happening to this very comment.** The count above said four for three
 * passes, and the copy it missed is the custom cursor — the one animated thing
 * on EVERY page of the site, including the four routes with no scroll-linked
 * scenery at all. It was `1 - Math.pow(1 - 0.19, dt * 60)` written out, behind
 * a reduced-motion snap, in a file that already imported from here. So the
 * sentence "a correction would land in one copy and silently not the others"
 * was true of this list as well as of the arithmetic. If you add a caller, add
 * it here; if you are reading this to check the number, the population is
 * `grep -rn 'settle(' src/` minus this file's own two mentions.
 */
export const settle = (rate: number, dt: number) => 1 - Math.pow(1 - rate, dt * 60)
