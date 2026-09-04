import type { CSSProperties, JSX, RefObject } from 'react'
import { asset } from '../../lib/asset'
import { useHeroParallax, useParallax } from '../../hooks/useParallax'
import { useSway } from '../../hooks/useSway'
import { useTheme } from '../../theme/ThemeProvider'
import { useSlotOverride } from '../../scene/store'
import { placementStyle } from '../../scene/apply'
import type { Motion, SlotOverride } from '../../scene/types'
import './Scene.css'

/** A path under public/assets/parallax/, WITHOUT the theme suffix or the
 *  extension. e.g. 'landscapes/mountain-ridge' or 'props/pine-faceted-pair'. */
type ArtName = string

/** Default pointer-sway amplitude, in px at full deflection. `Tools.tsx`'s
 *  boulders are 12 and 7; a piece a draft turns into a sway layer starts
 *  there and the editor's own sliders take it from anywhere. */
const SWAY_X = 12
const SWAY_Y = 7

/**
 * One piece of the parallax art kit, in the right artwork for the theme.
 *
 * The two files are **separate artwork**, not one image and a filter. The
 * kit's own README says so in as many words: `-dark` carries a midnight-blue
 * note and `-light` is paler mist and silver with a narrow graphite line,
 * because the two themes have different contrast ranges to sit inside. A
 * `filter: invert()` or a `brightness()` on one file would undo the decision
 * the illustrator already made and produce art that is merely not-black
 * rather than art that belongs. So this swaps the `src`, and nothing here
 * ever recolours a pixel.
 *
 * Everything it draws is decorative and says so four ways — `alt=""`,
 * `aria-hidden`, `pointer-events: none` from the stylesheet, and
 * `draggable={false}` so a cursor that catches the edge of a mountain does
 * not start dragging it across the page.
 *
 * `data-slot` is the piece's own class, and it is the id the Scene Editor
 * selects, stores and saves against. It is written for everybody rather than
 * only in edit mode, because an attribute costs nothing and a page you can
 * only inspect while a developer tool is loaded is a page nobody can inspect.
 */
function Art({
  art,
  light,
  className,
  moves,
  elementRef,
  style,
  slot,
  extraId,
}: {
  art: ArtName
  light?: ArtName
  className: string
  moves: boolean
  elementRef?: RefObject<HTMLImageElement | null>
  style?: CSSProperties
  slot?: string
  extraId?: string
}): JSX.Element {
  const { theme } = useTheme()
  /*
   * ── `light`: the Cebu theme is a different PICTURE, not a different ink ──
   * The winter kit's two files per piece are one drawing in two palettes, so
   * one name with a theme suffix was the whole story. The Cebu set replaces
   * the light picture outright — a palm where the pine was, the sea where the
   * ridge was — and a palm saved as `pine-row-light.webp` would be a lie the
   * next reader has to discover. So a slot may name its light piece: the dark
   * name stays the slot's identity and every winter call site is untouched.
   *
   * `data-twin` carries the OTHER theme's URL for `theme/artPrefetch.ts`,
   * which used to derive the twin by swapping the suffix on the same name and
   * cannot once the two themes are two names.
   */
  const shown = theme === 'light' && light ? light : art
  const twin = theme === 'light' ? art : (light ?? art)
  const twinTheme = theme === 'light' ? 'dark' : 'light'
  return (
    <img
      ref={elementRef}
      data-twin={asset(`assets/parallax/${twin}-${twinTheme}.webp`)}
      data-slot={slot}
      data-extra={extraId}
      className={`scene__art${moves ? ' scene__art--moves' : ''} ${className}`}
      style={style}
      /* `.webp`, not `.png`, and this is not a preference.
         The kit ships both: the PNG is the source art the illustrator's tool
         emits and it stays in the repo, but it is up to 2.1 MB per cutout at
         2172px wide for a layer that paints at a few hundred CSS pixels. The
         WebP derivative beside it is the same artwork with its alpha intact
         (`yuva420p`), downscaled to the width it is actually painted at — a
         ~93% cut across the kit, and megabytes off first load on a site that
         measured its own idle main thread down to 0.1 ms/s. Point this back
         at `.png` and you hand all of that back.
         The kit's current file count and byte totals live in
         `public/assets/parallax/README.md` and are deliberately not copied
         here: this comment carried a stale pair (28 files, 28.0 MB) for a kit
         that had already grown to 36 and 35.4 MB. Nothing about the argument
         needs the number, and the number belongs beside the files.
         `asset()`, never a leading slash — rule 15. */
      src={asset(`assets/parallax/${shown}-${theme}.webp`)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
}

/*
 * ── why these are separate components and not one with a mode prop ─────────
 *
 * `useParallax`, `useHeroParallax` and `useSway` each own
 * `element.style.translate` outright: every one writes the whole value every
 * frame from its own lerp, and none reads what another left there. Attach two
 * to one element and the writes race inside a single frame — whichever ran
 * second wins, which one that is depends on effect order, and the visible
 * result is a layer that stutters between two positions rather than one that
 * does either job.
 *
 * A `mode` prop would not fix that, it would hide it: hooks cannot be called
 * conditionally, so a single component would have to call all three and then
 * pick, which is exactly the thing that breaks. Separate components means the
 * choice is made where components are CHOSEN, and each element only ever has
 * one hook writing to it.
 *
 * This is the kind of thing the next person will try to "simplify". It is not
 * a stylistic preference. Merge them and the art shakes.
 *
 * ── and this is what lets a draft change a slot's motion ───────────────────
 *
 * The three exported wrappers below now RESOLVE rather than render: each calls
 * `useSlotOverride` once, unconditionally, and then returns one of the four
 * builders. Returning a different component type is not a conditional hook —
 * it is the same "choice made at the call site" the paragraph above asks for,
 * moved one level in. React unmounts the old element and mounts the new one,
 * so the outgoing hook's cleanup runs and exactly one writer survives, which
 * is the property that mattered.
 *
 * With no draft loaded — which is everybody, always, unless a signed-in admin
 * has switched the editor on — `useSlotOverride` returns the same `undefined`
 * every render and each wrapper returns precisely what it returned before this
 * existed. See `src/scene/store.ts` for how that fast path is kept.
 */

type BuildProps = {
  art: ArtName
  light?: ArtName
  className: string
  factor: number
  style?: CSSProperties
  slot?: string
  extraId?: string
  swayX?: number
  swayY?: number
}

function DriftArt({ art, light, className, factor, style, slot, extraId }: BuildProps): JSX.Element {
  const ref = useParallax<HTMLImageElement>(factor)
  return (
    <Art art={art} light={light} className={className} moves elementRef={ref} style={style} slot={slot} extraId={extraId} />
  )
}

function HeroDriftArt({ art, light, className, factor, style, slot, extraId }: BuildProps): JSX.Element {
  const ref = useHeroParallax<HTMLImageElement>(factor)
  return (
    <Art art={art} light={light} className={className} moves elementRef={ref} style={style} slot={slot} extraId={extraId} />
  )
}

function SwayArt({ art, light, className, style, slot, extraId, swayX, swayY }: BuildProps): JSX.Element {
  const ref = useSway<HTMLImageElement>(swayX ?? SWAY_X, swayY ?? SWAY_Y)
  return (
    <Art art={art} light={light} className={className} moves elementRef={ref} style={style} slot={slot} extraId={extraId} />
  )
}

function StillInner({ art, light, className, style, slot, extraId }: BuildProps): JSX.Element {
  return <Art art={art} light={light} className={className} moves={false} style={style} slot={slot} extraId={extraId} />
}

/** The one place a resolved motion becomes a component. Exported so
 *  `scene/SceneExtras.tsx` builds an added piece exactly the way a shipped one
 *  is built, rather than growing a second, slightly different renderer. */
export function buildArt(motion: Motion, props: BuildProps): JSX.Element {
  switch (motion) {
    case 'still':
      return <StillInner {...props} />
    case 'sway':
      return <SwayArt {...props} />
    case 'hero':
      return <HeroDriftArt {...props} />
    default:
      return <DriftArt {...props} />
  }
}

/** Everything a wrapper has to work out before it can pick a builder. */
function resolve(
  o: SlotOverride | undefined,
  fallbackMotion: Motion,
  base: { art: ArtName; light?: ArtName; className: string; factor: number },
): { motion: Motion; props: BuildProps } | null {
  if (o?.hidden) return null
  return {
    motion: o?.motion ?? fallbackMotion,
    props: {
      art: o?.art ?? base.art,
      /* A draft that swaps the artwork swaps BOTH themes' pictures to the one
         it names: it is editing this theme's page, and the other theme has its
         own draft with its own answer. Leaving `light` pointing at the old
         Cebu piece would make a swapped slot draw the new art in dark and the
         old art in light, which is the sort of half-applied change that takes
         an afternoon to see. */
      light: o?.art ? undefined : base.light,
      className: base.className,
      factor: o?.factor ?? base.factor,
      style: placementStyle(o),
      slot: base.className,
      swayX: o?.swayX,
      swayY: o?.swayY,
    },
  }
}

/** Art that drifts against its own distance from the viewport centre. The
 *  usual choice for anything below the hero. */
export function ThemedArt({
  art,
  light,
  className,
  factor,
}: {
  art: ArtName
  light?: ArtName
  className: string
  factor: number
}): JSX.Element | null {
  const { theme } = useTheme()
  const o = useSlotOverride(className, theme)
  const r = resolve(o, 'drift', { art, light, className, factor })
  return r && buildArt(r.motion, r.props)
}

/**
 * Art that rides the hero's own displacement instead of its own, so a layer
 * inside the hero sinks with it rather than against it.
 *
 * **Nothing calls this today, and it is kept on purpose.** The hero is a pinned
 * `Stage` now and draws its ridges and its pine with `StillArt`; the only layer
 * left riding the hero's rect is `Faith.tsx`'s rays, which calls
 * `useHeroParallax` directly on a `<div>`.
 *
 * It stays because the block above is the reason: these are separate
 * components so that no element can ever have two motion hooks writing to it.
 * Delete the hero one and the next person who wants art tied to the hero
 * either reaches for `ThemedArt` — wrong ride, and it only looks slightly off
 * — or adds the `mode` prop, which is the bug. An export that exists so the
 * wrong thing is hard to write is doing its job while nobody calls it.
 *
 * It has a second caller now that is not a call site: the Scene Editor offers
 * `hero` as a motion for any piece inside the hero, and `buildArt` above
 * builds it through the same component.
 *
 * `scene/README.md` carries the rule this was decided under, and the condition
 * for deleting it.
 */
export function ThemedHeroArt({
  art,
  light,
  className,
  factor,
}: {
  art: ArtName
  light?: ArtName
  className: string
  factor: number
}): JSX.Element | null {
  const { theme } = useTheme()
  const o = useSlotOverride(className, theme)
  const r = resolve(o, 'hero', { art, light, className, factor })
  return r && buildArt(r.motion, r.props)
}

/** Art that does not move at all. The right answer more often than it looks:
 *  a prop anchored to a section edge reads as part of the place, and giving
 *  every layer a drift is how a page starts to feel like it is sliding. */
export function StillArt({
  art,
  light,
  className,
}: {
  art: ArtName
  light?: ArtName
  className: string
}): JSX.Element | null {
  const { theme } = useTheme()
  const o = useSlotOverride(className, theme)
  /* factor 0.06 is the kit's usual gentle drift, and it is only ever reached
     if a draft turns this slot INTO a drifting one without naming an amount. */
  const r = resolve(o, 'still', { art, light, className, factor: 0.06 })
  return r && buildArt(r.motion, r.props)
}
