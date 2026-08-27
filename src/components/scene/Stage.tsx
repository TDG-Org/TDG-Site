import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import { onFrame } from '../../lib/motion'
import './Stage.css'

/**
 * How far outside the viewport the stage keeps painting, in px.
 *
 * The same 120 `useOffscreenPause` uses, and for the same reason: the guard is
 * a paint saving, so being a frame early costs a frame of a full-viewport
 * backdrop and being a frame late costs a visible pop-in. It does not need
 * `useParallax`'s 400 -- nothing here is converging, so there is no settle to
 * spend off screen.
 */
const COVER_MARGIN = 120

/**
 * A backdrop that stays put while its section's content scrolls over it.
 *
 * ```tsx
 * <section id="faith" className="section section--blend stage-host faith">
 *   <Stage className="faith__stage">
 *     <Moon className="faith__moon" />
 *     <ThemedArt art="landscapes/mountain-ridge" className="faith__ridge" factor={0.04} />
 *   </Stage>
 *   <div className="shell"> ... </div>
 * </section>
 * ```
 *
 * This is the one architectural idea taken from the reference the site owner
 * named: a fixed backdrop with ordinary sections scrolling over it, which is
 * what makes a hero look pinned while its copy fades away. The reference does
 * it with one `position: fixed` full-viewport WebGL canvas behind the whole
 * document. This does it per section instead, with `position: sticky`, because
 * on this page each section owns its own scenery and a single page-wide layer
 * would have to be told which section's art to be showing -- which is a router
 * for pictures. The cost of the per-section version is that a stage is clipped
 * at its section's edges, so scenery cannot bleed from one section into the
 * next; the moon has to be handed over rather than carried across.
 *
 * `pointer-events: none`, `aria-hidden`, and one stacking context at the
 * section's floor.
 *
 * ## Two things that are easy to get wrong
 *
 * **1. A sticky box sticks inside its containing block, and a `.section` will
 * not let it stick at all.**
 *
 * `Stage` renders two elements. The outer is `position: absolute; inset: 0`,
 * so it exactly covers the section's padding box and adds NOTHING to the flow
 * -- measured on `#origin`: 1935px tall with a stage and 1935px without one. A
 * sticky box is in normal flow, so a bare `height: 100svh` sticky element as a
 * direct child of the section would have pushed the section's copy down by a
 * whole viewport.
 *
 * The inner element is the sticky one, and its containing block is that outer
 * box -- the section's padding box. So the stage stays pinned for
 * `section height - 100svh` of scrolling, starting when the section's TOP edge
 * reaches the viewport top and releasing exactly at its BOTTOM edge. Measured
 * on `#origin`, 1935px tall in a 414px-tall viewport: the stage held a constant
 * offset for 1521px of scroll and then released at 1935px with its bottom
 * sitting exactly on the section's bottom.
 *
 * (The constant it held was 120 and not 0, and that offset was an artefact of
 * the session it was read in rather than anything this file chose:
 * `useHeroTakeover` was live then and translated `#origin` down by up to
 * TAKEOVER_LAG px while the section arrived, and a translate carries the whole
 * section with it. **That hook has since been deleted** -- the hero pins and
 * Origin climbs over it on a `margin-top: -100svh`, so nothing writes a
 * transform to `#origin` any more -- so a fresh reading lands on a different
 * number, and re-measuring against 120 would be checking against a value that
 * described a deleted mechanism. CONSTANT is the claim, and it is also the
 * half that did not change. Unpinned, the same readings ran 72 -> -228 ->
 * -1449. This 120 has nothing to do with `COVER_MARGIN`'s 120 above: that one
 * is a number this file picked, this one is a number a browser reported once.)
 *
 * In a section SHORTER than the viewport the sticky box is taller than its
 * containing block and never pins at all: it is then just a viewport-tall
 * backdrop clipped to the section, which is a perfectly good thing to be but
 * is not pinning, so do not tune an effect against it.
 *
 * **`.section` is `overflow: hidden`, and that stops sticky dead.** An
 * ancestor with `overflow: hidden` is a scroll container, so it becomes the
 * sticky box's scrollport -- and since it never scrolls, the box never sticks.
 * Measured on `#origin` in this repo: with the section's own `overflow: hidden`
 * the stage tracked the section down the page (top 72 -> -228 -> -1449) instead
 * of pinning. The fix is `overflow: clip`, which clips identically and is
 * explicitly NOT a scroll container. `Stage.css` ships that one line as
 * `.stage-host`; **put it on the section**, beside `.section`. Verified in the
 * same measurement: with `clip` the stage pinned. (`body { overflow-x: hidden }`
 * in `base.css` is NOT a problem -- `html`'s overflow is `visible`, so the
 * body's value propagates to the viewport and the body itself is treated as
 * `visible`. Verified: a control sticky element with no overflow ancestor
 * pinned correctly.)
 *
 * **2. A covered backdrop still costs paint for the rest of the page.**
 *
 * A full-viewport layer that stopped being visible at the top of the page goes
 * on being painted and composited all the way to the footer -- exactly the
 * waste `motion.ts` and `useOffscreenPause` exist to remove, and at
 * viewport scale. So the stage watches its own section's rect on the frame
 * loop and stamps `data-covered` on itself once the section is more than
 * `COVER_MARGIN` outside the viewport; `Stage.css` turns that into
 * `visibility: hidden`, which stops paint and compositing for the whole
 * subtree.
 *
 * `visibility` and not the alternatives, on purpose:
 *
 * - `display: none` and `content-visibility: hidden` are bigger wins because
 *   they skip layout too, and both are wrong for what lives in here. Measured:
 *   `display: none` took a child canvas's `clientWidth` from 276 to 0, which is
 *   what `Snow` sizes its backing store from -- so every trip past the section
 *   would blank and re-seed the field, and the re-seed is a visible
 *   re-randomisation of every flake. `content-visibility: hidden` left the same
 *   canvas measuring 276x414 here, but it applies size containment to the
 *   subtree and a `ResizeObserver` on skipped content is specified to report a
 *   zero box, which is the same failure arriving through the other door. That
 *   half is NOT verified in this session -- ResizeObserver delivery needs a
 *   rendering lifecycle this browser was not running -- so the guard uses the
 *   tool whose cost was actually measured. `visibility: hidden` left the pin's
 *   rect and the child canvas's `clientWidth`/`clientHeight` byte-identical.
 * - An `IntersectionObserver` would be cheaper per frame, and `useOffscreenPause`
 *   already runs one. It is not used here because its callback is asynchronous:
 *   a backdrop that reappears a frame or more after the reader has scrolled
 *   back to it pops in at viewport size. The rect read costs one measurement
 *   per frame **only while the loop is awake**, which is only while the page is
 *   moving, and this subscriber never calls `hold()` -- so a parked reader pays
 *   nothing for it. An observer would also mean the strong-reference bookkeeping
 *   `useOffscreenPause`'s header spells out, per stage.
 *
 * The guard reads `mi` nowhere, which is what makes it correct under reduced
 * motion: it is a paint saving, not an animation, so it behaves identically at
 * `motionIntensity() === 0` and the stage is visible whenever its section is.
 * It is reversible in the frame the section comes back, and it starts VISIBLE
 * -- the attribute is only ever added by a frame that measured the section
 * away, so a stage that never gets a frame is a stage you can see.
 *
 * **The guard is a paint guard, not a work guard.** It cannot reach an
 * `onFrame` subscriber inside the stage, for exactly the reason `data-live`
 * cannot: a tick knows nothing about an attribute. Anything in here that draws
 * from JavaScript still does its own rect check -- `Snow` does, and
 * `hooks/README.md` says why.
 *
 * ## And it is not a wrapper
 *
 * `Stage` goes BESIDE the section's content, not around it. It takes no flow
 * space, so it cannot push anything, and it creates exactly one stacking
 * context, at `z-index: 0` -- under `.shell`'s `z-index: 1`. That means
 * nothing a caller puts inside a stage can paint over the copy however it
 * numbers itself, which is guardrail 2 of the art kit made structural instead
 * of remembered. It also means the stage can never trap the content above it,
 * because it never contains it.
 */
export function Stage({
  children,
  className,
}: {
  /** Layers to draw. Positioned by the caller's own CSS. */
  children: ReactNode
  className?: string
}): JSX.Element {
  const root = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    // The section is the honest box: the sticky child's own rect is pinned to
    // the viewport for as long as the section is anywhere near it, so it is a
    // poor thing to ask "can this be seen". `?? el` covers a stage placed
    // somewhere that is not a section, where the stage's own box is all there
    // is to go on.
    const box: Element = el.closest('section') ?? el
    let covered: boolean | null = null

    return onFrame(({ vh }) => {
      const r = box.getBoundingClientRect()
      const next = r.bottom < -COVER_MARGIN || r.top > vh + COVER_MARGIN
      // The state only changes twice per traversal. Everything else is one
      // rect and a comparison, and no attribute write for the browser to
      // recalculate style from.
      if (next === covered) return
      covered = next
      return () => {
        if (next) el.setAttribute('data-covered', 'true')
        else el.removeAttribute('data-covered')
      }
    })
  }, [])

  return (
    <div
      ref={root}
      className={`stage${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <div className="stage__pin">{children}</div>
    </div>
  )
}
