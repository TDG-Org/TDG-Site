import { useEffect, useRef } from 'react'
import { onFrame } from '../lib/motion'

/**
 * Drift a decorative layer against its own distance from the viewport centre.
 * Uses the standalone `translate` property so any `transform` the element
 * already carries (centring, rotation) survives untouched.
 */
export function useParallax<T extends HTMLElement>(factor: number) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let current = 0

    return onFrame(({ vh, mi }) => {
      const r = el.getBoundingClientRect()
      const centreOffset = r.top + r.height / 2 - vh / 2
      const target = centreOffset * -factor * mi
      current += (target - current) * 0.16
      const y = current.toFixed(2)
      return () => {
        el.style.translate = `0 ${y}px`
      }
    })
  }, [factor])

  return ref
}

/**
 * Layers that ride the hero's own displacement rather than their own — the
 * hero sinks as you scroll and these follow it at their own rate.
 */
export function useHeroParallax<T extends HTMLElement>(factor: number) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let hero: HTMLElement | null = null

    return onFrame(({ mi }) => {
      hero ??= document.getElementById('top')
      if (!hero) return
      const y = (hero.getBoundingClientRect().top * factor * mi).toFixed(2)
      return () => {
        el.style.translate = `0 ${y}px`
      }
    })
  }, [factor])

  return ref
}
