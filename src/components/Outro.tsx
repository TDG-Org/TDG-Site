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
  /* Two layers, and they disagree about which way to go — which is the whole
     of what makes a boundary read as behind something. `useParallax` writes
     `centreOffset * -factor`, so +0.03 on the seam climbs more slowly than the
     page and sits at the back, and -0.075 on the arch moves against it and
     comes forward. The first pass had +0.024 and +0.04: same direction, within
     a percent and a half of each other, so nothing moved against anything. */
  const seam = useParallax<HTMLDivElement>(0.03)

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
        {/* The nearest art in this section and the one that drifts most — you
            are walking through this, not looking at it. It is now 29vw wide
            and taller than the makers note, where it used to be 216px tucked
            in a gutter, and the room for that came from this section's own
            padding rather than from the copy: see Outro.css.

            `useParallax` only ever writes a VERTICAL translate, so the 40px it
            keeps off the copy cannot be spent by the motion, however large the
            factor gets. That is what lets this one be the loudest layer in the
            section without the clearance becoming a thing to re-check. */}
        <ThemedArt art="props/garden-arch" className="outro__arch" factor={-0.075} />

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
