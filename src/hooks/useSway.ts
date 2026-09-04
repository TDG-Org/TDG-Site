import { useEffect, useRef } from 'react'
import { onFrame } from '../lib/motion'
import { usePointer } from './usePointer'

/**
 * Mouse parallax: a layer that slides with the cursor rather than with the
 * scroll.
 *
 * **This lived in `components/Tools.tsx` as a private hook until the Scene
 * Editor needed a second caller.** It is unchanged apart from the move —
 * `Tools.tsx` imports it from here now, and `scene/ThemedArt.tsx` uses it for
 * any slot a draft sets to `motion: 'sway'`. The comments below are the ones
 * that were written for the boulders, because every one of them is still the
 * reason this hook has the shape it has.
 *
 * ## Why it is one writer per element
 *
 * `useParallax` owns `element.style.translate` outright — it writes the whole
 * value every frame from its own lerp and never reads what anything else left
 * there. Adding a second writer to the same element is the exact bug
 * `scene/ThemedArt.tsx`'s header describes: two writes race inside one frame
 * and the layer stutters between two positions. So a layer takes the scroll
 * drift OR the pointer sway, never both — which is why the editor's motion
 * control is a set of exclusive choices rather than a row of checkboxes, and
 * why `Tools.tsx` puts the sway on a wrapper box around an `<img>` that is
 * already drifting.
 *
 * Where it goes on a wrapper, keep the wrapper the ART's own box rather than
 * the section: the compositor layer it promotes is then a few hundred pixels
 * square and not a viewport.
 *
 * ## Why there is no lerp and no `hold()` here
 *
 * `usePointer` already damps, and it already holds the loop while its own lerp
 * converges and snaps when it lands. What is written here is a pure function
 * of two numbers that are correct on the frame they are read — the same shape
 * as `useHeroParallax`, which needs no smoothing of its own for the same
 * reason. A second lerp on top would add lag and a second reason for the loop
 * never to park.
 *
 * ## Why it checks its own rect
 *
 * `useOffscreenPause` stamps `data-live` on a section and `base.css` turns
 * that into `animation-play-state: paused`, but an `onFrame` subscriber never
 * sees an attribute — `hooks/README.md` is explicit that anything driven from
 * JS has to check for itself. Off screen this neither writes nor holds. There
 * is no stale-state problem on the way back in: with no lerp behind it, the
 * first frame inside the viewport computes and paints the correct offset
 * before the browser paints anything.
 *
 * At `mi === 0` both terms are zero — `usePointer` already returns 0,0 under
 * reduced motion, and the multiply here makes that visible at the call site
 * rather than a fact you have to go and look up — so the layer rests exactly
 * where it composed. That is the identity the art kit asks for, not a hidden
 * layer, and it is also what lets the Scene Editor freeze the page for
 * placement by calling `setMotionIntensity(0)`.
 */
export function useSway<T extends HTMLElement>(x: number, y: number) {
  const ref = useRef<T | null>(null)
  const pointer = usePointer()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let painted = ''

    return onFrame(({ vh, mi }) => {
      const r = el.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= vh) return
      const next = `${(pointer.x * x * mi).toFixed(2)}px ${(pointer.y * y * mi).toFixed(2)}px`
      if (next === painted) return
      painted = next
      return () => {
        el.style.translate = next
      }
    })
  }, [pointer, x, y])

  return ref
}
