import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { TOOLS, type ToolCard } from '../data/content'
import { appHash, rememberOrigin } from '../lib/route'
import { AppIcon } from './AppIcon'
import { Seam } from './scene/Seam'
import { ThemedArt } from './scene/ThemedArt'
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
  const blob = useParallax<HTMLDivElement>(0.2)
  /* The boundary drifts against the section behind it, which is what makes it
     read as depth rather than as a shape stuck on the edge. Small on purpose:
     the seam is the near ground at this boundary, so it moves most here, and
     the bridge out on the horizon moves least. 0.04 is 36px of travel across a
     full 900px screen — enough to disagree with the section behind it, not
     enough to look like it is sliding. */
  const seam = useParallax<HTMLDivElement>(0.04)
  const head = useReveal<HTMLDivElement>('wipe', 0)

  return (
    <section id="tools" className="section section--blend tools">
      {/* ── the walk, beat four: crossing a stone footbridge ────────────────
          Apps' treeline is behind you and #building is the far bank. The
          `wave` is the water this bridge crosses — the only one on the page,
          because it is the only boundary with water under it.

          Both of these are drawn FIRST on purpose. Everything below them in
          this file — the neon sun, its ring, the road grid, the horizon line
          and its glow — is positioned with z-index auto, so DOM order alone
          puts the art behind all of it without a single z-index. The bridge
          does not compete with the road; it sits out past it. */}
      <div ref={seam} className="tools__seam-drift" aria-hidden="true">
        <Seam shape="wave" edge="top" className="tools__seam" />
      </div>
      <ThemedArt art="landscapes/stone-footbridge" className="tools__bridge" factor={0.022} />

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
