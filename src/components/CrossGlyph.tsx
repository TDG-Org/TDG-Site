import { useId } from 'react'

const PATH = 'M16.6 0H25.4V26.5H42V35.3H25.4V100H16.6V35.3H0V26.5H16.6Z'

type Props = {
  /**
   * `hero` uses a four-stop ramp, `faith` the softer three-stop one above the
   * verse, and `summit` a SILHOUETTE for the one standing on the Faith ridge
   * in front of the moon. See the `stops` table below for why the third one
   * had to exist.
   */
  variant?: 'hero' | 'faith' | 'summit'
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

  /*
   * ── why there are three ramps and not two ────────────────────────────────
   *
   * `hero` and `faith` are both LIT glyphs: the light falls across the mark
   * from the top left, so both ramps open on the theme's brightest ink and
   * darken downward. That is right wherever the cross is the subject.
   *
   * `summit` is the same path doing the opposite job. On the Faith ridge the
   * cross stands directly in front of the moon, so it is BACKLIT — and painted
   * with `faith`'s ramp it opened on `#ffffff` against a white disc. The
   * crossbar sits in the top third of the path, which is exactly the third
   * inside the disc, so the crossbar was white on white and the only part of
   * the glyph with anything to contrast against was the stem below the disc's
   * lower edge. The site owner reported that as "the cross is not finished,
   * you just have one line going up". It was finished. It was invisible.
   *
   * So this ramp runs the other way — the ridge's own ink, barely lifting
   * toward the sky at the foot — and it is dark in BOTH themes, because a
   * silhouette in front of a light source does not change sign when the
   * palette does. tokens.css carries the two sets of values.
   */
  const stops =
    variant === 'hero'
      ? [
          { offset: 0, token: '--cross-stop-0' },
          { offset: 0.34, token: '--cross-stop-1' },
          { offset: 0.78, token: '--cross-stop-2' },
          { offset: 1, token: '--cross-stop-3' },
        ]
      : variant === 'summit'
        ? [
            { offset: 0, token: '--summit-stop-0' },
            { offset: 0.5, token: '--summit-stop-1' },
            { offset: 1, token: '--summit-stop-2' },
          ]
        : [
            { offset: 0, token: '--faith-stop-0' },
            { offset: 0.42, token: '--faith-stop-1' },
            { offset: 1, token: '--faith-stop-2' },
          ]

  return (
    <svg
      viewBox="0 0 42 100"
      aria-hidden="true"
      /* Both, not either. `aria-hidden` takes it out of the accessibility
         tree; IE and older Edge still give every inline <svg> a tab stop of
         its own, and `focusable="false"` is the only thing that removes it —
         so without this the page carries three empty tab stops, one per
         instance of this glyph.

         **This comment used to declare a sweep finished that was not.** It
         said this file and `Nav.tsx`'s toggle icons "were the last that did
         not", naming `scene/Moon.tsx`, `scene/Seam.tsx`, `faith/Summit.tsx`
         and `KeyArt.tsx` as already paired. Counted afterwards: NINE of 31
         rendered svg carried it. The 22 that did not were every icon in
         `AuthModal.tsx` (11), `dev/controls.tsx` (5), `Store.tsx`'s Tick,
         Caret and Cross, `Folded.tsx`'s Chevron, `ImageSlot.tsx`'s placeholder
         and `dev/FeedbackTab.tsx`'s sort caret — and several of those are an
         icon INSIDE a button, which `Nav.tsx` calls the case that matters
         most. All 22 were done in one pass. It is 31 of 31 now, and the claim
         is a count rather than a recollection.

         Count it the right way, because the raw numbers disagree with each
         other: `grep -rn '<svg' src/` gives 35 lines across the .tsx files,
         four of which are prose inside comments — this block, `Nav.tsx`,
         `faith/Summit.tsx` and `scene/Moon.tsx`. `grep -rn 'focusable' src/`
         overcounts for the same reason, this block included. The population is
         `grep -rnE '^[[:space:]]*<svg' src/`: 31, because every rendered one
         opens its own line. */
      focusable="false"
      className={className}
    >
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
