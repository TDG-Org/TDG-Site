import { useParallax } from '../hooks/useParallax'
import { useReveal } from '../hooks/useReveal'
import { SectionsProvider } from '../lib/sections'
import { asset } from '../lib/asset'
import { rememberOrigin, storeAppHash } from '../lib/route'
import { STORE_APPS } from '../data/store'
import { shotHeight } from '../data/content'
import { BackButton, Fold, FoldControls, OnwardButton, PageNav } from './Folded'
import { AppIcon } from './AppIcon'
import type { AppPage as AppPageData } from '../data/appPages'
import { chipsFor, iconFor, shotFor } from '../content/resolve'
import { resolvePage } from '../content/resolvePage'
import { useSiteContent } from '../content/store'
import { DOWN_WORDING, liveRepoForPage, useLiveAccess } from '../live/useLive'
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

  /* All three come from this product's own CARD, which the Content tab at
     `#/dev` can rename, re-cover or re-chip. Reading the live document rather
     than the built-in card is what stops this page printing the words the site
     stopped saying an hour ago. See src/content/README.md. */
  const doc = useSiteContent()
  const shot = shotFor(doc, page.slug)
  const chips = chipsFor(doc, page.slug)
  const icon = iconFor(doc, page.slug)

  /* The runtime deploy check the card runs, run here too, so the page and the
     card can never disagree about whether the app is live — or about a site
     that WAS live and has stopped answering, which renders here as the same
     `Temporarily unavailable` the card carries, in the row where its link
     would have stood. `liveRepoForPage` answers nothing for a product whose
     card already carries a hand-written way in — and the dedupe below keeps
     the derived link out when the page's own `links` already name the same
     destination. See src/live/README.md. */
  /* A fact is only worth a cell if it SAYS something. The Content tab can
     rewrite this strip, and a row with an empty side is a labelled blank on
     the page, so the empty ones are dropped here and a page left with none
     prints no strip at all rather than an empty bordered box. */
  const facts = page.facts.filter((f) => f.label.trim() !== '' && f.value.trim() !== '')

  const ask = liveRepoForPage(doc, page.slug)
  const live = useLiveAccess(ask.repo, page.title, ask.verb)
  const liveDown = live?.kind === 'down'

  /* ── the way on, DERIVED (rule 17) ───────────────────────────────────────
     Does this app sell anything? The catalogue answers, matched on the page
     the Store's own card already names, so an app added to `STORE_APPS`
     tomorrow gets its control here without anybody editing this file or that
     app's prose. It used to be a hand-typed line in `links` on exactly two
     pages, which is the shape rule 17 exists to stop: a third app would have
     shipped with a shop nothing on its page pointed at, and the failure would
     have been silent. */
  const shop = STORE_APPS.find((a) => a.page === page.slug) ?? null
  const shopHash = shop ? storeAppHash(shop.id) : null
  const shopLabel = shop
    ? shop.packs.length === 1
      ? 'See the pack in the Store'
      : 'See the packs in the Store'
    : null

  /* A link the overlay or the data file still writes by hand to the place the
     control above already goes is dropped, not drawn twice — the same dedupe
     the live link does one line down. The two built-in ones went with this
     edit; a stored document written before it can still carry one. */
  const links = (page.links ?? []).filter((l) => l.href !== shopHash)
  const liveLink =
    live?.kind === 'live' && !links.some((l) => l.href === live.href) ? live : null

  return (
    <section id="top" className="section section--blend appview">
      <div className="texture appview__grid" aria-hidden="true" />
      <div ref={blob} className="blob appview__blob" aria-hidden="true" />

      <div className="shell appview__shell">
        <PageNav>
          <BackButton fallbackLabel={page.backLabel} fallbackHash={page.backHash} />
          {shopHash && shopLabel && (
            <OnwardButton href={shopHash} label={shopLabel} from={page.title} />
          )}
        </PageNav>

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

          {facts.length > 0 && (
            <dl className="appview__glance">
              {facts.map((fact) => (
                <div key={fact.label} className="appview__glance-row">
                  <dt className="appview__glance-label">{fact.label}</dt>
                  <dd className="appview__glance-value">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {(links.length > 0 || liveLink || liveDown) && (
            <div className="appview__links">
              {links.map((link) =>
                link.external ? (
                  <a
                    key={link.href}
                    className="appview__link"
                    href={link.href}
                    target="_blank"
                    rel="noopener"
                  >
                    {link.label}
                    {/* Said to a screen reader, which cannot see `target`:
                        a link that leaves the tab without warning is the one
                        `pageBlocks.ts` promises "says so". */}
                    <span className="sr-only"> (opens in a new tab)</span>
                    <span className="appview__link-arrow" aria-hidden="true">
                      →
                    </span>
                  </a>
                ) : (
                  /* An in-site link is a journey, so it says where it started.
                     Every one of these today points at that app's packs in the
                     Store, and without this the page they open would offer
                     "Back to Apps" — the label of whatever journey opened THIS
                     page — while actually returning here. See lib/route.ts. */
                  <a
                    key={link.href}
                    className="appview__link"
                    href={link.href}
                    onClick={() => rememberOrigin(page.title)}
                  >
                    {link.label}
                    <span className="appview__link-arrow" aria-hidden="true">
                      →
                    </span>
                  </a>
                ),
              )}
              {liveLink && (
                <a
                  className="appview__link"
                  href={liveLink.href}
                  target="_blank"
                  rel="noopener"
                >
                  {liveLink.label}
                  <span className="appview__link-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              )}
              {liveDown && (
                /* The link's own pill, muted and inert: the state stands
                   exactly where the way in stands when there is one, so its
                   absence is announced rather than silent. */
                <span className="appview__link appview__link--down">{DOWN_WORDING}</span>
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
                height={shotHeight(shot, shot.widths[0])}
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
          <PageNav>
            <BackButton fallbackLabel={page.backLabel} fallbackHash={page.backHash} tone="quiet" />
            {shopHash && shopLabel && (
              <OnwardButton href={shopHash} label={shopLabel} from={page.title} tone="quiet" />
            )}
          </PageNav>
        </div>
      </div>
    </section>
  )
}

export default function AppPage({ slug }: { slug: string }) {
  const page = resolvePage(useSiteContent(), slug)

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
