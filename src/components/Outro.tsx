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
  /* ── the depth ladder ─────────────────────────────────────────────────────
     `useParallax` writes `centreOffset * -factor`, so a positive factor climbs
     more slowly than the page and sits at the back, and a negative one moves
     against it and comes forward.

        +0.015 the air     this section's own ink rising into #faith's hillside
        +0.030 the seam    the terrace fading in below the join
        -0.090 the arch    the threshold you walk through
        -0.130 the stones  the path arriving at it, nearest, on the ground

     Slowest to fastest is 0.015 to 0.13, nearly nine times, against two layers
     0.045 apart before this pass. Two positives and two negatives, so the ends
     of the ladder travel 0.145 of the page APART — relative travel between two
     layers going opposite ways is the SUM of their factors, which is why the
     sign is worth more here than the magnitude.

     `.outro__ground` takes no hook at all, deliberately: it is the ground the
     arch stands on rather than an object on it, and a floor that slides
     against the things standing on it is a rug. */
  const air = useParallax<HTMLDivElement>(0.015)
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
            of the five, which suits a threshold made of stone — and it is the
            only band on the page that dissolves at BOTH ends, so nothing at
            all is painted on the join itself and the terrace fades in below
            it. Outro.css argues that, and says why this is the one boundary
            that needs no `--seam-lift`.

            **The arch cannot cross this boundary, and that was computed rather
            than left open.** A layer that belongs to both sections is the
            strongest way to hide a join — it is how the lamppost works five
            sections up, and how #apps, #tools and #building each hide theirs
            in this pass — and only an UPWARD crossing can work anywhere on
            this page, because each section paints over the one before it, so a
            layer sent DOWN out of its own section is covered by the section it
            lands in. Upward is available here: this section is later in the
            DOM than `#faith`. What is not available is the height. The arch is
            bedded 100px below this section's floor and is `1.5w` tall against a
            section that is `2 x padding + 254px`, so its crown already sits
            BELOW the top edge by 44px at 1440, 52 at 1920, 79 at 1280 and 134
            at 1024; crossing needs it taller, and its width is bounded by the
            copy's own left edge, so the extra height can only come from
            hanging further off the left of the page. At 1024 a crown at the
            join needs `w = 410` against a box whose left edge would then be at
            −215 — the entire left column, ink and all, outside the viewport.
            An arch with one leg is not a threshold.

            **So the thing that crosses is the AIR, and it is the only crossing
            on the page that carries no shape at all.** `.outro__air` is a band
            of this section's own `--band-outro` reaching up over the join into
            the foot of #faith's hillside and fading out at both ends. It is
            aerial perspective doing the join's work: Faith's near ridge
            recedes into the colour of the section below it instead of meeting
            it on a line, and because --band-outro IS --bg, the half of the band
            that lies below the join paints exactly nothing. One gradient, no
            silhouette, nothing on the join line itself — which is the same
            idea this boundary always had, now reaching across instead of
            stopping at the edge. */}
        <div ref={air} className="outro__air" aria-hidden="true" />
        {/* ── the light you walked out of ──────────────────────────────────
            The moon is the thread this page is strung on: it rests on the
            hero's horizon and it stands behind the cross on the Faith summit,
            directly above this section. So the air at the top of the Outro is
            still carrying it — a wide bloom hanging over the shallow end of
            the stair, in `--glow`, inside a wash of `--band-faith`, which is
            the band this section is walking out of.

            It is doing three of the four jobs this half of the section had
            nobody to do. It is the one light source, which the arch and the
            stones below are then read against. It is the haze band between the
            terrace's plane and theirs. And it is what fills the top right,
            which the render showed as two hundred pixels of flat black beside
            a stair — air is only air when something is happening in it.

            Behind the terrace on purpose: the light is BEYOND the crest, and
            drawing it first is what makes the stone read in front of it.   */}
        <div className="outro__afterglow" aria-hidden="true" />
        <div ref={seam} className="outro__seam-drift" aria-hidden="true">
          {/* The lit nosing on every tread, and it is the same path a few
              pixels lower rather than a second drawing. What shows is the
              strip between the two silhouettes — under each tread and under
              each chamfer, and nothing at all beside a riser, because a
              vertical edge shifted straight down exposes nothing. That is
              exactly where a stair's next tread top catches the light.

              Both bands hang off ONE drift wrapper, so there is one hook and
              one writer of `style.translate` between them; the offset is
              `top` on this box and never a transform. */}
          <div className="outro__tread">
            <Seam shape="steps" edge="top" className="outro__seam" />
          </div>
          <Seam shape="steps" edge="top" className="outro__seam" />
        </div>

        {/* Everything that has to be cut at this section's own edges. The
            section is `overflow: clip` with a margin now, so that the air band
            above can reach into #faith, and a clip margin opens every edge
            equally — so without this box the arch, which is bedded 100px below
            the floor, would stand on top of the GitHub strip. */}
        <div className="outro__clip" aria-hidden="true">
          {/* The ground the last two things on this walk stand on. It is also
              what fills the right-hand half of this section, which the render
              showed as several hundred pixels of flat black beside a single
              arch. Air is only air when something is happening in it. */}
          <div className="outro__ground" />
          {/* The arch: 29vw wide and taller than the makers note, where it
              used to be 216px tucked in a gutter, and the room for that came
              from this section's own padding rather than from the copy — see
              Outro.css.

              `useParallax` only ever writes a VERTICAL translate, so the 40px
              it keeps off the copy cannot be spent by the motion, however
              large the factor gets. That is what lets it be one of the loudest
              layers in the section without the clearance becoming a thing to
              re-check. */}
          <ThemedArt art="props/garden-arch" className="outro__arch" factor={-0.09} />
          {/* `transitions/stepping-stones` — in the kit from the beginning and
              drawn by nothing until now. The walk has crossed water on a
              bridge, climbed to a summit and is arriving at a gate; a path of
              flat stones leading to the gate's foot is the last thing you
              would actually pass on it.

              It sits in the RIGHT gutter, at exactly the inset the arch takes
              on the left, out of the same two variables applied in mirror
              image — rule 6, and the reason `--outro-copy-inset` is stated as
              an inset from an edge rather than as a coordinate. The art is
              mirrored so the path recedes toward the arch rather than away
              from it; that is a `transform`, and `useParallax` writes the
              standalone `translate` property, so the two never touch. */}
          <ThemedArt art="transitions/stepping-stones" className="outro__stones" factor={-0.13} />
        </div>

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
