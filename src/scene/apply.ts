import type { CSSProperties } from 'react'
import type { Placement } from './types'

/**
 * A draft placement, as inline style.
 *
 * ## Why inline, and why only the fields that are set
 *
 * The shipped placement of every piece is a CSS rule, and most of those rules
 * are a `calc()` over four tokens with a paragraph above them explaining how
 * the numbers were solved. An editor that replaced those wholesale would throw
 * away the part that is right — the mask, the `object-position`, the clamp
 * that keeps a box inside the frame at 320px — in order to change the one part
 * that is not. So a draft writes as little as it can: an absent field is not a
 * zero, it is "the stylesheet still decides".
 *
 * Inline is the only place that reliably wins over a stylesheet without an
 * `!important` arms race, and it is also what makes the draft readable — the
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
 * `useParallax` owns the standalone `translate` property, several pieces carry
 * a `transform` of their own in CSS (the Outro's path is mirrored that way),
 * and the theme cross-fade owns `filter`. The individual `rotate` and `scale`
 * properties compose with all three instead of replacing any of them, which is
 * the same reasoning `scene/Scene.css` gives for the motion hooks using
 * `translate` rather than a transform.
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
 *  at, and it keeps the draft JSON readable when I come to bake it into CSS. */
function round(n: number, places = 3): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/**
 * Read a live element's placement back out, in the same units.
 *
 * This is what the first drag of an untouched piece uses: rather than starting
 * from zero, the editor measures where the stylesheet actually put the thing
 * and writes that down, so the very first pixel of movement is relative to the
 * shipped position rather than to the top-left corner of its parent.
 *
 * **The motion hooks' `translate` is subtracted out**, because
 * `getBoundingClientRect` includes it and a layer measured mid-drift would be
 * recorded at wherever it happened to be drifting. The editor freezes motion
 * while it is open (`setMotionIntensity(0)`, which parks every drift at its
 * resting position), so in practice this reads `0px 0px` — but a draft that
 * quietly depended on that would break the first time somebody turned motion
 * back on and dragged something, so it is handled here rather than assumed.
 */
export function measurePlacement(el: HTMLElement): Required<Pick<Placement, 'x' | 'y' | 'w'>> {
  const parent = (el.offsetParent as HTMLElement | null) ?? document.documentElement
  const pr = parent.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const [tx, ty] = readTranslate(el)
  const pw = pr.width || 1
  const ph = pr.height || 1
  return {
    x: ((r.left - tx - pr.left) / pw) * 100,
    y: ((r.top - ty - pr.top) / ph) * 100,
    w: (r.width / (window.innerWidth || 1)) * 100,
  }
}

/** `translate: 12.30px -4.00px` -> [12.3, -4]. Anything else is [0, 0]. */
function readTranslate(el: HTMLElement): [number, number] {
  const raw = el.style.translate
  if (!raw) return [0, 0]
  const parts = raw.trim().split(/\s+/)
  const x = Number.parseFloat(parts[0] ?? '')
  const y = Number.parseFloat(parts[1] ?? '')
  return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0]
}

/** Move a placement by a pixel delta, in the units the draft stores. */
export function nudge(
  p: Required<Pick<Placement, 'x' | 'y' | 'w'>>,
  dxPx: number,
  dyPx: number,
  parent: DOMRect,
): { x: number; y: number } {
  return {
    x: p.x + (dxPx / (parent.width || 1)) * 100,
    y: p.y + (dyPx / (parent.height || 1)) * 100,
  }
}
