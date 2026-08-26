import type { JSX } from 'react'
import './Seam.css'

type SeamShape = 'ridge' | 'dune' | 'peaks' | 'wave' | 'steps'

/**
 * The five silhouettes, in the art kit's flat low-poly voice: broad facets,
 * no detail, nothing that reads as an illustration. They are the boundary
 * between two sections wearing a shape, not a picture of a place.
 *
 * All five are authored in the `edge="top"` orientation — the mass along the
 * TOP of the band, the silhouette hanging down into the section below it —
 * because that is the case the flip is measured from. A seam at the bottom
 * edge is the same path mirrored, which is what `edge="bottom"` does, so
 * there is exactly one path per shape and the two edges cannot drift into two
 * slightly different mountains.
 *
 * They are deliberately shallow. A seam is read at 40–90px tall across a
 * whole viewport, so an amplitude that looks timid at this viewBox is already
 * the loudest thing on the boundary once it is stretched.
 */
const SHAPES: Record<SeamShape, string> = {
  /* a low mountain profile: many facets, none of them tall */
  ridge:
    'M0 0 L0 24 L180 56 L320 38 L470 80 L620 46 L760 62 L900 34 L1050 68 L1210 42 L1330 58 L1440 32 L1440 0 Z',
  /* two soft swells that overlap through a shallow trough */
  dune: 'M0 0 L0 18 C180 20 280 70 480 64 C640 59 720 32 880 34 C1060 36 1180 80 1440 68 L1440 0 Z',
  /* the same idea as ridge, taller and far more angular */
  peaks:
    'M0 0 L0 12 L150 74 L250 28 L420 106 L560 32 L700 86 L810 24 L980 98 L1120 36 L1260 80 L1360 30 L1440 62 L1440 0 Z',
  /* one long lazy S across the whole width */
  wave: 'M0 0 L0 30 C420 92 1020 4 1440 54 L1440 0 Z',
  /* a blocky terrace: every edge orthogonal, no diagonals at all */
  steps: 'M0 0 L0 16 H210 V40 H420 V24 H620 V64 H840 V44 H1040 V76 H1240 V52 H1440 V0 Z',
}

/**
 * A band of flat silhouette that sits on one edge of a section.
 *
 * **It is filled with `currentColor` and it sets no colour of its own**, which
 * is the whole point: the section paints it, from `--seam-fill`, which
 * `base.css` already declares for every section.
 *
 *     .origin__seam { color: var(--seam-fill); }
 *
 * `--seam-fill` is that section's band stepped slightly toward `--text`, and
 * the step is the thing that makes a seam work at all. Painted in a band
 * flat, a seam is INVISIBLE: `base.css` keeps adjacent bands meeting on an
 * identical value, so a shape drawn at a boundary in either neighbour's
 * colour is drawn where the two colours are equal. That was measured, not
 * guessed — `#apps` gave rgb(8,8,12) for the seam and rgb(8,8,12) for the
 * section behind it. A seam is a shape that contrasts, not a colour that
 * matches.
 *
 * Stepping toward `--text` is what makes one declaration right in both
 * themes: near-white ink in dark lifts the silhouette slightly above the sky,
 * near-black ink in light drops it slightly below a pale one — which is
 * exactly how the art kit's `-dark` and `-light` ridges are drawn, so the
 * seam and the PNG beside it agree. `scene/README.md` has the long version.
 *
 * `preserveAspectRatio="none"` because a seam is a proportion of the viewport,
 * not a picture: it stretches to whatever width it is given and takes its
 * height from CSS. That is also why the paths carry no thin features — a
 * 1440-unit shape squeezed into 375px turns anything narrow into a spike.
 *
 * Decorative, so `aria-hidden`, and `pointer-events: none` from the
 * stylesheet: it covers the top or bottom strip of a section and must never
 * take a click meant for what is under it.
 */
export function Seam({
  shape,
  edge,
  className,
}: {
  shape: SeamShape
  /** Which edge of the section it sits on. */
  edge: 'top' | 'bottom'
  className?: string
}): JSX.Element {
  return (
    <svg
      className={`scene__seam scene__seam--${edge}${className ? ` ${className}` : ''}`}
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* The mirror lives on the path rather than on a wrapping <g> so the
          shape stays one element as well as one string. translate-then-scale,
          because a bare scale(1,-1) reflects about y=0 and would put the band
          entirely above the viewBox. */}
      <path
        d={SHAPES[shape]}
        fill="currentColor"
        transform={edge === 'bottom' ? 'translate(0,120) scale(1,-1)' : undefined}
      />
    </svg>
  )
}
