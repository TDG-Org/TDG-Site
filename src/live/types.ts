/**
 * The shapes for what this site can learn about its own products at runtime.
 *
 * `src/data/` is what we SAY about a product; this folder is what GitHub can
 * CONFIRM about one — that its repository exists in the org, that a deploy of
 * it is live, where that deploy answers. The two never fight: hand-written
 * data always wins, and everything here only upgrades a card whose data has
 * nothing better to offer than a status caption. See `README.md` beside this
 * file for the whole argument.
 */

/** One repository, as the GitHub API describes it. Only the fields this site
 *  reads — the API sends about ninety more and none of them are wanted. */
export type OrgRepo = {
  /** Exact case, the way GitHub spells it: `Bible-Educator`. */
  name: string
  description: string | null
  /**
   * The repo's own Website field, verbatim, or null. An empty string is
   * normalised to null on the way in: GitHub sends `""` for a field somebody
   * cleared, and an empty href is a link to the page you are already on.
   */
  homepage: string | null
  /** Does GitHub Pages serve a site for this repo? */
  hasPages: boolean
  /** Lowercase, GitHub enforces that. `tdg-app` is the one this site reads. */
  topics: string[]
  archived: boolean
  fork: boolean
  language: string | null
  htmlUrl: string
}

/**
 * Three states, and "could not read" is one of them — the same shape as
 * `badges/useBadges.ts`, for the same reason. `ok` with an empty list is a
 * real answer (an org with nothing public); `error` is the different fact
 * that we were not told, and a caller must not render it as an empty org.
 */
export type OrgReposState =
  | { kind: 'checking' }
  | { kind: 'error' }
  | { kind: 'ok'; repos: OrgRepo[] }

/**
 * A real, working way in to a product, discovered at runtime.
 *
 * The same `{ href, label }` shape as a card's hand-written `download`, on
 * purpose: the component that renders one renders the other, so the two can
 * never drift apart visually.
 */
export type LiveAccess = {
  href: string
  /** Title Case, it is a button: `Open Bible Educator`, `Download Makullveny`. */
  label: string
}

/**
 * What the deploy probe can say about one repo name. Three answers, because
 * a 404 is two different sentences depending on history: `absent` has never
 * been seen answering (the card honestly says Coming soon), `down` WAS
 * answering and has stopped (the card says temporarily unavailable — telling
 * somebody who used it yesterday that it never existed is a lie by
 * omission). The history lives server-side, in the `tdg_site_deploys_seen`
 * table behind the `tdg-site-deploys` function, so every visitor reads one
 * truth.
 */
export type DeployAnswer = 'live' | 'down' | 'absent'

/**
 * What `useLiveAccess` hands a card: a working way in, the fact that the
 * usual way in has stopped answering, or null for "nothing to add" — which
 * covers both "never shipped" and "could not ask", because the two render
 * identically as the hand-written status quo.
 */
export type LiveState = ({ kind: 'live' } & LiveAccess) | { kind: 'down' }

/**
 * A public org repository that asked for a card — the `tdg-app` topic — and
 * that no hand-written card claims. Everything on it is derived from the
 * repository itself, which is the point: it is the face an app gets between
 * the day it exists and the day somebody writes its real entry in
 * `src/data/content.ts`.
 */
export type DiscoveredApp = {
  /** The repository's own name, exact case. */
  name: string
  /**
   * The number on the card's badge, continuing the site's one running
   * sequence (apps `01`–`06`, tools `07`–`09`, so discoveries start at `10`).
   * Derived from the static lists' own maximum rather than typed, so a tenth
   * hand-written card renumbers these without anybody remembering they exist.
   */
  index: string
  /** Title Case, derived from the name: `bible-quiz` → `Bible Quiz`. */
  title: string
  /** The repo's description, or the honest line for not having written one. */
  copy: string
  /** Built from the repo's state, in the site's own chip vocabulary. */
  chips: { label: string; hot?: boolean }[]
  /** Where the whole card goes: the live site when there is one, else the repo. */
  href: string
  /** The card's action link. Null when nothing is deployed yet. */
  access: LiveAccess | null
  repoUrl: string
}
