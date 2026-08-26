import { useId } from 'react'

const PATH = 'M16.6 0H25.4V26.5H42V35.3H25.4V100H16.6V35.3H0V26.5H16.6Z'

type Props = {
  /** hero uses a four-stop ramp, the faith centrepiece a softer three-stop one */
  variant?: 'hero' | 'faith'
  className?: string
}

/**
 * The TDG cross. One path and one continuous gradient across both bars, not
 * two shapes, so the light reads as a single fall across the whole glyph.
 *
 * The gradient is painted through `<stop>`s rather than a flat
 * `fill: var(--token)` because `base.css` transitions `stop { stop-color }`
 * on the theme wave and `path` is not in its `transition: var(--t-theme)`
 * list — a filled path would SNAP to the new theme while the page around it
 * crosses. `scene/Moon.tsx`'s header carries the long version.
 */
export function CrossGlyph({ variant = 'hero', className }: Props) {
  /*
   * Per instance, from `useId`, exactly the way `scene/Moon.tsx` does it —
   * read that file's note before changing either, because the two are one
   * decision.
   *
   * SVG ids are document-global and `url(#id)` resolves against the whole
   * document, so a fixed id means the SECOND glyph on a page silently paints
   * itself from the FIRST one's stops. This page renders three: the hero's
   * mark, the lit glyph above the verse, and the silhouette standing on the
   * summit ridge in `faith/Summit.tsx` — and the two faith ones share a
   * variant, so `url(#faithCrossGrad)` resolved to whichever came first in
   * the DOM. It is invisible today only because the stops happen to be
   * identical; the moment one instance is given its own treatment it becomes
   * a cross wearing the wrong colour with nothing in the code to point at.
   *
   * The strip is not superstition: React's generated ids are wrapped in
   * punctuation, and while a fragment reference tolerates it, an id made only
   * of word characters is the one that can also be handed to a CSS selector
   * or a `getElementById` by whoever debugs this next.
   */
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const id = `${variant}CrossGrad${uid}`

  const stops =
    variant === 'hero'
      ? [
          { offset: 0, token: '--cross-stop-0' },
          { offset: 0.34, token: '--cross-stop-1' },
          { offset: 0.78, token: '--cross-stop-2' },
          { offset: 1, token: '--cross-stop-3' },
        ]
      : [
          { offset: 0, token: '--faith-stop-0' },
          { offset: 0.42, token: '--faith-stop-1' },
          { offset: 1, token: '--faith-stop-2' },
        ]

  return (
    <svg viewBox="0 0 42 100" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={id} x1="6%" y1="0%" x2="94%" y2="100%">
          {stops.map((s) => (
            <stop key={s.offset} offset={s.offset} style={{ stopColor: `var(${s.token})` }} />
          ))}
        </linearGradient>
      </defs>
      <path d={PATH} fill={`url(#${id})`} />
    </svg>
  )
}
