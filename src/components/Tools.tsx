import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { TOOLS, type ToolCard } from '../data/content'
import { appHash, rememberOrigin } from '../lib/route'
import { asset } from '../lib/asset'
import './Tools.css'

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
      <a className="card__cover" href={appHash(tool.page)} onClick={rememberOrigin}>
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
          {/* The tool's own icon, decorative: the title beside it already
              names it, so a screen reader would only hear it twice. */}
          <img
            className="tools__icon"
            src={asset(`assets/${tool.icon}`)}
            alt=""
            width="30"
            height="30"
            loading="lazy"
            decoding="async"
          />
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
  const blob = useParallax<HTMLDivElement>(0.2)
  const head = useReveal<HTMLDivElement>('wipe', 0)

  return (
    <section id="tools" className="section section--blend tools">
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
