import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { ImageSlot } from './ImageSlot'
import { APPS, GITHUB_ORG, type AppCard } from '../data/content'
import './Apps.css'

function AppTile({ app, index }: { app: AppCard; index: number }) {
  const reveal = useReveal<HTMLElement>('card3d', index % 4)
  const tilt = useTilt<HTMLElement>()

  return (
    <article ref={mergeRefs(reveal, tilt)} className="card apps__card">
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />

      <div className="apps__shot">
        <ImageSlot
          id={app.id}
          placeholder={app.slotPlaceholder}
          shot={app.shot}
          sizes="(max-width: 640px) 90vw, (max-width: 1100px) 44vw, 300px"
        />
      </div>
      <div className="badge apps__index">{app.index}</div>
      <div className="chips apps__chips">
        {app.chips.map((chip) => (
          <span key={chip.label} className={chip.hot ? 'chip chip--hot' : 'chip'}>
            {chip.label}
          </span>
        ))}
      </div>
      <h3 className="apps__title">{app.title}</h3>
      <p className="apps__copy">{app.copy}</p>
      <div className="apps__status">{app.status}</div>
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

      <div className="shell apps__shell">
        <div ref={head} className="apps__head">
          <div>
            <div className="kicker">
              <span className="kicker__num">02</span>
              <span className="kicker__rule" />
              <span className="kicker__label">Apps</span>
            </div>
            <h2 className="h2 apps__heading">Apps we're crafting.</h2>
            <p className="lede apps__lede">
              The bigger desktop and installable apps we're pouring time into.
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
