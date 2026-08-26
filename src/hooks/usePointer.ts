import { useEffect } from 'react'
import { onFrame } from '../lib/motion'

/** Damped pointer position, -1..1 on each axis, 0 at the viewport centre. */
export type Pointer = { readonly x: number; readonly y: number }

/** Per-frame lerp rate expressed per second, so 144Hz feels like 60Hz.
 *  Deliberately the same shape as `useParallax`'s: one settle on this site. */
const settle = (rate: number, dt: number) => 1 - Math.pow(1 - rate, dt * 60)

/**
 * Slower than `useParallax`'s 0.16, and that difference is the point.
 *
 * A layer following the cursor is reacting to a hand rather than to the page,
 * and a hand changes direction far more sharply than a scroll does. At 0.16
 * the scenery snaps at every flick. 0.12 takes roughly 25 frames to settle,
 * which reads as weight instead of lag.
 */
const RATE = 0.12

/**
 * Below this the value can no longer change anything a consumer paints.
 *
 * The output is normalised, so a consumer multiplies it by an amplitude before
 * it reaches a pixel. At 0.0008 a layer would have to travel 1250px per unit
 * for the remaining error to be worth one pixel, and nothing on this page is
 * asked to move a tenth of that. Snapping here is what lets `hold()` stop.
 */
const EPSILON = 0.0008

/* -- one listener and one lerp for the whole page -------------------------
 *
 * Everything below is module state on purpose. Six consumers must not mean six
 * `pointermove` listeners and six copies of the same lerp computing the same
 * two numbers. They mean one of each, reference counted, and six reads of the
 * result -- and because the result is the same object every time, six reads of
 * one allocation.
 */
let rawX = 0
let rawY = 0
let seen = false
let curX = 0
let curY = 0
let consumers = 0
let detach: (() => void) | null = null

/**
 * The frozen accessor every consumer gets. Frozen rather than a plain object
 * because it is shared: a consumer assigning to `.x` would be moving every
 * other consumer's scenery.
 */
const POINTER: Pointer = Object.freeze({
  get x() {
    return curX
  },
  get y() {
    return curY
  },
})

const clamp1 = (n: number) => (n < -1 ? -1 : n > 1 ? 1 : n)

function attach() {
  consumers++
  if (consumers > 1) return

  /*
   * Coarse pointers get 0,0 and no listener at all.
   *
   * `(pointer: fine)` is `Cursor.tsx`'s test and this uses the same one, so
   * "does the visitor have a cursor" has one answer on this site rather than
   * two. A phone has no hover state to follow and fires `pointermove` only
   * during a drag, so without this the scenery would lurch sideways every time
   * somebody swiped the page -- the opposite of what a mouse-parallax layer is
   * for. `useTilt` refuses on `(hover: hover)` for the same reason; on every
   * real device the two agree, and where they can disagree (a laptop with a
   * touchscreen) `(pointer: fine)` is the one that answers for the PRIMARY
   * pointer, which is the one being followed.
   */
  if (!window.matchMedia('(pointer: fine)').matches) {
    detach = () => {}
    return
  }

  /*
   * -- why a listener at all, when rule 9 says not to add one --------------
   *
   * Rule 9 forbids a scroll listener and forbids animating outside the loop.
   * This listener does neither: it stores two integers and returns. A position
   * has to be captured from an event, because there is no other way to learn
   * where a pointer is -- and `motion.ts` already listens to `pointermove`
   * itself, as a wake source, so the loop is guaranteed awake for at least
   * GRACE_MS after the last move. That is what makes the split correct rather
   * than merely cheap: the event supplies the target, the loop supplies the
   * frames, and nothing is written outside the loop's write phase.
   *
   * The alternative -- lerping inside the listener and writing there -- is the
   * exact shape rule 9 exists to stop. It runs at pointer rate rather than
   * frame rate, it writes in the middle of an event rather than in the write
   * phase, and it has no way to keep animating after the last event, which is
   * precisely when a damped follower still has most of its travel left.
   *
   * The coordinates are stored UNNORMALISED. Normalising here would mean
   * reading `window.innerWidth` inside a pointer event, which can land in the
   * middle of another listener's style writes and force a synchronous layout:
   * `Cursor.tsx` writes the dot's transform from its own `pointermove`. The
   * division costs nothing in the read phase, which is where layout reads
   * belong.
   *
   * The pointer LEAVING the window deliberately does not recentre this. It was
   * the obvious nicety and it is wrong here -- a trip to the browser chrome, a
   * tab switch or a reach for the scrollbar would send every layer on the page
   * gliding back to centre and out again, so the scenery would animate most
   * visibly at the moments nobody is looking at it. The last position is the
   * honest answer for a pointer that has not moved.
   */
  const move = (e: PointerEvent) => {
    rawX = e.clientX
    rawY = e.clientY
    seen = true
  }
  window.addEventListener('pointermove', move, { passive: true })

  const stop = onFrame(({ vh, mi, dt, hold }) => {
    /*
     * Reduced motion is not a slower mouse parallax, it is none. Snap to the
     * identity rather than easing to it: an eased return IS motion, and the
     * one moment it would ever play is the moment somebody asked for less of
     * it. The step is instant, it happens once when the visitor flips the
     * setting, and `motion.ts` wakes the loop for that so it lands.
     */
    if (mi === 0) {
      curX = 0
      curY = 0
      return
    }
    // no pointer has been anywhere yet, so there is no target to converge on
    if (!seen) return

    const tx = clamp1((rawX / (window.innerWidth || 1)) * 2 - 1)
    const ty = clamp1((rawY / (vh || 1)) * 2 - 1)
    const dx = tx - curX
    const dy = ty - curY

    /*
     * Settled: land exactly on the target and stop holding. Without this the
     * lerp approaches asymptotically and never arrives, `hold()` runs forever,
     * and the page's headline number -- a parked reader at 0.1ms of main
     * thread per second -- becomes the cost of a page that never parks.
     */
    if (dx < EPSILON && dx > -EPSILON && dy < EPSILON && dy > -EPSILON) {
      curX = tx
      curY = ty
      return
    }

    hold()
    const k = settle(RATE, dt)
    curX += dx * k
    curY += dy * k
    // No write closure, because this subscriber touches no DOM at all. It sits
    // in the read phase because everything it reads is layout (innerWidth, vh)
    // and everything it writes is two numbers a consumer reads next.
  })

  detach = () => {
    window.removeEventListener('pointermove', move)
    stop()
    curX = 0
    curY = 0
    seen = false
  }
}

function release() {
  consumers--
  if (consumers > 0) return
  consumers = 0
  detach?.()
  detach = null
}

/**
 * Damped, normalised pointer position for mouse-parallax layers.
 *
 * `x` and `y` run -1..1 with 0 at the viewport centre.
 *
 * ```tsx
 * const pointer = usePointer()
 * const layer = useRef<HTMLDivElement | null>(null)
 * useEffect(
 *   () =>
 *     onFrame(() => {
 *       const el = layer.current
 *       if (!el) return
 *       const next = `${(pointer.x * 26).toFixed(2)}px ${(pointer.y * 14).toFixed(2)}px`
 *       return () => {
 *         el.style.translate = next
 *       }
 *     }),
 *   [pointer],
 * )
 * ```
 *
 * **It never causes a React render, and that is the contract rather than an
 * optimisation.** Returning state would re-render a whole section on every
 * mouse move -- several times a frame, for a decorative offset -- which is the
 * opposite of what this site does everywhere else. What comes back is a frozen
 * accessor over module state: the same object on every call and for every
 * consumer, read inside the consumer's OWN `onFrame` tick. Read during render
 * it gives you the value at render time and nothing afterwards.
 *
 * **One listener and one lerp for the whole page**, reference counted, so six
 * consumers cost what one does.
 *
 * **Zero on a coarse pointer and zero under reduced motion.** Both are the
 * identity rather than a disabled feature: a layer multiplying by 0 is a layer
 * at rest exactly where it was composed.
 *
 * **It holds the loop only while converging.** Once the lerp has landed on the
 * target it snaps and returns without `hold()`, so a reader who has stopped
 * moving the mouse lets the loop park.
 */
export function usePointer(): Pointer {
  useEffect(() => {
    attach()
    return release
  }, [])
  return POINTER
}
