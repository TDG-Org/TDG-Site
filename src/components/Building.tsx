import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { MARANATHA, NEXT_UP } from '../data/content'
import { asset } from '../lib/asset'
import { appHash, rememberOrigin } from '../lib/route'
import { Seam } from './scene/Seam'
import { ThemedArt } from './scene/ThemedArt'
import './Building.css'

function NextUpPill({ label, index }: { label: string; index: number }) {
  const reveal = useReveal<HTMLDivElement>('pop', index)
  return (
    <div ref={reveal} className="building__pill">
      <span className="building__pill-dot" data-alt={index % 2 === 1 || undefined} />
      {label}
    </div>
  )
}

export function Building() {
  /* ── the depth ladder ─────────────────────────────────────────────────────
     `useParallax` writes `centreOffset * -factor`, so a positive factor climbs
     more slowly than the page — distance — and a negative one moves against
     it — nearness. The first pass had 0.012 / 0.02 / 0.03, three positives
     inside a fifth of a percent of each other, which is three layers agreeing
     with each other rather than three planes; the second had five inside
     0.018..0.07.

        +0.012 the blob       warm glow behind everything
        +0.015 the fog        the far bank at the floor, all but still
        +0.022 the seam       the bank's edge at the boundary
        +0.030 the far pines  the small pale stand across the water
        -0.050 the post       the wayfinder on the bank, crossing UP into #tools
        -0.100 the near pines crowns at the floor, in front of the fog
        -0.120 the mist       the water you just crossed, coming off the surface

     Slowest to fastest is 0.012 to 0.12, ten times, where the last pass ran
     0.018 to 0.07 — under four. Four positives and three negatives, so the two
     ends of the ladder are travelling 0.135 of the page APART rather than
     0.102 of it in the same direction, and the pair that carries the boundary
     — the seam going down and the mist coming up — now disagree by 0.142 where
     they disagreed by 0.042.

     The blob was +0.07 and it is +0.012 for the same reason #tools' was cut
     from +0.2: a blurred glow is the layer that has least to say about depth,
     and spending the section's largest factor on it left everything a reader
     actually reads as an object crowded into a third of an octave.

     This is still the page's flat contrast anchor and still the section where
     nothing follows the cursor. What it is no longer is the section with one
     faint pine in it. */
  const blob = useParallax<HTMLDivElement>(0.012)
  const seam = useParallax<HTMLDivElement>(0.022)
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const reveal = useReveal<HTMLDivElement>('scale', 0)
  const tilt = useTilt<HTMLDivElement>()

  return (
    <section id="building" className="section section--flat building">
      {/* ── the walk, beat five: the far bank ───────────────────────────────
          You have just crossed the water in #tools; this is the ground on the
          other side, and this section is where the walk finally has somewhere
          to point. `props/wayfinding-post` had been in the kit since the
          beginning, drawn by nothing, described there as a signpost whose
          boards must stay blank — which is exactly what a section called
          "Building now" wants standing in it. It is this section's one
          structural anchor under guardrail 8 of the kit, which #building did
          not have at all before: it had fog and a pine pair, and fog and
          foliage are what the guardrail allows BESIDE an anchor.

          The faceted pair rather than #apps' trees, and they are not
          interchangeable. The pair is a whole small stand, which is what trees
          look like across water. It is drawn TWICE now, at two sizes and two
          opacities — one file, one URL, one request, the same trick
          `atmosphere/fog-veil` has used in this section since it was written —
          because a bank with one stand on it is a prop and a bank with two at
          two distances is a place. The fog band sits between them, which is
          what makes the far one read as far.

          Both stands are cropped by this section's own bottom edge, so what
          you see is crowns standing BEYOND the ground rather than trees in the
          foreground.

          None of this is kept off the pills by being drawn before `.shell`.
          `.card` is a plate now (--card-bg) and `.building__pill` still paints
          `var(--surface)`, which is a 4.5% white wash in the dark theme — so a
          layer behind a pill is read straight through it. What keeps it off
          the copy is that every box lives inside this section's own floor;
          Building.css does that arithmetic. */}
      {/* Everything that must be cut at this section's own edges. The section
          is `overflow: clip` with a margin now, so the mist and the wayfinder
          below can rise out of the top of it into #tools' floor, and a clip
          margin opens every edge equally — so without this box the pines would
          hang two whole trees over #faith. `.origin__clip` is the same idea
          three sections up. */}
      <div className="building__clip" aria-hidden="true">
        {/* ── the boundary: carried by atmosphere, not by an edge ───────────
            Fourth of the five joins on this page and the third distinct idea:
            #apps stands a treeline on both sides of its join, #tools draws one
            clean waterline, and this one has no hard edge anywhere in it. A
            `dune` that dissolves downward, and — in the crossing band below —
            a bank of the same mist that backs this section's own far bank,
            rising in front of it and over the join.

            The mist is drawn after the seam and outside this clip, so it is in
            front of it: the bank's edge is the far thing here and the mist off
            the water is the nearest thing in the section, which is why their
            factors have opposite signs and why the mist carries the largest
            one. */}
        <div ref={seam} className="building__seam-drift">
          <Seam shape="dune" edge="top" className="building__seam" />
        </div>

        {/* The lit bank, the far stand standing on it, the fog between the two
            depths, and the near stand in front of all three. Order is depth,
            and the fog in the middle of it is the point: a haze band between
            two planes does more for distance than a third prop would. */}
        <div className="building__bank" />
        <ThemedArt art="props/pine-faceted-pair" className="building__pines-far" factor={0.03} />
        <ThemedArt art="atmosphere/fog-veil" className="building__fog" factor={0.015} />
        <ThemedArt art="props/pine-faceted-pair" className="building__pines" factor={-0.1} />
        {/* ── the ground haze, and the fix for the ruled line at #faith ─────
            Last of the scenery, so it is in front of all of it: a band of this
            section's OWN --band-building rising out of the floor, transparent
            at the top and at exactly the band at the bottom edge.

            It is doing the depth job the fog band does one plane back — the
            near stand's feet recede into it, so the trees stand IN the section
            instead of on top of it — and it closes the boundary as a
            side-effect of being that. #faith's --tint-top is the same
            --band-building token this fades to, so the last row of #building
            and the first row of #faith are one value by construction: there is
            nothing left at the join for a cut edge to be made of.

            That join is the one Faith measured at fifteen columns and could not
            close from its own side; Faith.css carries both readings and now
            carries this one. Building.css has why it is a band rather than a
            mask on the fog alone. */}
        <div className="building__haze" />

        <div className="texture building__scan" />
        <div ref={blob} className="blob building__blob" />
      </div>

      {/* ── the far bank, standing in two sections ──────────────────────────
          The wayfinder's head and the mist off the water both rise out of this
          section's top edge into #tools' floor, where the bridge, the boulders
          and the neon grid were all being cut off on one ruled line. A layer
          that belongs to both sections is the strongest join there is.

          No z-index, unlike #apps' own crossing band: #building is later in
          the document than #tools and both sections are z-index auto, so this
          already paints over the floor it rises into.

          The post is drawn BEFORE the mist, so the mist is in front of it —
          you are looking at the far bank through the water you just crossed,
          and the post's base fades into it rather than ending anywhere. */}
      <div className="building__over" aria-hidden="true">
        <ThemedArt art="props/wayfinding-post" className="building__post" factor={-0.05} />
        <ThemedArt art="atmosphere/fog-veil" className="building__mist" factor={-0.12} />
      </div>

      <div className="shell building__shell">
        <div ref={head} className="building__head">
          <div>
            <div className="kicker">
              <span className="kicker__num">04</span>
              <span className="kicker__rule" />
              <span className="kicker__label">Building now</span>
            </div>
            <h2 className="h2 building__heading">Works in progress.</h2>
            <p className="lede building__lede">
              What's on our screens right now. One is nearly done, the rest are just getting going.
            </p>
          </div>
          <span className="building__count">{MARANATHA.count}</span>
        </div>

        <div ref={mergeRefs(reveal, tilt)} className="card building__feature">
          <span className="card__spot" aria-hidden="true" />
          <span className="card__edge" aria-hidden="true" />

          {/* The game gets its own page too, opened the same way every app
              card is opened. */}
          <a className="card__cover" href={appHash(MARANATHA.page)} onClick={() => rememberOrigin('Building')}>
            <span className="sr-only">Open the MARANATHA page</span>
          </a>

          <div className="building__art">
            <picture>
              <source
                type="image/avif"
                sizes="(max-width: 760px) 100vw, min(50vw, 590px)"
                srcSet={MARANATHA.shot.widths
                  .map((w) => `${asset(`shots/${MARANATHA.shot.slug}-${w}.avif`)} ${w}w`)
                  .join(', ')}
              />
              <source
                type="image/webp"
                sizes="(max-width: 760px) 100vw, min(50vw, 590px)"
                srcSet={MARANATHA.shot.widths
                  .map((w) => `${asset(`shots/${MARANATHA.shot.slug}-${w}.webp`)} ${w}w`)
                  .join(', ')}
              />
              <img
                className="building__art-img"
                src={asset(`shots/${MARANATHA.shot.slug}-${MARANATHA.shot.widths[0]}.webp`)}
                alt={MARANATHA.shot.alt}
                width={720}
                height={405}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>

          <div className="building__body">
            <div className="building__tags">
              <span className="building__tag">GAME</span>
              {/* MARANATHA.tag, not a literal. This tag and the `status` on
                  the button eleven lines down are two claims about one card,
                  and while the tag was typed here they had already drifted:
                  IN PLAYTEST over a status of `Coming soon`. Rule 1 — a word a
                  visitor reads lives in src/data/. */}
              <span className="building__tag building__tag--live">
                <span aria-hidden="true">● </span>
                {MARANATHA.tag}
              </span>
            </div>
            <h3 className="building__title">
              {MARANATHA.heading}
              <span className="building__title-arrow" aria-hidden="true">
                →
              </span>
            </h3>
            <p className="building__copy">{MARANATHA.copy}</p>
            <div className="building__actions">
              <span className="building__play building__play--soon">{MARANATHA.status}</span>
              <span className="building__note">{MARANATHA.note}</span>
            </div>
          </div>
        </div>

        <div className="building__pills">
          {NEXT_UP.map((label, i) => (
            <NextUpPill key={label} label={label} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
