import { useEffect, useRef } from 'react'
import { clamp01, framesRun, onFrame } from '../lib/motion'

export type RevealKind = 'wipe' | 'card3d' | 'slideL' | 'pop' | 'scale' | 'holy' | 'rise'

/** Scroll-linked, not a one-shot trigger: progress tracks the element's rect. */
const START = 0.94
const END = 0.46
const STAGGER = 0.14

function paint(el: HTMLElement, kind: RevealKind, p: number, mi: number) {
  const eased = 1 - Math.pow(1 - p, 3)

  if (mi === 0 || p >= 1) {
    el.style.opacity = ''
    el.style.transform = ''
    el.style.clipPath = ''
    el.style.filter = ''
    el.style.transition = ''
    el.style.willChange = ''
    // hand `transform` back to whatever else wants it (the tilt hook)
    delete el.dataset.revealing
    return true
  }
  el.dataset.revealing = ''

  // Promote only while it is actually moving. Setting this at mount left every
  // block below the fold holding a compositor layer until you scrolled to it.
  el.style.willChange = 'transform,opacity'
  el.style.opacity = (mi >= 1 ? eased : 1 - (1 - eased) * mi).toFixed(3)
  const inv = (1 - eased) * mi

  switch (kind) {
    case 'wipe':
      el.style.transform = `translate3d(0,${(inv * 38).toFixed(2)}px,0)`
      el.style.clipPath = `inset(${Math.min(100, inv * 100).toFixed(1)}% 0 0 0)`
      break
    case 'card3d':
      el.style.transform =
        `perspective(1200px) translate3d(0,${(inv * 78).toFixed(2)}px,0) ` +
        `rotateX(${(inv * 9).toFixed(2)}deg) scale(${(1 - inv * 0.06).toFixed(3)})`
      break
    case 'slideL':
      el.style.transform = `translate3d(${(inv * -64).toFixed(2)}px,0,0)`
      break
    case 'pop':
      el.style.transform =
        `translate3d(0,${(inv * 18).toFixed(2)}px,0) scale(${(1 - inv * 0.09).toFixed(3)})`
      break
    case 'scale':
      el.style.transform =
        `translate3d(0,${(inv * 46).toFixed(2)}px,0) scale(${(1 - inv * 0.07).toFixed(3)})`
      break
    case 'holy':
      el.style.transform =
        `translate3d(0,${(inv * 52).toFixed(2)}px,0) scale(${(1 - inv * 0.1).toFixed(3)})`
      el.style.filter = `blur(${(inv * 12).toFixed(2)}px)`
      break
    default:
      el.style.transform =
        `translate3d(0,${(inv * 58).toFixed(2)}px,0) scale(${(1 - inv * 0.035).toFixed(3)})`
  }
  return false
}

/**
 * Opacity + transform reveal, staggered by index and driven off the shared
 * frame loop. Attach the returned ref to the element you want revealed.
 */
export function useReveal<T extends HTMLElement>(kind: RevealKind, index = 0) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    /*
     * The stagger is spent INSIDE the runway, not added to the end of it.
     *
     * This used to be `clamp01(raw - index * STAGGER)`, which subtracts a flat
     * amount and therefore pushes each later element's finish line further DOWN
     * the page: at index 3 the raw term has to reach 1.42 before the element is
     * done, which needs the element's top 0.42 of a runway ABOVE the runway's
     * own end. That is free while the reader is scrolling — there is always more
     * page below — and it is not free when the page ARRIVES somewhere.
     *
     * Clicking Apps in the nav lands `#apps` at the top of the viewport with the
     * card row already on screen and nothing left below it to scroll. `progress`
     * is monotonic (the tick returns early on `p <= progress`), so whatever the
     * stagger subtracted on that first frame is where the element stays. Measured
     * nine seconds after a real nav click at 1440x900: the four Apps cards sat at
     * opacity 0.998 / 0.982 / 0.928 / 0.797 with their tops at 465 / 467 / 472 /
     * 486 — a row of four cards at four different opacities and four different
     * heights, which is rule 6 broken in the most visible place on the site. The
     * same click on Tools left three cards at 0.944 / 0.858 / 0.710. Worse, every
     * one of them kept `data-revealing`, so `paint()` never handed `transform`
     * back and `useTilt` was locked out for the rest of the session.
     *
     * Dividing by `1 - index * STAGGER` renormalises the remainder over what is
     * left of the runway instead. Every index still STARTS later — index 3 waits
     * until the raw term passes 0.42 — and every index now FINISHES at the same
     * place, the moment the element's top reaches `vh * END`. A later card ramps
     * faster over a shorter distance, which reads as the row catching up with
     * itself rather than as four elements on four different schedules.
     *
     * Ceiling on the divisor because a large enough index would otherwise divide
     * by zero or by a negative: at STAGGER 0.14 that is index 7, and Origin draws
     * seven chapter rows. 0.2 leaves the last of them a fifth of the runway to
     * cross, which is short but is motion; below that it would be a snap.
     */
    const progressFor = (top: number, vh: number) => {
      const start = vh * START
      const raw = (start - top) / (start - vh * END)
      const lead = Math.min(index * STAGGER, 0.8)
      return clamp01((raw - lead) / (1 - lead))
    }

    el.style.transition = 'none'
    // Seed from where the element actually is rather than from zero, so nothing
    // sits invisible waiting for a first frame that may be a tab-switch away.
    const vh0 = window.innerHeight || 800
    let progress = progressFor(el.getBoundingClientRect().top, vh0)
    let done = paint(el, kind, progress, 1)

    // Safety net: if the loop never runs (page opened in a background tab),
    // still show anything that is already on screen.
    const rescue = window.setTimeout(() => {
      if (done || framesRun() > 0) return
      if (el.getBoundingClientRect().top < (window.innerHeight || 800) * 0.92) {
        progress = 1
        done = paint(el, kind, 1, 1)
      }
    }, 1600)

    const stop = onFrame(({ vh, mi }) => {
      if (done) return
      if (mi === 0) return () => void (done = paint(el, kind, 1, 0))
      const r = el.getBoundingClientRect()
      if (r.height === 0 && r.top === 0) return
      const p = progressFor(r.top, vh)
      if (p <= progress) return
      progress = p
      return () => void (done = paint(el, kind, p, mi))
    })

    return () => {
      window.clearTimeout(rescue)
      stop()
    }
  }, [kind, index])

  return ref
}
