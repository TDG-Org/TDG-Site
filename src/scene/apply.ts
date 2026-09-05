import type { CSSProperties } from 'react'
import type { Placement } from './types'

/**
 * A scene placement, as inline style.
 *
 * ## Why inline, and why only the fields that are set
 *
 * The shipped placement of every piece is a CSS rule, and most of those rules
 * are a `calc()` over four tokens with a paragraph above them explaining how
 * the numbers were solved. An editor that replaced those wholesale would throw
 * away the part that is right — the mask, the `object-position`, the clamp
 * that keeps a box inside the frame at 320px — in order to change the one part
 * that is not. So a placement writes as little as it can: an absent field is not a
 * zero, it is "the stylesheet still decides".
 *
 * Inline is the only place that reliably wins over a stylesheet without an
 * `!important` arms race, and it is also what makes `scene.json` readable — the
 * element in DevTools shows exactly the four numbers the editor is holding.
 *
 * ## The two opposite edges have to be cleared
 *
 * Most of these rules anchor from the far edge: `right` and `bottom`, because
 * a prop belongs to the corner it is cropped by. An absolutely positioned box
 * with `left`, `right` AND `width` all resolved ignores one of them — `right`,
 * in a left-to-right document — so writing `left` alone would look like it
 * worked and then jump the moment `width` changed. Setting the far edge to
 * `auto` in the same breath is what makes `x`/`y` mean what they say.
 *
 * ## `rotate` and `scale`, never `transform`
 *
 * `useParallax` owns the standalone `translate` property, **nine of the
 * seventeen pieces on the home page carry a `transform` of their own in CSS**
 * (the `left: 50%` + `translateX(-50%)` centring recipe, plus the Outro path's
 * mirror), and the theme cross-fade owns `filter`. The individual `rotate` and
 * `scale` properties compose with all three instead of replacing any of them,
 * which is the same reasoning `scene/Scene.css` gives for the motion hooks
 * using `translate` rather than a transform.
 *
 * That those transforms exist is also the whole reason `measurePlacement`
 * below is written the way it is. Read its header before changing either.
 */
export function placementStyle(p: Placement | undefined): CSSProperties | undefined {
  if (!p) return undefined
  const s: CSSProperties = {}
  let any = false

  if (p.x !== undefined) {
    s.left = `${round(p.x)}%`
    s.right = 'auto'
    any = true
  }
  if (p.y !== undefined) {
    s.top = `${round(p.y)}%`
    s.bottom = 'auto'
    any = true
  }
  if (p.w !== undefined) {
    s.width = `${round(p.w)}vw`
    any = true
  }
  if (p.h !== undefined) {
    s.height = `${round(p.h)}vh`
    any = true
  }
  if (p.opacity !== undefined) {
    s.opacity = round(p.opacity, 3)
    any = true
  }
  if (p.z !== undefined) {
    s.zIndex = p.z
    any = true
  }
  if (p.rotate !== undefined && p.rotate !== 0) {
    s.rotate = `${round(p.rotate, 1)}deg`
    any = true
  }
  if (p.flip) {
    s.scale = '-1 1'
    any = true
  }
  if (p.shown) {
    /* `block`, not `revert`: these are `<img>` elements, every one of them is
       `position: absolute` from `.scene__art`, and an absolutely positioned
       box computes to `block` anyway. `revert` would hand the decision back to
       the same rule that is setting `none`. */
    s.display = 'block'
    any = true
  }

  return any ? s : undefined
}

/** Three decimals is a hundredth of a pixel at any viewport this page is read
 *  at, and it keeps `scene.json` readable if it is ever baked into CSS. */
function round(n: number, places = 3): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/**
 * Read a live element's placement back out, in the same units the scene
 * stores — the LAYOUT box, never the visual one.
 *
 * This is what the first drag of an untouched piece uses: rather than starting
 * from zero, the editor measures where the stylesheet actually put the thing
 * and writes that down, so the very first pixel of movement is relative to the
 * shipped position rather than to the top-left corner of its parent.
 *
 * ## Why `offsetLeft` and not `getBoundingClientRect()`
 *
 * **This is the bug the site owner reported as "when I move the hero__ridge,
 * it snaps to a spot", and it was never about that layer.** An audit that
 * measured every piece on the page, wrote the measurement straight back as
 * inline style and re-measured — a round trip that must move nothing — found
 * NINE of seventeen jumping before any drag had happened:
 *
 *     hero__ridge        -1389.9px    origin__snow      -1526.7px
 *     hero__mid          -1275.8px    origin__pines     -1218.6px
 *     hero__rear         -1180.6px    origin__tops-art  -1123.4px
 *     origin__lamp       -1351.7px    hero__cloud--far   -799.5px
 *     hero__weather-art    -47.1px
 *
 * Every one of those numbers is that element's own CSS transform. They are the
 * `left: 50%` + `translateX(-50%)` centring recipe, and `hero__ridge`'s
 * computed transform is `matrix(1, 0, 0, 1, -1389.91, 0)` — the jump to the
 * tenth of a pixel.
 *
 * `getBoundingClientRect()` reports the box AFTER transforms. `left` positions
 * the box BEFORE them. Feed one into the other and the transform is applied
 * twice: the piece leaps by exactly its own translate, once, on the first
 * pointer-down — which is precisely what "snaps to a spot" looks like.
 *
 * `offsetLeft` / `offsetTop` are the layout offsets from `offsetParent`'s
 * padding edge, ignoring every transform and the standalone `translate`
 * property alike. Verified against the same audit: `origin__pines` sits at
 * `offsetTop -27` while its rect says `100.4`, and its parallax `translate` is
 * `0px 127.18px` — -27 + 127.18 = 100.18, so the offset really is the
 * pre-motion, pre-transform number, and no hand-rolled subtraction is needed
 * for either. (An earlier version of this file parsed `el.style.translate` and
 * subtracted it. That covered the motion hooks and nothing else, which is why
 * the layers with a CSS transform still jumped.)
 *
 * ## Why `clientWidth` is the denominator
 *
 * A percentage `left` on an absolutely positioned element resolves against its
 * containing block, which is the PADDING box of the nearest positioned
 * ancestor — and `offsetLeft` is measured from that same padding edge.
 * `clientWidth`/`clientHeight` is that box. `getBoundingClientRect().width`
 * is the border box and includes any scrollbar, so pairing it with
 * `offsetLeft` would be two different rulers; in this document that is a 10px
 * disagreement at 1904 (`walk__frost-art` measures 1894 wide in a 1904
 * viewport), which is small enough to look like drift rather than a bug.
 *
 * Width is the exception and is deliberately against the VIEWPORT, because it
 * is stored in `vw`: `1vw` is one hundredth of the viewport width including
 * the scrollbar, which is what `window.innerWidth` reports.
 *
 * ## The sub-pixel that is left, and why it stays
 *
 * `offsetLeft` and friends are rounded to whole pixels by the platform, so a
 * round trip is exact to about a pixel rather than exactly exact. Re-running
 * the same audit after this change, over every layer, at five scroll beats, in
 * both themes: 44 of 46 rows move by 0.0px and two — `origin__lamp` and
 * `outro__shore`, the two tallest boxes on the page — move by 0.8px and 0.6px.
 *
 * That is one integer rounding, it only ever applies to the FIRST grab of a
 * piece the scene has not touched (every later drag starts from the stored
 * number, not from a re-measurement), and it is a tenth of the smallest nudge
 * the arrow keys make. Removing it means reconstructing the layout box from
 * the visual rect by decomposing the computed transform matrix and its
 * `transform-origin` — which is the same class of arithmetic that produced the
 * -1526px bug, traded for 0.8px. Not worth it. If you are here because
 * something moved by hundreds of pixels, this is not the cause.
 */
export function measurePlacement(el: HTMLElement): Required<Pick<Placement, 'x' | 'y' | 'w'>> {
  const parent = offsetBox(el)
  return {
    x: (el.offsetLeft / parent.width) * 100,
    y: (el.offsetTop / parent.height) * 100,
    w: (el.offsetWidth / (window.innerWidth || 1)) * 100,
  }
}

/**
 * The box a percentage offset on this element resolves against.
 *
 * One definition, used by the measurement above AND by every drag in the
 * editor, because a drag that converted pixels to percent against a different
 * rectangle to the one the measurement used would be off by the difference on
 * every single pointer move — a slow drift rather than an obvious break, which
 * is the kind that survives a review.
 */
export function offsetBox(el: HTMLElement): { width: number; height: number } {
  const parent = (el.offsetParent as HTMLElement | null) ?? document.documentElement
  return {
    width: parent.clientWidth || window.innerWidth || 1,
    height: parent.clientHeight || window.innerHeight || 1,
  }
}

/** A pixel delta, in the units the scene stores. */
export function pxToPlacement(el: HTMLElement, dxPx: number, dyPx: number): { dx: number; dy: number } {
  const parent = offsetBox(el)
  return { dx: (dxPx / parent.width) * 100, dy: (dyPx / parent.height) * 100 }
}

/** A width delta, in the `vw` the scene stores. */
export const pxToVw = (px: number): number => (px / (window.innerWidth || 1)) * 100

/** A height delta, in the `vh` the scene stores. */
export const pxToVh = (px: number): number => (px / (window.innerHeight || 1)) * 100

/**
 * The height a piece is actually painting at, in `vh`.
 *
 * Needed the moment the editor lets the ratio be unlocked: until then a piece
 * takes its height from its own `aspect-ratio` and the scene says nothing, and
 * the first free resize has to start from the height that rule produced rather
 * than from zero. `offsetHeight` for the same reason `measurePlacement` uses
 * `offsetLeft` — it is the layout box, before any transform.
 */
export const measureHeightVh = (el: HTMLElement): number => pxToVh(el.offsetHeight)
