import { useReveal } from '../hooks/useReveal'
import { GITHUB_ORG } from '../data/content'
import './Outro.css'

/** The makers note and the GitHub card that close the page before the footer. */
export function Outro() {
  const makers = useReveal<HTMLDivElement>('wipe', 0)
  const card = useReveal<HTMLDivElement>('rise', 0)

  return (
    <>
      <section className="section outro">
        <div ref={makers} className="outro__makers">
          <div className="kicker outro__kicker">
            <span className="kicker__num">06</span>
            <span className="kicker__rule" />
            <span className="kicker__label">The makers</span>
          </div>
          <h2 className="h2 h2--serif outro__heading">Brothers, one calling.</h2>
          <p className="outro__copy">
            We build together on nights, weekends, and the hours in between, trying to make things
            that are actually good, and that we'd be proud to put His name on.
          </p>
        </div>
      </section>

      <section className="outro__gh-section">
        <div ref={card} className="outro__gh">
          <div className="outro__gh-left">
            <span className="outro__gh-icon" aria-hidden="true">↗</span>
            <div>
              <div className="outro__gh-title">Open on GitHub</div>
              <p className="outro__gh-copy">
                Most of what we build sits in private repos until it is ready, but you can watch
                what's public.
              </p>
            </div>
          </div>
          <a className="outro__gh-cta" href={GITHUB_ORG} target="_blank" rel="noopener">
            Visit our GitHub ↗
          </a>
        </div>
      </section>
    </>
  )
}
