import { useEffect, useRef } from 'react'
import { onFrame } from '../lib/motion'

/** Per-frame lerp rate expressed per second, so 144Hz feels like 60Hz. */
const settle = (rate: number, dt: number) => 1 - Math.pow(1 - rate, dt * 60)

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
    let painted = ''

    return onFrame(({ vh, mi, dt, hold }) => {
      const r = el.getBoundingClientRect()
      const centreOffset = r.top + r.height / 2 - vh / 2
      const target = centreOffset * -factor * mi
      // the lerp is still converging, so it needs the next frame even if the
      // page has stopped moving
      if (Math.abs(target - current) > 0.02) hold()
      current += (target - current) * settle(0.16, dt)
      const next = `0 ${current.toFixed(2)}px`
      // A style write the browser has to recalculate is not free. Once the lerp
      // has settled this is the same string every frame — do not write it again.
      if (next === painted) return
      painted = next
      return () => {
        el.style.translate = next
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
    let painted = ''

    return onFrame(({ mi }) => {
      hero ??= document.getElementById('top')
      if (!hero) return
      const next = `0 ${(hero.getBoundingClientRect().top * factor * mi).toFixed(2)}px`
      if (next === painted) return
      painted = next
      return () => {
        el.style.translate = next
      }
    })
  }, [factor])

  return ref
}
