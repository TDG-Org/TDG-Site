import { useEffect, useRef } from 'react'
import { clamp01, onFrame } from '../lib/motion'
import { mergeRefs } from '../lib/mergeRefs'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { useTilt } from '../hooks/useTilt'
import { useHeroTakeover } from './Hero'
import { CHAPTERS, type Chapter } from '../data/content'
import './Story.css'

function StoryRow({ chapter, index }: { chapter: Chapter; index: number }) {
  const reveal = useReveal<HTMLElement>('pop', index)
  const tilt = useTilt<HTMLElement>(true)

  return (
    <article
      ref={mergeRefs(reveal, tilt)}
      className="story__row"
      data-turn={chapter.turn || undefined}
      tabIndex={0}
      aria-label={chapter.title}
    >
      <span className="story__sweep" aria-hidden="true" />
      {/* The turn's halo. Painted behind the dot as two compositable layers
          rather than an animated box-shadow, which costs ~45ms of main thread
          per second for this one 11px dot. */}
      {chapter.turn ? <span className="story__pulse" aria-hidden="true" /> : null}
      <span className="story__dot" aria-hidden="true" />
      <div className="story__meta">
        <span className="story__chapter">{chapter.chapter}</span>
        <span className="story__phase">{chapter.phase}</span>
      </div>
      <div className="story__body">
        <div className="story__numeral">{chapter.numeral}</div>
        <div>
          <h3 className="story__title">{chapter.title}</h3>
          <p className="story__copy">{chapter.copy}</p>
        </div>
      </div>
    </article>
  )
}

export function Story() {
  const section = useRef<HTMLElement | null>(null)
  const rail = useRef<HTMLDivElement | null>(null)
  const blob = useParallax<HTMLDivElement>(0.18)
  const intro = useReveal<HTMLDivElement>('wipe', 0)

  useHeroTakeover(section)

  // A second spine grows over the static one, mapped across the middle
  // two-thirds of the section, so the path visibly fills as you read.
  useEffect(() => {
    const fill = rail.current
    const el = section.current
    if (!fill || !el) return
    let painted = ''
    return onFrame(({ vh }) => {
      const r = el.getBoundingClientRect()
      const p = clamp01((vh * 0.86 - r.top) / (r.height * 0.66))
      const next = `${(p * 100).toFixed(1)}%`
      if (next === painted) return
      painted = next
      return () => {
        fill.style.height = next
      }
    })
  }, [])

  return (
    <section id="story" ref={section} className="section section--blend story">
      <div className="texture story__grid" aria-hidden="true" />
      <div ref={blob} className="blob story__blob" aria-hidden="true" />

      <div className="shell story__shell">
        <div ref={intro} className="story__intro">
          <div className="kicker">
            <span className="kicker__num">01</span>
            <span className="kicker__rule" />
            <span className="kicker__label">Our story</span>
          </div>
          <h2 className="h2 h2--serif story__heading">It started with a clan tag.</h2>
          <p className="story__lede">
            Nine years ago, we picked three letters for a gaming clan. We got older, we found God,
            and we kept the letters — because by then they meant something far bigger. Today we
            build the same way we used to play: together, late, and all in.
          </p>
        </div>

        <div className="story__timeline">
          <div className="story__spine" aria-hidden="true" />
          <div ref={rail} className="story__spine-fill" aria-hidden="true" />
          <div className="story__rows">
            {CHAPTERS.map((chapter, i) => (
              <StoryRow key={chapter.numeral} chapter={chapter} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
