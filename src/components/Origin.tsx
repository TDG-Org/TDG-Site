import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { clamp01, onFrame } from '../lib/motion'
import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { usePointer } from '../hooks/usePointer'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { Snow } from './scene/Snow'
import { Stage } from './scene/Stage'
import { StillArt } from './scene/ThemedArt'
import { ABOUT_HASH, rememberOrigin } from '../lib/route'
import { CHAPTERS, type Chapter } from '../data/content'
import './Origin.css'

/**
 * The cabin, in its own chunk, and NOT rendered until the reader is on the
 * way here.
 *
 * `React.lazy` splits the chunk but fires its import the moment the component
 * renders, and Origin is in the home page's tree from the first paint — so a
 * plain lazy mount is a 134 kB gzipped download of three.js for every visitor
 * including one who reads the hero and leaves. Splitting the chunk is only
 * half the job; the other half is `mounted` below, which is why this constant
 * is never referenced except behind that flag.
 */
const CabinScene = lazy(() =>
  import('./origin/CabinScene').then((m) => ({ default: m.CabinScene })),
)

/**
 * How much of the viewport Origin has to have climbed before three.js is
 * asked for. 20% of a viewport past first contact.
 *
 * Origin's top edge is only 30svh below the fold at the top of the page (the
 * hero's runway — see Hero.tsx), so a plain `rootMargin: 0` fires on the
 * first wheel notch and the deferral buys nothing: scrolling through the
 * hero's own dissolve is exactly what a visitor who is only reading the hero
 * does. Requiring the section to be a fifth of a viewport ON screen means the
 * reader has scrolled past the beat and is watching Origin arrive, and it
 * still leaves 80svh of scrolling before Origin's top reaches the top of the
 * viewport — several seconds of network on a slow connection, and the cabin
 * is a backdrop rather than content, so arriving late costs nothing but the
 * fade it does not get.
 */
const CABIN_MARGIN = '0px 0px -20% 0px'

/** Pointer amplitude for the lamppost, px. See Origin.css: this number is
 *  spent out of the same budget that keeps the lamp's ink 30px clear of the
 *  wordmark, so it cannot be raised here alone. */
const LAMP_POINT_X = 10

/**
 * How much snow the NEAR layer is allowed to add, on top of the cabin's own.
 *
 * This section now has snow at two depths, which is not the same thing as
 * having it twice. `CabinScene` draws the far and middle layers inside the 3D
 * scene, where flakes have real parallax against the trees and the cabin and
 * pass behind geometry as well as in front of it; `Snow` is the near layer, a
 * few bigger, faster flakes crossing the frame close to the reader, in front of
 * everything the scene draws.
 *
 * **Density is the whole risk, and it is a reading risk rather than a
 * performance one.** Two snowfalls at the wrong ratio is a blizzard, and behind
 * this one there are seven chapters of prose somebody is trying to read. So the
 * number is deliberately far below `Snow`'s own default of 1: at 1 the canvas
 * at a 1440px viewport gets 99 flakes, which is the density of weather you look
 * AT.
 *
 * Counted at 0.3 off the drawn canvas, not calculated — the flakes were
 * flood-filled out of the backing store — against the cabin's 200 / 420 / 640
 * in-scene flakes on the same three machine tiers. The canvas is the stage's
 * pin, so its box is the section's width by 100svh:
 *
 * | canvas | <=4 cores, or under 900px | 8 cores | more |
 * | --- | --- | --- | --- |
 * | 320 x 812 | 3 | 3 | 3 |
 * | 375 x 812 | 4 | 4 | 4 |
 * | 1430 x 900 | 16 | 24 | 29-30 |
 * | 1910 x 1080 | 26 | 38 | 48 |
 *
 * (29 and not 30 in one reading of the busiest cell, because two flakes
 * overlapped into one blob for the counter. The budget is 30.)
 *
 * The narrow column is the one that decides it. `flakeBudget` treats a viewport
 * under 900px as a weak machine, so a phone lands on the 0.55 multiplier
 * whatever its cores are, and at 0.3 that is three or four flakes on a phone —
 * sparse, and the direction to be wrong in for a layer meant to read as a few
 * flakes close to your face rather than as fog. Going high enough to make a
 * phone busy puts a 1920 desktop past 70, which is where the near layer starts
 * competing with the copy behind it. The weather this section HAS is the
 * cabin's; this is the pane of glass in front of it.
 *
 * It is a prop and not an edit to `Snow`'s defaults on purpose: the defaults
 * are that component's idea of ordinary snowfall, and this is one section
 * asking for less.
 */
const NEAR_SNOW = 0.3

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
  const intro = useReveal<HTMLDivElement>('wipe', 0)
  const more = useReveal<HTMLDivElement>('wipe', 0)
  const [cabin, setCabin] = useState(false)
  const pointer = usePointer()

  /*
   * Deferred mount for the three.js chunk. See CABIN_MARGIN above for the
   * number and CabinScene's own header for what it draws.
   *
   * An IntersectionObserver rather than the frame loop, deliberately: the
   * loop parks when nothing holds it, and a reader who scrolls with the
   * keyboard, restores a session at a saved position or lands on `#origin`
   * from another route can arrive here on a frame the loop never ran. The
   * observer fires from the browser's own lifecycle either way, and it costs
   * nothing per frame.
   *
   * It disconnects on the first hit and never observes again. Once three.js is
   * in memory and a WebGL context is live, unmounting on scroll-up would throw
   * both away and pay for them again on the way back down, which is strictly
   * worse than leaving a parked canvas in the DOM — CabinScene already returns
   * before drawing AND before holding once its section is off screen.
   *
   * No observer at all (a very old browser, or one where the constructor
   * throws) mounts it immediately. A missing optimisation is not a reason to
   * lose the section's centrepiece.
   */
  useEffect(() => {
    const el = section.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setCabin(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        setCabin(true)
      },
      { rootMargin: CABIN_MARGIN },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  /*
   * The lamppost answers the mouse, and only on one axis.
   *
   * Horizontally it is a near object sliding against a far horizon, which is
   * the whole point of a mouse parallax. VERTICALLY it is a thing standing on
   * the ground — and a foot that bobs 5px off the snow every time the cursor
   * moves is the one way to lose the illusion this entire arrangement exists
   * to build. So there is no y term at all.
   */
  useEffect(() => {
    const el = lamp.current
    if (!el) return
    let painted = ''
    return onFrame(({ mi }) => {
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
    <section id="origin" ref={section} className="section section--blend stage-host origin">
      {/* ── everything that must NOT escape ─────────────────────────
          This section is `overflow: clip` with a 130svh clip margin, because
          the lamppost below has to rise out of the top of it and stand in the
          hero. A clip margin opens EVERY edge, though, and Origin has layers
          deliberately larger than it is: a blurred blob that drifts on
          `useParallax`, a masked grid, a viewport-sized WebGL canvas. Left as
          direct children they would leak into the hero and into Apps the
          moment the margin was added, and so would every future layer added
          to this section, silently.

          So the clip is stated once, HERE, as a box: this wrapper is the
          section's own padding box with `overflow: clip` and no margin, and
          anything inside it is clipped exactly as it always was. Only the two
          things that are SUPPOSED to cross the boundary sit outside it. That
          makes the invariant structural rather than remembered, which is the
          same move `.stage` makes for z-order.

          `overflow: clip` is not a scroll container, so the sticky pin inside
          still pins. `overflow: hidden` here would kill the cabin's stage
          exactly the way it would kill the hero's; Stage.tsx's header has the
          measurement. */}
      <div className="origin__clip" aria-hidden="true">
        {/* The cabin, far off across the snow, walked toward as the reader
            moves through the chapters. It replaces `origin/OriginField.tsx`,
            which was a 2D projected point field standing in for depth this
            section can now have properly: one canvas in here, not two.

            It is mounted in a `Stage` because that is the framing it was
            composed for, a sticky viewport-sized box, so its camera composes
            for a screen rather than for a 1700px-tall strip. Decorative four
            ways: aria-hidden on the stage, pointer-events none from its own
            inline style, no flow space, and the bottom layer of the section.

            `Suspense fallback={null}` because there is nothing to show while
            a backdrop loads, and a placeholder is a shape that appears and is
            then replaced. `cabin` is the deferred mount; see the effect
            above, and note that the lazy import does not fire until this
            renders. */}
        <Stage className="origin__stage">
          {cabin ? (
            <Suspense fallback={null}>
              <CabinScene className="origin__cabin" />
            </Suspense>
          ) : null}

          {/* The near layer of the snow, and the only snow that does not need
              WebGL. See NEAR_SNOW above for the depth ladder and the density.

              It sits INSIDE the stage rather than beside it, which buys three
              things at once. It is one viewport of canvas instead of a
              section's worth — the pin is 100svh, this section is nearly three
              times that — so the fill is bounded by the screen and the flake
              budget is spent where the reader is looking. It is pinned, so the
              near snow is viewport-locked the way snow in front of your face
              is, rather than scrolling away with the page. And it inherits the
              stage's `pointer-events: none`, its `aria-hidden`, its
              `data-covered` paint guard and its place at the floor of the
              section's stacking order, which is what keeps it off the copy.

              AFTER the cabin, which is the whole of the z-order between them:
              neither canvas carries a `z-index`, so tree order decides, and
              inventing one here would only escape into the section's stacking
              context — see .stage's note in Stage.css.

              It is unconditional where the cabin is deferred. It has no chunk
              to download and no context to acquire, so there is nothing to
              defer, and a visitor whose browser refuses WebGL gets this. */}
          <Snow className="origin__flakes" density={NEAR_SNOW} />
        </Stage>

        <div className="texture origin__grid" />
        <div ref={blob} className="blob origin__blob" />
      </div>

      {/* ── the ground, and it crosses the boundary ───────────────────
          A snow drift sitting ON the seam: its crest stands above Origin's
          top edge, in the hero, and its body fills down into Origin. This is
          the section's boundary treatment and it replaces the `Seam` terrace
          that used to be here. Two silhouettes on one boundary is mush, and
          of the two this is the one the lamppost can stand in, which is the
          whole point of the arrangement below: the pole's foot has to land on
          something rather than on a colour change.

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
          and the measured table. */}
      <div ref={lamp} className="origin__lamp-drift" aria-hidden="true">
        <StillArt art="hero/lamppost-left" className="origin__lamp" />
      </div>

      <div className="shell origin__shell">
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

        <div className="origin__timeline">
          <div className="origin__spine" aria-hidden="true" />
          <div ref={rail} className="origin__spine-fill" aria-hidden="true" />
          <div className="origin__rows">
            {CHAPTERS.map((chapter, i) => (
              <OriginRow key={chapter.numeral} chapter={chapter} index={i} />
            ))}
          </div>
        </div>

        {/* The front page is deliberately the short version now, so the end of
            the timeline points at the long one. `rememberOrigin` is what brings
            a reader back to this section rather than to the top of the page. */}
        <div ref={more} className="origin__more-wrap">
          <a className="origin__more" href={ABOUT_HASH} onClick={() => rememberOrigin('Origin')}>
            The longer version, and who is behind it
            <span className="origin__more-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </div>
      </div>
    </section>
  )
}
