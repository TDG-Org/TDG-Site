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

    const progressFor = (top: number, vh: number) => {
      const start = vh * START
      return clamp01((start - top) / (start - vh * END) - index * STAGGER)
    }

    el.style.transition = 'none'
    el.style.willChange = 'transform,opacity'
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
