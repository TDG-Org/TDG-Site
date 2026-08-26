import { useEffect, useRef } from 'react'
import { mergeRefs } from '../lib/mergeRefs'
import { onFrame } from '../lib/motion'
import { useParallax } from '../hooks/useParallax'
import { usePointer } from '../hooks/usePointer'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { ImageSlot } from './ImageSlot'
import { AppIcon } from './AppIcon'
import { ThemedArt } from './scene/ThemedArt'
import { Seam } from './scene/Seam'
import { APPS, GITHUB_ORG, type AppCard } from '../data/content'
import { appHash, rememberOrigin } from '../lib/route'
import './Apps.css'

/** How far the pine slides with the cursor, in px at full deflection. It is
 *  deliberately 60% of the amount `#tools` gives its boulders: two things on
 *  the page follow the pointer and the quieter of the two sections gets the
 *  quieter of the two. */
const SWAY_X = 8
const SWAY_Y = 5

/**
 * Mouse parallax for the one layer in this section close enough to earn it.
 *
 * **This is a copy of `useSway` in Tools.tsx and the two must stay in step.**
 * It is fifteen lines and there are two of them; if a third section ever wants
 * one it stops being worth duplicating and belongs in `src/hooks/` beside
 * `usePointer`, which is where the shared half of this already lives.
 *
 * The three things it has to get right, all of which Tools.tsx explains at
 * length: the sway goes on a WRAPPER because `useParallax` owns
 * `element.style.translate` outright and two writers on one element race
 * inside a frame; there is no lerp and no `hold()` because `usePointer`
 * already damps, already holds while converging and already snaps when it
 * lands, so this writes a pure function of two numbers that are correct on the
 * frame they are read; and it checks its own rect, because `useOffscreenPause`
 * stamps an attribute and an `onFrame` subscriber cannot see one.
 *
 * At `mi === 0` both terms are zero, so the layer rests exactly where it
 * composed — visible and still, which is what the art kit asks for.
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

function AppTile({ app, index }: { app: AppCard; index: number }) {
  const reveal = useReveal<HTMLElement>('card3d', index % 4)
  const tilt = useTilt<HTMLElement>()

  return (
    <article ref={mergeRefs(reveal, tilt)} className="card apps__card">
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      {/* The whole card opens the app's own page. It is first in the card so
          it is also first in the tab order, ahead of a download link that a
          card may also carry. `rememberOrigin` is what lets Back return to
          this exact spot in the list rather than to the top of the page. */}
      <a className="card__cover" href={appHash(app.page)} onClick={() => rememberOrigin('Apps')}>
        <span className="sr-only">Open the {app.title} page</span>
      </a>

      <div className="apps__shot">
        <ImageSlot
          id={app.id}
          placeholder={app.slotPlaceholder}
          /* The cover is the app's own key art where it has one. The `shot`
             stays on the card's data regardless — the app's own PAGE reads it
             through `shotForPage()`, and a screenshot belongs there. */
          art={app.art}
          shot={app.shot}
          /* Breakpoints track the real column count of the auto-fit grid
             (1 col <613px, 2 to 929, 3 to 1227, 4 above). The shot now
             bleeds to the card's own edges, so no padding to subtract.
             Over-declaring made retina readers pull the 1120w candidate
             into a too-small slot. */
          sizes="(max-width: 612px) calc(100vw - 2 * clamp(18px, 4vw, 40px)), (max-width: 929px) calc((100vw - 2 * clamp(18px, 4vw, 40px) - 20px) / 2), (max-width: 1227px) calc((100vw - 2 * clamp(18px, 4vw, 40px) - 40px) / 3), 280px"
        />
      </div>
      <div className="apps__body">
        <div className="badge apps__index">{app.index}</div>
        <div className="chips apps__chips">
          {app.chips.map((chip) => (
            <span key={chip.label} className={chip.hot ? 'chip chip--hot' : 'chip'}>
              {chip.label}
            </span>
          ))}
        </div>
        <h3 className="apps__title">
          <AppIcon icon={app.icon} shape={app.iconShape} />
          {app.title}
          <span className="apps__title-arrow" aria-hidden="true">
            →
          </span>
        </h3>
        <p className="apps__copy">{app.copy}</p>
        {app.download ? (
          <a className="apps__download" href={app.download.href} target="_blank" rel="noopener">
            {app.download.label}
            <span className="apps__download-arrow" aria-hidden="true">
              →
            </span>
          </a>
        ) : (
          <div className="apps__status">{app.status}</div>
        )}
      </div>
    </article>
  )
}

export function Apps() {
  /* ── the depth ladder ─────────────────────────────────────────────────────
     Sign first: `useParallax` writes `centreOffset * -factor`, so a POSITIVE
     factor climbs more slowly than the page and reads as distance, and a
     negative one moves against it and reads as near. Three layers that only
     differed in magnitude is what the first pass had, and it looked like one
     layer with a bit of jitter.

        +0.06  the blob    sky glow behind everything
        +0.02  the seam    the far treeline at the boundary, barely drifting
        -0.02  the canopy  the nearer branches over it, moving against it
        +0.035 the reeds   scrub across the clearing, small and far
        -0.08  the pine    the tree at the frame edge, near, and swaying

     The pine and the reeds go opposite ways, and that is the pair that carries
     the depth: 0.115 of relative travel between them where the first pass had
     0.03 between its two props, and a foreground moving against a background
     rather than both of them agreeing. -0.08 rather than the -0.11 this
     started at, because the pine is 690px tall at 1920 and drift scales with
     the layer's own height — at -0.11 a 900x1400 window spent 96px of the
     clearance and left the visible tree a 72px spire.

     `#apps` is `.section--flat` and stays the quieter of the two flat anchors
     on purpose: its foreground is `--art-mid` where `#tools` gives its
     foreground `--art-near`, and its sway is 8/5px against `#tools`' 12/7. */
  const blob = useParallax<HTMLDivElement>(0.06)
  const seam = useParallax<HTMLDivElement>(0.02)
  const canopy = useParallax<HTMLDivElement>(-0.02)
  const sway = useSway<HTMLDivElement>(SWAY_X, SWAY_Y)
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const more = useReveal<HTMLDivElement>('scale', 2)

  return (
    <section id="apps" className="section section--flat apps">
      <div className="texture apps__dots" aria-hidden="true" />
      <div ref={blob} className="blob apps__blob" aria-hidden="true" />

      {/* ── this section's beat in the walk: a treeline ────────────────────
          The home page reads as one walk through one place — a valley under a
          lamppost, a path of stepping stones, a treeline, a footbridge, a
          hillside cross, a garden arch — and this is the treeline.

          `props/tall-pine` and not the faceted pair, because the kit added a
          piece for exactly this: one oversized edge prop drawn to be cropped
          by the frame, to be used ALONE rather than beside another pine
          family. A tree that runs out of the top of its own picture is what a
          treeline looks like from underneath it; two small whole trees is what
          a treeline looks like on a map. The faceted pair keeps its place two
          sections down in #building, where the trees are meant to be across
          the water and small — and the kit is explicit that the tall one is
          used ALONE, never beside another pine family, which is why those two
          live two sections apart.

          The pine is the near plane and it is the one that follows the cursor;
          the reeds are the far one and go the other way. It is still the
          quieter of the two flat sections: `#apps` is the contrast anchor
          between two blended ones, so the pine takes `--art-mid` where #tools'
          foreground takes `--art-near`, and the sway is 8/5px against #tools'
          12/7.

          Order matters, and it matters more than it did. These sit after the
          dots and the blob so they are over the texture, and before `.shell` —
          which carries `z-index: 1` — so the whole scene layer is under the
          cards. That is NOT what keeps them off the copy: `.card` is
          `background-color: var(--surface)`, a 4.5% white wash in the dark
          theme, so a card is 95% transparent and art behind the grid would be
          read straight through it. What keeps them off the copy is that both
          boxes live entirely inside this section's own floor — see Apps.css. */}
      <ThemedArt art="props/bushes-reeds" className="apps__reeds" factor={0.035} />
      {/* The sway box is the pine's own box, not the section: see useSway.
          One writer per element — pointer here, scroll on the <img> inside. */}
      <div ref={sway} className="apps__pine-sway" aria-hidden="true">
        <ThemedArt art="props/tall-pine" className="apps__pine" factor={-0.08} />
      </div>

      {/* ── the boundary: a canopy at two depths ───────────────────────────
          Origin is the snow and the lit cabin; this is the treeline you walk
          under on the way out of it. So the join is TWO silhouettes rather
          than one, and it is the only boundary on the page that carries two —
          the four below it are a single shape, a mist, a pass and a dissolve,
          in that order, so no two joins on this page are the same idea.

          Reading them from the back:

          - `ridge` is the far treeline, hard-edged, `var(--seam-fill)`, and it
            drifts DOWN with the page at +0.02.
          - `dune` is the nearer branches over it: a bigger step toward the
            ink, a taller band, dissolved with `--seam-fade` so it has no edge
            of its own, and it drifts UP at -0.02.

          0.04 of relative travel between them, so the two edges open and
          close as you scroll instead of sitting one on top of the other. That
          is the whole point: a reader following the near shape down finds the
          far one behind it rather than finding a line.

          Both are painted `var(--seam-fill)` / a band mix, and neither can
          read `--tint-*` — those are registered `inherits: false` so the theme
          wave can animate them. See scene/README.md.

          The drift goes on a zero-height wrapper because `useParallax` is
          typed to HTMLElement and `Seam` takes no ref, and a zero height means
          the hook reads the BOUNDARY's distance from the viewport centre
          rather than a box whose middle moves with however tall the band
          happens to be at this width. Apps.css carries the rest, including
          what `--seam-lift` is for. */}
      <div ref={seam} className="apps__seam-drift" aria-hidden="true">
        <Seam shape="ridge" edge="top" />
      </div>
      <div ref={canopy} className="apps__canopy-drift" aria-hidden="true">
        <Seam shape="dune" edge="top" className="apps__canopy" />
      </div>

      <div className="shell apps__shell">
        <div ref={head} className="apps__head">
          <div>
            <div className="kicker">
              <span className="kicker__num">02</span>
              <span className="kicker__rule" />
              <span className="kicker__label">Apps</span>
            </div>
            <h2 className="h2 apps__heading">Apps we're building.</h2>
            <p className="lede apps__lede">
              The bigger desktop and installable apps, the ones most of our hours go into.
            </p>
          </div>
          <div className="apps__nudge">↳ hover a card</div>
        </div>

        <div className="apps__grid">
          {APPS.map((app, i) => (
            <AppTile key={app.id} app={app} index={i} />
          ))}

          <div ref={more} className="apps__more" data-more>
            <div className="apps__more-title">and more on the way</div>
            <p className="apps__more-copy">
              We're always building. Follow along to catch the next one.
            </p>
            <a className="apps__more-link" href={GITHUB_ORG} target="_blank" rel="noopener">
              Watch on GitHub →
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
