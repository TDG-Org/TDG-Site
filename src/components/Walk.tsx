import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { clamp01, onFrame } from '../lib/motion'
import { ErrorBoundary } from './ErrorBoundary'
import { Snow } from './scene/Snow'
import { Stage } from './scene/Stage'
import { StillArt } from './scene/ThemedArt'
import './Walk.css'

/**
 * The cabin, in its own chunk, and NOT rendered until the reader is on the
 * way here.
 *
 * `React.lazy` splits the chunk but fires its import the moment the component
 * renders, and this container is in the home page's tree from the first paint
 * — so a plain lazy mount is a 134 kB gzipped download of three.js for every
 * visitor including one who reads the hero and leaves. Splitting the chunk is
 * only half the job; the other half is `cabin` below, which is why this
 * constant is never referenced except behind that flag.
 *
 * It moved here from `Origin.tsx` unchanged when the stage moved. See the
 * header below for why the stage had to leave Origin at all.
 */
const CabinScene = lazy(() =>
  import('./origin/CabinScene').then((m) => ({ default: m.CabinScene })),
)

/**
 * How much of the viewport the walk has to have climbed before three.js is
 * asked for. 20% of a viewport past first contact.
 *
 * The number is Origin's, unchanged, and it is still right for the same
 * arithmetic: `.walk`'s top edge sits at exactly the document position
 * `#origin`'s used to (the `margin-top: -100svh` moved onto this wrapper —
 * see Walk.css), so it is 30svh below the fold at the top of the page, and a
 * plain `rootMargin: 0` would fire on the first wheel notch. Requiring a fifth
 * of a viewport ON screen means the reader has scrolled past the hero's own
 * dissolve and is watching the walk arrive, and it still leaves 80svh of
 * scrolling before the pin engages — several seconds of network on a slow
 * connection, and the cabin is a backdrop rather than content, so arriving
 * late costs nothing but the fade it does not get.
 */
const CABIN_MARGIN = '0px 0px -20% 0px'

/**
 * How much snow the NEAR layer is allowed to add, on top of the cabin's own.
 *
 * This backdrop has snow at two depths, which is not the same thing as having
 * it twice. `CabinScene` draws the far and middle layers inside the 3D scene,
 * where flakes have real parallax against the trees and the cabin and pass
 * behind geometry as well as in front of it; `Snow` is the near layer, a few
 * bigger, faster flakes crossing the frame close to the reader, in front of
 * everything the scene draws.
 *
 * **Density is the whole risk, and it is a reading risk rather than a
 * performance one.** Two snowfalls at the wrong ratio is a blizzard, and
 * behind this one there are seven chapters of prose somebody is trying to
 * read. So the number is deliberately far below `Snow`'s own default of 1: at
 * 1 the canvas at a 1440px viewport gets 99 flakes, which is the density of
 * weather you look AT.
 *
 * Counted at 0.3 off the drawn canvas, not calculated — the flakes were
 * flood-filled out of the backing store — against the cabin's 200 / 420 / 640
 * in-scene flakes on the same three machine tiers. The canvas is the stage's
 * pin, so its box is the walk's width by 100svh:
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
 * The narrow column is the one that decides it. `flakeBudget` treats a
 * viewport under 900px as a weak machine, so a phone lands on the 0.55
 * multiplier whatever its cores are, and at 0.3 that is three or four flakes
 * on a phone — sparse, and the direction to be wrong in for a layer meant to
 * read as a few flakes close to your face rather than as fog.
 *
 * It is a prop and not an edit to `Snow`'s defaults on purpose: the defaults
 * are that component's idea of ordinary snowfall, and this is one backdrop
 * asking for less.
 */
const NEAR_SNOW = 0.3

/**
 * ── when the near snow stops ───────────────────────────────────────────────
 * Both numbers are fractions of `apps` — the p at which the camera has
 * finished its turn and settled on the table — rather than absolute p values,
 * because the camera's beats are anchored to the same marks and a literal here
 * would drift away from them the moment anybody changed a section's height.
 *
 * Snow in front of the lens while you cross the snow is the whole point of
 * this layer. Snow falling INSIDE a room is a bug, and it is the obvious kind:
 * the camera goes through the door somewhere between the threshold and the
 * turn, so the flakes have to be gone by the time the turn finishes. 0.60 of
 * the way to the table is roughly the doorway and 0.92 is the end of the turn,
 * which leaves a third of the approach's length to fade over — long enough
 * that nobody sees it start.
 *
 * The alternative — unmounting `Snow` once the camera is inside — was rejected
 * rather than overlooked. It would stop the canvas ticking for the interior
 * half of the walk, which is a real saving, and it would pay for it by
 * re-seeding the whole flake field on the way back up: `Snow` builds its
 * flakes from `Math.random()` at mount, so a reader who scrolls back out of
 * the cabin would watch the weather re-randomise. `Stage.css` refuses
 * `display: none` for exactly that reason one layer down, and the same
 * argument decides it here.
 */
const FLAKES_FADE_FROM = 0.6
const FLAKES_FADE_TO = 0.92

/**
 * ── when the frost arrives on the glass ───────────────────────────────────
 * Both are fractions of the run that is LEFT after the `tools` mark — `tools`
 * is the p at which `#tools`' top edge reaches the top of the viewport, so the
 * mark is the frame the tools heading arrives and 1 is the pin releasing.
 * FROST_LEAD is measured BACKWARD from the mark and FROST_FULL forward.
 * Fractions of a live mark rather than absolute p values, for the reason
 * FLAKES_FADE_FROM gives: the camera's beats are anchored to the same marks
 * and a literal would drift away from them the day anybody changed a section's
 * height — which is a live risk here, because the cabin builder is repacing
 * this camera in the same pass.
 *
 * `props/window-frost` is the one thing a texture-free WebGL scene cannot draw
 * for itself, and the cabin builder asked for it by name. It is not an object
 * in the room — it is the GLASS, so it is a DOM layer over the whole canvas
 * rather than a prop at a place in it, and it has no position to get wrong
 * when the camera underneath moves.
 *
 * **What the ramp actually tracks is how much of the frame is window**, which
 * is why it starts before the mark rather than on it. The camera spends the
 * beat before `tools` panning up off the table toward the west wall, and the
 * window is already growing in frame across the whole of it; a layer that only
 * began once `#tools` arrived would be frost appearing on a pane the reader
 * has already been looking at for a viewport. At 1440x900 the ramp runs scroll
 * 4467 -> 5160 against a `#tools` that starts at 4797, whose heading is at
 * 5249 and whose first card row is at 5376 — so the frost arrives while the
 * cards are still coming up from the bottom of the screen and is fully on
 * before any of them is settled enough to read.
 *
 * **It is not a legibility device and it was measured not to be.** The kit's
 * own brief for this piece asked for the middle 60% to be clear so that it
 * would NOT sit behind the reading area, and that is exactly where the tools
 * cards are. `.walk__frost` in Walk.css carries the ablation.
 */
const FROST_LEAD = 0.5
const FROST_FULL = 0.55

/**
 * How much of the run past `#tools`' mark the frost spends coming back OFF,
 * as a fraction of that run.
 *
 * It had no fall at all: the rise clamped at 1 and stayed, so the piece went on
 * painting over Tools' bridge, its fence and the whole join into `#games` —
 * pale crystal shards in a night sky over a stone footbridge, which is where
 * the site owner saw them. 0.34 puts the fade entirely inside the last third of
 * the walk, after the card grid's last row has left the frame and while the
 * canvas is already washing out, so the two disappear together.
 */
const FROST_FALL = 0.34

/**
 * Where the camera is along the walk, and where the two sections it settles on
 * begin. `Walk` computes it once a frame and hands it to `CabinScene`.
 *
 * **A frozen accessor over a ref, never React state.** `usePointer` and
 * `useSectionProgress` return the same shape and for the same reason: a
 * container that re-rendered sixty times a second to move a backdrop would
 * re-render the three sections inside it with every frame of the scroll. Read
 * it inside an `onFrame` tick; read during render it gives the value at render
 * time and nothing afterwards.
 */
export type WalkProgress = {
  /** 0 as `.walk`'s top reaches the viewport top; 1 as the pin releases. */
  readonly p: number
  /** the p at which `#apps`' top reaches the viewport top. */
  readonly apps: number
  /** the p at which `#tools`' top reaches the viewport top. */
  readonly tools: number
}

/**
 * ── CONTRACT W: the cabin walk ────────────────────────────────────────────
 *
 * One 3D backdrop, one camera move, three sections read against it. The
 * reader walks across the snow through Origin's chapters, in through the
 * cabin door, turns left, settles looking DOWN at a big table while the
 * project cards are read, tilts up off it and pans to the west window while
 * the small tools are read, and the frame washes out into `#games`.
 * `internal/checklists/cabin-interior-spec.md` is the authority for the shot
 * and carries the site owner's own words and the floor plan.
 *
 * **This file exists because a `Stage` cannot leave its section.** `Stage` is
 * a `position: sticky` pin inside a `position: absolute; inset: 0` box, so it
 * pins for `section height − 100svh` and releases on that section's bottom
 * edge — `Stage.tsx`'s header has the measurement. `CabinScene` lived in a
 * stage inside `#origin`, which meant its pin ended where Origin did and it
 * could not paint one pixel behind `#apps` or `#tools`. So the stage moves up
 * a level, into a wrapper around all three, and pins for the whole run.
 *
 * ```tsx
 * <Walk>
 *   <Origin />
 *   <Apps />
 *   <Tools />
 * </Walk>
 * ```
 *
 * ## And one thing that will be got wrong on purpose
 *
 * **The copy over this backdrop is plated, and a plate is a LOCAL object.**
 * Five blocks of copy are read against a lit 3D room — Origin's intro, its
 * seven chapter rows, the link that closes its timeline, and the heads of
 * `#apps` and `#tools` — and each takes a soft-edged plate in --card-bg from
 * `.walk-plate`, declared in Walk.css because it is the file that owns all
 * three sections. Every one of them is anchored to its own copy's column and
 * has reached nothing 240px past its own last glyph.
 *
 * The version before this pass was not: the five plates ran 1350-1390px wide
 * for copy 265-660px wide, two of them were measurably rectangles, and between
 * them they lifted the average pixel of the frame by 24 levels in dark and 39
 * in light. That is five viewports of camera work delivered as a wash, and it
 * is the failure to watch for, because the fix for a heading that will not
 * read is always reached for at frame scale first. Walk.css carries the alpha
 * probe that measures it and the numbers each block is solved against.
 *
 * ## The three things that would silently break it
 *
 * **1. An `overflow: hidden` anywhere above the pin.** An ancestor with
 * `overflow: hidden` is a scroll container, so it becomes the sticky box's
 * scrollport, and since it never scrolls the box never sticks. `.walk` is
 * therefore `overflow: clip` — which clips identically and is explicitly not a
 * scroll container — and Walk.css says so beside the declaration. The three
 * sections inside may keep `.section`'s own `hidden`, because they are
 * siblings of the stage rather than ancestors of it.
 *
 * **2. A stacking context on `.walk`.** It must not have one. `#origin` paints
 * at `z-index: 4` so its lamppost clears the hero's stage, `.hero__frame`
 * paints at 5 so the wordmark clears the lamppost, and both of those numbers
 * are resolved in the ROOT stacking order. Give this wrapper an `opacity`, a
 * `filter`, a `will-change`, an `isolation` or a `z-index` and every one of
 * them is trapped inside it and painted after the hero — so the lamppost would
 * land on top of the wordmark. Walk.css repeats this where it can be broken.
 *
 * **3. Origin's negative margin collapsing out through it.** The
 * `margin-top: -100svh` that pulls this half of the page up onto the pinned
 * hero used to be on `#origin`. As the first in-flow child of a new wrapper it
 * would collapse straight out through the wrapper's top edge, which is a
 * layout bug with nothing on screen to point at. It lives on `.walk` now, and
 * `.walk`'s border-box top is therefore at exactly the document position
 * `#origin`'s used to be — so `scrollIntoView('#origin')`, `rememberOrigin`
 * and the hero dissolve are all untouched.
 */
export function Walk({ children }: { children: ReactNode }) {
  const walk = useRef<HTMLDivElement | null>(null)
  const flakes = useRef<HTMLDivElement | null>(null)
  const frost = useRef<HTMLDivElement | null>(null)
  const [cabin, setCabin] = useState(false)

  /*
   * The progress the camera follows. One object, mutated in place, read
   * through the frozen accessor below — see `WalkProgress`.
   */
  const state = useRef({ p: 0, apps: 0, tools: 0 })
  const view = useRef<WalkProgress | null>(null)
  const progress = (view.current ??= Object.freeze({
    get p() {
      return state.current.p
    },
    get apps() {
      return state.current.apps
    },
    get tools() {
      return state.current.tools
    },
  }))

  /*
   * Deferred mount for the three.js chunk. See CABIN_MARGIN above for the
   * number and CabinScene's own header for what it draws. It moved here from
   * `Origin.tsx` unchanged except for the element it watches.
   *
   * An IntersectionObserver rather than the frame loop, deliberately: the loop
   * parks when nothing holds it, and a reader who scrolls with the keyboard,
   * restores a session at a saved position or lands on `#origin` from another
   * route can arrive here on a frame the loop never ran. The observer fires
   * from the browser's own lifecycle either way, and it costs nothing per
   * frame.
   *
   * It disconnects on the first hit and never observes again. Once three.js is
   * in memory and a WebGL context is live, unmounting on scroll-up would throw
   * both away and pay for them again on the way back down, which is strictly
   * worse than leaving a parked canvas in the DOM — CabinScene already returns
   * before drawing AND before holding once the backdrop is off screen.
   *
   * No observer at all (a very old browser, or one where the constructor
   * throws) mounts it immediately. A missing optimisation is not a reason to
   * lose the page's centrepiece.
   */
  useEffect(() => {
    const el = walk.current
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
   * ── the one measurement the whole shot is cut to ──────────────────────────
   *
   * `p` is `-rect.top / (rect.height - vh)` on `.walk`, clamped: it is 0 the
   * frame the wrapper's top reaches the top of the viewport and 1 the frame
   * the pin releases. That is the sticky pin's OWN travel, which is exactly
   * the run the camera should follow, and it is the reason this is not
   * `useSectionProgress`.
   *
   * That hook runs over `vh + height` with the element completely off screen
   * at both ends — which is the right shape for an entrance and an exit, and
   * the wrong one here. Recovering "how far through the pin am I" from it
   * needs the height and the viewport handed back in beside it, at which point
   * two files know the geometry instead of one, and the camera's beats would
   * silently slide the day somebody changed a section's height.
   *
   * ── the two marks ─────────────────────────────────────────────────────────
   *
   * `apps` and `tools` are the same p for each section's top edge, measured
   * from the live boxes rather than written down. They exist so the camera's
   * settled beats land when a heading arrives rather than at a number somebody
   * typed: the table is composed for the moment `#apps` reaches the top of the
   * viewport and the window for the moment `#tools` does, and both stay true
   * when a card is added, a chapter is opened or a clamp resolves differently
   * at another width.
   *
   * They are re-measured only when the geometry they depend on actually moves
   * — the wrapper's own height or the viewport's — which is two extra rects on
   * a layout change and none on a scroll. No `ResizeObserver` and no `resize`
   * listener for it: `motion.ts` already watches both (it observes
   * `document.documentElement` and listens for `resize`), and `.walk` is in
   * normal flow, so its height cannot change without the document's changing
   * with it. The loop is therefore awake on the frame the answer moved.
   *
   * The whole subscriber is one rect and no `hold()`, so a parked reader pays
   * nothing for it.
   */
  useEffect(() => {
    const el = walk.current
    if (!el) return
    let lastH = -1
    let lastVh = -1
    let pinH = 0
    let paintedFlakes = ''
    let paintedFrost = ''

    const markOf = (id: string, top: number, run: number) => {
      const s = el.querySelector(id)
      return s ? clamp01((s.getBoundingClientRect().top - top) / run) : 0
    }

    const read = (vh: number) => {
      const r = el.getBoundingClientRect()
      const moved = r.height !== lastH || vh !== lastVh
      /*
       * ── the run is the PIN's travel, so it is measured off the pin ─────────
       * This divided by `vh` (`window.innerHeight`), which is the pin's height
       * only while the two agree — and on a phone they do not. The pin is
       * `100lvh` (Walk.css says why it is not `svh`), and `innerHeight` grows
       * by the height of the browser's bar the moment the bar retracts, which
       * is exactly what happens as a reader scrolls down into this walk. A run
       * of `height - innerHeight` therefore shrank by 60-110px at that
       * moment: `p` reached 1 before the pin had released, and both marks
       * stepped every time the bar toggled, so the camera's composed beats
       * slid off the headings they were cut to. The pin's own box is constant
       * across a bar toggle, so measured off it the marks hold still.
       *
       * `offsetHeight`, read only when the geometry it depends on has moved —
       * the wrapper's height or the viewport's — so a scroll costs no second
       * read. `|| vh` is the fallback for a walk rendered without its stage.
       */
      if (moved) pinH = el.querySelector<HTMLElement>('.stage__pin')?.offsetHeight || vh
      // `height - pinH` is 0 for a wrapper shorter than the viewport, where
      // the pin never engages at all; `max(1, ...)` keeps that from producing
      // Infinity rather than a pinned-at-0 backdrop.
      const run = Math.max(1, r.height - pinH)
      state.current.p = clamp01(-r.top / run)
      if (!moved) return
      lastH = r.height
      lastVh = vh
      state.current.apps = markOf('#apps', r.top, run)
      state.current.tools = markOf('#tools', r.top, run)
    }

    // Seed from where the walk actually is, the way `useSectionProgress` does,
    // so `CabinScene` reading `progress.p` before the first frame — or in a
    // background tab, where the loop has not run — gets the truth and not 0.
    read(window.innerHeight || 800)

    return onFrame(({ vh, mi }) => {
      read(vh)

      // The two scroll-linked opacities of this backdrop, folded into this
      // subscriber rather than given one each: both need `p` and a mark and
      // nothing else, and a subscriber of their own would be a second and a
      // third rect for numbers this one already has. One element, one writer
      // still holds — these are two elements and this tick is the only thing
      // that writes to either.
      const snowEl = flakes.current
      const frostEl = frost.current
      const { p, apps, tools } = state.current

      // The near snow, out by the doorway. At mi 0 the inline value is CLEARED
      // rather than set to something, so the layer rests at the `--art-near`
      // its stylesheet gives it — the frame it was composed at, visible and
      // still, which is what the art kit asks for and what `CabinScene`'s own
      // WALK_REST leaves behind it.
      const snowFrom = apps * FLAKES_FADE_FROM
      const snowSpan = Math.max(0.001, apps * FLAKES_FADE_TO - snowFrom)
      const nextSnow = mi === 0 ? '' : (1 - clamp01((p - snowFrom) / snowSpan)).toFixed(3)

      // The frost on the window. Its identity at mi 0 is NOT this layer's CSS
      // rest the way the snow's is, because there is no one frame it was
      // composed at: the same layer is wrong over the table and right against
      // the glass. So it snaps, and it snaps ON THE MARK THE CAMERA USES —
      // `CabinScene`'s `restFor` parks at the composed window station for
      // `p >= (apps + tools) / 2` and at the room's for anything below it, so
      // testing the same midpoint here means the glass is frosted exactly when
      // the camera is at the glass. Both are composed frames; neither is a
      // frozen mid-move one, and neither knows anything about the other beyond
      // the two marks this file already hands down.
      //
      // `tools > 0` is the guard and it is not defensive noise: `markOf`
      // returns 0 for a section it cannot find, and every expression below
      // measures BACKWARD from that mark — so a `Walk` rendered without a
      // `#tools` inside it would put `frostFrom` at -0.5 and open the page on
      // a half-frosted hero. No `#tools`, no window, no frost.
      const run = Math.max(0.001, 1 - tools)
      const frostFrom = tools - run * FROST_LEAD
      const frostSpan = Math.max(0.001, run * (FROST_LEAD + FROST_FULL))
      /* ── and it FALLS again, which it did not before ───────────────────
         The ramp above only ever rose, so once the frost reached 1 it stayed
         there for the rest of the walk — over Tools' own landscape floor and
         across the join into #games, where it read as pale angular shards
         hanging in the sky above a stone bridge. The frost belongs to the
         WINDOW, and the window is gone by then: the camera has pushed through
         it and the canvas is washing out.

         So it comes off over the last `FROST_FALL` of the run, which lands it
         at zero on the same edge the canvas's own dissolve does. Multiplying
         the two ramps rather than branching keeps this one expression, and the
         product is still exactly 1 across the middle where the cards are. */
      const nextFrost =
        tools <= 0
          ? '0'
          : mi === 0
            ? p >= (apps + tools) / 2
              ? '1'
              : '0'
            : (
                clamp01((p - frostFrom) / frostSpan) *
                (1 - clamp01((p - (1 - run * FROST_FALL)) / Math.max(0.001, run * FROST_FALL)))
              ).toFixed(3)

      if (nextSnow === paintedFlakes && nextFrost === paintedFrost) return
      paintedFlakes = nextSnow
      paintedFrost = nextFrost
      return () => {
        if (snowEl) snowEl.style.opacity = nextSnow
        if (frostEl) frostEl.style.opacity = nextFrost
      }
    })
  }, [])

  return (
    // `stage-host` is `overflow: clip` and nothing else — the one line a box
    // holding a `Stage` needs, shipped by Stage.css so the requirement travels
    // with the primitive. `.walk` re-declares it because it also needs a clip
    // MARGIN, which `clip` is the only overflow value to have, and a margin
    // cannot be written on a class that other callers share.
    <div ref={walk} className="walk stage-host">
      {/* The backdrop for the whole walk: one camera, one pin, no seams
          between the three sections it paints behind. It is `inset: 0` of
          `.walk`, so the pin holds for (walk height − 100svh) — Origin, Apps
          and Tools end to end — and releases on Tools' bottom edge.

          The pin's LAST position is therefore always the bottom 100svh of this
          box, and Tools' landscape band is the bottom --tools-scene of the same
          box: the two overlapped by construction, which is how the footbridge
          came to be painted over the cabin's ceiling. `.walk__stage`'s mask
          ends on a transparent band exactly --tools-scene deep, so no canvas is
          ever drawn there — Walk.css carries the measurement and the reason it
          is geometry rather than a JS opacity.

          Decorative four ways: `aria-hidden` on the stage, `pointer-events:
          none` from the stage's own rule, no flow space, and the floor of the
          page's stacking order at `z-index: 0`.

          `Suspense fallback={null}` because there is nothing to show while a
          backdrop loads, and a placeholder is a shape that appears and is then
          replaced. `cabin` is the deferred mount; see the effect above, and
          note that the lazy import does not fire until this renders. */}
      <Stage className="walk__stage">
        {cabin ? (
          // `silent`: if the cabin's chunk is gone after a deploy the walk
          // keeps its band and its near snow; the page does not go blank.
          <ErrorBoundary silent>
            <Suspense fallback={null}>
              <CabinScene className="walk__cabin" progress={progress} />
            </Suspense>
          </ErrorBoundary>
        ) : null}

        {/* The near layer of the snow, and the only snow that does not need
            WebGL. See NEAR_SNOW above for the depth ladder and the density and
            FLAKES_FADE_FROM for why it stops at the door.

            It sits INSIDE the stage rather than beside it, which buys three
            things at once. It is one viewport of canvas instead of five — the
            pin is 100svh and the walk is nearly six times that — so the fill
            is bounded by the screen and the flake budget is spent where the
            reader is looking. It is pinned, so the near snow is viewport-
            locked the way snow in front of your face is, rather than scrolling
            away with the page. And it inherits the stage's `pointer-events:
            none`, its `aria-hidden`, its `data-covered` paint guard and its
            place at the floor of the stacking order, which is what keeps it
            off the copy.

            AFTER the cabin, which is the whole of the z-order between them:
            neither canvas carries a `z-index`, so tree order decides, and
            inventing one here would only escape into the page's stacking
            context — see `.stage`'s note in Stage.css.

            The wrapper is here because `Snow` takes no ref and the fade needs
            an element to write `opacity` to. One writer per element: this box
            owns `opacity`, the canvas inside owns nothing at all.

            It is unconditional where the cabin is deferred. It has no chunk to
            download and no context to acquire, so there is nothing to defer,
            and a visitor whose browser refuses WebGL gets this. */}
        <div ref={flakes} className="walk__flakes">
          <Snow className="walk__flakes-canvas" density={NEAR_SNOW} />
        </div>

        {/* The frost on the cabin's west window, and the last thing in the
            stage because it is the nearest thing in the shot — it is not a
            prop standing somewhere in the room, it is the GLASS the camera
            ends up against.

            That is why it is a full-frame DOM layer and not something placed
            at the window's screen position: the cabin builder is repacing this
            camera, and a layer pinned to where the opening happens to project
            would be wrong the moment the dolly changed. A vignette that is
            clear through the middle 60% has nothing to line up with.

            INSIDE the stage, which buys the same four things the snow gets
            from being here: the stage's mask, so the frost washes out into
            `#games` on exactly the band the canvas does rather than
            floating over Tools' landscape; the pin, so it is viewport-locked
            the way glass in front of your face is; `data-covered`, so it
            stops painting off screen; and `aria-hidden` + `pointer-events:
            none` + the floor of the stacking order, so it is never between
            the reader and a card.

            `StillArt` and not `ThemedArt`: this layer has no distance to
            drift against — it is at zero distance — and the two files are
            separate artwork, which is the whole reason the frost can be pale
            cold crystal in dark and near-white in light without a filter.

            The wrapper exists because `StillArt` takes no ref and the fade
            needs an element to write `opacity` to. One writer per element:
            this box owns `opacity`, the image inside owns the kit's own
            `--art-near`. */}
      </Stage>

      {children}

      {/* ── the frost is IN FRONT of the cards, and that is deliberate ────────
          It used to live in the backdrop stage above, which `Stage.css` pins at
          `z-index: 0` so nothing inside it can ever paint over a section's
          copy — the right default, and the wrong one for this. The owner asked
          for it: "the window frost pngs, allow it to be higher index to cover
          some of the cards when scrolling, to make things more poppy and fun!"

          So it gets its own `Stage` AFTER the sections. Same sticky pin, same
          `aria-hidden`, same `pointer-events: none` — it cannot take a click
          meant for a card and a screen reader never meets it — but it paints
          last. `Walk.css` raises this one's z-index and shapes the mask that
          keeps the middle of the frame clear, because a card whose text is
          under frost is a card nobody can read, and the artwork is drawn clear
          in its middle 60% for exactly this. */}
      <Stage className="walk__front">
        <div ref={frost} className="walk__frost">
          <StillArt art="props/window-frost" light="props/capiz-window" className="walk__frost-art" />
        </div>
      </Stage>
    </div>
  )
}
