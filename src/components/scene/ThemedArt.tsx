import type { JSX, RefObject } from 'react'
import { asset } from '../../lib/asset'
import { useHeroParallax, useParallax } from '../../hooks/useParallax'
import { useTheme } from '../../theme/ThemeProvider'
import './Scene.css'

/** A path under public/assets/parallax/, WITHOUT the theme suffix or the
 *  extension. e.g. 'landscapes/mountain-ridge' or 'props/pine-faceted-pair'. */
type ArtName = string

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
 */
function Art({
  art,
  className,
  moves,
  elementRef,
}: {
  art: ArtName
  className: string
  moves: boolean
  elementRef?: RefObject<HTMLImageElement | null>
}): JSX.Element {
  const { theme } = useTheme()
  return (
    <img
      ref={elementRef}
      className={`scene__art${moves ? ' scene__art--moves' : ''} ${className}`}
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
      src={asset(`assets/parallax/${art}-${theme}.webp`)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
}

/*
 * ── why these are three components and not one with a mode prop ────────────
 *
 * `useParallax` and `useHeroParallax` each own `element.style.translate`
 * outright: both write the whole value every frame from their own lerp, and
 * neither reads what the other left there. Attach both to one element and the
 * two writes race inside a single frame — whichever ran second wins, which one
 * that is depends on effect order, and the visible result is a layer that
 * stutters between two positions rather than one that does either job.
 *
 * A `mode` prop would not fix that, it would hide it: hooks cannot be called
 * conditionally, so a single component would have to call both and then pick,
 * which is exactly the thing that breaks. Three components means the choice is
 * made where components are chosen — at the call site — and each element only
 * ever has one hook writing to it.
 *
 * This is the kind of thing the next person will try to "simplify". It is not
 * a stylistic preference. Merge them and the art shakes.
 */

/** Art that drifts against its own distance from the viewport centre. The
 *  usual choice for anything below the hero. */
export function ThemedArt({
  art,
  className,
  factor,
}: {
  art: ArtName
  className: string
  factor: number
}): JSX.Element {
  const ref = useParallax<HTMLImageElement>(factor)
  return <Art art={art} className={className} moves elementRef={ref} />
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
 * It stays because the block above is the reason: these are three components
 * so that no element can ever have both parallax hooks writing to it. Delete
 * the hero one and the next person who wants art tied to the hero either
 * reaches for `ThemedArt` — wrong ride, and it only looks slightly off — or
 * adds the `mode` prop, which is the bug. An export that exists so the wrong
 * thing is hard to write is doing its job while nobody calls it.
 *
 * `scene/README.md` carries the rule this was decided under, and the condition
 * for deleting it.
 */
export function ThemedHeroArt({
  art,
  className,
  factor,
}: {
  art: ArtName
  className: string
  factor: number
}): JSX.Element {
  const ref = useHeroParallax<HTMLImageElement>(factor)
  return <Art art={art} className={className} moves elementRef={ref} />
}

/** Art that does not move at all. The right answer more often than it looks:
 *  a prop anchored to a section edge reads as part of the place, and giving
 *  every layer a drift is how a page starts to feel like it is sliding. */
export function StillArt({ art, className }: { art: ArtName; className: string }): JSX.Element {
  return <Art art={art} className={className} moves={false} />
}
