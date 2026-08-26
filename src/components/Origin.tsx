import { useEffect, useRef, useState } from 'react'
import { clamp01, onFrame } from '../lib/motion'
import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { usePointer } from '../hooks/usePointer'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { StillArt, ThemedArt } from './scene/ThemedArt'
import { ABOUT_HASH, rememberOrigin } from '../lib/route'
import { CHAPTERS, type Chapter } from '../data/content'
import './Origin.css'

/*
 * ── the cabin used to be mounted here, and is not any more ────────────────
 * `CabinScene`, the `Stage` it hangs in, the near `Snow` layer and the
 * IntersectionObserver that defers the three.js chunk all moved to
 * `components/Walk.tsx` in this pass. CONTRACT W: the camera now goes on past
 * this section, in through the cabin door and around to the window, so its pin
 * has to hold for `#origin`, `#apps` and `#tools` together — and a `Stage`
 * releases on the bottom edge of the section it is declared in, which is
 * exactly the bound that made a shot across three sections impossible.
 *
 * What is left in this file is the section's own art: the mist, the treeline
 * and the snow bank at the hero boundary, the lamppost standing in that snow,
 * and the grid and blob inside `.origin__clip`. All of them still paint OVER
 * the walk's canvas, because `#origin` is `z-index: 4` and the stage is at 0.
 *
 * `stage-host` came off the section with the stage. It is `overflow: clip` and
 * nothing else, and `.origin` has declared its own `overflow: clip` (with the
 * 130svh margin the lamppost needs) since long before this pass — so the class
 * was already saying something the section said better one line down, and with
 * no `Stage` in here it is not even claiming the right thing any more.
 */

/** Pointer amplitude for the lamppost, px. See Origin.css: this number is
 *  spent out of the same budget that keeps the lamp's ink 30px clear of the
 *  wordmark, so it cannot be raised here alone. */
const LAMP_POINT_X = 10

/**
 * How far outside the viewport the lamppost's pointer tick stops writing, px.
 *
 * 120, the number `scene/Stage.tsx` and `faith/Summit.tsx` already guard on,
 * because this is the same question they answer: an `onFrame` subscriber
 * cannot see `useOffscreenPause`'s attribute and has to check for itself.
 *
 * It is worth a rect here even though the tick already suppresses a repeated
 * string. `usePointer` holds the loop for the whole of a mouse gesture
 * ANYWHERE on the page, so without this the lamppost took a style write and a
 * style recalculation every time the reader moved the cursor six sections
 * away. There is no stale state to be wrong about on the way back in: what
 * this writes is a pure function of a damped pointer that is already correct
 * on the frame it is read, and the read and its write happen inside one frame
 * before the browser paints.
 *
 * 120 rather than `useParallax`'s 400 for the same reason those two differ:
 * 400 buys the seventeen frames a lerp needs to settle out of sight, and there
 * is no lerp on this element.
 */
const LAMP_MARGIN = 120

/**
 * ── the depth ladder ──────────────────────────────────────────────────────
 *
 * Sign first, because it is the half that carries the depth: `useParallax`
 * writes `centreOffset * -factor`, so a POSITIVE factor lags the page and
 * reads as distance, and a NEGATIVE one travels against it and reads as near.
 * Four layers that only differ in magnitude is one layer with jitter; four
 * that differ in SIGN is a place.
 *
 *   +0.18  the blob        the sky glow behind everything (unchanged)
 *   +0.05  the valley mist the haze lying against the hero's ridges
 *   +0.02  the far trees   the pine pair standing behind the boundary
 *   -0.11  the near trees  the pine grove, cropped by the right frame edge
 *
 * Sixteen times between the fastest and the slowest, and the pair that
 * actually builds the boundary — the far trees at +0.02 and the near ones at
 * -0.11 — open and close by 0.13 of relative travel against each other, which
 * is what makes a reader scrolling past find a second treeline behind the
 * first rather than finding a line.
 *
 * **The ladder is one rung shorter than it was, and the rung that went is the
 * -0.07 nightfall.** It was the moving half of `.origin__sink`, the fade this
 * section used to paint into `#apps` at its own floor — and under CONTRACT W
 * that floor is not a boundary at all, it is the middle of one continuous
 * camera move. See the note where the sink used to be rendered. Every layer
 * left on this ladder is at the section's TOP, which is the one edge of Origin
 * that is still a join between two different pictures.
 *
 * The lamppost and its light are deliberately NOT on this ladder: they answer
 * the pointer and nothing else, because the pole is a thing standing on the
 * ground and ground does not drift. See the lamp effect below.
 */
const HAZE_FACTOR = 0.05
const FAR_TREE_FACTOR = 0.02
const NEAR_TREE_FACTOR = -0.11

/**
 * One chapter of the timeline, as a disclosure.
 *
 * The chapter's prose is shut by default and opens on click. Seven open
 * paragraphs made this section about a third of the home page on its own, and
 * a reader who wanted chapter five had to scroll past four essays to reach it.
 *
 * **A shut row still says what it is.** That is this site's stated position
 * everywhere it folds something — see `lib/sections.tsx` and `Folded.tsx`: a
 * section that says nothing while shut is a bug. Here the tag, the phase, the
 * numeral and the title are all still on the row, so the seven of them read as
 * an index of the story rather than as seven mystery headings.
 *
 * **Opening one does not shut the others.** These are chapters of one story
 * and comparing two of them side by side is a thing somebody will want; an
 * accordion that closes what you were reading to show you what you just asked
 * for would take that away for no gain.
 *
 * The trigger is a real `<button>`. It used to be the `<article>` itself with
 * `tabIndex={0}` and an `aria-label`, which is an element that looks focusable,
 * takes a tab stop, and does nothing at all when you press Enter or Space on
 * it. A button gets both keys for free and can say `aria-expanded`.
 *
 * **The button's HIT AREA is the whole row; its box is not.** The row carries
 * the padding — 28px above, 30px below, 26px right and a left gutter the spine
 * and the dot live in — and the button sits inside all of it, so for a while a
 * click anywhere but the words landed on the `<article>` and did nothing, on a
 * row that lights up on hover across its whole width. Measured at 1440px with
 * `elementFromPoint`: every probe in the two padding bands, the four corners
 * and the gutter answered `article.origin__row`.
 *
 * Moving the row's padding onto the button is the obvious fix and it is the
 * wrong one: the button's bottom padding then falls between the title and the
 * prose whenever the row is open, and the 21.75px gap measured there becomes
 * 51.75px. So no box moves. `.origin__toggle::after` is stretched out into the
 * row's padding instead — the same thing `.card__cover` does on an Apps card —
 * and the open row's spacing is identical to what it was.
 *
 * **The opened prose is not part of the control.** The overlay stops at the
 * heading's bottom edge once the row is open, because somebody dragging to
 * select a sentence must not lose it to a close. It is also what `Folded.tsx`
 * does — its head toggles, the region under it never does — so the site's two
 * disclosures answer a click in the same place.
 */
function OriginRow({ chapter, index }: { chapter: Chapter; index: number }) {
  const reveal = useReveal<HTMLElement>('pop', index)
  const tilt = useTilt<HTMLElement>(true)
  const [open, setOpen] = useState(false)
  // The numerals are unique across CHAPTERS and there is one Origin section on
  // the page, so this is stable across renders without a generated id.
  const panelId = `origin-chapter-${chapter.numeral}`

  return (
    <article
      ref={mergeRefs(reveal, tilt)}
      className="origin__row"
      data-turn={chapter.turn || undefined}
      data-open={open || undefined}
    >
      <span className="origin__sweep" aria-hidden="true" />
      {/* The turn's halo. Painted behind the dot as two compositable layers
          rather than an animated box-shadow, which costs ~45ms of main thread
          per second for this one 11px dot. */}
      {chapter.turn ? <span className="origin__pulse" aria-hidden="true" /> : null}
      <span className="origin__dot" aria-hidden="true" />

      {/* The button is inside the heading rather than around it, so the chapter
          still has a heading in the document outline while it is shut. */}
      <h3 className="origin__row-heading">
        <button
          type="button"
          className="origin__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="origin__meta">
            <span className="origin__chapter">{chapter.chapter}</span>
            <span className="origin__phase">{chapter.phase}</span>
          </span>
          <span className="origin__body">
            {/* The tag beside it already says "CH. 01", so to a screen reader
                this is the same number a second time. It is here as type. */}
            <span className="origin__numeral" aria-hidden="true">
              {chapter.numeral}
            </span>
            <span className="origin__title">{chapter.title}</span>
          </span>
        </button>
      </h3>

      {/* A 0fr to 1fr grid row rather than a measured max-height, the same way
          `Folded.tsx` opens: what is inside is prose whose height depends on
          the width it is read at, and `height: auto` does not transition at
          all. The paragraph carries its own fade and slide so the words arrive
          after the box has started opening rather than being stretched open
          with it. */}
      <div className="origin__panel" id={panelId} inert={!open}>
        <div className="origin__panel-inner">
          <p className="origin__copy">{chapter.copy}</p>
        </div>
      </div>
    </article>
  )
}

export function Origin() {
  const section = useRef<HTMLElement | null>(null)
  const rail = useRef<HTMLDivElement | null>(null)
  const lamp = useRef<HTMLDivElement | null>(null)
  const blob = useParallax<HTMLDivElement>(0.18)
  const haze = useParallax<HTMLDivElement>(HAZE_FACTOR)
  const intro = useReveal<HTMLDivElement>('wipe', 0)
  const more = useReveal<HTMLDivElement>('wipe', 0)
  const pointer = usePointer()

  /*
   * The lamppost answers the mouse, and only on one axis.
   *
   * Horizontally it is a near object sliding against a far horizon, which is
   * the whole point of a mouse parallax. VERTICALLY it is a thing standing on
   * the ground — and a foot that bobs 5px off the snow every time the cursor
   * moves is the one way to lose the illusion this entire arrangement exists
   * to build. So there is no y term at all.
   *
   * **This wrapper now carries five layers, not one.** The lamp's warm light —
   * its pool on the snow, the cone of lit air, the halo and the lantern's own
   * core — are children of this element for exactly this reason: one writer of
   * `translate`, on the box all five share, so the light cannot come off the
   * lantern however far the pointer pulls it. Origin.css has the geometry they
   * all read from.
   *
   * The rect guard is new; see LAMP_MARGIN for why a tick that already
   * suppresses a repeated string still wanted one. `.origin__lamp-drift` is
   * `inset: 0`, so its rect IS the section's rect — this is the section check
   * the house rule asks for, not a second box.
   */
  useEffect(() => {
    const el = lamp.current
    if (!el) return
    let painted = ''
    return onFrame(({ vh, mi }) => {
      const r = el.getBoundingClientRect()
      if (r.bottom < -LAMP_MARGIN || r.top > vh + LAMP_MARGIN) return
      const next = mi === 0 ? '' : `${(pointer.x * LAMP_POINT_X).toFixed(1)}px 0`
      if (next === painted) return
      painted = next
      return () => {
        el.style.translate = next
      }
    })
  }, [pointer])

  // A second spine grows over the static one, mapped across the middle
  // two-thirds of the section, so the path visibly fills as you read.
  useEffect(() => {
    const fill = rail.current
    const el = section.current
    if (!fill || !el) return
    let painted = ''
    return onFrame(({ vh }) => {
      const r = el.getBoundingClientRect()
      const p = clamp01((vh * 0.86 - r.top) / (r.height * 0.66))
      const next = `${(p * 100).toFixed(1)}%`
      if (next === painted) return
      painted = next
      return () => {
        fill.style.height = next
      }
    })
  }, [])

  return (
    <section id="origin" ref={section} className="section origin">
      {/* ── everything that must NOT escape ─────────────────────────
          This section is `overflow: clip` with a 130svh clip margin, because
          the lamppost below has to rise out of the top of it and stand in the
          hero. A clip margin opens EVERY edge, though, and Origin has layers
          deliberately larger than it is: a blurred blob that drifts on
          `useParallax`, and a masked grid. Left as direct children they would
          leak into the hero and into Apps the moment the margin was added, and
          so would every future layer added to this section, silently.

          So the clip is stated once, HERE, as a box: this wrapper is the
          section's own padding box with `overflow: clip` and no margin, and
          anything inside it is clipped exactly as it always was. Only the
          things that are SUPPOSED to cross the boundary sit outside it. That
          makes the invariant structural rather than remembered, which is the
          same move `.stage` makes for z-order.

          The cabin and the near snow used to be the first thing in this box.
          They are in `Walk.tsx` now — see the note at the top of this file —
          and both of them paint UNDER this section rather than inside it, so
          the grid and the blob below are drawn over the canvas exactly as they
          were drawn over it here.

          `overflow: clip` and not `hidden`, still: the walk's sticky pin is
          not inside this section, so `hidden` would no longer break it, but
          `overflow-clip-margin` is defined only for `clip` and the whole
          purpose of this box is the margin on the section around it. */}
      <div className="origin__clip" aria-hidden="true">
        <div className="texture origin__grid" />
        <div ref={blob} className="blob origin__blob" />
      </div>

      {/* ── the valley's mist ─────────────────────────────────────────
          Aerial perspective, and it is the cheapest depth cue there is: a
          band of THIS section's own ink lying against the hero's ridges,
          above the boundary, so the mountains pale into the air Origin
          arrives in rather than being cut off by it.

          It is `--band-origin` and not `--terrain-haze` even though the haze
          token is what the hero draws under each ridge. That token is the
          ridge's FOOT — the colour a ridge stops on — and Hero.css already
          spends it there. What this band is doing is the other half of the
          same idea from below: it is the arriving section's air, which is the
          band, and tokens.css records that --band-origin was DERIVED from
          exactly that foot ink at this band's own lightness. One ink, and it
          is right in both themes for one reason: over a night sky it darkens
          the ridge toward the valley floor, over a pale one it pales it toward
          the mist, which is what aerial perspective does in each.

          It drifts FASTER than the treeline standing in it (+0.05 against
          +0.02), because it is further away, and a positive factor lags the
          page. See the depth ladder above. */}
      <div ref={haze} className="origin__haze" aria-hidden="true" />

      {/* ── the treeline, and it is the thing that welds the two bands ──
          The site owner's report: "have the trees overlap well with the hero
          section, because right now the trees are being cut off past the
          mountain height." The trees they mean are the cabin's, and those
          genuinely cannot leave — they are geometry inside a WebGL canvas
          inside `.origin__clip`, and moving that canvas up would put snow and
          pines in the middle of the hero at scroll 0.

          So this is a SECOND treeline, built the way the lamppost below is
          built: a child of #origin that sits OUTSIDE `.origin__clip` and
          escapes upward through the section's `overflow-clip-margin`. Crowns
          in the hero's mountains, trunks in Origin's snow, one prop standing
          on both sides of a boundary — which is a weld no gradient can make.

          Two silhouettes at two depths and not one: `props/pine-grove` is the
          NEAR plane, mirrored and pushed off the right edge so the frame CROPS
          it, and `props/pine-pair` is the far one behind and left of it,
          smaller and at --art-far.

          **That assignment is the other way round from the obvious one, and it
          was decided off a render rather than off the file names.** The pair is
          drawn in flat facets, which is the hero's voice, so putting it near
          looked like the right call — and on screen its -dark artwork is a mid
          slate that composites LIGHTER than this section's near-black sky, so a
          490px pine at the frame edge read as one more pale triangle among the
          ridge's pale triangles. The grove is the darker, painterly file, and
          near-black-on-near-black is what a foreground conifer is supposed to
          be. Swapped, the near tree reads as a tree and the pair does the job
          flat facets are actually good at, which is being far away.

          The kit says the grove is "a richer edge anchor for one later
          section" and says of both that they must never stand beside the
          lamppost — so both are on the RIGHT, and the pole keeps the left edge
          to itself.

          Both are on the right for a second reason: Origin's reading column
          ends at 994px inside a 1430px section, so a tree at the frame edge is
          a tree nothing has to be read through.

          Invisible at scroll 0 by arithmetic, not by luck. Origin's top edge
          sits at 130svh and the fold at 100svh, so there are 30svh to spend;
          the band's own top is 1.42 x --tl-rise above the boundary and
          --tl-rise is capped at 17svh, which leaves better than 5svh of
          clearance at every viewport height. Origin.css has the working. */}
      <div className="origin__treeline" aria-hidden="true">
        <ThemedArt art="props/pine-pair" className="origin__tree--far" factor={FAR_TREE_FACTOR} />
        <ThemedArt art="props/pine-grove" className="origin__tree--near" factor={NEAR_TREE_FACTOR} />
      </div>

      {/* ── the ground, and it crosses the boundary ───────────────────
          A snow drift sitting ON the seam: its crest stands above Origin's
          top edge, in the hero, and its body fills down into Origin. This is
          the section's boundary treatment and it replaces the `Seam` terrace
          that used to be here. Two silhouettes on one boundary is mush, and
          of the two this is the one the lamppost can stand in, which is the
          whole point of the arrangement below: the pole's foot has to land on
          something rather than on a colour change.

          It is drawn AFTER the treeline on purpose: the drift is what buries
          the pines' trunks, so the row of trees has no bottom edge of its own
          to show. The band's own mask finishes that join — see Origin.css.

          The wrapper is a band centred on the boundary with its own
          `overflow: clip`, so the drift's own width (it runs off both edges,
          the way the art kit asks a floor to) cannot leak through the
          section's clip margin and put a horizontal scrollbar on the page. */}
      <div className="origin__ground" aria-hidden="true">
        <StillArt art="landscapes/snow-bank" className="origin__snow" />
      </div>

      {/* ── the lamppost ─────────────────────────────────────
          It is drawn by THIS section and not by the hero, and that is the
          whole trick. The site owner asked for the foot of the pole to be on
          the ground of the story section rather than cut off at the seam, and
          a pole living in a pinned hero is covered by Origin the instant
          Origin rises over it: there is no z-order inside the hero that can
          survive being painted over by the next section.

          Here it is a child of #origin, so it paints with Origin (z-index 4)
          and over the hero's stage (0), while Hero.css gives up the hero's own
          stacking context so .hero__frame's z-index 5 can still be above BOTH.
          That is what keeps the pole behind the wordmark, the tagline, the
          CTAs, the model and the bottom strip while its foot is planted 30px
          inside Origin's snow.

          Origin.css has the sizing, the two clearances it is solved against,
          and the measured table.

          ── and now it is lit ─────────────────────────────────────────
          The artwork draws a lit lantern and nothing on the page ever answered
          it. The site owner asked for "some colour, a bit transparent,
          lighting to the pole where the light should come from, to have a bit
          more warmth and glow", and this is the one warm source in a cold blue
          valley, which is what makes the valley read as cold.

          Four layers, because a lamp is four intensities at four distances,
          and four compositable radial gradients rather than one box-shadow or
          one filter: a shadow cannot be an ellipse on the ground and a filter
          would repaint the whole pole every frame it breathed.

          They are SIBLINGS of the pole inside the drift wrapper, so all five
          boxes share one `left`/`top`/`width`/`aspect-ratio` and the light can
          never come off the lantern however far the pointer pulls it. The pool
          is drawn BEFORE the pole and the other three after, which is the
          whole of the z-order between them: the snow is lit under the foot,
          and the glass, the halo and the lit air are in front of the ironwork.

          Origin.css carries where each gradient sits inside that shared box,
          and the re-measured clearance table — three of the four are inside
          the same ink budget the artwork already spends, so --lamp-fit did not
          have to move. */}
      <div ref={lamp} className="origin__lamp-drift" aria-hidden="true">
        <span className="origin__lamp-pool" />
        <StillArt art="hero/lamppost-left" className="origin__lamp" />
        <span className="origin__lamp-spill" />
        <span className="origin__lamp-glow" />
        <span className="origin__lamp-core" />
      </div>

      {/* ── the sink into #apps is GONE, and that is CONTRACT W ─────────────
          A `.origin__sink` used to sit here: a dusk ramp into --band-apps plus
          a crest of the same ink rising on `useParallax(-0.07)`, built to hide
          the ruled line where the cabin's canvas stopped dead on this
          section's bottom edge.

          There is no such line any more. The canvas does not stop here — it
          carries on behind `#apps` and `#tools` as one continuous camera move,
          and this boundary is now the middle of an interior shot rather than a
          join between two bands. A landscape transition drawn across it would
          be worse than nothing: a fade to night painted over the inside of a
          lit cabin, at the exact moment the camera is turning toward the
          table. Deleted rather than softened, for the same reason Origin.css
          gives for deleting the arrival shadow — an edge treatment on an edge
          that does not exist has nothing to be right about.

          `#apps`' treeline crossing up over the same boundary went with it,
          and Apps.tsx says so from the other side. */}

      <div className="shell origin__shell">
        {/* ── the plate is OUTSIDE the reveal, and it has to be twice over ──
            `.walk-plate` (Walk.css) is the one plate recipe the five blocks of
            copy over the walk share, and it wants a wrapper for two separate
            reasons — this block used to break both.

            `useReveal('wipe')` writes `clip-path: inset(N% 0 0 0)` to the
            element it reveals, and a clip-path clips that element's
            PSEUDO-ELEMENTS to its border box. On `.origin__intro::before` that
            drew a plate built to have no edge on any side as a hard rectangle
            for the six-tenths of a second the wipe runs — the identical defect
            Apps.tsx caught in a render one section down and fixed with a
            wrapper. This file did not, and now does.

            And the plate is anchored with `calc(50vw - 50%)`, which is the
            wrapper's own left edge said from inside it — true only for a box
            CENTRED in the frame. `.origin__intro` is 660px inside an 1100px
            shell and sits at its left, so plating it directly would have put
            the plate 260px off. The wrapper is the full shell width; the
            intro's own `max-width` is unchanged inside it. */}
        <div className="origin__intro-plate walk-plate">
          <div ref={intro} className="origin__intro">
            <div className="kicker">
              <span className="kicker__num">01</span>
              <span className="kicker__rule" />
              <span className="kicker__label">Origin</span>
            </div>
            <h2 className="h2 h2--serif origin__heading">It started on a Minecraft server.</h2>
            <p className="origin__lede">
              TDG was the name of a Minecraft server the two of us built and ran, years before it
              meant anything else. We reached back for it in 2016 when a Black Ops II clan needed a
              tag, and the three letters stayed long after the lobbies emptied. In 2024 they were
              given a new meaning, and we are still growing into it.
            </p>
          </div>
        </div>

        <div className="origin__timeline">
          <div className="origin__spine" aria-hidden="true" />
          <div ref={rail} className="origin__spine-fill" aria-hidden="true" />
          {/* ── one plate for seven rows, and that is the whole of the fix ──
              Every row used to carry its own, masked with an ellipse that was
              at full alpha on the row's left edge and through both of its
              horizontal edges — so seven of them drew a ruled left edge plus
              eight ruled lines across the cabin, six of them in the 4px gaps
              between rows. `.walk-plate` here is one soft-edged field over the
              whole column, and Origin.css has the alpha measurements.

              The rows reveal individually and this box never does, so it is
              also outside the `clip-path` trap — see the intro's note above. */}
          <div className="origin__rows walk-plate">
            {CHAPTERS.map((chapter, i) => (
              <OriginRow key={chapter.numeral} chapter={chapter} index={i} />
            ))}
          </div>
        </div>

        {/* The front page is deliberately the short version now, so the end of
            the timeline points at the long one. `rememberOrigin` is what brings
            a reader back to this section rather than to the top of the page. */}
        {/* The plate is on the OUTER box and the reveal on the inner one.
            `useReveal` writes a `clip-path` to whatever it reveals, and a
            clip-path clips that element's pseudo-elements to its border box —
            which would draw this link's soft-edged scrim as a hard rectangle
            for the length of the wipe. Apps.tsx carries the render that caught
            it on the same construction one section down. */}
        <div className="origin__more-plate walk-plate">
          <div ref={more} className="origin__more-wrap">
            <a className="origin__more" href={ABOUT_HASH} onClick={() => rememberOrigin('Origin')}>
              The longer version, and who is behind it
              <span className="origin__more-arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
