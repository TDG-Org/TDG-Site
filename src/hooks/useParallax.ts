import { useEffect, useRef } from 'react'
import { onFrame, settle } from '../lib/motion'

/**
 * How far outside the viewport a layer goes on being painted, in px.
 *
 * `useOffscreenPause` cannot reach this. It stamps `data-live` on a section and
 * `base.css` turns that into `animation-play-state: paused` on everything
 * inside — but an `onFrame` subscriber knows nothing about an attribute.
 * Anything driven from JS instead of CSS keyframes has to check for itself,
 * which is what every JS-driven scene on this page already does and what this
 * had been missing. Four of them, and each reads a rect inside its own tick
 * and returns before it draws: `hero/Starfield.tsx`, `origin/CabinScene.tsx`,
 * `components/faith/Summit.tsx` and `components/scene/Snow.tsx`. (That list
 * named `origin/OriginField.tsx` until this pass, which was deleted;
 * `CabinScene.tsx` is the three.js scene that replaced it and had to answer
 * the same question again.)
 *
 * **400px, and deliberately not the 120px `useOffscreenPause` uses**, because
 * the two are answering different questions. That hook decides WHETHER a CSS
 * animation ticks, and being a frame late about it costs nothing. This one
 * decides WHERE an element is, through a lerp that takes about 17 frames to
 * settle into its natural lag behind the target. Re-enter 120px out and the
 * layer spends a third of a second ON SCREEN drifting at not quite the right
 * rate: no snap, nothing you could point at, but still a behaviour change at
 * the exact moment somebody starts looking at the section, and this guard is
 * only allowed to be a saving. 400px is those 17 frames at a brisk 1400px/s
 * scroll, so the settle is spent where nobody is. Flick faster than that and
 * what is left is a fraction of a pixel per frame on a blurred decorative layer
 * that is already smearing past.
 *
 * The margin also has to clear the biggest drift a layer can carry, because the
 * rect measured below already includes that drift and the drift is frozen while
 * the layer is parked — too small a margin and the guard could park something
 * that is still on screen. At the band edge the largest factor on the page
 * (0.2, the Tools blob) is worth (vh/2 + 400 + height/2) x 0.2: about 280px on
 * a 1000px viewport with a 1000px layer, and still under 400 at 1400 x 1400.
 * Take a factor past ~0.25 and this number has to come up with it.
 */
const PARK_MARGIN = 400

/**
 * Drift a decorative layer against its own distance from the viewport centre.
 * Uses the standalone `translate` property so any `transform` the element
 * already carries (centring, rotation) survives untouched.
 *
 * **Twenty of these run on the home page**, and this header is the one place
 * that number lives — `src/hooks/README.md` points here for it and deliberately
 * does not repeat it, because a figure written down twice is one that will
 * eventually disagree with itself.
 *
 * Two greps, because a call site is not a subscriber: `grep -rn 'useParallax<'
 * src/` gives twelve on the home page — Apps 3 (blob, seam, canopy), Faith 3
 * (blob, seam, climb), Building 2, Tools 2, Origin 1, Outro 1 — and skips
 * `About.tsx`, `AppPage.tsx` and `Store.tsx`, which are other routes, and this
 * file's own declaration. `grep -rn '<ThemedArt' src/` gives eight more on the
 * home page — Building 3, Apps 2, Tools 2, Outro 1 — each of which is one more
 * subscriber through `scene/ThemedArt.tsx`'s single `useParallax<` above.
 * Twelve plus eight.
 *
 * It was seventeen (ten plus seven) when this line was last counted, so re-run
 * both greps rather than trusting the arithmetic. `<StillArt>` is NOT in it —
 * it calls neither hook and writes nothing, which is `ThemedArt.tsx`'s whole
 * reason for being three components.
 *
 * Off screen they now cost the rect and nothing else — see `PARK_MARGIN`.
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

      /* ── reduced motion snaps to the identity; it never eases to it ───────
         The rule is `usePointer.ts`'s and it is the page's: "an eased return
         IS motion, and the one moment it would ever play is the moment
         somebody asked for less of it." The cabin and the snow already agree;
         this hook did not, and it is the one with the most layers on it — a
         visitor who TOGGLED the preference mid-session watched every parallax
         layer on the page glide to rest, about seventeen frames of exactly the
         motion they had just asked to stop.

         One assignment, and it is deliberately placed to leave the three
         things around it alone.

         **It cannot swallow the identity write.** `current` is set to the
         target rather than returned on, so the frame falls through to the
         write path below and emits `0 0.00px` exactly once — after which
         `next === painted` suppresses every frame after it, which is the same
         mechanism that already stops a settled lerp rewriting its own string.
         A `return` here instead would leave whatever drift was last painted
         sitting on the element forever.

         **It cannot hold the loop.** With `current === target` the convergence
         test below is 0 and `hold()` is skipped, so the loop parks on the
         frame after the toggle. `motion.ts` wakes it for the preference change
         itself, which is what makes the one frame happen at all.

         **And it changes nothing while `mi > 0`**, where the branch is never
         taken and the lerp runs exactly as it did. */
      if (mi === 0) current = target

      /* ── parked: nobody can see this layer ────────────────────────────────
         The rect read stays, because the guard is what needs it — and it has to
         be THIS element's rect rather than its section's. These layers are
         deliberately larger than their sections and drift against them, so a
         section's rect is not its art's rect. What goes is the `toFixed`, the
         write closure, the inline style write the browser then has to
         recalculate, and the `hold()` — which until now kept the whole frame
         loop awake for a lerp nobody could see.

         `current = target` rather than a bare `return`, and that one line is
         the difference between this working and this flickering. Freeze
         `current` instead and it is only correct for as long as the scroll
         position it was frozen at stays true: a hash jump into a section, a
         lazy image resizing the page above it, or a reduced-motion toggle
         leaves it hundreds of pixels out, and the layer then snaps or slides to
         catch up on the first frame anybody can see it. That is a flicker at
         the exact moment somebody starts looking, which is worse than the cost
         being removed. Tracking the target while parked is two multiplies and
         an assignment, and it means the first live frame starts from zero error
         instead of unwinding one.

         Nothing shows the frozen position on the way back in, either: this read
         and the write it returns happen inside the same frame, before the
         browser paints, so the first frame back inside the band is already
         painted in the right place.

         Reduced motion comes through here too. At `mi === 0` the target is 0,
         so a parked layer syncs to 0 and takes its one identity write on the
         frame it re-enters the band — 400px before it can be seen. The guard
         defers that write, it never swallows it, and a layer that was never
         painted at all is sitting at the identity position already. */
      if (r.bottom < -PARK_MARGIN || r.top > vh + PARK_MARGIN) {
        current = target
        return
      }

      // the lerp is still converging, so it needs the next frame even if the
      // page has stopped moving
      if (Math.abs(target - current) > 0.02) hold()
      current += (target - current) * settle(0.16, dt)
      const next = `0 ${current.toFixed(2)}px`
      // A style write the browser has to recalculate is not free. Once the lerp
      // has settled this is the same string every frame, so do not write it again.
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
 * Layers that ride the hero's own displacement rather than their own. The
 * hero sinks as you scroll and these follow it at their own rate.
 *
 * ## How many things ride this
 *
 * **`grep -rn 'useHeroParallax<' src/` returns two call sites, and one of them
 * is live.** `components/Faith.tsx` puts it on the rays; `scene/ThemedArt.tsx`
 * puts it on `ThemedHeroArt`, which has no caller of its own and is kept on
 * purpose (`scene/README.md` says why). So the home page carries exactly ONE
 * subscriber — counted in the live DOM, one `.faith__rays`. **Neither call
 * site is in the hero.** The hero is a pinned `scene/Stage` now and drives its
 * six layers off one shared rect per frame in `Hero.tsx`.
 *
 * `src/hooks/README.md` points here for that count and deliberately does not
 * repeat it, so it has to be right in this header and nowhere else.
 *
 * ## Why this one has no off-screen guard when `useParallax` does
 *
 * **There is no stale state here to be wrong about.** This writes a pure
 * function of the hero's rect with no lerp behind it, so whatever frame it
 * resumed on it would write exactly what an unguarded run writes on that frame.
 * The entry problem that makes the guard next door delicate — a `current` that
 * goes stale while parked — does not exist in this hook.
 *
 * **And the guard would not be free here, where next door it is.**
 * `useParallax` already has the element's own rect in hand, so its guard is two
 * comparisons on a number it had to measure anyway. This hook reads the HERO's
 * rect — one element, shared by every subscriber — and never touches the
 * element it writes to. Guarding it means a second `getBoundingClientRect` per
 * subscriber per frame, plus a number shadowing the string it already keeps so
 * it can tell where the frozen drift has actually left the element: a
 * measurement added to every live frame, and two measurements left on every
 * parked one, to save one style write.
 *
 * **At one subscriber that is not a close call, and the argument got stronger
 * rather than weaker as the count fell.** This note used to argue it at six
 * subscribers and it held there; a guard whose only saving is one style write
 * cannot pay for a per-frame measurement at any count where the measurement is
 * the larger half, and one is where that is most obvious. Next door the same trade
 * is worth taking because the rect is already paid for AND because twenty
 * layers take it. Do not read the falling number as a reason to revisit this:
 * it is the same conclusion with less doubt in it.
 *
 * It also never calls `hold()`, so unlike `useParallax` it has never kept the
 * loop from parking. A reader sitting still pays nothing for it at all; its
 * cost exists only while the page is already moving.
 *
 * **The version that used to look free, and no longer exists.** When most
 * subscribers lived inside `.hero`, the hero's own rect — already read on the
 * line below — would have settled them at no cost, since anything clipped out
 * of the hero is off screen when the hero is. That shortcut is gone twice
 * over: nothing rides this hook inside `.hero` any more, and `.hero` is
 * `overflow: clip` rather than `hidden`. It was not taken while it was
 * available either, and that half is the part to keep: it makes this hook's
 * behaviour depend on where in the DOM its element sits and on an `overflow`
 * declared in `Hero.css`, a file this hook otherwise has no reason to know
 * about, where deleting one line would silently hide a layer. Rebuild it only
 * with that cost stated.
 *
 * If this ever grows a lerp, or grows to `useParallax`'s twenty, guard it on
 * the LIVE box — the element's rect corrected by the drift about to be written
 * — and never on the frozen one. The drift here scales with total scroll rather
 * than with the viewport, so no fixed margin can absorb it.
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
