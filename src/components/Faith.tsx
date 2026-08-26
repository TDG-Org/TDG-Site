import { useHeroParallax, useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { CrossGlyph } from './CrossGlyph'
import { Seam } from './scene/Seam'
import { ThemedArt } from './scene/ThemedArt'
import './Faith.css'

export function Faith() {
  const rays = useHeroParallax<HTMLDivElement>(0.05)
  const blob = useParallax<HTMLDivElement>(0.12)
  const seam = useParallax<HTMLDivElement>(0.034)
  const content = useReveal<HTMLDivElement>('holy', 0)

  return (
    <section id="faith" className="section section--blend faith">
      {/* ── the walk, beat six: the hillside, and the cross on it ───────────
          `peaks` because this is the one boundary on the walk where the land
          actually rises: you leave the open ground of #building and climb.

          The hillside is the kit's Faith-only piece and it stays that way. It
          is small, quiet and far out in the lower-right corner, well below the
          verse and nowhere near the CrossGlyph this section already draws —
          see Faith.css, where the sizing makes that a fact about the boxes
          rather than a hope about the copy. Its glow is painted into the
          file's own alpha, so nothing here adds one. */}
      <div ref={seam} className="faith__seam-drift" aria-hidden="true">
        <Seam shape="peaks" edge="top" className="faith__seam" />
      </div>
      <ThemedArt art="faith/hillside-cross" className="faith__hill" factor={0.018} />

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
