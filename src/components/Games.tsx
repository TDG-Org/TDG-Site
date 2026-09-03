import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { MARANATHA, NEXT_UP, shotHeight } from '../data/content'
import { visibleGame, type SiteGame } from '../content/resolve'
import { useSiteContent } from '../content/store'
import { DOWN_WORDING, useLiveAccess } from '../live/useLive'
import { asset } from '../lib/asset'
import { appHash, rememberOrigin } from '../lib/route'
import { Seam } from './scene/Seam'
import { ThemedArt } from './scene/ThemedArt'
import './Games.css'

function NextUpPill({ label, index }: { label: string; index: number }) {
  const reveal = useReveal<HTMLDivElement>('pop', index)
  return (
    <div ref={reveal} className="games__pill">
      <span className="games__pill-dot" data-alt={index % 2 === 1 || undefined} />
      {label}
    </div>
  )
}

/**
 * The game's own card.
 *
 * Its own component so the section can leave it out entirely — the Content tab
 * at `#/dev` can hide any product, this one included, and a hook cannot be
 * called conditionally. The tilt and the reveal belong to the card anyway; they
 * were only on the section because there was one card and it never went away.
 */
function Feature({ game }: { game: SiteGame }) {
  const reveal = useReveal<HTMLDivElement>('scale', 0)
  const tilt = useTilt<HTMLDivElement>()
  const shot = game.shot

  /* Is the game actually deployed? Asked only while no human has given the
     button a link — a Content-tab `href` is a decision, and discovery never
     argues with one. `Play`, not `Open`: it is a game. See src/live/README.md. */
  const live = useLiveAccess(game.href ? undefined : MARANATHA.repo, game.title, 'Play')

  return (
    <div ref={mergeRefs(reveal, tilt)} className="card games__feature">
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      {/* The game gets its own page too, opened the same way every app
          card is opened. */}
      <a className="card__cover" href={appHash(game.page)} onClick={() => rememberOrigin('Games')}>
        <span className="sr-only">Open the {game.heading} page</span>
      </a>

      {/* A card whose cover has been taken away keeps its body rather than a
          hole where a picture was: the panel is a wide card and an empty art
          box would read as an image that failed to load. */}
      {shot && (
        <div className="games__art">
          <picture>
            <source
              type="image/avif"
              sizes="(max-width: 760px) 100vw, min(50vw, 590px)"
              srcSet={shot.widths
                .map((w) => `${asset(`shots/${shot.slug}-${w}.avif`)} ${w}w`)
                .join(', ')}
            />
            <source
              type="image/webp"
              sizes="(max-width: 760px) 100vw, min(50vw, 590px)"
              srcSet={shot.widths
                .map((w) => `${asset(`shots/${shot.slug}-${w}.webp`)} ${w}w`)
                .join(', ')}
            />
            <img
              className="games__art-img"
              src={asset(`shots/${shot.slug}-${shot.widths[0]}.webp`)}
              alt={shot.alt}
              width={shot.widths[0]}
              height={shotHeight(shot, shot.widths[0])}
              loading="lazy"
              decoding="async"
            />
          </picture>
        </div>
      )}

      <div className="games__body">
        <div className="games__tags">
          <span className="games__tag">GAME</span>
          {/* `game.tag`, not a literal. This tag and the `status` on the button
              below it are two claims about one card, and while the tag was
              typed here they had already drifted: IN PLAYTEST over a status of
              `Coming soon`. Rule 1 — a word a visitor reads lives in data. */}
          <span className="games__tag games__tag--live">
            <span aria-hidden="true">● </span>
            {game.tag}
          </span>
        </div>
        <h3 className="games__title">
          {game.heading}
          <span className="games__title-arrow" aria-hidden="true">
            →
          </span>
        </h3>
        <p className="games__copy">{game.copy}</p>
        <div className="games__actions">
          {/* Not a link until the demo is actually reachable, and two things
              can make it one: the Content tab giving the button a link (which
              keeps `status` as its words), or `src/live/` finding a deploy on
              its own (which brings its own words — `status` still says Coming
              soon, and printing that on a working button would be the drift
              this panel's tag comment warns about). All three states are the
              same element in the same place, so the row does not move. */}
          {game.href ? (
            <a className="games__play" href={game.href} target="_blank" rel="noopener">
              {game.status}
            </a>
          ) : live?.kind === 'live' ? (
            <a className="games__play" href={live.href} target="_blank" rel="noopener">
              {live.label}
            </a>
          ) : (
            <span className="games__play games__play--soon">
              {live?.kind === 'down' ? DOWN_WORDING : game.status}
            </span>
          )}
          <span className="games__note">{game.note}</span>
        </div>
      </div>
    </div>
  )
}

export function Games() {
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

  /* The game panel, as the Developer console's Content tab last published it.
     `null` when it has been hidden, and then this section is its heading, its
     count line and the Next Up pills — see src/content/README.md. */
  const game = visibleGame(useSiteContent())

  return (
    <section id="games" className="section section--flat games">
      {/* ── the walk, beat five: the far bank ───────────────────────────────
          You have just crossed the water in #tools; this is the ground on the
          other side, and this section is where the walk finally has somewhere
          to point. `props/wayfinding-post` had been in the kit since the
          beginning, drawn by nothing, described there as a signpost whose
          boards must stay blank — which is exactly what a section called
          "Games" wants standing in it: one road, most of it still ahead.
          It is this section's one structural anchor under guardrail 8 of the
          kit, which #games did not have at all before: it had fog and a pine
          pair, and fog and foliage are what the guardrail allows BESIDE an
          anchor.

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
          `.card` is a plate now (--card-bg) and `.games__pill` still paints
          `var(--surface)`, which is a 4.5% white wash in the dark theme — so a
          layer behind a pill is read straight through it. What keeps it off
          the copy is that every box lives inside this section's own floor;
          Games.css does that arithmetic. */}
      {/* Everything that must be cut at this section's own edges. The section
          is `overflow: clip` with a margin now, so the mist and the wayfinder
          below can rise out of the top of it into #tools' floor, and a clip
          margin opens every edge equally — so without this box the pines would
          hang two whole trees over #faith. `.origin__clip` is the same idea
          three sections up. */}
      <div className="games__clip" aria-hidden="true">
        {/* ── the light theme's sky, and why the dark theme draws it too ────
            First in, so everything below is read against it rather than
            through it. In LIGHT it is a shaded band across the section's sky
            that comes back to --band-games before either edge; in DARK its
            ink is `transparent` and it paints nothing at all. Games.css
            carries the two measurements it was solved against — the band and
            the feature card were 2.5 L* apart in light, against 90 in dark —
            and the mask stops that keep both joins on the token. */}
        <div className="games__dusk" />

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
        <div ref={seam} className="games__seam-drift">
          <Seam shape="dune" edge="top" className="games__seam" />
        </div>

        {/* The lit bank, the far stand standing on it, the fog between the two
            depths, and the near stand in front of all three. Order is depth,
            and the fog in the middle of it is the point: a haze band between
            two planes does more for distance than a third prop would. */}
        {/* ── and what the two stands are in Cebu ────────────────────────
            `props/coconut-pair` was here, in both slots: a 2:3 prop the width
            of a pine pair, tucked into a corner. At the widths this section is
            actually read at that put two palm fronds in the bottom-left and
            left the rest of a 380px floor empty — the site owner's report was
            exactly that, "I can only see 2 of the trees", and asked for
            `palm-row` in their place so the stand fills the bank it is
            standing on.

            It is an aspect change and not only a file change: the row is a 3:1
            band, so Games.css gives both slots a light-theme box (a band
            across the floor) rather than trying to letterbox a 3:1 file into
            the 2:3 hole the pines left. The dark stands are untouched.

            The FAR stand takes `landscapes/far-palms` rather than the same row
            at a smaller width, and that is a rendering fact rather than a
            preference: a 3:1 box locks height to width, so making the far
            palms smaller by shrinking the element also makes the element
            narrower — and at 66vw its own edges were visible as a bright
            rectangle down the middle of the section, because inside it two
            rows overlap and outside it only one does. `far-palms` is the same
            palms drawn small INSIDE a full-width canvas (Origin's far shore
            uses it for the same reason), so the far stand can be both smaller
            and edge to edge. */}
        <div className="games__bank" />
        <ThemedArt art="props/pine-faceted-pair" light="landscapes/far-palms" className="games__pines-far" factor={0.03} />
        {/* ── the floor, and it stopped being a smear of glare ────────────
            `atmosphere/sea-haze` was here in light. That file is a band of
            sunlight ON WATER, and this band is the sand between two stands of
            palms, so what it painted was a yellow streak lying across a beach
            with nothing to be the glare of — the site owner's "the yellow
            floor image is randomly thrown in there. As you can tell, that
            needs a whole redesign cause what?"

            `landscapes/beach-terrace` is the ground itself: sand with a few
            shells in it, drawn for this width. The near stand's trunks go into
            it and the far one stands on it, which is the job the fog band was
            doing in the winter frame by being air between two depths. */}
        <ThemedArt art="atmosphere/fog-veil" light="landscapes/beach-terrace" className="games__fog" factor={0.015} />
        <ThemedArt art="props/pine-faceted-pair" light="props/palm-row-mid" className="games__pines" factor={-0.1} />
        {/* ── the ground haze, and the fix for the ruled line at #faith ─────
            Last of the scenery, so it is in front of all of it: a band of this
            section's OWN --band-games rising out of the floor, transparent
            at the top and at exactly the band at the bottom edge.

            It is doing the depth job the fog band does one plane back — the
            near stand's feet recede into it, so the trees stand IN the section
            instead of on top of it — and it closes the boundary as a
            side-effect of being that. #faith's --tint-top is the same
            --band-games token this fades to, so the last row of #games
            and the first row of #faith are one value by construction: there is
            nothing left at the join for a cut edge to be made of.

            That join is the one Faith measured at fifteen columns and could not
            close from its own side; Faith.css carries both readings and now
            carries this one. Games.css has why it is a band rather than a
            mask on the fog alone. */}
        <div className="games__haze" />

        <div className="texture games__scan" />
        <div ref={blob} className="blob games__blob" />
      </div>

      {/* ── the far bank, standing in two sections ──────────────────────────
          The wayfinder's head and the mist off the water both rise out of this
          section's top edge into #tools' floor, where the bridge, the boulders
          and the neon grid were all being cut off on one ruled line. A layer
          that belongs to both sections is the strongest join there is.

          No z-index, unlike #apps' own crossing band: #games is later in
          the document than #tools and both sections are z-index auto, so this
          already paints over the floor it rises into.

          The post is drawn BEFORE the mist, so the mist is in front of it —
          you are looking at the far bank through the water you just crossed,
          and the post's base fades into it rather than ending anywhere. */}
      <div className="games__over" aria-hidden="true">
        <ThemedArt art="props/wayfinding-post" light="props/beach-signpost" className="games__post" factor={-0.05} />
        {/* ── and the crossing band is the SHALLOWS ───────────────────────
            This is the layer that reaches up out of #games into #tools'
            floor, and #tools' floor is where the pier stands. It was the same
            glare plate, so the pier stood on a torn patch of its own water
            with a yellow streak behind it and nothing else — "a bunch of crap
            (images) just thrown together and literally make no sense".

            `landscapes/shallow-water` is a real waterline: turquoise with a
            foam line across it, edge to edge. The pier now stands IN it, the
            reeds at its near edge, the coral rocks on the sand beyond, and the
            band carries the join up into the section above exactly as it did
            before. */}
        <ThemedArt art="atmosphere/fog-veil" light="landscapes/shallow-water" className="games__mist" factor={-0.12} />
      </div>

      <div className="shell games__shell">
        <div ref={head} className="games__head">
          <div>
            <div className="kicker">
              <span className="kicker__num">04</span>
              <span className="kicker__rule" />
              <span className="kicker__label">Games</span>
            </div>
            <h2 className="h2 games__heading">Games we're making.</h2>
            <p className="lede games__lede">
              Right now that means one, a Bible game that runs in a browser tab. The rest are
              queued behind it.
            </p>
          </div>
          {game && <span className="games__count">{game.count}</span>}
        </div>

        {game && <Feature game={game} />}

        <div className="games__pills">
          {NEXT_UP.map((label, i) => (
            <NextUpPill key={label} label={label} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
