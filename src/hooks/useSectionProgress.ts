import { useEffect, useRef, type RefObject } from 'react'
import { clamp01, onFrame } from '../lib/motion'

/** How far a section has travelled across the viewport, 0..1. */
export type SectionProgress = { readonly p: number }

/**
 * 0 as the section's top reaches the viewport bottom, 1 as its bottom reaches
 * the viewport top.
 *
 * ```tsx
 * const [section, progress] = useSectionProgress<HTMLElement>()
 * // ...
 * <section ref={section} className="section">
 * ```
 *
 * The consumer reads `.p` inside its own `onFrame` tick. **Like `usePointer`,
 * this never causes a React render**: it returns a frozen accessor over a ref,
 * so a section does not re-render sixty times a second to move a decorative
 * layer. Read during render it gives the value at render time and nothing
 * afterwards.
 *
 * `origin/CabinScene.tsx:450` computes exactly this expression inline —
 * `(vh - rect.top) / (vh + rect.height)`, inside its own tick — and inherited
 * it from `origin/OriginField.tsx`, the file it replaced this pass. This is
 * that line with the reasoning attached; anything new that wants scroll
 * progress through a section should call this instead of writing the
 * arithmetic a third time. `grep -rn 'useSectionProgress<' src/` says
 * `components/Faith.tsx` is the only thing that does today.
 *
 * ## What "progress" actually means
 *
 * The travel is `vh + height`, so the run starts and ends with the section
 * completely OUT of view: p is 0 the instant before any of it is visible and 1
 * the instant after all of it has gone. Both endpoints are therefore invisible
 * by construction, which is what makes the value safe to drive an entrance and
 * an exit from -- there is no first frame at which something has to appear
 * already half-done.
 *
 * Two consequences worth knowing before you pick a range to map:
 *
 * - **p = 0.5 is always the section's centre crossing the viewport's centre**,
 *   whatever the two heights are. Substitute `top = (vh - height) / 2` and the
 *   section's midpoint lands on `vh / 2` exactly. This is the one landmark that
 *   does not move, so anything meant to peak "in the middle of the section"
 *   peaks at 0.5 and nowhere else.
 *
 * - **The section is at its most visible between `height / (vh + height)` and
 *   `vh / (vh + height)`**, and those two brackets swap places depending on
 *   which is taller. A section TALLER than the viewport fills the screen
 *   completely across that band -- for a section twice the viewport's height,
 *   p 0.33 to 0.67. A section SHORTER than the viewport is fully on screen
 *   across it instead -- for a half-height section, p 0.33 to 0.67 again, but
 *   with page visible above and below it the whole way. Either way the band
 *   brackets 0.5 and shrinks as the section's height approaches the viewport's,
 *   vanishing to the single instant p = 0.5 when they are equal.
 *
 * What p is NOT is "how much of this section have I read". For a section three
 * screens tall, p has already spent a quarter of its run before the first line
 * of copy reaches the middle of the screen. If you want a range that starts
 * when the section's top hits the viewport top, map a sub-range of p rather
 * than reaching for a second measurement.
 *
 * ## What it costs
 *
 * One `getBoundingClientRect` per frame per consumer, and nothing else: no
 * lerp, no write, and **no `hold()`**, so it can never keep the loop awake. A
 * reader sitting still pays nothing for it at all -- the same argument
 * `useHeroParallax`'s header makes for not guarding itself off screen. It is
 * also why there is no off-screen park here: outside the viewport the clamp
 * already pins p to 0 or 1, and a guard would cost the rect it was trying to
 * save.
 */
export function useSectionProgress<T extends HTMLElement>(): [
  RefObject<T | null>,
  SectionProgress,
] {
  const ref = useRef<T | null>(null)
  const state = useRef({ p: 0 })
  const view = useRef<SectionProgress | null>(null)
  const out = (view.current ??= Object.freeze({
    get p() {
      return state.current.p
    },
  }))

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // `vh + height` can only be 0 for an element with no box in a viewport
    // with no height; `|| 1` keeps that from producing NaN rather than 0.
    const progressOf = (top: number, height: number, vh: number) =>
      clamp01((vh - top) / (vh + height || 1))

    // Seed from where the section actually is, the way `useReveal` does, so a
    // consumer that reads `.p` before the first frame -- or in a background
    // tab, where the loop has not run at all -- gets the truth rather than 0.
    const r0 = el.getBoundingClientRect()
    state.current.p = progressOf(r0.top, r0.height, window.innerHeight || 800)

    return onFrame(({ vh }) => {
      const r = el.getBoundingClientRect()
      state.current.p = progressOf(r.top, r.height, vh)
    })
  }, [])

  return [ref, out]
}
