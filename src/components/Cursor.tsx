import { useEffect, useRef } from 'react'
import { onFrame, settle } from '../lib/motion'
import './Cursor.css'

/** What the pointer is currently over. It drives the ring's shape. */
type Kind = 'default' | 'link' | 'grab' | 'wide'

/*
 * The three things the ring can be over, and the order they are tested in.
 *
 * ## The precedence rule, written down
 *
 * GRAB, then LINK, then WIDE. The reason is NOT "the more specific selector
 * wins" -- it is that **the ring names the smallest thing the pointer can act
 * on by itself.**
 *
 * A Store pack card is the worked example: `.card` is WIDE, the Buy button
 * inside it is LINK, and the body between them does nothing at all. The ring
 * opens to 38px over the card and to 44px over the button, and that step is how
 * the cursor says "this whole thing is one object, and THIS is the part that
 * does something".
 *
 * A card that is entirely one link does not step, and needs no exemption from
 * anything: `.card__cover` is `position: absolute; inset: 0`, so it covers the
 * card's padding as well as its content and leaves no strip of card to read
 * differently. Every Apps and Tools card is uniformly LINK for that reason.
 *
 * ## Why the timeline is an exception, and FILLS is where exceptions go
 *
 * This pair has now produced two surprises, so both are written down here
 * rather than rediscovered a third time.
 *
 * The FIRST was that `.origin__row` had never won at all. Every row carried a
 * stray `tabIndex={0}`, which matches `[tabindex]:not([tabindex="-1"])` in
 * LINK, so the whole row answered LINK before WIDE was ever consulted and the
 * WIDE entry was dead code from the day it was written.
 *
 * The SECOND arrived when those rows were rebuilt as real `<button>`
 * disclosures and the attribute went with them. `.origin__toggle` is
 * `display: block; width: 100%; padding: 0` in normal flow, and `.origin__row`
 * is padded 28px/30px, so the button fills the row's CONTENT box and leaves the
 * row's own padding around it. That is not a card with a control in it. It is a
 * frame of WIDE around a fill of LINK, and crossing a single row read
 * wide -> link -> wide with nothing having changed about what the pointer could
 * actually do. Jitter, not information.
 *
 * A row has exactly one behaviour and the button IS the row. So the whole row
 * is one target, chevron and all, and it reads WIDE across every pixel of
 * itself.
 *
 * ## Why a third list, and not a `:not()` inside LINK
 *
 * `button:not(.origin__toggle)` would work and would hide the reasoning: the
 * next reader parses it as "apparently that button is not interactive", which
 * is the opposite of true. Reordering WIDE ahead of LINK is worse still and was
 * ruled out -- it is a site-wide regression, because a link inside a card would
 * stop winning the link ring.
 *
 * FILLS states the actual fact: a control that fills the wide surface it sits
 * in is not a target WITHIN that surface, it is that surface. Anything else
 * inside an `.origin__row` -- a link in a chapter's prose once one is opened --
 * still matches LINK and still gets the link ring, which is right, because that
 * genuinely is a second thing to act on.
 */
const LINK = 'a,button,[role="button"],summary,label,input,select,textarea,[tabindex]:not([tabindex="-1"])'
const GRAB = '.hero__model'
const WIDE = '.card,.origin__row'

/**
 * Controls that ARE their wide surface rather than a control within one.
 *
 * Deliberately short, and it should stay short. An entry here is a claim that
 * the element covers its WIDE ancestor's whole hit area, so a reader crossing
 * it can never tell where one ends and the other begins. That is true of
 * `.origin__toggle`; it is not true of a Buy button sitting in a card's action
 * row, and adding one of those here would flatten a step that carries meaning.
 */
const FILLS = '.origin__toggle'

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
      // The NEAREST interactive ancestor, so a link inside a control inside a
      // card still answers for itself.
      const link = target.closest(LINK)
      // ...unless that control fills its wide surface, in which case it IS the
      // surface and the WIDE answer below is the honest one. See FILLS.
      if (link && !link.matches(FILLS)) return 'link'
      if (target.closest(WIDE)) return 'wide'
      // A fill control with no WIDE surface around it is still a control. It
      // cannot happen today -- .origin__toggle only exists inside .origin__row
      // -- and falling to 'default' would be the one wrong answer available.
      return link ? 'link' : 'default'
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
      // cursor, just without the trailing. The snap is in FRONT of the lerp
      // rather than inside it, so `settle` is only ever asked for the eased
      // case -- the same shape usePointer and useParallax use.
      const ease = mi === 0 ? 1 : settle(0.19, dt)
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
