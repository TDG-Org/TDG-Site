import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { SectionsProvider } from '../lib/sections'
import { BackButton, Fold, FoldControls } from './Folded'
import { ABOUT } from '../data/about'

/**
 * About TDG.
 *
 * Deliberately the same page as an app page, in every way a reader can feel:
 * the same chrome, the same folds, the same open and closed behaviour, the same
 * way back. It carries no stylesheet of its own, because a second one would be
 * the beginning of the two drifting apart, and this page's whole job is to look
 * like it belongs beside the ten it links to.
 *
 * Everything it says is in `src/data/about.ts`.
 */
function AboutBody() {
  const blob = useParallax<HTMLDivElement>(-0.12)
  const head = useReveal<HTMLDivElement>('wipe', 0)

  return (
    <section id="top" className="section section--blend appview">
      <div className="texture appview__grid" aria-hidden="true" />
      <div ref={blob} className="blob appview__blob" aria-hidden="true" />

      <div className="shell appview__shell">
        {/* Home rather than a list, because this page is not opened from one.
            Somebody who arrived from a link that remembered where they were
            still gets that place back; see BackButton. */}
        <BackButton label="Back to Home" fallbackHash="#top" />

        <div ref={head} className="appview__head">
          <div className="kicker">
            <span className="kicker__rule" />
            <span className="kicker__label">The Disciples of God</span>
          </div>
          <h1 className="h2 appview__title">{ABOUT.title}</h1>
          <p className="lede appview__lede">{ABOUT.lede}</p>
          <p className="appview__intro">{ABOUT.intro}</p>

          <dl className="appview__glance">
            {ABOUT.facts.map((fact) => (
              <div key={fact.label} className="appview__glance-row">
                <dt className="appview__glance-label">{fact.label}</dt>
                <dd className="appview__glance-value">{fact.value}</dd>
              </div>
            ))}
          </dl>

          <div className="appview__links">
            {ABOUT.links.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  className="appview__link"
                  href={link.href}
                  target="_blank"
                  rel="noopener"
                >
                  {link.label}
                  <span className="appview__link-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              ) : (
                <a key={link.href} className="appview__link" href={link.href}>
                  {link.label}
                  <span className="appview__link-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              ),
            )}
          </div>
        </div>

        <FoldControls />

        <div className="appview__folds">
          {ABOUT.sections.map((section) => (
            <Fold key={section.id} section={section} prefix="about-sec" />
          ))}
        </div>

        <div className="appview__foot">
          <BackButton label="Back to Home" fallbackHash="#top" tone="quiet" />
        </div>
      </div>
    </section>
  )
}

export default function About() {
  /*
   * The provider sits outside the component that renders the folds, so it
   * survives every re-render one of them causes. Mounted inside, every section
   * would shut again the moment another one opened.
   */
  return (
    <SectionsProvider>
      <AboutBody />
    </SectionsProvider>
  )
}
