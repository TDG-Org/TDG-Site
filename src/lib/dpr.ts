/**
 * The ceiling this site sizes a canvas backing store to, and the second
 * `settle`.
 *
 * **The reasoning is `hero/PointCloud.tsx`'s**, and it is the one that
 * generalises: at the scales anything here draws at, 2x buys nothing for a
 * soft point or a flat-shaded facet, and it costs four times the fill. A dust
 * mote in `hero/Starfield.tsx` is sub-pixel to begin with; a snowflake in
 * `scene/Snow.tsx` is a 0.6-2.7px disc; `origin/CabinScene.tsx` is untextured
 * facets with no high-frequency detail for the extra samples to resolve. None
 * of the four has an edge sharp enough to reward a retina buffer, and all four
 * pay the fill rate every frame.
 *
 * It lived in four files. Three declared a byte-identical
 * `const MAX_DPR = 1.5` and ran `Math.min(window.devicePixelRatio || 1,
 * MAX_DPR)`; `PointCloud` — which owns the argument — wrote the 1.5 as a bare
 * literal with no name at all. That is the same story `settle()` in
 * `lib/motion.ts` had one step earlier: one decision, four copies, correctable
 * in one.
 *
 * **It belongs here specifically**, and an earlier note in `CabinScene.tsx`
 * said so and sent readers here to find it — where it was not. This file was
 * 44 lines about NOTICING a ratio change and held no cap, no 1.5 and no fill
 * argument. It holds both halves now: what the cap is, and how you learn the
 * ratio moved. A consumer wants them together, because the second is only ever
 * used to re-apply the first.
 *
 * **What does NOT belong here.** An area cap is not a display fact.
 * `CabinScene.tsx` keeps its own `MAX_PIXELS` beside its `resize`, because
 * that number is about one component's option to mount a canvas over a whole
 * tall section — it would be wrong to impose it on a viewport-sized canvas and
 * meaningless to state it next to a ratio.
 */
export const MAX_DPR = 1.5

/**
 * Tells you when the display's pixel ratio changes.
 *
 * Every canvas here sizes its backing buffer to `devicePixelRatio` and re-reads
 * it from a ResizeObserver, which is right for a window being dragged wider and
 * wrong for the other way a ratio changes: a laptop at 200% next to a monitor
 * at 100%, and a window dragged from one to the other. The CSS size of the
 * canvas never moved, so no observer fires, and the buffer stays sized for the
 * screen it left — soft on the sharper display, or needlessly heavy on the
 * blunter one. Changing the OS scaling with the window where it is does the
 * same thing.
 *
 * A media query is the one thing that does notice. `(resolution: Ndppx)` is
 * true only at exactly the ratio it was armed with, so the first change event
 * IS the ratio having moved; the listener is then re-armed at the new value.
 *
 * On a browser that does not understand `resolution`, the query simply never
 * matches and never fires, which leaves the old ResizeObserver-only behaviour
 * rather than breaking anything.
 */
export function onDprChange(run: () => void): () => void {
  let query: MediaQueryList | null = null
  let stopped = false

  const arm = () => {
    if (stopped) return
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    query.addEventListener('change', fire, { once: true })
  }

  const fire = () => {
    if (stopped) return
    run()
    arm()
  }

  arm()

  return () => {
    stopped = true
    query?.removeEventListener('change', fire)
    query = null
  }
}
