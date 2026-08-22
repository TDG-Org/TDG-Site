/**
 * The blocks a folded page is built out of, shared by every page that folds.
 *
 * `appPages.ts` and `about.ts` both write content in this vocabulary, and
 * `components/Folded.tsx` draws it. Keeping the set small is the point: a page
 * is content in a shape somebody can add to without opening a component, and a
 * block type per paragraph would end that immediately.
 */

export type PageBlock =
  /** A paragraph. */
  | { kind: 'text'; text: string }
  /** A numbered walkthrough. */
  | { kind: 'steps'; steps: { title: string; text: string }[] }
  /**
   * A list of things it can do, each with a real explanation beside it.
   * `soon: true` marks something that is not built yet, and the row says so.
   */
  | { kind: 'features'; items: { name: string; text: string; soon?: boolean }[] }
  /** A label/value table, for the facts a list of prose would bury. */
  | { kind: 'facts'; items: { label: string; value: string }[] }
  /** A question somebody actually asks, and the answer. */
  | { kind: 'qa'; items: { q: string; a: string }[] }
  /**
   * A row of pointers to somewhere else on the site, one line each. The About
   * page's run through the apps is this: enough to recognise the one you want,
   * and a link to the page that has the detail, so the same sentences are not
   * written in two places.
   */
  | { kind: 'signpost'; items: { name: string; text: string; href: string }[] }
  /** One sentence that needs to stand apart, usually a limit or a warning. */
  | { kind: 'note'; text: string }

export type PageSection = {
  /** Stable id. Used for the open/closed register and the region's DOM id. */
  id: string
  title: string
  /** The one line the closed row carries. */
  what: string
  /** The tag on the right of the closed row. */
  tag?: string
  blocks: PageBlock[]
}

export type PageLink = {
  label: string
  href: string
  /** Off this site. Opens in a new tab and says so to a screen reader. */
  external?: boolean
}
