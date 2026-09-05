/**
 * The shape of the scene — what the Scene Editor writes and what
 * `store.ts` hands back to the art layer.
 *
 * Everything here is a DRAFT. Nothing in this file is applied to the page for
 * an ordinary visitor: `store.ts` only ever holds a document once the editor
 * has been switched on by an admin, and the committed default of every slot is
 * still the CSS in `src/components/*.css`. See `src/scene/README.md` for the
 * arrangement: saving this file IS making it the default.
 */

/** The one place a theme name is spelled, for this folder. */
export type ThemeKey = 'dark' | 'light'

/**
 * How a layer answers the page.
 *
 * These are the three things `scene/ThemedArt.tsx` can build, and they map one
 * to one onto the hooks: `still` calls none, `drift` calls `useParallax`, and
 * `sway` calls `usePointer` through the same lerp `Tools.tsx` uses for the
 * boulders. `hero` is `useHeroParallax` — a layer riding the hero's own
 * displacement rather than its own, which only makes sense inside the hero and
 * so is offered only there.
 */
export type Motion = 'still' | 'drift' | 'sway' | 'hero'

/** The seven places an added piece can be anchored. */
export type SectionId = 'hero' | 'origin' | 'apps' | 'tools' | 'games' | 'faith' | 'outro'

export const SECTION_IDS: readonly SectionId[] = [
  'hero',
  'origin',
  'apps',
  'tools',
  'games',
  'faith',
  'outro',
]

/**
 * Where a layer sits, in units that survive a change of viewport.
 *
 * **Percentages of the offset parent for position, `vw` for size**, and that
 * pairing is the whole reason the scene is portable between one window and the
 * next. A pixel offset read off a 1904px window is wrong on a 1280px one; a
 * percentage of the box the layer is actually positioned inside is the same
 * placement at both. Size is `vw` rather than a percentage because the art kit
 * is drawn at a scale relative to the PAGE, not to whichever clip box happens
 * to be its parent — `Games.css` states its own rows in `vw` for the same
 * reason, and a piece dragged from the library should land at a size that
 * reads the same way on a laptop and a monitor.
 *
 * Every field is optional and only the ones present are written. That is what
 * lets the scene say "this piece moved 40px left" without also having to restate
 * the height, the `object-position` and the mask that its CSS rule already
 * gets right. An absent field is not a zero; it is "the stylesheet decides".
 */
export type Placement = {
  /** left, as a percentage of the offset parent's width. */
  x?: number
  /** top, as a percentage of the offset parent's height. */
  y?: number
  /** width, in `vw`. */
  w?: number
  /** height, in `vh`. Usually absent — most pieces take their height from
   *  their own `aspect-ratio`, and writing one here breaks that. */
  h?: number
  /** 0..1, multiplied into whatever the stylesheet's opacity token resolved
   *  to. Absent means the token alone. */
  opacity?: number
  /** `z-index`. Absent means the stylesheet's, which is almost always auto —
   *  so DOM order decides, which is what the sections are written around. */
  z?: number
  /** degrees. */
  rotate?: number
  /** mirror horizontally. */
  flip?: boolean
  /**
   * Draw a piece the stylesheet is not drawing.
   *
   * Several slots are `display: none` in one theme — the whole Cebu clearance
   * is written that way, and `.tools__fence` and `.outro__stair-clip` were
   * before it. They are still in the DOM, so the editor's Layers list finds
   * them and can select them, and without this that selection is a dead end:
   * a 0x0 box that cannot be dragged and a panel with nothing to change.
   *
   * `hidden` wins over this, so the two cannot fight. Absent means the
   * stylesheet decides, which is the answer for almost every slot.
   */
  shown?: boolean
}

/** An override on a piece the page already draws, keyed by its own class. */
export type SlotOverride = Placement & {
  motion?: Motion
  /** `useParallax` factor, when `motion` is `drift` or `hero`. */
  factor?: number
  /** Pointer sway amplitude in px, when `motion` is `sway`. */
  swayX?: number
  swayY?: number
  /** Swap the artwork this slot draws, without touching where it sits. */
  art?: string
  /** Draw nothing. Kept rather than deleted so the piece can come back, and
   *  so the scene can say "not this one" about a slot it does not own. */
  hidden?: boolean
}

/** A piece the page does NOT draw, added by the editor. */
export type Extra = Placement & {
  /** Stable id, also the React key and the value of `data-extra`. */
  id: string
  /** Which section's art layer it lives inside. */
  section: SectionId
  /** A kit name without the theme suffix — `props/coconut-palm-tall`. */
  art: string
  motion: Motion
  factor?: number
  swayX?: number
  swayY?: number
  hidden?: boolean
  /** What the editor's Layers list calls it. */
  label?: string
}

/** One theme's worth of edits. */
export type ThemeDoc = {
  slots: Record<string, SlotOverride>
  extras: Extra[]
}

/** The whole scene: the two themes are edited and saved independently, which is
 *  the site's own rule 12 restated as a data shape. */
export type SceneDoc = {
  version: 1
  dark: ThemeDoc
  light: ThemeDoc
}

export const emptyThemeDoc = (): ThemeDoc => ({ slots: {}, extras: [] })

export const emptyDoc = (): SceneDoc => ({
  version: 1,
  dark: emptyThemeDoc(),
  light: emptyThemeDoc(),
})

/** One row of `public/assets/parallax/manifest.json`. */
export type ArtSlotInfo = {
  name: string
  group: string
  dark: boolean
  light: boolean
}
