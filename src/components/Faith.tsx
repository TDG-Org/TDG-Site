import { useHeroParallax, useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { CrossGlyph } from './CrossGlyph'
import './Faith.css'

export function Faith() {
  const rays = useHeroParallax<HTMLDivElement>(0.05)
  const blob = useParallax<HTMLDivElement>(0.12)
  const content = useReveal<HTMLDivElement>('holy', 0)

  return (
    <section id="faith" className="section section--blend faith">
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
