import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { GITHUB_ORG } from '../data/content'
import { ABOUT_HASH, rememberOrigin } from '../lib/route'
import { StillArt, ThemedArt } from './scene/ThemedArt'
import './Outro.css'

/** The makers note and the GitHub card that close the page before the footer. */
export function Outro() {
  const makers = useReveal<HTMLDivElement>('wipe', 0)
  const card = useReveal<HTMLDivElement>('rise', 0)
  /* ── the depth ladder ─────────────────────────────────────────────────────
     `useParallax` writes `centreOffset * -factor`, so a positive factor climbs
     more slowly than the page and sits at the back, and a negative one moves
     against it and comes forward.

        +0.015 the air      this section's own ink rising into #faith's hillside
        +0.030 the stair    the cut stone you come down, crossing the join
         0.000 the lantern  the light on the far side of the gate
        -0.090 the arch     the threshold you walk through
        -0.130 the stones   the path arriving at it, nearest, on the ground

     Slowest to fastest is 0.015 to 0.13, nearly nine times, against two layers
     0.045 apart before this pass. Two positives and two negatives with a zero
     between them, so the ends of the ladder travel 0.145 of the page APART —
     relative travel between two layers going opposite ways is the SUM of their
     factors, which is why the sign is worth more here than the magnitude.

     The lantern's zero is the same choice `.outro__ground` makes and for a
     related reason: it is the only object here that is seen THROUGH another
     one, so the pair that matters is it and the arch rather than it and the
     frame, and 0.09 of relative travel is what has to fit inside the arch's
     own opening. Outro.css does that sum. A hook would also be a frame
     subscriber bought for a layer whose whole job is to sit still at the end
     of the walk.

     +0.030 is the rung the `steps` Seam used to hold and the stair inherits it
     unchanged: it stands at the far end of the walk, above and behind the arch,
     so it is the second-slowest thing here. It is also the one layer that
     crosses the boundary, and a crossing layer's factor is a budget as well as
     a depth — Outro.css's `.outro__stair` carries what 0.03 is worth in pixels
     and what the mask has to absorb because of it.

     `.outro__ground` takes no hook at all, deliberately: it is the ground the
     arch stands on rather than an object on it, and a floor that slides
     against the things standing on it is a rug. */
  const air = useParallax<HTMLDivElement>(0.015)

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

            `transitions/stone-stair` is the path climbing out, and it is the
            REAL one: this boundary spent two passes faking a cut-stone stair
            with `Seam`'s `steps` silhouette, a flat band of `--seam-fill` in
            six orthogonal treads. The site owner read the render of it exactly
            as it is drawn — a staircase of grey rectangles — and he was right
            twice over, because a silhouette has one tone by construction and a
            stair is entirely made of the second one: the lit tread and the
            riser in shadow under it. `.outro__tread` existed to fake that
            second tone out of the same path drawn a few pixels lower, which is
            three layers and one colour doing the work of one layer with real
            facets in it.

            So the seam and its nosing are gone and the artwork stands here
            instead, descending LEFT toward the arch, running off the left of
            the page at its near end and dissolving into haze at its far one.
            Outro.css has the geometry, the mask and the join reading.

            **The arch cannot cross this boundary, and that was computed rather
            than left open.** A layer that belongs to both sections is the
            strongest way to hide a join — it is how the lamppost works five
            sections up, and how #apps, #tools and #games each hide theirs
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
        {/* The stair, outside `.outro__clip` on purpose: it is the one thing
            here allowed above the join, so it takes the section's own clip
            margin the way `.outro__air` does. Drawn before the clip, so the
            arch inside it stands in FRONT of the steps — which is the reading
            the beat wants, and the reason the stair may run behind the arch's
            crown without being tidied around it.

            The box around it is a clip and only a clip, and it is here because
            the section cannot do the job: `overflow-clip-margin` opens EVERY
            edge by 114px, so a layer wide enough to run off the left also runs
            off the right, and at 320x812 the stair's far end reached x 431 —
            `document.scrollWidth` 431 against a `clientWidth` of 320, which is
            a horizontal scrollbar on a phone.

            Outro.css shortens the stair below 800px as well, for a different
            reason (the copy has no gutters down there and the run has to clear
            it), and that alone takes today's numbers back inside the frame at
            every width. This box is what makes staying inside it a property of
            the BOX rather than of three clamps continuing to agree.
            `.games__over` is the same element one section up, with the same
            two jobs: let a layer cross the join vertically, and keep it inside
            the frame horizontally. */}
        <div className="outro__stair-clip" aria-hidden="true">
          <ThemedArt art="transitions/stone-stair" light="transitions/beach-steps" className="outro__stair" factor={0.03} />
        </div>

        {/* Everything that has to be cut at this section's own edges. The
            section is `overflow: clip` with a margin now, so that the air band
            above can reach into #faith, and a clip margin opens every edge
            equally — so without this box the arch, which is bedded 100px below
            the floor, would stand on top of the GitHub strip. */}
        <div className="outro__clip" aria-hidden="true">
          {/* The ground the last three things on this walk stand on — the
              lantern, the arch and the path. It is also what fills the
              right-hand half of this section, which the render showed as
              several hundred pixels of flat black beside a single arch. Air is
              only air when something is happening in it. */}
          <div className="outro__ground" />
          {/* ── the far side of the water ───────────────────────────────────
              The beat had a floor, a waterline and four props on it, and
              nothing at all beyond them: past the shore was the section's own
              band, so the eye read the whole thing as objects on a gradient
              rather than as a place. `landscapes/headland` closes it — the
              green headland across the lagoon, palms along its crest, drawn
              edge to edge — and with it the four things in front finally have
              a distance to be in front of.

              `landscapes/far-range-soft` in dark, which is the kit's own soft
              far range and has been in the repo unused since it shipped. It is
              the same job at midnight: something beyond the terrace for the
              afterglow to be hanging over.

              Drawn first of everything in the clip, so every other layer in
              this section is in front of it. */}
          <StillArt
            art="landscapes/far-range-soft"
            light="landscapes/headland"
            className="outro__far"
          />
          {/* ── the line the ground ENDS at ─────────────────────────────────
              The floor below is a soft plane with no far edge, so in light it
              ran into the section's own band and the beat had a beach and no
              shore. `landscapes/shore-foam` is the waterline: it straddles the
              ground band's top edge, so the sand has something to stop at and
              the pale band above it reads as water rather than as the section
              running out of ideas.

              `atmosphere/mist-bank` in dark, because a foam line at midnight on
              a stone terrace is not a thing — what is there is the air the
              afterglow is already hanging in, and this gives it a body. Drawn
              straight after the ground and before every prop, so all four still
              stand in FRONT of it. */}
          <StillArt
            art="atmosphere/mist-bank"
            light="landscapes/shallow-water"
            className="outro__shore"
          />
          {/* And the sand itself is drawn rather than mixed. `.outro__ground`
              below is a gradient doing two jobs — the contrast the copy needs
              and the floor the props stand on — and it is very good at the
              first and can only ever be a colour at the second. This is the
              second job: `landscapes/beach-terrace`, sand with shells in it, at
              the ground band's own height, so the terrace has a surface.
              `landscapes/snow-bank` in dark, which is the drift #origin plants
              its lamppost in, one section's walk away and the right ground for
              the same night. */}
          <StillArt
            art="landscapes/snow-bank"
            light="landscapes/beach-terrace-plain"
            className="outro__sand"
          />
          {/* ── the light beyond the gate ─────────────────────────────────
              `props/lantern-post`, drawn BEFORE the arch so the arch's stone
              is in front of it and the gap between its two columns is what you
              see it through. The kit calls it "a small final-beat light
              source", and this section's only light until now was a gradient:
              `.outro__afterglow` is the moon carried over from Faith and
              `.outro__ground`'s pool is where that lands, so the whole beat was
              lit by something outside the frame.

              A lantern standing in the middle of the section with the arch
              beside it would be a second object competing with the one
              structural anchor guardrail 8 allows. Seen THROUGH the arch it is
              not a second anchor at all — it is the reason the threshold is
              worth walking through, and it puts the one warm note on the page
              on the far side of the gate rather than in front of it.

              Its glow is painted into its own alpha. No filter, no shadow, and
              nothing here recolours a pixel.

              `StillArt`, so it takes no hook and no frame subscriber: a layer
              that moves LESS against the page is farther away, and travelling
              with the section exactly is as far as this ladder goes. What that
              costs is 0.09 of relative travel against the arch in front of it,
              and Outro.css checks that against the opening it has to stay
              inside rather than against the frame. */}
          <StillArt art="props/lantern-post" light="props/capiz-lantern" className="outro__lantern" />
          {/* The arch: 29vw wide and taller than the makers note, where it
              used to be 216px tucked in a gutter, and the room for that came
              from this section's own padding rather than from the copy — see
              Outro.css.

              `useParallax` only ever writes a VERTICAL translate, so the 40px
              it keeps off the copy cannot be spent by the motion, however
              large the factor gets. That is what lets it be one of the loudest
              layers in the section without the clearance becoming a thing to
              re-check. */}
          <ThemedArt art="props/garden-arch" light="props/coral-arch" className="outro__arch" factor={-0.09} />
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
          {/* ── -0.13 -> -0.035, because a path LIES ON the ground ──────────
              `.outro__ground` has no parallax hook at all — its own comment
              says why: a floor that slides against the things standing on it
              is a rug. So every pixel of this layer's travel is travel away
              from the plane it is supposed to be lying on. At -0.13 the box
              had risen 145px against that floor by the time the section was
              centred, and the far end of the path stood 84px ABOVE the
              horizon — which is the largest single reason this beat read as
              "seemingly randomly placed images": a row of flat stones seen
              from above, hanging in the air with nothing under them.

              -0.035 keeps a hint of nearness against the arch's -0.09 and
              never takes the path off the ground. */}
          <ThemedArt art="transitions/stepping-stones" light="transitions/sand-stones" className="outro__stones" factor={-0.035} />
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
            Visit Our GitHub<span className="sr-only"> (opens in a new tab)</span>
            <span aria-hidden="true"> ↗</span>
          </a>
        </div>
      </section>
    </>
  )
}
