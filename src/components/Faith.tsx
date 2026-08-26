import { useHeroParallax, useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useSectionProgress } from '../hooks/useSectionProgress'
import { CrossGlyph } from './CrossGlyph'
import { Summit } from './faith/Summit'
import { Seam } from './scene/Seam'
import './Faith.css'

export function Faith() {
  const rays = useHeroParallax<HTMLDivElement>(0.05)
  const blob = useParallax<HTMLDivElement>(0.12)
  const seam = useParallax<HTMLDivElement>(0.034)
  /* The far range climbing into the frame from below the boundary. Negative,
     so it moves AGAINST the band hanging over it: 0.052 of relative travel,
     which is what opens and closes the slot of sky between the two. */
  const climb = useParallax<HTMLDivElement>(-0.018)
  const content = useReveal<HTMLDivElement>('holy', 0)
  /* The summit's scroll choreography. It is read here rather than inside
     `Summit` because the hook measures a SECTION and the section is this
     file's element; `progress` is a frozen accessor, so passing it down costs
     nothing and re-renders nothing. */
  const [section, progress] = useSectionProgress<HTMLElement>()

  return (
    <section ref={section} id="faith" className="section section--blend faith faith-summit-host">
      {/* ── the walk, beat six: the climb, and the summit at the top of it ──
          This is the one boundary on the walk where the land actually rises:
          you leave the open ground of #building and start up. So it is drawn
          as a PASS — two lands closing on a slot of sky — and it is the only
          join on the page built that way. The four others are a canopy at two
          depths (#apps), one clean waterline (#tools), a mist with no edge in
          it at all (#building) and a shape that fades in from nothing (the
          Outro), so a reader never meets the same idea twice.

          `ridge` HANGS from the boundary: a low, many-faceted profile, the far
          bank you are leaving seen from below it. It drifts DOWN with the page,
          and it is masked at its top so that the boundary itself carries none
          of it — Faith.css has the fifteen-column measurement that made that
          change, and it is why the band no longer needs `--seam-lift`.

          `peaks` RISES to meet it, `edge="bottom"` — the only seam on this page
          in that orientation, and it is the shape the old single seam here used
          to be, now doing the job its name implies. It is the range you are
          about to climb, so it drifts UP against the other one and dissolves at
          its base into haze rather than ending on a line.

          Neither ever reaches the other: Faith.css carries the computed gap at
          every width, and the two silhouettes are 12–20px apart at their
          closest. The sky between them is the point.

          The summit at the bottom of this section is where the climb ends. */}
      {/* ── the light theme's sky ────────────────────────────────────────
          First in, so the two bands at the boundary, the field, the summit and
          the copy are all read against it rather than through it. In LIGHT it
          is a shaded band across this section's sky that comes back to its own
          two tokens before either edge; in DARK its ink is `transparent` and it
          paints nothing. Faith.css carries the measurements and the mask stops
          — including why it holds off for the first 12%, which is exactly as
          far as the two seams reach. */}
      <div className="faith__dusk" aria-hidden="true" />
      <div ref={seam} className="faith__seam-drift" aria-hidden="true">
        <Seam shape="ridge" edge="top" className="faith__seam" />
      </div>
      <div ref={climb} className="faith__climb-drift" aria-hidden="true">
        <Seam shape="peaks" edge="bottom" className="faith__climb" />
      </div>

      {/* a slow gradient field: a drifting radial pair, a rotating conic
          sweep and a pulsing diagonal wash, all masked to a soft ellipse */}
      <div className="faith__field" aria-hidden="true">
        <div className="faith__drift" />
        <div className="faith__spin" />
        <div className="faith__pulse" />
      </div>

      {/* ── the shafts, and why they are two boxes ──────────────────────────
          `useHeroParallax` writes `hero.top * factor`, which scales with TOTAL
          scroll rather than with the viewport — its own header says so. By the
          time this section is on screen the drift is -334 to -437px, so the
          box it is written on slides 100px relative to the section while a
          reader passes through it, and anything positioned inside that box is
          positioned against nothing.

          A mask on the moving box is therefore a mask in the wrong place, and
          it was measured being wrong: the section's top edge sat at 35–42% of
          the box, which is where the old radial's own centre was, so the rays
          arrived at the #building join at full strength and made the entire
          remaining step there. Ablated, hiding this layer took a join that
          measured +0.7 to +5.1 in dark, varying run to run with the breathe
          animation, to 0.00 at every one of fifteen columns.

          So the mask goes on a box that does not move and the drift stays on
          the one that does. `.building__over` is the same shape one section up:
          a static, masked band with drifting art inside it. */}
      <div className="faith__rays-veil" aria-hidden="true">
        <div ref={rays} className="faith__rays">
          <div className="faith__ray" />
          <div className="faith__ray faith__ray--thin" />
        </div>
      </div>

      <div ref={blob} className="faith__blob" aria-hidden="true" />

      {/* ── the payoff ──────────────────────────────────────────────────────
          The summit: smooth authored ridges, the moon low behind them, and the
          cross on the crest with the disc directly behind it. It replaces the
          kit's `faith/hillside-cross`, which was a faceted low-poly hill with
          its own cross and its own painted glow tucked into the lower-right
          corner — a SECOND cross on a SECOND hill once this one exists, which
          the art kit's own guardrail 8 ("at most one structural anchor per
          section") rules out, and the wrong texture besides. Its README now
          says the same thing from the other end: Faith's terrain is authored
          SVG, never the faceted ridges.

          This is where the page's moon ends up. It rests on the horizon in the
          hero and it arrives here, behind the cross, five sections later. */}
      <Summit progress={progress} />

      <div ref={content} className="faith__content">
        <div className="faith__cross-row">
          <div className="faith__cross" aria-hidden="true">
            <CrossGlyph variant="faith" />
          </div>
        </div>

        <div className="kicker faith__kicker">
          <span className="kicker__num">05</span>
          <span className="kicker__rule" />
          <span className="kicker__label faith__kicker-label">Faith</span>
        </div>

        <blockquote className="faith__quote">
          “The light shines in the darkness, and the darkness hasn't overcome it.”
        </blockquote>
        <div className="faith__cite">JOHN 1:5</div>
        <p className="faith__copy">
          Everything we make is meant to be useful, and to point back to Him. That's the whole
          reason we kept the name.
        </p>
      </div>
    </section>
  )
}
