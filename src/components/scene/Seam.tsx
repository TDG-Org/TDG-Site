import type { JSX } from 'react'
import './Seam.css'

type SeamShape = 'ridge' | 'dune' | 'peaks' | 'wave' | 'steps' | 'firs'

/**
 * The six silhouettes, in the art kit's flat low-poly voice: broad facets,
 * no detail, nothing that reads as an illustration. They are the boundary
 * between two sections wearing a shape, not a picture of a place.
 *
 * All six are authored in the `edge="top"` orientation — the mass along the
 * TOP of the band, the silhouette hanging down into the section below it —
 * because that is the case the flip is measured from. A seam at the bottom
 * edge is the same path mirrored, which is what `edge="bottom"` does, so
 * there is exactly one path per shape and the two edges cannot drift into two
 * slightly different mountains.
 *
 * They are deliberately shallow — with one exception. A seam is read at 40–90px
 * tall across a whole viewport, so an amplitude that looks timid at this
 * viewBox is already the loudest thing on the boundary once it is stretched.
 * `steps` is the exception and it is deliberate: it spends 7.5% to 83.3% of
 * the band on purpose, because that spread is what lets one mask draw its far
 * end pale and its near end solid. Its own comment has the argument.
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
  /* ── a stone stair in perspective, descending to the left ─────────────────
     **Nothing draws this today, and that is the end of a two-pass argument
     rather than an oversight.** It is kept for the same reason the kit keeps
     an unplaced piece: the set of six is a vocabulary, and a shape deleted
     because its one caller changed its mind is a shape the next boundary
     re-invents slightly differently.

     The Outro drew it, and drew a second copy of it a few pixels lower for the
     lit nosing, because a `Seam` is a flat fill and a stair is entirely made
     of two tones — the lit tread and the riser in shadow under it. The site
     owner read the render as a staircase of grey rectangles, which is what a
     one-tone stair is. `transitions/stone-stair` stands on that boundary now:
     real facets, real risers, one element instead of three. `Outro.css`'s
     `.outro__stair` carries that argument from the other end.

     What the redraw below fixed is still worth keeping, because it is a lesson
     about masks rather than about this shape. It was a blocky terrace —
     `H210 V40 H420 V24 H620 V64 …`, every edge orthogonal, no diagonal in it
     at all, and the treads stepping up and down around a mean. Rendered at the
     Outro boundary it did not read as ground. It read as UI that had failed to
     load: a row of flat grey rectangles stepping across the whole width.

     Two things made it that, and both are fixed by the path rather than by
     the fill.

     **The old treads were level, and so is a mask.** Its silhouette ran y
     16..76 of the 120 viewBox — the shallowest tread only 13% of the band down
     — while the Outro's mask ramps from `transparent` at the join to opaque a
     quarter of a band lower. A level tread under a level alpha ramp gives a
     rectangle with a ruled top edge that every tread shares, and six of those
     side by side is a skeleton loader. A shape whose edge is level everywhere
     is the one shape a horizontal mask cannot dissolve.

     **And a terrace that goes up and down again is not a stair.** These six
     treads descend monotonically from y 100 at the left edge to y 9 at the
     right, so the silhouette occupies 7.5% to 83.3% of the band instead of 13%
     to 63%. Under the same mask that spread is worth more than the shape is:
     the far end is drawn where the alpha is under a third and the near end
     where it is full, so the run recedes into haze by itself with no second
     layer and no second colour.

     The perspective is in the proportions rather than in a vanishing point.
     Treads widen toward the near end — 176, 156, 186, 222, 260, 300 units
     reading right to left — and the risers deepen with them, 6, 8, 10, 12, 14.
     Each tread also falls 1 to 6 units across its own run and turns down
     through a chamfered nosing before its riser, 20 units wide at the far end
     and 36 at the near, which is what makes it cut stone rather than a step in
     a bar chart. The nosing is the narrowest feature: 20 units is 5.2px at
     375px wide, and it is a corner rather than a spike, so the header's
     warning about thin features does not apply to it. Do not add a narrower
     one.

     It descends to the LEFT because the Outro's threshold is on the left: the
     `props/garden-arch` stands in that gutter, so the run comes down toward
     the gate and the light hangs over the shallow end. The near tread is 300
     units and is cut by the frame; the far one runs out at the right edge as a
     landing. The raster that took its place descends the same way, for the
     same reason.                                                            */
  steps:
    'M0 0 L0 100 L300 94 L336 88 L336 74 L596 69 L628 64 L628 52 L850 48 L878 44 L878 34 L1064 31 L1088 28 L1088 20 L1244 18 L1264 16 L1264 10 L1440 9 L1440 0 Z',
  /* ── a conifer treeline: eleven firs of four depths on one baseline ───────
     The sixth shape, and the first one added since the set was written. It
     exists because #apps' beat is walking OUT of Origin's clearing INTO the
     trees, and none of the five says "trees": `ridge` and `peaks` are rock,
     `dune` and `wave` are soft ground and water, `steps` is worked stone. A
     treeline drawn with `peaks` reads as a mountain range that happens to be
     jagged — the give-away is that a mountain's facets are asymmetric and
     continuous, while a treeline is a row of separate objects standing on one
     line, with sky between them.

     So: a flat baseline at y = 22, and eleven isosceles spikes hanging off it
     at four depths (62 / 74 / 96 / 112 of the 120 viewBox), with a plain gap
     of baseline between each pair. The gaps are what make them read as trees
     rather than as one serrated edge, and the varied depth is what stops the
     row reading as a comb.

     **It is authored in `edge="top"` like the other five — mass along the top,
     spikes hanging DOWN — and the two callers both draw it `edge="bottom"`.**
     That is not a contradiction: `edge` is which way the shape POINTS, not
     which end of the section it sits on (`scene/README.md` says so, and
     `#faith`'s rising range is the precedent). A treeline at a section's TOP
     boundary wants the mirrored path, mass at the bottom and the tips rising
     into the section above.

     The base of the widest fir is 104 viewBox units. Squeezed to the 375px
     narrow end that is 27px of width against a 34px spike, which is a fir; the
     header's warning about thin features becoming spikes is about features
     that were never meant to be spikes, and these were. The narrowest base is
     68 units — 17.7px at 375 — which is the floor this row was drawn to. Do
     not add a narrower one.                                                 */
  firs:
    'M0 0 L0 22 L52 22 L92 96 L132 22 L206 22 L241 74 L276 22 L336 22 L388 112 L440 22 L496 22 L536 78 L576 22 L638 22 L686 104 L734 22 L790 22 L824 62 L858 22 L912 22 L962 100 L1012 22 L1062 22 L1098 74 L1134 22 L1182 22 L1234 108 L1286 22 L1332 22 L1366 66 L1400 22 L1440 22 L1440 0 Z',
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
