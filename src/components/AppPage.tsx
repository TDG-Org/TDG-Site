import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { SectionsProvider } from '../lib/sections'
import { asset } from '../lib/asset'
import { BackButton, Fold, FoldControls } from './Folded'
import { AppIcon } from './AppIcon'
import {
  chipsForPage,
  iconForPage,
  pageForSlug,
  shotForPage,
  type AppPage as AppPageData,
} from '../data/appPages'
import './AppPage.css'

/**
 * One app's own page.
 *
 * It knows nothing about any particular app: everything a reader sees comes
 * from `src/data/appPages.ts`, so adding an app is a content edit and fixing a
 * line of a guide is one string. The folding and the blocks are `Folded.tsx`,
 * shared with the About page, over the Developer console's own open/closed
 * state in `src/lib/sections.tsx`: nobody reading this site should have to
 * learn a second idea about how a long page opens.
 *
 * Everything starts shut. Each closed row carries its title, one line saying
 * what is inside it, and a tag, so a page that has not been opened still reads
 * as an index rather than as ten mystery headings.
 */

function AppPageBody({ page }: { page: AppPageData }) {
  const blob = useParallax<HTMLDivElement>(-0.12)
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const art = useReveal<HTMLDivElement>('scale', 1)

  const shot = shotForPage(page.slug)
  const chips = chipsForPage(page.slug)
  const icon = iconForPage(page.slug)

  return (
    <section id="top" className="section section--blend appview">
      <div className="texture appview__grid" aria-hidden="true" />
      <div ref={blob} className="blob appview__blob" aria-hidden="true" />

      <div className="shell appview__shell">
        <BackButton fallbackLabel={page.backLabel} fallbackHash={page.backHash} />

        <div ref={head} className="appview__head">
          <div className="kicker">
            <span className="kicker__num">{page.index}</span>
            <span className="kicker__rule" />
            <span className="kicker__label">{page.group}</span>
          </div>
          <h1 className="h2 appview__title">
            {icon && <AppIcon icon={icon.icon} shape={icon.shape} className="appview__title-icon" />}
            {page.title}
          </h1>
          <p className="lede appview__lede">{page.lede}</p>
          <p className="appview__intro">{page.intro}</p>

          {chips.length > 0 && (
            <div className="chips appview__chips">
              {chips.map((chip) => (
                <span key={chip.label} className={chip.hot ? 'chip chip--hot' : 'chip'}>
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          <dl className="appview__glance">
            {page.facts.map((fact) => (
              <div key={fact.label} className="appview__glance-row">
                <dt className="appview__glance-label">{fact.label}</dt>
                <dd className="appview__glance-value">{fact.value}</dd>
              </div>
            ))}
          </dl>

          {page.links && page.links.length > 0 && (
            <div className="appview__links">
              {page.links.map((link) =>
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
          )}
        </div>

        {shot && (
          <div ref={art} className="appview__art">
            <picture>
              <source
                type="image/avif"
                sizes="(max-width: 900px) calc(100vw - 2 * clamp(18px, 4vw, 40px)), 860px"
                srcSet={shot.widths.map((w) => `${asset(`shots/${shot.slug}-${w}.avif`)} ${w}w`).join(', ')}
              />
              <source
                type="image/webp"
                sizes="(max-width: 900px) calc(100vw - 2 * clamp(18px, 4vw, 40px)), 860px"
                srcSet={shot.widths.map((w) => `${asset(`shots/${shot.slug}-${w}.webp`)} ${w}w`).join(', ')}
              />
              <img
                className="appview__art-img"
                src={asset(`shots/${shot.slug}-${shot.widths[0]}.webp`)}
                alt={shot.alt}
                width={shot.widths[0]}
                height={Math.round((shot.widths[0] / 16) * 10)}
                loading="lazy"
                decoding="async"
                style={shot.position ? { objectPosition: shot.position } : undefined}
              />
            </picture>
          </div>
        )}

        <FoldControls />

        <div className="appview__folds">
          {page.sections.map((section) => (
            <Fold key={section.id} section={section} prefix="app-sec" />
          ))}
        </div>

        <div className="appview__foot">
          <BackButton fallbackLabel={page.backLabel} fallbackHash={page.backHash} tone="quiet" />
        </div>
      </div>
    </section>
  )
}

export default function AppPage({ slug }: { slug: string }) {
  const page = pageForSlug(slug)

  /*
   * The router accepts a slug because a CARD names it, so a card whose page
   * has not been written yet lands here. Saying so is the only honest answer:
   * a blank screen reads as a broken site, and a redirect reads as a link that
   * never existed.
   */
  if (!page) {
    return (
      <section id="top" className="section section--blend appview">
        <div className="shell appview__shell">
          <button type="button" className="appview__back" onClick={() => window.history.back()}>
            <span className="appview__back-arrow" aria-hidden="true">
              ←
            </span>
            Back
          </button>
          <div className="appview__head">
            <h1 className="h2 appview__title">Not written yet</h1>
            <p className="lede appview__lede">
              This one does not have its page yet. Everything else is one click back.
            </p>
          </div>
        </div>
      </section>
    )
  }

  /*
   * The provider sits outside the component that renders the folds, so it
   * survives every re-render one of them causes. Mounted inside, every section
   * would shut again the moment another one opened.
   */
  return (
    <SectionsProvider>
      <AppPageBody page={page} />
    </SectionsProvider>
  )
}
