import { lazy, Suspense, useEffect, type RefObject } from 'react'
import { clamp01, onFrame } from '../lib/motion'
import { useHeroParallax } from '../hooks/useParallax'
import { CrossGlyph } from './CrossGlyph'
import { ThemedHeroArt } from './scene/ThemedArt'
import { Starfield } from './hero/Starfield'
import { Tagline } from './hero/Tagline'
import './Hero.css'

/* The model and its twelve form definitions are the largest thing on the page
   and none of it is needed to paint the hero. Split it out. */
const PointCloud = lazy(() =>
  import('./hero/PointCloud').then((m) => ({ default: m.PointCloud })),
)

/**
 * How far Origin lags below its layout position before it has arrived, in px.
 * See `useHeroTakeover`. `.hero`'s own box-shadow paints the floor under that
 * lag and has to stay taller than this number.
 */
const TAKEOVER_LAG = 120

export function Hero() {
  const shafts = useHeroParallax<HTMLDivElement>(0.06)
  const content = useHeroParallax<HTMLDivElement>(0.14)

  // As the page scrolls, the hero sinks, dims and blurs. It lags behind while
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

      {/* ── the valley ──────────────────────────────────────────────────────
          Back to front, and deliberately the two quietest pieces in the kit:
          sky · fog · ridge (z-index 0, DOM order) → point cloud (2) → the
          lamppost (2, after the model so it paints over it) → content and
          strip (3). Guardrail 5 of public/assets/parallax/implementation-
          brief.md, which also says the bench and the trees stay out of the
          hero — the props are reserved for the sections further down, and the
          establishing shot stays quiet.

          Both ride `useHeroParallax`, so they are choreographed against the
          hero's OWN displacement rather than against viewport centre: every
          other layer in this section already is, and a layer drifting to a
          different clock is the thing that reads as "wrong" without being
          nameable. Negative factors, because these are far away and a far
          layer moves LESS than the scroll: the hook writes `top * factor`,
          and `top` goes negative as the page moves, so a negative factor is a
          downward offset that cancels part of the scroll.

          Opacity is --art-far in both cases, from tokens.css, per theme. The
          two PNGs behind these are separate -dark and -light artwork; nothing
          here recolours a pixel. See scene/README.md. */}
      <ThemedHeroArt art="atmosphere/fog-veil" className="hero__fog" factor={-0.062} />
      <ThemedHeroArt art="landscapes/mountain-ridge" className="hero__ridge" factor={-0.034} />

      <div ref={shafts} className="hero__shafts" aria-hidden="true">
        <div className="hero__shaft" />
        <div className="hero__shaft-core" />
        <div className="hero__shaft-far" />
      </div>

      <Starfield />

      <div className="hero__bloom" aria-hidden="true" />
      <div className="hero__grain" aria-hidden="true" />
      <div className="hero__vignette" aria-hidden="true" />

      {/* The model loads in the background, with no fallback UI on mobile or slow networks */}
      <Suspense fallback={null}>
        <PointCloud />
      </Suspense>

      {/* The one peripheral prop the hero gets, and the reason it sits HERE in
          the file rather than up with the terrain: it shares z-index 2 with
          the point cloud, so DOM order is what puts it in front. Its lamp is
          warm and lit — a quiet echo of --warm — and the glow around it is
          painted into the PNG's own alpha, so there is no CSS glow on top of
          it. `.scene__art` is pointer-events: none, so it cannot touch the
          model's drag area; it is in the left gutter and the model is on the
          right, so the two never share a pixel either. */}
      <ThemedHeroArt art="hero/lamppost-left" className="hero__lamp" factor={0.032} />

      <div ref={content} className="hero__content">
        <div className="hero__inner">
          <div className="hero__eyebrow-row">
            <span className="hero__eyebrow-rule" />
            <span className="hero__eyebrow">The Disciples of God</span>
          </div>

          {/* the cross glyph is the "T", so the heading's only text is "DG".
              Name it explicitly or the page's h1 reads as "DG" */}
          <h1 className="hero__wordmark" aria-label="TDG">
            <span className="hero__cross">
              <CrossGlyph variant="hero" />
            </span>
            <span className="hero__dg">DG</span>
          </h1>

          <Tagline />

          <div className="hero__ctas">
            <a href="#apps" className="hero__cta">
              Explore our work <span className="hero__cta-arrow" aria-hidden="true">→</span>
            </a>
            <a href="#origin" className="hero__cta hero__cta--ghost">
              Our origin
            </a>
          </div>
        </div>
      </div>

      <div className="hero__strip">
        <div className="hero__strip-inner">
          <div className="hero__meta">
            <span>Est. 2016</span>
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

/**
 * Kept next to the hero: the Origin section slides up over it.
 *
 * ── why the lift runs downward and settles at zero ───────────────────────
 * This used to be `Math.sin(e * Math.PI)`, which rises to 148px at the
 * halfway point and then falls back to 0. A reader scrolling steadily
 * watched the section come up and then sink again — the wobble was the
 * effect, not a taste problem, and it is what made the seam read as choppy.
 *
 * A monotonic curve that ends anywhere other than zero is not an option
 * either: `translate` does not move layout, so a section left permanently
 * displaced by L opens an L-tall band of page background between its own
 * floor and the next section's ceiling, forever, for every section below it
 * to trip over. So the travel runs the other way. Origin starts a lag BELOW
 * its layout position and eases monotonically UP into it: it arrives, it
 * settles, and once it has arrived the rest of the page is untouched by any
 * of this. The band the lag opens above Origin is filled by `.hero`'s own
 * box-shadow floor — see Hero.css — which paints --hero-bg, the very token
 * Origin's --tint-top is built from, so the boundary has no colour in it.
 *
 * ── the shadow ───────────────────────────────────────────────────────────
 * It used to switch from `none` to full the instant `e` crossed 0.02. Now
 * its alpha ramps with the same eased progress, from zero.
 *
 * The colour comes from `--hero-takeover-ink`, which Hero.css declares per
 * theme. It used to be `rgba(0,0,0,0.6)` composed here in JavaScript, with
 * no light variant — a literal colour one layer up from the stylesheet,
 * failing in exactly the way rule 2 predicts: right in one theme, and a
 * black shadow designed for a black page arriving over the light one. JS
 * only scales the token now; reading it back with `getComputedStyle` would
 * be a layout read in the read phase and is not the answer.
 *
 * ── and the scale is gone ────────────────────────────────────────────────
 * `scale: 1 - 0.012 * wave` resampled every glyph in the section it was
 * applied to. At 0.988 that is a visible softening of the exact paragraphs
 * somebody is trying to read, in exchange for a depth cue. It has been
 * dropped rather than relocated: the only wrapper available inside Origin
 * contains all of Origin's text, and the depth it was buying is carried
 * across the boundary now by the hero's own fog and ridge, which sit at
 * different parallax factors and are cut by the hero's floor.
 */
export function useHeroTakeover<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let painted = ''
    return onFrame(({ vh, mi }) => {
      const top = el.getBoundingClientRect().top
      const e = clamp01((vh - top) / (vh * 0.9))
      // one ease-out, monotone in e, no overshoot and no return trip
      const arrived = 1 - Math.pow(1 - e, 3)
      const translate = `0 ${((1 - arrived) * TAKEOVER_LAG * mi).toFixed(2)}px`
      const lit = arrived * mi
      // Below half a percent the shadow is three thousandths of an alpha and
      // costs a 90px blur of the whole section to paint. `none` is the same
      // picture for free, and the step to it is invisible.
      const shadow =
        lit < 0.005
          ? 'none'
          : `0 -34px 90px -26px color-mix(in srgb, var(--hero-takeover-ink) ${(lit * 100).toFixed(1)}%, transparent)`
      const next = `${translate}|${shadow}`
      if (next === painted) return
      painted = next
      return () => {
        el.style.translate = translate
        el.style.boxShadow = shadow
      }
    })
  }, [ref])
}
