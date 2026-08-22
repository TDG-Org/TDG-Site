import { useEffect } from 'react'
import { sectionDomId, useSections } from '../lib/sections'
import { hasOrigin, originLabel } from '../lib/route'
import type { PageBlock, PageSection } from '../data/pageBlocks'
// One stylesheet for both folded pages. It is still named for the app pages
// because that is where it was written and renaming a file another branch is
// editing costs more than the tidier name is worth; every rule in it that
// starts `.fold` or draws a block is shared, and About adds only its own
// chrome on top.
import './AppPage.css'

/**
 * The folding, and the blocks inside it.
 *
 * Shared by the app pages and the About page so the two cannot drift into
 * different ideas of what a section looks like or how it opens. The behaviour
 * is the Developer console's, through the same state in `src/lib/sections.tsx`:
 * every section starts shut, each closed row carries its title, one line saying
 * what is inside it and a tag, and Expand All reaches every section on screen.
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

export function Block({ block }: { block: PageBlock }) {
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

  if (block.kind === 'qa') {
    /* A description list, because that is what a Q&A is: the question is the
       term and the answer is its description. A screen reader then announces
       the pairing rather than a run of unrelated paragraphs. */
    return (
      <dl className="appview__qa">
        {block.items.map((item) => (
          <div key={item.q} className="appview__qa-item">
            <dt className="appview__qa-q">{item.q}</dt>
            <dd className="appview__qa-a">{item.a}</dd>
          </div>
        ))}
      </dl>
    )
  }

  if (block.kind === 'signpost') {
    return (
      <ul className="appview__signposts">
        {block.items.map((item) => (
          <li key={item.href} className="appview__signpost">
            <a className="appview__signpost-link" href={item.href}>
              {item.name}
              <span className="appview__signpost-arrow" aria-hidden="true">
                →
              </span>
            </a>
            <span className="appview__signpost-text">{item.text}</span>
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

export function Fold({
  section,
  prefix,
  level = 2,
}: {
  section: PageSection
  prefix: string
  /**
   * The heading level for this row, so the outline nests where the page puts
   * it. The app pages open on an `h1` and these are their sections, so 2 is
   * the default; on the Store they sit under a heading of their own inside a
   * page whose title is already an `h2`, and a row that announced itself as a
   * top-level section there would be lying about where it is.
   */
  level?: 2 | 3 | 4
}) {
  const { isOpen, toggle, register } = useSections()
  useEffect(() => register(section.id), [register, section.id])

  const open = isOpen(section.id)
  const regionId = sectionDomId(section.id, prefix)
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4'

  return (
    <section className="fold" data-open={open || undefined}>
      {/* The button is inside the heading rather than around it, so the section
          still has a heading in the document outline while it is shut. */}
      <Heading className="fold__heading">
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
      </Heading>

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

export function FoldControls() {
  const { expandAll, collapseAll, openCount, total } = useSections()

  return (
    <div className="appview__controls">
      <p className="appview__controls-count">
        {openCount === 0 ? `${total} sections, all closed` : `${openCount} of ${total} sections open`}
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

/**
 * The way back, and the only one either page needs.
 *
 * Arriving here from a card, or from a link that remembered where it was,
 * pushed a history entry, so going back is exactly what the browser's own Back
 * button does. Routing this through `history.back()` is what stops the two
 * landing in different places. A page opened cold, from a shared link, has
 * nothing behind it on this site, and goes to `fallbackHash` instead.
 */
export function BackButton({
  fallbackLabel,
  fallbackHash,
  tone,
}: {
  /** Where Back goes when this page was opened cold, and what to call it. */
  fallbackLabel: string
  fallbackHash: string
  tone?: 'quiet'
}) {
  // The place the reader actually came from, when they came from one. Read at
  // render because it is set before this page mounts and cannot change while
  // it is on screen.
  const where = originLabel() ?? fallbackLabel

  const goBack = () => {
    if (hasOrigin()) window.history.back()
    else window.location.hash = fallbackHash
  }

  return (
    <button type="button" className="appview__back" data-tone={tone} onClick={goBack}>
      <span className="appview__back-arrow" aria-hidden="true">
        ←
      </span>
      Back to {where}
    </button>
  )
}
