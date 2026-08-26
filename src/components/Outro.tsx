import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { GITHUB_ORG } from '../data/content'
import { ABOUT_HASH, rememberOrigin } from '../lib/route'
import { Seam } from './scene/Seam'
import { ThemedArt } from './scene/ThemedArt'
import './Outro.css'

/** The makers note and the GitHub card that close the page before the footer. */
export function Outro() {
  const makers = useReveal<HTMLDivElement>('wipe', 0)
  const card = useReveal<HTMLDivElement>('rise', 0)
  const seam = useParallax<HTMLDivElement>(0.024)

  return (
    <>
      <section className="section outro">
        {/* ── the walk, beat seven: the arch you leave through ──────────────
            This component renders two sections and both of these go on the
            FIRST one, for reasons that are structural rather than taste:

            - The strip below holds one thing, the GitHub card, and almost no
              vertical room around it. An arch there would be standing directly
              beside a content container, which is the one thing the kit says
              an arch must never look like it is framing. Here it stands in the
              makers note's own left gutter with the card in a different
              section entirely, so it structurally cannot frame it.
            - The boundary this seam is for is Faith → Outro, and this is the
              section on that boundary. The strip below meets the footer, whose
              own builder owns that seam.
            - The scene tokens are declared per section, and base.css sets them
              on `.outro`. The strip is that section's sibling, not its child,
              so it inherits none of them.

            `steps` is the path climbing out. It is the only orthogonal shape
            of the five, which suits a threshold made of stone. */}
        <div ref={seam} className="outro__seam-drift" aria-hidden="true">
          <Seam shape="steps" edge="top" className="outro__seam" />
        </div>
        {/* The nearest art on the page and the one that drifts most — you are
            walking through this, not looking at it. useParallax only ever
            writes a vertical translate, so the 18px it keeps off the copy is
            never spent by the motion. */}
        <ThemedArt art="props/garden-arch" className="outro__arch" factor={0.04} />

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
          {/* The longer answer, for the reader who got this far and wanted it.
              `rememberOrigin` is what brings them back to this paragraph rather
              than to the top of the page. */}
          <a className="outro__about" href={ABOUT_HASH} onClick={() => rememberOrigin('Home')}>
            More about us, and the questions people ask
            <span className="outro__about-arrow" aria-hidden="true">
              →
            </span>
          </a>
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
