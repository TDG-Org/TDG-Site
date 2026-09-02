import { useEffect, type ReactNode } from 'react'
import { sectionDomId, useSections } from '../lib/sections'

/**
 * One section of the Account page, open or shut.
 *
 * ## Why this is not `Folded.tsx`'s `Fold`
 *
 * That one takes a `PageSection` and renders its `blocks` — a vocabulary of
 * prose written in `src/data/`, which is exactly right for an app page and
 * cannot express a form, a segmented control or a list of people with buttons
 * on them. So this is the same ROW with arbitrary children under it: the same
 * `.fold` classes from `AppPage.css`, the same chevron, the same 0fr→1fr grid
 * region, the same register with `useSections` so Expand All and Collapse All
 * reach it without being told it exists.
 *
 * Sharing the stylesheet rather than copying it is the point. A second set of
 * lookalike collapsible rows is how two surfaces that should feel identical
 * start drifting, and this page opens from the same chrome as the pages that
 * already have them.
 *
 * ## The chevron is drawn here
 *
 * `Folded.tsx`'s is module-private, and this repo's rule is that icons are
 * inline SVG written where they are used (AGENTS.md §5). Both carry
 * `aria-hidden` AND `focusable="false"` on the element itself, which is the
 * pair `CrossGlyph.tsx` counts.
 *
 * ## A shut row still answers for itself
 *
 * `what` is not a subtitle, it is the reason the page is readable while
 * everything is closed — `src/lib/sections.tsx` says every closed row carries
 * a line saying what is inside it, and a section that says nothing while shut
 * is a bug. `count` is the second half of that for the sections whose answer
 * is a number: how many friends, how many badges. Somebody scanning a
 * collapsed page should be able to tell which section is worth opening.
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
      aria-hidden="true"
      focusable="false"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export function AccountFold({
  id,
  title,
  what,
  /**
   * The one figure worth seeing without opening the section, as a `.chip` on
   * the row. A string, not a number: some sections' answer is `2 of 6`, and
   * one that has nothing to count passes nothing rather than a zero.
   */
  count,
  children,
}: {
  id: string
  title: ReactNode
  what: string
  count?: string
  children: ReactNode
}) {
  const { isOpen, toggle, register } = useSections()
  useEffect(() => register(id), [register, id])

  const open = isOpen(id)
  const regionId = sectionDomId(id, 'account')

  return (
    <section className="fold acct__fold" data-open={open || undefined}>
      {/* The button is inside the heading rather than around it, so the section
          still has a heading in the document outline while it is shut. */}
      <h2 className="fold__heading">
        <button
          type="button"
          className="fold__head"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => toggle(id)}
        >
          <span className="fold__chevron" aria-hidden="true">
            <Chevron />
          </span>
          <span className="fold__titles">
            <span className="fold__title">{title}</span>
            <span className="fold__what">{what}</span>
          </span>
          {count && <span className="chip fold__tag">{count}</span>}
        </button>
      </h2>

      {/* A 0fr to 1fr grid row rather than a measured max-height: what is
          inside is a form and a list whose height depends on the width it is
          read at, and a measured height would be wrong on the next resize.
          `inert` is what keeps a shut section's inputs and buttons out of the
          tab order — hiding it with a height alone would leave a closed page
          holding forty invisible focus stops. */}
      <div className="fold__region" id={regionId} inert={!open}>
        <div className="fold__region-inner">
          <div className="fold__body acct__fold-body">{children}</div>
        </div>
      </div>
    </section>
  )
}

/**
 * A heading inside a section, for the two that hold more than one thing.
 *
 * `h3`, because the section it sits in is an `h2` — the outline has to say
 * that Streaks is part of Your Stats rather than a seventh section of the
 * page.
 */
export function AccountSub({
  title,
  what,
  children,
}: {
  title: string
  what?: string
  children: ReactNode
}) {
  return (
    <section className="acct__sub">
      <h3 className="acct__sub-title">{title}</h3>
      {what && <p className="acct__sub-what">{what}</p>}
      {children}
    </section>
  )
}
