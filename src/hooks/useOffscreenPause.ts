import { useEffect } from 'react'

/** Everything `base.css` will park with `animation-play-state: paused`. */
const SECTIONS = 'section, footer'

/**
 * Park every decorative animation in a section while that section is off
 * screen. The faith gradient field alone is a rotating conic gradient under a
 * 46px blur: cheap to look at, expensive to keep compositing when nobody can.
 *
 * ## Why this watches the DOM instead of running once
 *
 * It used to call `querySelectorAll` a single time, from an effect with `[]`
 * dependencies. That is correct for exactly one commit, and this site replaces
 * its whole page on a hash route — so it was correct for the first page a
 * visitor happened to land on and for nothing afterwards.
 *
 * Measured shape of the failure: open `#/store`, then click Origin. The home
 * page's sections were built after the only scan ever ran, so not one of them
 * carried `data-live` at all, `[data-live='false']` never matched, and the
 * Faith conic gradient, the Tools road grid and the Origin turn pulse all kept
 * compositing off screen for the rest of the visit. That is precisely the cost
 * this hook exists to remove, and the comment above claimed it was removed.
 *
 * The lazy routes had it on a FIRST load too, with no navigation involved:
 * About, an app page and `#/dev` arrive a chunk later than this effect runs, so
 * their sections were never in the document to be found.
 *
 * ## Why a MutationObserver and not the route
 *
 * Re-running on the route would fix the navigation half and not the lazy half —
 * a `Suspense` that resolves two hundred milliseconds after the route changed
 * is a new section with no route change behind it. It would also mean this hook
 * taking an argument, and it is called from `App.tsx` with none.
 *
 * Watching the container instead covers both, and covers whatever arrives next
 * for the same reason: a section is picked up because it appeared, not because
 * something remembered to say so.
 *
 * ## What keeps it from leaking
 *
 * One IntersectionObserver and one MutationObserver for the life of the app,
 * created once and disconnected once — a navigation adds neither. That matters
 * because `IntersectionObserver` holds its targets **strongly**: a section left
 * observed after its page was unmounted is a detached tree the collector cannot
 * take, one per section per navigation, which is the leak a naive re-scan would
 * trade the bug for. So removals are handled as deliberately as arrivals, and
 * `watched` is what keeps the two in step.
 *
 * ## And it does not fight the frame loop
 *
 * Both observers are callback-driven. Neither asks for an animation frame,
 * neither listens to scroll, and nothing here calls `hold()`, so `motion.ts`
 * still parks with nothing to do — see AGENTS.md rule 9.
 */
export function useOffscreenPause() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ;(entry.target as HTMLElement).dataset.live = String(entry.isIntersecting)
        }
      },
      { rootMargin: '120px 0px' },
    )

    const watched = new Set<HTMLElement>()

    const watch = (el: HTMLElement) => {
      if (watched.has(el)) return
      watched.add(el)
      // Live until the observer says otherwise. Its first callback is
      // asynchronous, and a section that started life `false` would have its
      // animations parked for the frames before the answer arrives — visible
      // as a gradient that is still when the page opens on top of it.
      el.dataset.live = 'true'
      io.observe(el)
    }

    const forget = (el: HTMLElement) => {
      if (!watched.delete(el)) return
      io.unobserve(el)
    }

    const scan = () => {
      for (const el of document.querySelectorAll<HTMLElement>(SECTIONS)) watch(el)
    }

    scan()

    const mo = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (!(node instanceof HTMLElement)) continue
          // The section itself, and the sections inside it: a route change
          // removes one `<main>`, and every section it held goes with it
          // without a record of its own.
          if (node.matches(SECTIONS)) forget(node)
          for (const el of node.querySelectorAll<HTMLElement>(SECTIONS)) forget(el)
        }
      }
      // Cheaper than walking `addedNodes` and correct in the case that walk
      // gets wrong: a batch that removed one page and added another has to
      // look at the whole document anyway, and a section nested inside an
      // added wrapper is found without descending it by hand. `watch` is a
      // set lookup per section, and this page has ten of them.
      scan()
    })
    // childList only. Attributes change every frame on this site — the frame
    // loop writes inline transforms — and asking for those would run this
    // callback sixty times a second to learn nothing.
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      io.disconnect()
      watched.clear()
    }
  }, [])
}
