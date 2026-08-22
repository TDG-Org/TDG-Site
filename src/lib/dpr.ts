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
