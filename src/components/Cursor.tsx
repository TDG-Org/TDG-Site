import { useEffect, useRef } from 'react'
import { onFrame } from '../lib/motion'
import './Cursor.css'

/** What the pointer is currently over. It drives the ring's shape. */
type Kind = 'default' | 'link' | 'grab' | 'wide'

/*
 * The three things the ring can be over, in the order they are tested. The
 * order IS the rule: the most specific thing under the pointer wins, so a
 * button inside a card is a button.
 *
 * ## Why `.origin__row` is in WIDE even though it has never won
 *
 * It had not, and the reason was not this ordering being wrong. Every timeline
 * row carried a stray `tabIndex={0}`, which matches
 * `[tabindex]:not([tabindex="-1"])` in LINK, so the whole row answered LINK
 * before WIDE was ever consulted and the entry below did nothing at all. The
 * rows are being rebuilt as real `<button>` disclosures and that attribute is
 * going with them, which is what finally lets this line do its job.
 *
 * ## What that leaves, and why it is the intended feel
 *
 * A rebuilt row is a wide surface with a control inside it, so the ring will
 * read 38px over the row and open to 44px over the button — the SAME step this
 * site has always given a `.card` with a control in it. A Store pack card is
 * the shipped example: its body is `wide` and its Buy button is `link`, and
 * that step is how the cursor says "this whole thing is one object, and THIS is
 * the part that does something". A row is exactly that shape, so it gets
 * exactly that answer.
 *
 * The alternative was dropping `.origin__row` from WIDE, and it is worse rather
 * than quieter: with the row no longer focusable the prose beside the button
 * would fall all the way to `default`, and the pointer would cross 26px → 44px
 * instead of 38px → 44px. Removing the entry to avoid a step makes the step
 * nearly three times bigger.
 */
const LINK = 'a,button,[role="button"],summary,label,input,select,textarea,[tabindex]:not([tabindex="-1"])'
const GRAB = '.hero__model'
const WIDE = '.card,.origin__row'

/**
 * A two-part cursor: a dot that tracks the pointer exactly and a ring that
 * trails it. The ring is the part that reacts: it opens up over anything
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

    /**
     * Both parts are placed and the native cursor is hidden in the same frame,
     * on the first real pointer position. Hiding it at mount instead left the
     * page with no cursor at all until the visitor moved.
     */
    const wakeCursor = () => {
      awake = true
      rx = x
      ry = y
      ringEl.style.transform = `translate3d(${rx}px,${ry}px,0) translate(-50%,-50%)`
      host.setAttribute('data-awake', 'true')
      document.documentElement.setAttribute('data-cursor', 'on')
    }

    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      // the dot is written here, not in the frame loop, so it never trails
      dotEl.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
      if (!awake) wakeCursor()
    }
    const over = (e: PointerEvent) => {
      // pointerover also carries a real position, so a click without a preceding
      // move should still bring the cursor up
      if (!awake) {
        x = e.clientX
        y = e.clientY
        dotEl.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
        wakeCursor()
      }
      host.setAttribute('data-kind', kindOf(e.target))
    }
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

    let painted = ''
    const stop = onFrame(({ dt, mi, hold }) => {
      // Once the ring has caught the pointer there is nothing left to compute
      // until the pointer moves again. No lerp, no string, no allocation.
      if (rx === x && ry === y) return
      // still catching up
      hold()
      // Reduced motion gets a ring locked to the pointer. Still a custom
      // cursor, just without the trailing.
      const ease = mi === 0 ? 1 : 1 - Math.pow(1 - 0.19, dt * 60)
      rx += (x - rx) * ease
      ry += (y - ry) * ease
      // below half the rounding quantum the written string can never change again
      if (Math.abs(x - rx) < 0.005 && Math.abs(y - ry) < 0.005) {
        rx = x
        ry = y
      }
      const next = `translate3d(${rx.toFixed(2)}px,${ry.toFixed(2)}px,0) translate(-50%,-50%)`
      if (next === painted) return
      painted = next
      return () => {
        ringEl.style.transform = next
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
