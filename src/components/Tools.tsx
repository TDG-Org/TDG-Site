import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { TOOLS, type ToolCard } from '../data/content'
import './Tools.css'

function ToolTile({ tool, index }: { tool: ToolCard; index: number }) {
  const reveal = useReveal<HTMLElement>('slideL', index)
  const tilt = useTilt<HTMLElement>()

  const body = (
    <>
      <span className="card__spot" aria-hidden="true" />
      <span className="card__edge" aria-hidden="true" />
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
        <h3 className="tools__title">{tool.title}</h3>
        <p className="tools__copy">{tool.copy}</p>
      </div>
      <span className={tool.href ? 'tools__cta' : 'tools__cta tools__cta--muted'}>{tool.cta}</span>
    </>
  )

  return tool.href ? (
    <a
      ref={mergeRefs(reveal, tilt)}
      className="card tools__card"
      href={tool.href}
      target="_blank"
      rel="noopener"
    >
      {body}
    </a>
  ) : (
    <div ref={mergeRefs(reveal, tilt)} className="card tools__card">
      {body}
    </div>
  )
}

export function Tools() {
  const blob = useParallax<HTMLDivElement>(0.2)
  const head = useReveal<HTMLDivElement>('wipe', 0)

  return (
    <section id="tools" className="section section--blend tools">
      {/* retro-neon band, clipped to the bottom so it can never touch a card */}
      <div className="tools__sun" aria-hidden="true" />
      <div className="tools__sun-ring" aria-hidden="true" />
      <div className="tools__road" aria-hidden="true">
        <div className="tools__road-grid" />
        <div className="tools__horizon" />
        <div className="tools__horizon-glow" />
      </div>
      <div ref={blob} className="blob tools__blob" aria-hidden="true" />

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
