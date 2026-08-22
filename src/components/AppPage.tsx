import { useEffect } from 'react'
import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { SectionsProvider, sectionDomId, useSections } from '../lib/sections'
import { hasOrigin } from '../lib/route'
import { asset } from '../lib/asset'
import {
  chipsForPage,
  pageForSlug,
  shotForPage,
  type AppPage as AppPageData,
  type PageBlock,
  type PageSection,
} from '../data/appPages'
import './AppPage.css'

/**
 * One app's own page.
 *
 * It knows nothing about any particular app: everything a reader sees comes
 * from `src/data/appPages.ts`, so adding an app is a content edit and fixing a
 * line of a guide is one string. The folding is the Developer console's, from
 * `src/lib/sections.tsx`, because a reader should not have to learn a second
 * idea about how a long page opens.
 *
 * Everything starts shut. Each closed row carries its title, one line saying
 * what is inside it, and a tag, so a page that has not been opened still reads
 * as an index rather than as ten mystery headings.
 */

function Chevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function Block({ block }: { block: PageBlock }) {
  if (block.kind === 'text') return <p className="appview__text">{block.text}</p>

  if (block.kind === 'note') {
    return (
      <p className="appview__note">
        <span className="appview__note-mark" aria-hidden="true">
          !
        </span>
        {block.text}
      </p>
    )
  }

  if (block.kind === 'steps') {
    return (
      <ol className="appview__steps">
        {block.steps.map((step, i) => (
          <li key={step.title} className="appview__step">
            <span className="badge appview__step-num" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="appview__step-text">
              <strong className="appview__step-title">{step.title}</strong>
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    )
  }

  if (block.kind === 'features') {
    return (
      <ul className="appview__features">
        {block.items.map((item) => (
          <li key={item.name} className="appview__feature" data-soon={item.soon || undefined}>
            <span className="appview__feature-head">
              <strong className="appview__feature-name">{item.name}</strong>
              {/* Said in the word the reader asked for. A planned feature that
                  reads like a shipped one is the one lie this site cannot tell. */}
              {item.soon && <span className="chip appview__soon">COMING</span>}
            </span>
            <span className="appview__feature-text">{item.text}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <dl className="appview__facts">
      {block.items.map((fact) => (
        <div key={fact.label} className="appview__fact">
          <dt className="appview__fact-label">{fact.label}</dt>
          <dd className="appview__fact-value">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Fold({ section }: { section: PageSection }) {
  const { isOpen, toggle, register } = useSections()
  useEffect(() => register(section.id), [register, section.id])

  const open = isOpen(section.id)
  const regionId = sectionDomId(section.id, 'app-sec')

  return (
    <section className="fold" data-open={open || undefined}>
      {/* The button is inside the heading rather than around it, so the section
          still has a heading in the document outline while it is shut. */}
      <h2 className="fold__heading">
        <button
          type="button"
          className="fold__head"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => toggle(section.id)}
        >
          <span className="fold__chevron" aria-hidden="true">
            <Chevron />
          </span>
          <span className="fold__titles">
            <span className="fold__title">{section.title}</span>
            <span className="fold__what">{section.what}</span>
          </span>
          {section.tag && <span className="chip fold__tag">{section.tag}</span>}
        </button>
      </h2>

      {/* A 0fr to 1fr grid row rather than a measured max-height: what is inside
          is prose whose height depends on the width it is read at, and a
          measured height would be wrong on the next resize. */}
      <div className="fold__region" id={regionId} inert={!open}>
        <div className="fold__region-inner">
          <div className="fold__body">
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function FoldControls() {
  const { expandAll, collapseAll, openCount, total } = useSections()

  return (
    <div className="appview__controls">
      <p className="appview__controls-count">
        {openCount === 0
          ? `${total} sections, all closed`
          : `${openCount} of ${total} sections open`}
      </p>
      <div className="appview__controls-btns">
        <button type="button" className="appview__ghost" onClick={expandAll}>
          Expand All
        </button>
        <button type="button" className="appview__ghost" onClick={collapseAll}>
          Collapse All
        </button>
      </div>
    </div>
  )
}

function BackButton({ page, tone }: { page: AppPageData; tone?: 'quiet' }) {
  /*
   * One control, one behaviour, whichever way the reader arrived.
   *
   * Opening the page from a card pushed a history entry, so going back is
   * exactly what the browser's own Back button does, and routing this through
   * `history.back()` is what stops the two landing in different places. Only a
   * page opened cold, from a shared link, has nothing behind it; that one goes
   * to the list the card lives in.
   */
  const goBack = () => {
    if (hasOrigin()) window.history.back()
    else window.location.hash = page.backHash
  }

  return (
    <button type="button" className="appview__back" data-tone={tone} onClick={goBack}>
      <span className="appview__back-arrow" aria-hidden="true">
        ←
      </span>
      Back to {page.backLabel}
    </button>
  )
}

function AppPageBody({ page }: { page: AppPageData }) {
  const blob = useParallax<HTMLDivElement>(-0.12)
  const head = useReveal<HTMLDivElement>('wipe', 0)
  const art = useReveal<HTMLDivElement>('scale', 1)

  const shot = shotForPage(page.slug)
  const chips = chipsForPage(page.slug)

  return (
    <section id="top" className="section section--blend appview">
      <div className="texture appview__grid" aria-hidden="true" />
      <div ref={blob} className="blob appview__blob" aria-hidden="true" />

      <div className="shell appview__shell">
        <BackButton page={page} />

        <div ref={head} className="appview__head">
          <div className="kicker">
            <span className="kicker__num">{page.index}</span>
            <span className="kicker__rule" />
            <span className="kicker__label">{page.group}</span>
          </div>
          <h1 className="h2 appview__title">{page.title}</h1>
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
            <Fold key={section.id} section={section} />
          ))}
        </div>

        <div className="appview__foot">
          <BackButton page={page} tone="quiet" />
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
