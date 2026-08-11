import { useEffect, useRef } from 'react'
import { motionIntensity } from '../lib/motion'

const REST = 'perspective(1100px) rotateY(0deg) rotateX(0deg) translateY(0)'

/**
 * Tilt toward the cursor, plus the two cursor-tracked custom properties the
 * spotlight and the pointer-lit border ring read.
 *
 * `soft` is the story-timeline variant: barely any tilt, long settle.
 */
export function useTilt<T extends HTMLElement>(soft = false) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // A tap has no cursor to tilt toward; leave touch devices flat.
    if (!window.matchMedia('(hover: hover)').matches) return

    const amount = soft ? 1.05 : 3.2
    const lift = soft ? -2.5 : -8

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const px = ((e.clientX - r.left) / r.width) * 2 - 1
      const py = ((e.clientY - r.top) / r.height) * 2 - 1
      // the reveal owns `transform` until it has landed
      if (motionIntensity() > 0 && !('revealing' in el.dataset)) {
        el.style.transform =
          `perspective(1100px) rotateY(${px * amount}deg) rotateX(${-py * amount}deg) translateY(${lift}px)`
      }
      el.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
    }
    const enter = () => el.setAttribute('data-lit', 'true')
    const leave = () => {
      el.removeAttribute('data-lit')
      // Same guard as move: while a reveal is mid-flight it owns `transform`,
      // and it only repaints on progress — writing REST here would freeze the
      // card at its final position with a partial opacity.
      if (!('revealing' in el.dataset)) el.style.transform = REST
    }

    el.addEventListener('pointermove', move)
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', leave)
    }
  }, [soft])

  return ref
}
