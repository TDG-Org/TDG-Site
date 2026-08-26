import { useEffect, useRef } from 'react'
import { mergeRefs } from '../lib/mergeRefs'
import { onFrame } from '../lib/motion'
import { useParallax } from '../hooks/useParallax'
import { usePointer } from '../hooks/usePointer'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { TOOLS, type ToolCard } from '../data/content'
import { appHash, rememberOrigin } from '../lib/route'
import { AppIcon } from './AppIcon'
import { Seam } from './scene/Seam'
import { ThemedArt } from './scene/ThemedArt'
import './Tools.css'

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
      ) : (
        <span className="tools__cta tools__cta--muted">{tool.cta}</span>
      )}
    </article>
  )
}

export function Tools() {
  /* ── the depth ladder for this section ────────────────────────────────────
     Four rates, and the SIGN is half of what makes them read. `useParallax`
     writes `centreOffset * -factor`, so a positive factor moves a layer DOWN
     the viewport as you scroll down — it climbs more slowly than the page and
     reads as distance — and a negative factor moves it up faster than the
     page, which is what near looks like. Layers that only differ in magnitude
     look like noise; layers that disagree about which way to go look like
     depth.

        +0.2   the blob      sky glow, the slowest thing on the page
        +0.03  the seam      the far boundary, barely drifting
        -0.035 the bridge    the structure across the water
        -0.115 the boulders  the shore you are standing on, plus the cursor

     Between the seam and the boulders that is 0.145 of the travel, against
     0.018 in the first pass — eight times the relative motion, which is the
     whole of what "there is no parallax anywhere" was about. */
  const blob = useParallax<HTMLDivElement>(0.2)
  const seam = useParallax<HTMLDivElement>(0.03)
  const sway = useSway<HTMLDivElement>(SWAY_X, SWAY_Y)
  const head = useReveal<HTMLDivElement>('wipe', 0)

  return (
    <section id="tools" className="section section--blend tools">
      {/* ── the walk, beat four: crossing a stone footbridge ────────────────
          Apps' treeline is behind you and #building is the far bank. The
          `wave` is the water this bridge crosses — the only one on the page,
          because it is the only boundary with water under it.

          The bridge is drawn from a distance and in three-quarter view: you
          can see the whole arch and the water under it, so it is the structure
          AHEAD of you rather than the deck underfoot. The boulders in the
          bottom corner are the near shore, and that is why they are the layer
          that moves most and the only one that follows the cursor.

          Both pieces are drawn AFTER the neon band rather than before it,
          which is the reverse of the first pass and deliberate. When the
          bridge was 132px wide it belonged out past the road; at 46vw it is
          nearer than a horizon grid, and a road painted over a bridge that
          large reads as a scrim rather than as ground. DOM order alone does
          it — everything here is z-index auto — so there is still not a single
          z-index in this section, and `.shell`'s own z-index 1 still keeps the
          whole scene layer under the cards. */}
      <div ref={seam} className="tools__seam-drift" aria-hidden="true">
        <Seam shape="wave" edge="top" className="tools__seam" />
      </div>

      {/* retro-neon band, clipped to the bottom so it can never touch a card */}
      <div className="tools__sun" aria-hidden="true" />
      <div className="tools__sun-ring" aria-hidden="true" />
      <div className="tools__road" aria-hidden="true">
        <div className="tools__road-grid">
          <div className="tools__road-run" />
        </div>
        <div className="tools__horizon" />
        <div className="tools__horizon-glow" />
      </div>
      <div ref={blob} className="blob tools__blob" aria-hidden="true" />

      <ThemedArt art="landscapes/stone-footbridge" className="tools__bridge" factor={-0.035} />
      {/* The sway box is the boulders' own box, not the section: see useSway.
          One writer per element — pointer here, scroll on the <img> inside. */}
      <div ref={sway} className="tools__rocks-sway" aria-hidden="true">
        <ThemedArt art="props/boulder-cluster" className="tools__rocks" factor={-0.115} />
      </div>

      <div className="shell tools__shell">
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

        <div className="tools__grid">
          {TOOLS.map((tool, i) => (
            <ToolTile key={tool.index} tool={tool} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
