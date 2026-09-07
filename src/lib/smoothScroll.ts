import { motionIntensity, setFramePrelude, settle, wake, type Frame } from './motion'

/**
 * Wheel scrolling glides, on the one frame loop.
 *
 * ## What was wrong
 *
 * A mouse wheel delivers a page in notches, about 100px each, and the browser
 * animates each notch on its own and then STOPS until the next one arrives.
 * Measured on this page with Chrome's own synthetic mouse gesture at 165Hz,
 * from the top of the hero: `4 9 8 10 10 19` px on consecutive frames, then
 * fourteen frames of `0`, then the next notch — and with the browser's own
 * smoothing off, or a wheel event delivered as a precise delta, the whole
 * 100px lands in ONE frame. Every layer on this site is driven off the scroll
 * position — the hero's pinned stage, the cabin, the moon, twenty parallax
 * layers — so a stepped scroll is stepped scenery: it lurches, freezes,
 * lurches. That is the "choppy" the site owner reported in the 3D sections,
 * and the parallax lerps could not hide it, because they are driven by the
 * same steps.
 *
 * ## What this does
 *
 * The wheel no longer scrolls the page directly. Each notch adds its distance
 * to a TARGET, and the frame loop moves the page toward the target with the
 * same `settle` lerp every parallax layer uses — a fraction of the remaining
 * distance per sixtieth of a second, so the curve is the same at 60 and 165Hz.
 * Two notches close together merge into one glide, a spin becomes one long
 * one, and the last notch tails off instead of stopping dead. Measured after:
 * every frame of a scroll moves the page, `12 10.7 9.4 8.3 ...`, and no frame
 * inside a scroll moves it by 0 — which is the only thing "smooth" means to
 * an eye.
 *
 * ## What stays native, on purpose
 *
 * - **Touch.** A finger on glass already is a continuous scroll with the
 *   platform's own inertia; a lerp on top of it makes the page lag the finger.
 * - **The keyboard, the scrollbar, find-in-page, focus moving to a field off
 *   screen.** All the browser's. The driver notices them two ways: any key or
 *   pointer press yields the glide outright, and a scroll position the driver
 *   did not write is an EXTERNAL move, which drops the glide rather than
 *   fighting it. `anchors.ts` yields explicitly before its own `smooth`
 *   scroll, because a native smooth scroll's first frame can move less than a
 *   pixel and would not be noticed in time.
 * - **Pinch zoom** (`ctrlKey` on the wheel) and a wheel that is horizontal.
 * - **Anything that can scroll on its own** — the account panel, the nav
 *   menus, the feedback card, the console's rail, the Scene Editor's dock —
 *   while that scroller can still move in the wheel's direction, or while it
 *   declares `overscroll-behavior: contain`. The walk up from the event's
 *   target is the same test the browser applies for scroll chaining, so a
 *   wheel over a list scrolls the list until the list runs out, exactly as it
 *   did before.
 * - **Reduced motion.** `motionIntensity()` is 0 and the wheel is untouched:
 *   the visitor asked for less motion, and a glide is motion.
 * - **A page under a dialog's scroll lock.** `modal.ts` puts `overflow:
 *   hidden` on the body while a dialog is up; there is nothing to scroll.
 *
 * ## Why the loop's PRELUDE and not a subscriber
 *
 * `motion.ts` runs every subscriber's read, then every write, so that one
 * layout flush serves the frame. The scroll position is what every one of
 * those reads measures against, so it has to be written BEFORE them — in the
 * same frame, not the next, or every layer paints one frame behind the page
 * for the length of the glide. `setFramePrelude` is that slot: the one write
 * the loop makes ahead of its read phase, and this is its only occupant.
 *
 * ## Rule 9
 *
 * This is a `wheel` listener and it is not a scroll listener: it is the thing
 * that scrolls. It animates through the loop, it `hold()`s only while a glide
 * is converging, and once the glide lands the loop parks exactly as before —
 * `isParked()` is true again within a second of the last notch. AGENTS.md §2
 * rule 9 names this file as the one wheel handler on the site.
 */

/**
 * The fraction of the remaining distance covered per sixtieth of a second.
 *
 * 0.12 lands 90% of a notch in 300ms and the last pixel in about 600ms.
 * Higher snaps back toward the native step; lower reads as the page being
 * dragged through syrup. The parallax layers follow the page at 0.16, so the
 * page itself is a shade heavier than what rides on it and the two rates
 * never fight — a layer always settles before the page it is chasing does.
 */
const RATE = 0.12

/** Under this much left to travel the glide has landed: snap, and let the loop park. */
const REST_PX = 0.5

/**
 * A `deltaMode` of lines, in px. Firefox delivers a wheel notch as 3 lines,
 * and 3 × this is the same 100px Chrome delivers the notch as.
 */
const LINE_PX = 100 / 3

/**
 * How far the page may differ from the last position this driver wrote
 * before that counts as somebody else scrolling. The browser snaps a
 * fractional write to the device pixel grid, so half a pixel is rounding and
 * a whole one is not.
 */
const EXTERNAL_PX = 1

let target = 0
let current = 0
/** The last position this driver wrote, or -1 between glides. */
let written = -1
let active = false
let installed = false

const maxScroll = () =>
  Math.max(0, document.documentElement.scrollHeight - window.innerHeight)

/**
 * Whether the browser should have this wheel event: every case in the header's
 * "what stays native" list, decided per event and never cached, because the
 * answer depends on where the wheel is and what is open.
 */
function wantsNative(e: WheelEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.deltaY === 0) return true
  if (motionIntensity() === 0) return true
  if (document.body.style.overflow === 'hidden') return true

  // A scroller between the wheel and the page keeps the wheel while it can
  // still move that way, or while it says it never chains.
  let node: Element | null = e.target instanceof Element ? e.target : null
  const stop = document.body
  while (node && node !== stop && node !== document.documentElement) {
    const el = node as HTMLElement
    if (el.scrollHeight > el.clientHeight + 1) {
      const cs = getComputedStyle(el)
      const oy = cs.overflowY
      if (oy === 'auto' || oy === 'scroll') {
        const ob = cs.overscrollBehaviorY
        if (ob === 'contain' || ob === 'none') return true
        const canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1
        const canUp = el.scrollTop > 0
        if (e.deltaY > 0 ? canDown : canUp) return true
      }
    }
    node = node.parentElement
  }
  return false
}

function onWheel(e: WheelEvent) {
  if (wantsNative(e)) return
  const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? window.innerHeight : 1
  const dy = e.deltaY * scale
  if (!active) {
    // Start from where the page actually is, never from where the last glide
    // ended: the keyboard, a link or a reload may have moved it since.
    current = window.scrollY
    target = current
  }
  const next = Math.min(maxScroll(), Math.max(0, target + dy))
  // At the page's edge the wheel has nothing to add. Leave the event to the
  // browser rather than swallowing it, so the platform's own edge behaviour
  // (an overscroll bounce, a pull-to-refresh) is still what happens there.
  if (next === target && !active) return
  target = next
  active = true
  e.preventDefault()
  wake()
}

/**
 * Drop the glide, wherever it is. The page stays where it is and the next
 * wheel notch starts fresh from there.
 */
export function yieldScroll() {
  active = false
  written = -1
}

/** One frame of the glide, run before every subscriber's read. */
function prelude({ dt, hold }: Frame) {
  if (!active) return
  const y = window.scrollY
  if (written >= 0 && Math.abs(y - written) > EXTERNAL_PX) {
    // Somebody else moved the page: the scrollbar, a key, a find, a focus.
    yieldScroll()
    return
  }
  const max = maxScroll()
  if (target > max) target = max
  const d = target - current
  if (d > -REST_PX && d < REST_PX) {
    current = target
    yieldScroll()
    window.scrollTo({ top: current, behavior: 'instant' })
    return
  }
  hold()
  current += d * settle(RATE, dt)
  written = current
  window.scrollTo({ top: current, behavior: 'instant' })
}

/**
 * Take over wheel scrolling for the page. Called once, from `main.tsx`, before
 * the first render, so no frame is ever scrolled two ways.
 */
export function installSmoothScroll() {
  if (installed || typeof window === 'undefined') return
  installed = true
  // passive: false is the whole point — the event's default is what is being
  // replaced. Bubble phase, so anything closer to the wheel that wants the
  // event has already had it and `defaultPrevented` above can see that.
  window.addEventListener('wheel', onWheel, { passive: false })
  // A press of any kind means the reader is steering by other means now.
  const opts = { passive: true, capture: true } as const
  window.addEventListener('keydown', yieldScroll, opts)
  window.addEventListener('pointerdown', yieldScroll, opts)
  window.addEventListener('touchstart', yieldScroll, opts)
  setFramePrelude(prelude)
}
