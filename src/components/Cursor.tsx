import { useEffect, useRef } from 'react'
import { motionIntensity, onFrame } from '../lib/motion'
import './Cursor.css'

/** What the pointer is currently over — drives the ring's shape. */
type Kind = 'default' | 'link' | 'grab' | 'wide'

const LINK = 'a,button,[role="button"],summary,label,input,select,textarea,[tabindex]:not([tabindex="-1"])'
const GRAB = '.hero__model'
const WIDE = '.card,.story__row'

/**
 * A two-part cursor: a dot that tracks the pointer exactly and a ring that
 * trails it. The ring is the part that reacts — it opens up over anything
 * interactive, goes dashed over the draggable hero model, and pinches on press.
 *
 * Fine pointers only. Coarse pointers keep their native behaviour and this
 * component renders nothing.
 */
export function Cursor() {
  const root = useRef<HTMLDivElement | null>(null)
  const ring = useRef<HTMLSpanElement | null>(null)
  const dot = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const host = root.current
    const ringEl = ring.current
    const dotEl = dot.current
    if (!host || !ringEl || !dotEl) return
    if (!window.matchMedia('(pointer: fine)').matches) return

    document.documentElement.setAttribute('data-cursor', 'on')

    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    let rx = x
    let ry = y
    let awake = false

    const kindOf = (target: EventTarget | null): Kind => {
      if (!(target instanceof Element)) return 'default'
      if (target.closest(GRAB)) return 'grab'
      if (target.closest(LINK)) return 'link'
      if (target.closest(WIDE)) return 'wide'
      return 'default'
    }

    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      // the dot is written here, not in the frame loop, so it never trails
      dotEl.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
      if (!awake) {
        awake = true
        rx = x
        ry = y
        host.setAttribute('data-awake', 'true')
      }
    }
    const over = (e: PointerEvent) => host.setAttribute('data-kind', kindOf(e.target))
    const down = () => host.setAttribute('data-press', 'true')
    const up = () => host.removeAttribute('data-press')
    const leave = () => host.removeAttribute('data-awake')
    const enter = () => {
      if (awake) host.setAttribute('data-awake', 'true')
    }

    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerover', over, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    document.addEventListener('pointerleave', leave)
    document.addEventListener('pointerenter', enter)

    const stop = onFrame(() => {
      // Reduced motion gets a ring locked to the pointer — still a custom
      // cursor, just without the trailing.
      const ease = motionIntensity() === 0 ? 1 : 0.19
      rx += (x - rx) * ease
      ry += (y - ry) * ease
      return () => {
        ringEl.style.transform = `translate3d(${rx.toFixed(2)}px,${ry.toFixed(2)}px,0) translate(-50%,-50%)`
      }
    })

    return () => {
      stop()
      document.documentElement.removeAttribute('data-cursor')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerover', over)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      document.removeEventListener('pointerleave', leave)
      document.removeEventListener('pointerenter', enter)
    }
  }, [])

  return (
    <div ref={root} className="cursor" data-kind="default" aria-hidden="true">
      <span ref={ring} className="cursor__ring" />
      <span ref={dot} className="cursor__dot" />
    </div>
  )
}
