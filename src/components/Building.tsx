import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { MARANATHA, NEXT_UP } from '../data/content'
import './Building.css'

function NextUpPill({ label, index }: { label: string; index: number }) {
  const reveal = useReveal<HTMLDivElement>('pop', index)
  return (
    <div ref={reveal} className="building__pill">
      <span className="building__pill-dot" data-alt={index % 2 === 1 || undefined} />
      {label}
    </div>
  )
}

export function Building() {
  const blob = useParallax<HTMLDivElement>(-0.1)
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const reveal = useReveal<HTMLDivElement>('scale', 0)
  const tilt = useTilt<HTMLDivElement>()

  return (
    <section id="building" className="section section--flat building">
      <div className="texture building__scan" aria-hidden="true" />
      <div ref={blob} className="blob building__blob" aria-hidden="true" />

      <div className="shell building__shell">
        <div ref={head} className="building__head">
          <div>
            <div className="kicker">
              <span className="kicker__num">04</span>
              <span className="kicker__rule" />
              <span className="kicker__label">Building now</span>
            </div>
            <h2 className="h2 building__heading">Works in progress.</h2>
            <p className="lede building__lede">
              What's on our screens right now — one close to done, the rest just getting started.
            </p>
          </div>
          <span className="building__count">{MARANATHA.count}</span>
        </div>

        <div ref={mergeRefs(reveal, tilt)} className="card building__feature">
          <span className="card__spot" aria-hidden="true" />
          <span className="card__edge" aria-hidden="true" />

          <div className="building__art">
            <picture>
              <source
                type="image/avif"
                sizes="(max-width: 760px) 100vw, 50vw"
                srcSet={MARANATHA.shot.widths
                  .map((w) => `/shots/${MARANATHA.shot.slug}-${w}.avif ${w}w`)
                  .join(', ')}
              />
              <source
                type="image/webp"
                sizes="(max-width: 760px) 100vw, 50vw"
                srcSet={MARANATHA.shot.widths
                  .map((w) => `/shots/${MARANATHA.shot.slug}-${w}.webp ${w}w`)
                  .join(', ')}
              />
              <img
                className="building__art-img"
                src={`/shots/${MARANATHA.shot.slug}-${MARANATHA.shot.widths[0]}.webp`}
                alt={MARANATHA.shot.alt}
                width={720}
                height={405}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>

          <div className="building__body">
            <div className="building__tags">
              <span className="building__tag">GAME</span>
              <span className="building__tag building__tag--live">● IN PLAYTEST</span>
            </div>
            <h3 className="building__title">{MARANATHA.heading}</h3>
            <p className="building__copy">{MARANATHA.copy}</p>
            <div className="building__actions">
              <span className="building__play building__play--soon">{MARANATHA.status}</span>
              <span className="building__note">{MARANATHA.note}</span>
            </div>
          </div>
        </div>

        <div className="building__pills">
          {NEXT_UP.map((label, i) => (
            <NextUpPill key={label} label={label} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
