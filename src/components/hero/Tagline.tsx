import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motionIntensity, onFrame } from '../../lib/motion'
import { HERO_TAGLINES } from '../../data/content'

/* ── the cadence, in seconds ───────────────────────────────────────────────
   Seconds and not milliseconds because every one of these is accumulated
   from `dt`, which the shared loop already hands out in seconds. */

/** How long each character waits before the next one lands. */
const TYPE_S = 0.034
/** A breath after a comma, so the line reads as a sentence being written
    rather than a buffer being flushed. */
const COMMA_S = 0.2
/** The same, longer, for a full stop that is not the end of the line. */
const STOP_S = 0.28
/** Clearing is a machine undoing itself; it has no reason to be careful. */
const ERASE_S = 0.016
/** How long a finished line stays. The whole point of the effect: the line
    the site is known by has to be READ, not watched. */
const REST_S = 5.2
/** One empty beat with a blinking caret before the next line starts. */
const GAP_S = 0.42

type Phase = 'typing' | 'rest' | 'erasing' | 'gap' | 'static'

/** Fisher–Yates, in place. */
function shuffle(bag: number[]) {
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = bag[i]
    bag[i] = bag[j]
    bag[j] = swap
  }
}

/**
 * A full bag of every line, drawn from the END.
 *
 * `bag[N - 1]` is therefore the next line out. If that is the line already on
 * screen, the same sentence would appear twice in a row across the reshuffle
 * — which is the one thing a shuffle bag exists to prevent, and the one place
 * a naive "shuffle when empty" gets it wrong. So it is swapped with `bag[0]`,
 * the LAST line this bag will hand out: the line still appears exactly once
 * per bag, and because a permutation holds distinct values, `bag[N - 1]` is
 * guaranteed to differ from `last` afterwards. (`bag[0] !== bag[N - 1]` needs
 * N >= 2, which HERO_TAGLINES satisfies five times over.)
 */
function fullBag(last: number): number[] {
  const bag = HERO_TAGLINES.map((_, i) => i)
  shuffle(bag)
  const end = bag.length - 1
  if (bag[end] === last) {
    const swap = bag[end]
    bag[end] = bag[0]
    bag[0] = swap
  }
  return bag
}

/**
 * The hero's tagline, typed out and then swapped for another one.
 *
 * ── why it is not a `setInterval` ────────────────────────────────────────
 * AGENTS.md rule 9: all motion goes through the one frame loop, which parks
 * itself when nothing holds it. A timer would keep the page's rendering
 * lifecycle alive on a hero nobody is looking at, for a decoration. So the
 * whole state machine lives inside one `onFrame` subscriber and accumulates
 * `dt` rather than reading a clock.
 *
 * ── how it lets the loop park ────────────────────────────────────────────
 * `frame.hold()` is called only while a character is actually pending — the
 * `typing` and `erasing` phases. Through the five-second `rest` and the gap
 * after it, this subscriber holds nothing, so if it is the only thing left
 * animating the loop stops asking for frames and the browser stops running
 * its rendering lifecycle. Accumulating `dt` (which the loop clamps to 50ms)
 * rather than differencing `frame.now` is what makes that safe: a park does
 * not silently burn the rest, so the line is on screen for REST_S of frames
 * a reader could actually have seen, and coming back to a parked tab does
 * not instantly wipe the sentence.
 *
 * And the hero never scrolls out of the way at the top of the page, so the
 * paragraph's own rect is checked first: off screen, it neither writes nor
 * holds. Same guard `hero/Starfield.tsx` uses, one element further in.
 *
 * ── accessibility (rule 14) ──────────────────────────────────────────────
 * A screen reader gets ONE clean sentence. The typing is decoration and says
 * so with `aria-hidden`; the sentence itself lives in a `.sr-only` span that
 * carries the whole line from the moment that line starts, never a fragment.
 * That span is deliberately NOT a live region — `aria-live` is "off" by
 * default and stays that way, because a tagline that re-announced itself
 * every nine seconds would talk over the page instead of describing it. The
 * reading order is unchanged: eyebrow, wordmark, this sentence, the CTAs.
 *
 * ── reduced motion ───────────────────────────────────────────────────────
 * At `motionIntensity() === 0` there is no typing and no cycling at all:
 * HERO_TAGLINES[0] renders whole, immediately, with no caret. It is read off
 * `frame.mi` rather than once at mount, so a visitor who changes the setting
 * with the page open gets the right answer without a reload.
 */
export function Tagline() {
  const box = useRef<HTMLParagraphElement | null>(null)
  const text = useRef<HTMLSpanElement | null>(null)
  /** The line a screen reader is currently being offered, in full. */
  const [spoken, setSpoken] = useState(0)

  /* Before the first paint, not after it. The React tree renders the typing
     run empty, because at full motion the first character has not been typed
     yet — but a visitor who asked for less motion is never going to get one,
     and the frame loop's answer arrives one paint too late for them. This is
     the only write that has to beat the browser to the screen, so it is the
     only one in a layout effect. */
  useLayoutEffect(() => {
    const node = text.current
    const el = box.current
    if (!node || !el || motionIntensity() > 0) return
    node.textContent = HERO_TAGLINES[0]
    el.dataset.phase = 'static'
  }, [])

  useEffect(() => {
    const el = box.current
    const node = text.current
    if (!el || !node) return

    /* HERO_TAGLINES[0] is what the page opens on, always: it is the line the
       site is known by, and a visitor must never land on anything else. The
       first bag is therefore the OTHER four, so the opening pass shows all
       five exactly once before anything repeats. */
    let current = 0
    let bag = HERO_TAGLINES.map((_, i) => i).slice(1)
    shuffle(bag)

    let phase: Phase = 'typing'
    let chars = 0
    /** Seconds banked toward the next character or the end of the phase. */
    let acc = 0
    /** Seconds the NEXT character waits — longer after punctuation. */
    let step = TYPE_S
    let paintedPhase = ''
    let paintedText = ''

    const restAfter = (ch: string) =>
      ch === ',' ? COMMA_S : ch === '.' || ch === '!' || ch === '?' ? STOP_S : 0

    const write = (shown: string, nextPhase: Phase) => {
      if (shown !== paintedText) {
        paintedText = shown
        node.textContent = shown
      }
      if (nextPhase !== paintedPhase) {
        paintedPhase = nextPhase
        el.dataset.phase = nextPhase
      }
    }

    return onFrame(({ vh, mi, dt, hold }) => {
      const line = HERO_TAGLINES[current]

      // Reduced motion: the whole first line, still, and nothing else ever.
      if (mi === 0) {
        if (phase === 'static') return
        phase = 'static'
        current = 0
        chars = HERO_TAGLINES[0].length
        acc = 0
        return () => write(HERO_TAGLINES[0], 'static')
      }
      if (phase === 'static') {
        // Motion came back on. Pick up from a finished line rather than
        // re-typing one the visitor has already read.
        phase = 'rest'
        acc = 0
      }

      // The hero is the one section that never scrolls out of the way at the
      // top of the page, so ask where the paragraph actually is. Off screen:
      // no write, and — the part that matters — no hold().
      const r = el.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= vh) return

      acc += dt
      let next = line

      switch (phase) {
        case 'typing': {
          hold()
          while (chars < line.length && acc >= step) {
            acc -= step
            chars += 1
            step = TYPE_S + restAfter(line[chars - 1])
          }
          if (chars >= line.length) {
            phase = 'rest'
            acc = 0
          }
          break
        }
        case 'rest': {
          // No hold(): this is five seconds of nothing, and pinning the loop
          // awake for it is exactly what motion.ts was written to stop.
          if (acc >= REST_S) {
            phase = 'erasing'
            acc = 0
          }
          break
        }
        case 'erasing': {
          hold()
          while (chars > 0 && acc >= ERASE_S) {
            acc -= ERASE_S
            chars -= 1
          }
          if (chars <= 0) {
            phase = 'gap'
            acc = 0
            step = TYPE_S
            // draw the next line now, so the hidden sentence a screen reader
            // is offered changes on the empty beat rather than mid-word
            if (bag.length === 0) bag = fullBag(current)
            current = bag.pop() as number
            next = HERO_TAGLINES[current]
            setSpoken(current)
          }
          break
        }
        default: {
          // gap — also unheld
          if (acc >= GAP_S) {
            phase = 'typing'
            acc = 0
          }
        }
      }

      const shown = next.slice(0, chars)
      if (shown === paintedText && phase === paintedPhase) return
      return () => write(shown, phase)
    })
  }, [])

  return (
    <p ref={box} className="hero__tagline">
      {/* The sentence itself, for a screen reader: one whole line, never a
          half-typed fragment. Not a live region — see the note above. */}
      <span className="sr-only">{HERO_TAGLINES[spoken]}</span>
      {/* and the decoration, which says four ways that it is one */}
      <span className="hero__tagline-typed" aria-hidden="true">
        <span ref={text} />
        <span className="hero__tagline-caret" />
      </span>
    </p>
  )
}
