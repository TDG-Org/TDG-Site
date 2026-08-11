import { lazy, Suspense, useEffect, type RefObject } from 'react'
import { onFrame } from '../lib/motion'
import { useHeroParallax } from '../hooks/useParallax'
import { CrossGlyph } from './CrossGlyph'
import { Starfield } from './hero/Starfield'
import './Hero.css'

/* The model and its twelve form definitions are the largest thing on the page
   and none of it is needed to paint the hero. Split it out. */
const PointCloud = lazy(() =>
  import('./hero/PointCloud').then((m) => ({ default: m.PointCloud })),
)

export function Hero() {
  const shafts = useHeroParallax<HTMLDivElement>(0.06)
  const content = useHeroParallax<HTMLDivElement>(0.14)

  // As the page scrolls, the hero sinks, dims and blurs — it lags behind while
  // the next section is pulled up over it.
  useEffect(() => {
    const el = content.current
    if (!el) return
    let hero: HTMLElement | null = null
    let painted = ''
    return onFrame(({ vh }) => {
      hero ??= document.getElementById('top')
      if (!hero) return
      const p = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / (vh || 800)))
      const opacity = (1 - p * 0.92).toFixed(4)
      const blur = p > 0.01 ? `blur(${(p * 5).toFixed(2)}px)` : ''
      const next = `${opacity}|${blur}`
      if (next === painted) return
      painted = next
      return () => {
        el.style.opacity = opacity
        el.style.filter = blur
      }
    })
  }, [content])

  return (
    <section id="top" className="hero">
      <div className="hero__sky" aria-hidden="true" />

      <div ref={shafts} className="hero__shafts" aria-hidden="true">
        <div className="hero__shaft" />
        <div className="hero__shaft-core" />
        <div className="hero__shaft-far" />
      </div>

      <Starfield />

      <div className="hero__bloom" aria-hidden="true" />
      <div className="hero__grain" aria-hidden="true" />
      <div className="hero__vignette" aria-hidden="true" />

      <Suspense fallback={null}>
        <PointCloud />
      </Suspense>

      <div ref={content} className="hero__content">
        <div className="hero__inner">
          <div className="hero__eyebrow-row">
            <span className="hero__eyebrow-rule" />
            <span className="hero__eyebrow">The Disciples of God</span>
          </div>

          {/* the cross glyph is the "T", so the heading's only text is "DG" —
              name it explicitly or the page's h1 reads as "DG" */}
          <h1 className="hero__wordmark" aria-label="TDG">
            <span className="hero__cross">
              <CrossGlyph variant="hero" />
            </span>
            <span className="hero__dg">DG</span>
          </h1>

          <p className="hero__tagline">
            Brothers building software, games, and tools — for the glory of Jesus.
          </p>

          <div className="hero__ctas">
            <a href="#apps" className="hero__cta">
              Explore our work <span className="hero__cta-arrow">→</span>
            </a>
            <a href="#story" className="hero__cta hero__cta--ghost">
              Our story
            </a>
          </div>
        </div>
      </div>

      <div className="hero__strip">
        <div className="hero__strip-inner">
          <div className="hero__meta">
            <span>Est. 2017</span>
            <span className="hero__meta-div" />
            <span>Apps · Tools · Games</span>
            <span className="hero__meta-div" />
            <span>Jesus Is King</span>
          </div>
          <div className="hero__meta">
            <span>Scroll</span>
            <span className="hero__scroll-arrow">↓</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Kept next to the hero: the story section slides up over it. */
export function useHeroTakeover<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let painted = ''
    return onFrame(({ vh, mi }) => {
      const top = el.getBoundingClientRect().top
      const e = Math.max(0, Math.min(1, (vh - top) / (vh * 0.9)))
      const wave = Math.sin(e * Math.PI)
      const translate = `0 ${(-wave * 148 * mi).toFixed(2)}px`
      const scale = (1 - 0.012 * wave * mi).toFixed(5)
      const shadow = e > 0.02 ? `0 -34px 90px -26px rgba(0,0,0,${(0.6 * mi).toFixed(2)})` : 'none'
      const next = `${translate}|${scale}|${shadow}`
      if (next === painted) return
      painted = next
      return () => {
        el.style.translate = translate
        el.style.scale = scale
        el.style.boxShadow = shadow
      }
    })
  }, [ref])
}
