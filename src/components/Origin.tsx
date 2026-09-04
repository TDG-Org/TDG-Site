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
import { SceneExtras } from '../scene/SceneExtras'
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
 * ── the lamppost's rise, and why it is not `useParallax` ──────────────────
 *
 * How far BELOW its resting line the lamp stands before the rise, px, and how
 * much scroll the rise takes as a fraction of the viewport.
 *
 * The site owner asked for the same treatment the hero's tall pine is
 * getting: the prop rises as the reader scrolls and its foot **comes to rest**
 * on the line where Origin's heading starts. "Comes to rest" is the half that
 * rules out `useParallax`, which is an unbounded lag — it passes through its
 * identity at the one scroll where the layer's centre meets the viewport's and
 * keeps travelling after it, so the foot would cross the heading's line rather
 * than land on it, and would still be climbing while the reader read. This is
 * a clamped ramp instead: the lamp starts LAMP_RISE below its composed
 * position, climbs to it, and does not move again. After the ramp the foot
 * cannot bob, because nothing writes to it.
 *
 * The ramp is measured off Origin's own top edge and both ends are fractions
 * of the viewport, so it holds at every height: it opens when that edge
 * reaches the fold and closes 0.40 of a viewport later. At 1440x900 that is
 * scroll 270 to 630, and at 630 the heading sits at viewport 706 — arriving.
 * So the last of the climb is on screen with the words it lands under, and the
 * lamp is standing still by the time the heading is comfortably read.
 *
 * ── the two numbers, and what each is bounded by ──────────────────────────
 *
 * **48, because that is what the fold allows.** At scroll 0 the lamp sits the
 * whole rise below its resting frame, and its resting frame is already 135.6px
 * lower than the old plant. Measured at 1440x900: the lit glass' bottom edge
 * lands at viewport `851.7 + LAMP_RISE`, so 48 is the largest rise that keeps
 * the whole of the lit pane above the 900px fold on the first screen. Past it
 * the hero's corner loses the lantern rather than merely lowering it, and a
 * light source cut in half by the fold is worse than either whole state.
 *
 * **0.40 of a viewport, because that is what makes 48px read as NEAR.** The
 * two together are a rate: 48px of travel against 360px of scroll is 0.133,
 * which is just past `props/pine-row`'s 0.13 — so the lamp is the fastest
 * thing at this boundary and therefore the nearest, which is what it is. Spend
 * the same 48px over 0.55 of a viewport instead and the rate falls to 0.097,
 * behind the row, and a lamp standing in front of a wood would be travelling
 * slower than the wood.
 */
const LAMP_RISE = 48
const LAMP_RISE_SPAN = 0.4

/**
 * How far outside the viewport the lamppost's tick stops writing, px, and how
 * far above its section's own top edge the lamppost is allowed to reach.
 *
 * ── the second number, which this guard was missing ───────────────────────
 * The lamppost escapes UPWARD out of #origin through that section's
 * `overflow-clip-margin: 130svh`, so the section's top edge is NOT the top of
 * the thing being guarded. At scroll 0 the section's rect begins 1170px down a
 * 900px window and the lantern is on screen — so a guard that only asked
 * `r.top > vh + margin` refused to write for the whole of the first 150px of
 * scroll and then wrote the full rise on one frame. Nothing showed while the
 * tick only carried the pointer, because with the cursor still there was no
 * value to write; the rise made it a 48px jump on a lamp the reader is looking
 * at.
 *
 * 1.3 is that clip margin, in the same units the rect is in. It is Origin.css's
 * own number for how far this section's ink may reach above itself, and the
 * lamppost is the thing the margin was added for.
 *
 * ── the first number ──────────────────────────────────────────────────────
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
const LAMP_ESCAPE = 1.3

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
 *   +0.06  the far tops    `landscapes/far-treeline`, the hazed horizon
 *   +0.02  the mist bank   `atmosphere/mist-bank`, the air between the planes
 *   -0.13  the near row    `props/pine-row`, cropped by BOTH frame edges
 *
 * Nine times between the fastest and the slowest, and the pair that actually
 * builds the boundary — the mist at +0.02 and the row standing in front of it
 * at -0.13 — open and close by 0.15 of relative travel against each other,
 * because the signs are opposite and relative travel is therefore a SUM. That
 * is what makes a reader scrolling past find a wood with air in it rather than
 * finding a line.
 *
 * **Three of those four rungs are new art and the fourth moved.** The row used
 * to be `props/pine-pair` at +0.02 and `props/pine-grove` at -0.11, one of
 * them mirrored and pushed off the right edge to fake a row out of two trees;
 * `props/pine-row` is the piece the kit drew for exactly that job. The mist
 * used to be a CSS gradient band standing in for art that did not exist —
 * `atmosphere/mist-bank` is that art, and its alpha reaches zero on all four
 * edges, so it can lie straight across the boundary with nothing to hide.
 * `landscapes/far-treeline` is the plane behind the row, and it arrives with
 * its own aerial haze already painted in, which is the depth cue no factor can
 * buy.
 *
 * **The ladder is one rung shorter than it was, and the rung that went is the
 * -0.07 nightfall.** It was the moving half of `.origin__sink`, the fade this
 * section used to paint into `#apps` at its own floor — and under CONTRACT W
 * that floor is not a boundary at all, it is the middle of one continuous
 * camera move. See the note where the sink used to be rendered. Every layer
 * left on this ladder is at the section's TOP, which is the one edge of Origin
 * that is still a join between two different pictures.
 *
 * The lamppost is deliberately NOT on this ladder, and it is not still either.
 * It answers the pointer on one axis and rides a CLAMPED rise on the other —
 * a lag with no end would drift its foot off the ground for as long as the
 * reader kept scrolling, and a foot that leaves the ground is the one way to
 * lose the illusion this whole arrangement exists to build. The snow bank it
 * stands in takes the identical rise from the identical subscriber, so the two
 * cannot come apart. See the lamp effect below.
 */
const FAR_TOPS_FACTOR = 0.06
const MIST_FACTOR = 0.02
const NEAR_ROW_FACTOR = -0.13

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
  const ground = useRef<HTMLDivElement | null>(null)
  const blob = useParallax<HTMLDivElement>(0.18)
  const intro = useReveal<HTMLDivElement>('wipe', 0)
  const more = useReveal<HTMLDivElement>('wipe', 0)
  const pointer = usePointer()

  /*
   * The lamppost answers the mouse on one axis and the scroll on the other,
   * and the two are different KINDS of motion on purpose.
   *
   * Horizontally it is a near object sliding against a far horizon, which is
   * the whole point of a mouse parallax. VERTICALLY it does not answer the
   * pointer at all — a foot that bobs 5px off the snow every time the cursor
   * moves is the one way to lose the illusion this entire arrangement exists
   * to build. What the y term carries instead is the rise: a clamped ramp that
   * lands the foot on the line where Origin's heading starts and then stops
   * writing. See LAMP_RISE.
   *
   * **The snow takes the same y, from this same subscriber.** That is the
   * whole of the answer to "the foot must not leave the ground": the lamp and
   * the drift it is planted in are two elements with one writer each and one
   * number between them, so they cannot come apart on a fast scroll the way
   * two independent lerps would. The drift does NOT take the pointer's x — the
   * 10px of sideways slide against the ground is the parallax itself, and it
   * is the behaviour this section already shipped.
   *
   * **The wrapper carries four layers now, not five.** The lamp's warm light —
   * its pool on the snow, the halo and the lantern's own core — are children
   * of this element for exactly this reason: one writer of `translate`, on the
   * box they all share, so the light cannot come off the lantern however far
   * the pointer pulls it or however high the rise takes it. (The fifth was
   * `.origin__lamp-spill`, the cone of lit air falling down the pole. It is
   * deleted — see Origin.css.)
   *
   * **The rect is the SECTION's and it has to be, now that this wrapper
   * moves.** `.origin__lamp-drift` is `inset: 0`, so its own rect used to BE
   * the section's rect and reading it here was free; with a translate written
   * to it that rect includes the very number this tick is about to compute,
   * which is a loop. The section's own ref is the same box without the
   * feedback, and it is still the section check the house rule asks for rather
   * than a second box. See LAMP_MARGIN for why a tick that already suppresses
   * a repeated string wants a guard at all.
   */
  useEffect(() => {
    const el = lamp.current
    const floor = ground.current
    const box = section.current
    if (!el || !box) return
    let painted = ''
    // The drift's own last value, kept apart from the lamp's. The lamp's
    // string changes on every pixel of pointer travel and the drift's does
    // not, so one shared guard would have handed the browser an identical
    // `translate` to recalculate on the snow for the whole of a mouse gesture.
    let paintedFloor = ''
    return onFrame(({ vh, mi }) => {
      const r = box.getBoundingClientRect()
      if (r.bottom < -LAMP_MARGIN || r.top > (1 + LAMP_ESCAPE) * vh + LAMP_MARGIN) return
      // 0 while Origin's top edge is still below the fold, 1 once it has
      // climbed LAMP_RISE_SPAN of a viewport past it. Both ends are fractions
      // of vh, so the ramp is the same gesture at every window height.
      const risen = mi === 0 ? 1 : clamp01((vh - r.top) / (LAMP_RISE_SPAN * vh))
      // `''` at mi 0 hands both elements back to their own composed position,
      // which is where the art kit's reduced-motion rule asks them to rest —
      // and the ramp's identity IS that position, because it ends at zero.
      const y = (LAMP_RISE * (1 - risen)).toFixed(1)
      const next = mi === 0 ? '' : `${(pointer.x * LAMP_POINT_X).toFixed(1)}px ${y}px`
      const nextFloor = mi === 0 ? '' : `0 ${y}px`
      if (next === painted && nextFloor === paintedFloor) return
      const wrote = next !== painted
      const wroteFloor = nextFloor !== paintedFloor
      painted = next
      paintedFloor = nextFloor
      return () => {
        if (wrote) el.style.translate = next
        if (floor && wroteFloor) floor.style.translate = nextFloor
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

      {/* ── the farthest tree plane ───────────────────────────────────────
          `landscapes/far-treeline`: a pale band of small conifer tops standing
          in mist the ARTWORK paints, not a mask. It is its own band and not a
          layer inside the treeline below, and that is a z-order requirement
          rather than tidiness — the mist bank sits BETWEEN these two planes on
          the depth ladder, so it has to be painted between them too. Sharing a
          wrapper would put the air behind the horizon it is supposed to be in
          front of. Origin.css has the geometry. */}
      <div className="origin__tops" aria-hidden="true">
        <ThemedArt
          art="landscapes/far-treeline"
          light="landscapes/far-palms"
          className="origin__tops-art"
          factor={FAR_TOPS_FACTOR}
        />
      </div>

      {/* ── the valley's mist, and it is a body of fog now rather than a wash
          A CSS band used to be here: `--band-origin` ramped transparent ->
          band -> transparent across the boundary, doing aerial perspective by
          arithmetic because there was no piece of art that could. There is
          now. `atmosphere/mist-bank` is drawn with its alpha reaching zero on
          ALL FOUR edges, which is the property the whole layer turns on: a
          band of colour has to be faded at both ends by a mask that has to be
          re-derived every time the box moves, and a piece of art that is
          already edge-free can simply be laid across the boundary with nothing
          to hide.

          What is gained is that fog now has SHAPE. The band paled the ridge
          evenly at every x, which is the one thing real air does not do; this
          piece is thicker in some places than others and has torn edges, so
          the hero's peaks come through it in some columns and are lost in
          others. That is the depth cue the band could only imitate.

          Two of them at two depths is what the CSS band could never be at all:
          this one lies at +0.02, in FRONT of the far tops behind it and behind
          the near row in front of it, so the wood has air inside it rather
          than air in front of it. See the depth ladder above.

          The wrapper is a band with its own `overflow: clip`, for the reason
          `.origin__ground` below records measuring: the art is wider than the
          viewport on purpose, and the section's 130svh clip margin opens the
          sides as well as the top. */}
      <div className="origin__mist" aria-hidden="true">
        <ThemedArt art="atmosphere/mist-bank" light="atmosphere/sea-haze" className="origin__mist-art" factor={MIST_FACTOR} />
      </div>

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

          ── it is a real row now, and that is the whole of this edit ────────
          It used to be `props/pine-pair` behind `props/pine-grove`, the grove
          mirrored with `scaleX(-1)` and pushed a third of its own width off
          the right-hand edge, both of them crowded into the right quarter of
          the frame. That was two trees pretending to be a wood, and the
          pretence is what put both of them on one side: the kit says of both
          that they must never stand beside the lamppost.

          `props/pine-row` is the piece the kit drew for this. Five to seven
          conifers of different heights, ink from the first column of the file
          to the last, so it runs off BOTH frame edges and the wood has no ends
          — and a row with no ends does not have to be kept away from the pole,
          because it is not a prop standing next to it, it is the treeline the
          pole stands in front of. `landscapes/far-treeline` goes behind it: a
          pale band of distant tops with its own aerial haze painted in, which
          is a depth cue no parallax factor can buy.

          The row's trunks are cropped by its own bottom edge, which is how the
          kit drew it, and the snow bank below is what buries them — the same
          job it already did for the grove. Origin.css carries the mask that
          finishes the join and the vertical anchors, both derived from the
          files' own alpha.

          Invisible at scroll 0 by arithmetic, not by luck. Origin's top edge
          sits at 130svh and the fold at 100svh, so there are 30svh to spend;
          the band's own top is 1.42 x --tl-rise above the boundary and
          --tl-rise is capped at 17svh, which leaves better than 5svh of
          clearance at every viewport height. Origin.css has the working. */}
      <div className="origin__treeline" aria-hidden="true">
        {/* `origin__pines` and not `origin__row`: `.origin__row` is a chapter
            of the timeline below and has been since this section was written.
            One class name, two meanings, is a stylesheet that breaks on a
            selector nobody looked twice at. */}
        <ThemedArt art="props/pine-row" light="props/palm-row" className="origin__pines" factor={NEAR_ROW_FACTOR} />
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
          section's clip margin and put a horizontal scrollbar on the page.

          ── and it rides the lamppost's rise ───────────────────────────────
          The ref is why this element is not a plain `<div>` any more. The
          lamp's foot now lands on the line where Origin's heading starts, and
          it CLIMBS to that line as the reader scrolls — so the drift takes the
          identical y from the identical `onFrame` subscriber, because a foot
          that rises 72px out of a snow bank that stayed put is the exact bob
          this section's own comments have been guarding against since the pole
          was planted. It is written on the BAND rather than on the artwork
          inside it, so the clip travels with the thing it is clipping and the
          drift's own bottom edge cannot slide out from under it. */}
      <div ref={ground} className="origin__ground" aria-hidden="true">
        <StillArt art="landscapes/snow-bank" light="landscapes/sand-bank" className="origin__snow" />
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
          CTAs, the model and the bottom strip while its foot is planted deep
          inside Origin's snow.

          Origin.css has the sizing, the two clearances it is solved against,
          and the measured table.

          ── and its foot is on the heading's line now ──────────────────
          It used to be planted 30px inside Origin's top edge. It now comes to
          rest on the line where Origin's heading starts, and it climbs to that
          line as the reader scrolls — the same treatment the hero's tall pine
          is getting on the other side of the frame. LAMP_RISE above carries
          the ramp; Origin.css carries --lamp-plant, what the deeper plant
          costs at scroll 0, and the two clearances re-derived against it.

          ── and it is lit, by a lamp rather than by a smear ────────────
          The artwork draws a lit lantern and nothing on the page ever answered
          it. The site owner asked for "some colour, a bit transparent,
          lighting to the pole where the light should come from, to have a bit
          more warmth and glow", and this is the one warm source in a cold blue
          valley, which is what makes the valley read as cold.

          **Three layers, not four.** There was a `.origin__lamp-spill`: an
          ellipse of lit air with a vertical radius of 79% of the artwork's
          frame, falling from the glass to the foot. On the page it read as a
          long warm OVAL smeared down the pole, and the site owner is right
          that it should not be there — "the glow from the pole should be a
          circle not an oval, just have the circle glow at the top where the
          light should only be coming out of, not the rest of the pole". The
          physics agrees with the eye: a lantern is a point source, so the glow
          around it is a DISC, and a pole is a dark object standing in that
          light rather than a thing that glows along its length.

          They are SIBLINGS of the pole inside the drift wrapper, so all four
          boxes share one `left`/`top`/`width`/`aspect-ratio` and the light can
          never come off the lantern however far the pointer pulls it or how
          far the rise takes it. The pool is drawn BEFORE the pole and the
          other two after, which is the whole of the z-order between them: the
          snow is lit under the foot, and the glass and its halo are in front
          of the ironwork.

          Origin.css carries where each gradient sits inside that shared box
          and the re-measured clearance table — all three are inside the same
          ink budget the artwork already spends, so --lamp-fit did not have to
          move. */}
      <div ref={lamp} className="origin__lamp-drift" aria-hidden="true">
        <span className="origin__lamp-pool" />
        {/* ── and by day it is not a lamppost at all ─────────────────────
            `hero/lamppost-cebu` used to be the light piece here: the same
            street lantern in a warmer palette, glass and all. A lit lantern
            standing on a beach at midday is the whole of what the site owner
            objected to — "that is a Dark mode thing and it's the day time in
            Light mode" — and no amount of recolouring fixes an object that
            does not belong to the hour. The file is deleted, not hidden.

            `props/coconut-pair` takes the slot, and it fits it rather than
            merely filling it: same 1024x1536 canvas, same trunk-at-the-bottom
            silhouette planted at `--lamp-plant`, so every measurement in
            Origin.css about where the foot lands and how far the ink stays
            off the reading column still describes the thing on screen. The
            `--lamp-*` glow tokens are already `transparent` in light
            (tokens.css), so the pool, the halo and the breath cost nothing
            here — there is no light to draw at noon. */}
        <StillArt art="hero/lamppost-left" light="props/coconut-pair" className="origin__lamp" />
        {/* Two haloes, not one. The owner asked for "a 2nd layer bigger glow
            for the light pole, but more faint/transparent" — which is what a
            lantern in cold air actually does: a tight bright halo on the glass
            and a much wider, much weaker bloom in the air around it. One
            radial cannot be both, because a single falloff wide enough to
            reach is too weak at the centre to read as a source. The wide one
            is drawn FIRST so the tight one sits on top of it. */}
        <span className="origin__lamp-halo" />
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
      {/* Where a piece the Scene Editor ADDED to this section is drawn.
          It renders null for everybody — see src/scene/SceneExtras.tsx — and
          it is inside the section rather than over the page so an added piece
          takes its percentages from the same box the shipped pieces do. */}
      <SceneExtras section="origin" />
    </section>
  )
}
