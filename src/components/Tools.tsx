import { useEffect, useMemo, useRef } from 'react'
import { mergeRefs } from '../lib/mergeRefs'
import { onFrame } from '../lib/motion'
import { useParallax } from '../hooks/useParallax'
import { usePointer } from '../hooks/usePointer'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { type ToolCard } from '../data/content'
import { visibleTools } from '../content/resolve'
import { useSiteContent } from '../content/store'
import { useLiveAccess } from '../live/useLive'
import { appHash, rememberOrigin } from '../lib/route'
import { AppIcon } from './AppIcon'
import { StillArt, ThemedArt } from './scene/ThemedArt'
import './Tools.css'

/*
 * ── the top of this section is no longer a boundary ───────────────────────
 * Two things used to be rendered at this section's top edge and neither is any
 * more: a `wave` Seam with a --seam-lift backfill, the waterline that carried
 * the `#apps` join, and a `pine-pair` on a crossing band that rose out of this
 * section into `#apps`' floor.
 *
 * Under CONTRACT W that edge is inside one continuous camera move — the shot
 * that started outside the cabin is at the top of the room here, panning from
 * the table to the west window — so a waterline and a stand of pines drawn
 * across it would be a landscape join in the middle of an interior. Deleted
 * with `useParallax`'s seam subscriber, `--tools-cross`, `--tools-over-depth`,
 * the two pine variables and this section's `overflow-clip-margin`.
 *
 * **This section's FLOOR is a different question and it gets a different
 * answer.** The join into `#building` is real, it is the end of the walk, and
 * it is where the 3D washes out into the outside light: the bridge, the water,
 * the boulders and the neon band are what the reader steps out into. Every one
 * of them stays, and this pass adds the fence the owner asked for to them.
 */

/** How far the nearest layer slides with the cursor, in px at full deflection. */
const SWAY_X = 12
const SWAY_Y = 7

/**
 * Mouse parallax for the one layer on this page that is close enough to earn
 * it: the boulders in the bottom corner of this section.
 *
 * ## Why this is a wrapper and not another factor on the art itself
 *
 * `useParallax` owns `element.style.translate` outright — it writes the whole
 * value every frame from its own lerp and never reads what anything else left
 * there. Adding a second writer to the same element is the exact bug
 * `scene/ThemedArt.tsx`'s header describes: two writes race inside one frame
 * and the layer stutters between two positions. So the scroll drift stays on
 * the `<img>` and the pointer sway goes on a box wrapped around it, one
 * writer per element. The wrapper is the art's own box rather than the whole
 * section, so the compositor layer it promotes is a few hundred pixels square
 * and not a viewport.
 *
 * ## Why there is no lerp and no `hold()` here
 *
 * `usePointer` already damps, and it already holds the loop while its own lerp
 * converges and snaps when it lands. What is written here is a pure function
 * of two numbers that are correct on the frame they are read — the same shape
 * as `useHeroParallax`, which needs no smoothing of its own for the same
 * reason. A second lerp on top would add lag and a second reason for the loop
 * never to park.
 *
 * ## Why it checks its own rect
 *
 * `useOffscreenPause` stamps `data-live` on a section and `base.css` turns
 * that into `animation-play-state: paused`, but an `onFrame` subscriber never
 * sees an attribute — `hooks/README.md` is explicit that anything driven from
 * JS has to check for itself. Off screen this neither writes nor holds. There
 * is no stale-state problem on the way back in: with no lerp behind it, the
 * first frame inside the viewport computes and paints the correct offset
 * before the browser paints anything.
 *
 * At `mi === 0` both terms are zero — `usePointer` already returns 0,0 under
 * reduced motion, and the multiply here makes that visible at the call site
 * rather than a fact you have to go and look up — so the layer rests exactly
 * where it composed. That is the identity the art kit asks for, not a hidden
 * layer.
 */
function useSway<T extends HTMLElement>(x: number, y: number) {
  const ref = useRef<T | null>(null)
  const pointer = usePointer()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let painted = ''

    return onFrame(({ vh, mi }) => {
      const r = el.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= vh) return
      const next = `${(pointer.x * x * mi).toFixed(2)}px ${(pointer.y * y * mi).toFixed(2)}px`
      if (next === painted) return
      painted = next
      return () => {
        el.style.translate = next
      }
    })
  }, [pointer, x, y])

  return ref
}

function ToolTile({ tool, index }: { tool: ToolCard; index: number }) {
  const reveal = useReveal<HTMLElement>('slideL', index)
  const tilt = useTilt<HTMLElement>()

  /* Same runtime upgrade the Apps cards get: a tool whose repo turns out to
     be deployed swaps its muted caption for a real link. A hand-written
     `href` (Volume Controller's store listing) passes `undefined`, which asks
     nothing — a human decision outranks discovery. See src/live/README.md. */
  const live = useLiveAccess(tool.href ? undefined : tool.repo, tool.title)

  return (
    <article ref={mergeRefs(reveal, tilt)} className="card tools__card">
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      {/* The card opens the tool's own page. The card used to BE the store
          link for the one tool that has one; that link is still here, below,
          as its own control, because a card that can only go to a store
          cannot also explain itself. */}
      <a className="card__cover" href={appHash(tool.page)} onClick={() => rememberOrigin('Tools')}>
        <span className="sr-only">Open the {tool.title} page</span>
      </a>

      <div className="tools__top">
        <span className="badge tools__index">{tool.index}</span>
        <div className="chips tools__chips">
          {tool.chips.map((chip) => (
            <span key={chip.label} className={chip.hot ? 'chip chip--hot' : 'chip'}>
              {chip.label}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3 className="tools__title">
          <AppIcon icon={tool.icon} shape={tool.iconShape} />
          {tool.title}
          <span className="tools__title-arrow" aria-hidden="true">
            →
          </span>
        </h3>
        <p className="tools__copy">{tool.copy}</p>
      </div>
      {tool.href ? (
        <a className="tools__cta tools__cta--link" href={tool.href} target="_blank" rel="noopener">
          {tool.cta}
        </a>
      ) : live ? (
        /* The arrow glyph is part of the cta STRING on hand-written links
           (`Add to Chrome →`), so a derived label carries the same one. */
        <a className="tools__cta tools__cta--link" href={live.href} target="_blank" rel="noopener">
          {live.label} →
        </a>
      ) : (
        <span className="tools__cta tools__cta--muted">{tool.cta}</span>
      )}
    </article>
  )
}

export function Tools() {
  /* The shelf, in the order and with the words the Developer console's Content
     tab last published, over the built-in list in `src/data/content.ts`. Rule
     17 again: derived, never typed. See src/content/README.md. */
  const doc = useSiteContent()
  const tools = useMemo(() => visibleTools(doc), [doc])

  /* ── the depth ladder for this section ────────────────────────────────────
     Four rates, and the SIGN is half of what makes them read. `useParallax`
     writes `centreOffset * -factor`, so a positive factor moves a layer DOWN
     the viewport as you scroll down — it climbs more slowly than the page and
     reads as distance — and a negative factor moves it up faster than the
     page, which is what near looks like. Layers that only differ in magnitude
     look like noise; layers that disagree about which way to go look like
     depth.

        +0.012 the blob      the room's light, the slowest thing in the section
        -0.05  the bridge    the structure across the water
        -0.15  the boulders  the shore you are standing on, plus the cursor

     **Two rungs went with the boundary they were on**: the +0.03 waterline
     seam and the -0.075 pine pair that rose out of this section into `#apps`'
     floor. See the note at the top of this file. Slowest to fastest is still
     0.012 to 0.15, twelve and a half times, because both of the rungs that
     went were in the middle — and between the blob and the boulders the
     relative travel is 0.162, the SUM rather than the difference, because the
     two disagree about which way to go.

     **The blob was +0.2 and it is +0.012.** 0.2 was the largest factor on the
     page and it was spent on a blurred glow, which is the layer that has least
     to say about depth and the one whose motion is hardest to see — while the
     things a reader actually reads as objects were crowded into 0.035..0.115.
     A sky that moves twice as fast as the ground it is behind is not a fast
     sky, it is a broken one. The magnitude moved to the boulders, where it is
     the near shore travelling against the page, and the page's largest factor
     is still 0.2 in absolute terms only because #outro's arch is nowhere near
     it: nothing here goes past `useParallax`'s stated ~0.25 ceiling, so
     PARK_MARGIN is untouched. */
  const blob = useParallax<HTMLDivElement>(0.012)
  const sway = useSway<HTMLDivElement>(SWAY_X, SWAY_Y)
  const head = useReveal<HTMLDivElement>('wipe', 0)

  return (
    /* No `.section--blend`. It is a gradient from --tint-top to --tint-bot,
       opaque edge to edge, and this section paints OVER the walk's canvas —
       so its own band would be a lid on the last two beats of the shot. The
       backdrop for the whole walk is one gradient on `.walk`, and it ends on
       --band-building at the floor, which is the join this section still has
       to make. Tools.css and Walk.css both carry the argument. */
    <section id="tools" className="section tools">
      {/* ── the end of the walk: stepping out of the cabin ──────────────────
          The camera has settled on the west window and the small tools are
          read against its light; then it pushes toward the glass and the frame
          washes out into the outside. THIS is what is outside: a stone
          footbridge over water, a bench on the far bank, a near shore with a
          three-rail fence running out of frame, boulders and reeds at its
          waterline, and the retro-neon band beyond them, handing the page to
          `#building`.

          That is the whole reason this floor survived the pass that deleted
          `#apps`' floor and both of this section's own boundary layers. It is
          not a landscape drawn across an interior shot — it is the interior
          shot ending, and the last thing the reader sees the camera looking at
          is the thing they then scroll into.

          **Until this pass that sentence was a claim rather than a fact.** The
          canvas never faded: the pin's last position is the bottom 100svh of
          the walk and this band is the bottom --tools-scene of it, so the
          bridge, the boulders and `#building`'s own wayfinding post were being
          painted over the cabin's ceiling and wall planes for the whole of the
          join. `.walk__stage`'s mask now ends on a transparent band exactly
          this deep — Walk.css carries the arithmetic — so the room is gone
          before any of this is drawn, and it is gone by geometry rather than by
          a number that has to be kept in step with a section's height.

          The bridge is drawn from a distance and in three-quarter view: you
          can see the whole arch and the water under it, so it is the structure
          AHEAD of you rather than the deck underfoot. The boulders in the
          bottom corner are the near shore, and that is why they are the layer
          that moves most and the only one that follows the cursor.

          Both pieces are drawn AFTER the neon band rather than before it,
          which is deliberate. When the bridge was 132px wide it belonged out
          past the road; at 46vw it is nearer than a horizon grid, and a road
          painted over a bridge that large reads as a scrim rather than as
          ground. DOM order alone does it — everything here is z-index auto —
          so there is still not a single z-index in this section, and
          `.shell`'s own z-index 1 still keeps the whole scene layer under the
          cards.

          The wrapper is the section's `aria-hidden` / `pointer-events: none`
          box. It used to be what kept the boulders from hanging a whole rock
          over `#building` through the section's clip MARGIN; the margin went
          with the crossing band that needed it, so the section is back to
          `.section`'s own `overflow: hidden` and this is a plain wrapper now.
          `.origin__clip` and `.apps__clip` are the same box either side. */}
      <div className="tools__clip" aria-hidden="true">
        {/* The retro-neon band, clipped to the bottom so it can never touch a
            card. The `tools__sun` disc and its breathing ring used to open this
            list and are deleted: two hard-edged masks made them, and in the
            renders of this pass they read as a small striped semicircle
            floating in the mist rather than as a sun on a horizon. Tools.css
            has the frame it was caught in and why the grid and the horizon
            stay. */}
        <div className="tools__road">
          <div className="tools__road-grid">
            <div className="tools__road-run" />
          </div>
          <div className="tools__horizon" />
          <div className="tools__horizon-glow" />
        </div>
        <div ref={blob} className="blob tools__blob" />

        <ThemedArt art="landscapes/stone-footbridge" className="tools__bridge" factor={-0.05} />
        {/* The haze BETWEEN the bridge and the boulders, and it is drawn
            between them in the DOM for exactly that reason: it washes the
            bridge's footings and the boulders are drawn over it crisp, which
            is the whole of what makes one read as further away than the
            other. Cheaper than another prop and worth more. */}
        <div className="tools__spray" />
        {/* The reeds at the near waterline, over the bridge's near end. Low
            foreground cover, which is exactly what the kit drew this piece for
            and what guardrail 8's "plus optional low foliage" clause permits
            beside an anchor. `StillArt` for the same reason as the bench, and
            after the spray so it is crisp where the bench is hazed. */}
        <StillArt art="props/bushes-reeds" className="tools__reeds" />
        {/* The fence along the near shore — the piece the site owner asked for
            by name in the same sentence that asked for the bench, and which
            did not exist in the kit until this pass. "maybe instead of a tree
            in that section and in that corner, have the fence! or the park
            seat!" The bench answered the second half; this is the first.

            It runs off BOTH side edges of the frame and its feet are below the
            section's bottom edge at every width, so it is cropped on three
            sides and ends in mid-air on none. That is the whole reason it is
            wider than the viewport rather than a fence-shaped object placed in
            a gap: this artwork's perspective is strong enough that any box
            small enough to fit between two props would be a model of a fence
            rather than a fence.

            `StillArt`, and this is the third layer at this floor to decline a
            factor for the same reason the bench and the reeds do — a thing
            standing on the ground does not drift, because ground does not.
            Tools.css has the arithmetic and the two numbers this one is solved
            from.

            AFTER the reeds and BEFORE the boulders, which is the whole of the
            depth between the three: the reeds are down at the water, the fence
            is up the bank in front of them, and the rocks are underfoot in
            front of both. Everything here is z-index auto, so DOM order is the
            only thing saying so. */}
        <StillArt art="props/fence-rail" className="tools__fence" />
        {/* The sway box is the boulders' own box, not the section: see useSway.
            One writer per element — pointer here, scroll on the <img> inside. */}
        <div ref={sway} className="tools__rocks-sway">
          <ThemedArt art="props/boulder-cluster" className="tools__rocks" factor={-0.15} />
        </div>
        {/* The far bank's own colour coming across the water, last of all, so
            every cut end at this section's bottom edge dissolves into the
            band below instead of stopping on it. See Tools.css. */}
        <div className="tools__shore" />
      </div>

      <div className="shell tools__shell">
        {/* The plate is on THIS box and not on the head, because `useReveal`
            writes a `clip-path` to whatever it reveals and a clip-path clips
            that element's pseudo-elements to its border box — which drew the
            head's soft-edged scrim as a hard rectangle for the length of the
            wipe. Apps.tsx carries the render that caught it.

            `walk-plate` is the shared recipe in Walk.css — one plate for the
            five blocks of copy read over the walk, so two headings a viewport
            apart over one continuous shot are plated by one idea. Tools.css
            sets only how far this one reaches and how much ink it spends. */}
        <div className="tools__head-plate walk-plate">
          <div ref={head} className="tools__head">
            <div className="kicker">
              <span className="kicker__num">03</span>
              <span className="kicker__rule" />
              <span className="kicker__label">Tools &amp; extensions</span>
            </div>
            <h2 className="h2 tools__heading">Small things, sharpened.</h2>
            <p className="lede tools__lede">
              Browser extensions and little utilities we actually use every day.
            </p>
          </div>
        </div>

        <div className="tools__grid">
          {tools.map((tool, i) => (
            <ToolTile key={tool.index} tool={tool} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
