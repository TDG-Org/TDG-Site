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
  const content = useReveal<HTMLDivElement>('holy', 0)
  /* The summit's scroll choreography. It is read here rather than inside
     `Summit` because the hook measures a SECTION and the section is this
     file's element; `progress` is a frozen accessor, so passing it down costs
     nothing and re-renders nothing. */
  const [section, progress] = useSectionProgress<HTMLElement>()

  return (
    <section ref={section} id="faith" className="section section--blend faith faith-summit-host">
      {/* ── the walk, beat six: the climb, and the summit at the top of it ──
          `peaks` because this is the one boundary on the walk where the land
          actually rises: you leave the open ground of #building and climb.
          The summit at the bottom of this section is where the climb ends. */}
      <div ref={seam} className="faith__seam-drift" aria-hidden="true">
        <Seam shape="peaks" edge="top" className="faith__seam" />
      </div>

      {/* a slow gradient field: a drifting radial pair, a rotating conic
          sweep and a pulsing diagonal wash, all masked to a soft ellipse */}
      <div className="faith__field" aria-hidden="true">
        <div className="faith__drift" />
        <div className="faith__spin" />
        <div className="faith__pulse" />
      </div>

      <div ref={rays} className="faith__rays" aria-hidden="true">
        <div className="faith__ray" />
        <div className="faith__ray faith__ray--thin" />
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
