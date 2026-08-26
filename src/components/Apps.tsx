import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { ImageSlot } from './ImageSlot'
import { AppIcon } from './AppIcon'
import { StillArt, ThemedArt } from './scene/ThemedArt'
import { Seam } from './scene/Seam'
import { APPS, GITHUB_ORG, type AppCard } from '../data/content'
import { appHash, rememberOrigin } from '../lib/route'
import './Apps.css'

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
  const blob = useParallax<HTMLDivElement>(-0.14)
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

          It is deliberately the quietest of the six. `#apps` is
          `.section--flat`, the contrast anchor between two blended sections,
          and turning it into a third scene would cost the page the one place
          it stops for breath. So: one structural anchor, one band of low
          foliage, both anchored to the bottom edge and both at `--art-far`.
          That is the whole budget the kit's guardrail 8 allows, and it is
          spent at the quiet end of it.

          Order matters. These come after the dots and the blob so they sit
          over the texture, and before `.shell` — which carries `z-index: 1` —
          so nothing here can ever paint over a card. */}
      <StillArt art="props/pine-faceted-pair" className="apps__pines" />
      <ThemedArt art="props/bushes-reeds" className="apps__reeds" factor={0.05} />

      {/* The boundary above, wearing a shape instead of a straight line. It is
          painted `var(--seam-fill)`, which base.css sets for `#apps` beside the
          band tints it has to agree with — the seam cannot read `--tint-*`
          itself, because those are registered `inherits: false` so the theme
          wave can animate them. See scene/README.md. `ridge` rather than
          `peaks`: a low, many-faceted profile reads as a distant treeline,
          where `peaks` at 44–90px across a whole viewport is a mountain range
          and would be the loudest thing in a section that is meant to be the
          calm one. */}
      <Seam shape="ridge" edge="top" className="apps__seam" />

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
