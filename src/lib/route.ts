import { useEffect, useState } from 'react'
import { APPS, MARANATHA, TOOLS } from '../data/content'
import { STORE_APPS } from '../data/store'

/**
 * The pages this site can be showing.
 *
 * A hash route rather than a path: the site is served from GitHub Pages, where
 * a real path needs a 404.html rewrite to survive a refresh or a shared link,
 * and every existing nav item is already a hash anchor. **Every route carries a
 * leading slash**, so it can never collide with a section id. The rule was
 * learned from one near miss: the home section used to be `#story`, one letter
 * from `#store`, and a route that ate a section anchor would break the one-page
 * scroll. That section is `#origin` now, so that particular pair cannot clash
 * any more — the rule stays exactly as it was, because what it actually buys is
 * that no section anchor added in future can collide with a route added today.
 * `#/app/<slug>` also puts the slug behind a segment, so no future app name can
 * collide with a section either.
 *
 * `#story` is not a route and never was, so it falls through to home here like
 * any other unknown fragment. Old links to it still work all the same: the hash
 * effect in App.tsx resolves that one fragment to `#origin`, without touching
 * the hash. That alias is written down at the line that does it — this is only
 * a signpost, so somebody who greps for `story` and lands here does not
 * conclude the old anchor died in the rename.
 *
 * `#/store/<app>` is that app's OWN shop page, and it used to be something
 * else: the one long Store, scrolled to that app's shelf. The shelves are gone
 * — the Store is an index of app cards now and each card opens a page of packs
 * — so the route that used to name a place on a page names a page. Nothing
 * about the hash changed, which is the point: every link written to it, here
 * and in `appPages.ts`, still lands on the same app's packs.
 *
 * `dev` is the Developer console, and it is not a secret because of this file:
 * anything the router can recognise has to be named here. What keeps it out of
 * everyone's way is that App renders HOME for it unless the signed-in account
 * is a TDG developer, the same thing `#/banana` does, and that every byte of
 * data behind it comes from `tdg_admin_*` functions that refuse a non-admin.
 * See src/dev/README.md.
 */
export type Route =
  | { kind: 'home' }
  | { kind: 'about' }
  /**
   * The signed-in account's own page: what it is, what it counts, and who may
   * see each part of it.
   *
   * **Not gated the way `dev` is, and that is the difference between the two.**
   * `#/dev` renders home for anybody who is not a developer, because a console
   * nobody should know about must answer the same thing an unknown hash does.
   * This is the opposite kind of page: it is linked from the nav on every page
   * of the site, so a signed-out reader who opens it — or who follows the link
   * somebody sent them — is told to sign in, in words, on the page they asked
   * for. Rendering home there would answer "is there something here?" with a
   * silence that is simply wrong.
   */
  | { kind: 'account' }
  /**
   * The Store: its index of app cards, or one app's own page of packs. A link
   * that says "Veditor packs are in the Store" has named an app, and it opens
   * that app's packs rather than a page with somebody else's on it too.
   */
  | { kind: 'store'; app?: string }
  | { kind: 'dev' }
  | { kind: 'app'; slug: string }

export const ABOUT_HASH = '#/about'
export const STORE_HASH = '#/store'
export const ACCOUNT_HASH = '#/account'
export const DEV_HASH = '#/dev'

/** The hash that opens one app's own page. */
export const appHash = (slug: string) => `#/app/${slug}`

/**
 * The hash that opens one app's own page of packs, the way `appHash` opens one
 * app's own page. Both exist so a component builds the route from an id rather
 * than concatenating the string itself; the two literals in `appPages.ts` stay
 * literals, because a data file writes an href the same way it writes any
 * other one.
 */
export const storeAppHash = (appId: string) => `#/store/${appId}`

/**
 * The slugs the router will accept, taken from the CARDS rather than from the
 * pages themselves. The page content is a large file and only a visitor who
 * opens one should pay to download it, so this file must not import it: see
 * the lazy import in App.tsx. Every card names its page, so the two lists
 * cannot drift without a card losing its link, which is visible immediately.
 */
const APP_SLUGS: string[] = [
  ...APPS.map((app) => app.page),
  ...TOOLS.map((tool) => tool.page),
  MARANATHA.page,
]

const HOME: Route = { kind: 'home' }

export function routeFromHash(hash: string): Route {
  const key = hash.replace(/^#/, '').replace(/^\/+/, '').toLowerCase()
  if (key === 'about') return { kind: 'about' }
  if (key === 'store') return { kind: 'store' }
  if (key.startsWith('store/')) {
    const app = key.slice(6)
    // An app we do not sell for still lands on the Store rather than on the
    // home page, because `#/store/banana` is unmistakably a request for the
    // shop. Only the part naming the app is dropped.
    return STORE_APPS.some((a) => a.id === app) ? { kind: 'store', app } : { kind: 'store' }
  }
  if (key === 'account') return { kind: 'account' }
  if (key === 'dev') return { kind: 'dev' }
  if (key.startsWith('app/')) {
    const slug = key.slice(4)
    // An app we do not have a page for behaves like `#/banana`: the home page,
    // hash untouched. A typo'd link must not render an empty shell.
    return APP_SLUGS.includes(slug) ? { kind: 'app', slug } : HOME
  }
  return HOME
}

const same = (a: Route, b: Route) => {
  if (a.kind !== b.kind) return false
  if (a.kind === 'app' && b.kind === 'app') return a.slug === b.slug
  // Two Store routes naming different apps are two different pages, and
  // treating them as one would leave a reader who clicked the second link
  // looking at the first app's packs.
  if (a.kind === 'store' && b.kind === 'store') return a.app === b.app
  return true
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))

  useEffect(() => {
    const onHash = () => {
      const next = routeFromHash(window.location.hash)
      // Keep the previous object when nothing actually changed. Clicking a
      // section anchor from the home page is a hashchange but not a route
      // change, and a fresh object would re-run every effect keyed on it.
      setRoute((prev) => (same(prev, next) ? prev : next))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return route
}

/* ── coming back ────────────────────────────────────────────────────────────
 *
 * Opening an app page from a card is a push, so the browser's own Back button
 * already returns to the home page, but it returns to the TOP of it unless
 * something puts the reader back where they were standing. That is what this
 * remembers, and the page's own Back control simply calls `history.back()`, so
 * both routes through are one code path and cannot land in different places.
 *
 * ## One journey, exactly one hop long
 *
 * This used to be consumed in ONE place — the home page's arrival — because
 * home was the only page a journey ever returned to. It is not any more: the
 * Store's index is a page you leave from a card and come back to, and an app
 * page can send you to that app's packs and be come back to in turn. A memory
 * consumed only at home outlives its journey on every one of those, and a
 * stale one is not harmless: `BackButton` reads its LABEL, so an app page
 * reached back from the Store would offer "Back to TDG Veditor" while standing
 * on TDG Veditor.
 *
 * So `arriveAt` is called on EVERY route change and the memory lives exactly
 * one hop. The first arrival after `rememberOrigin` records where the journey
 * went; arriving back at where it started restores the scroll and forgets it;
 * arriving anywhere ELSE forgets it too, because the reader has left the
 * journey rather than finished it. That last arm is what the old
 * consume-on-mismatch was buying, kept.
 */
type Origin = {
  hash: string
  scrollY: number
  label: string
  /** Where the journey went, learned on its first arrival. Null until then. */
  to: string | null
}

let origin: Origin | null = null

/**
 * Called as a card link is followed, before the hash changes.
 *
 * `from` is what the reader would call the place they are leaving, and it is
 * what the page they land on puts on its Back control. Without it the Store's
 * own cards would open an app page whose button said "Back to Apps" while
 * actually returning to the Store, which is a small lie told at the exact
 * moment somebody is trying to get back.
 */
export function rememberOrigin(from: string) {
  origin = { hash: window.location.hash, scrollY: window.scrollY, label: from, to: null }
}

/** True while there is a place on this site to go back to. */
export function hasOrigin() {
  return origin !== null
}

/** What to call that place, or null when there is no journey to name. */
export function originLabel(): string | null {
  return origin?.label ?? null
}

/**
 * Tell the memory a route change has landed on `hash`, and get back the scroll
 * position to restore — or null, which is every case but one.
 *
 * Called once per route change, from App.tsx, before anything decides where to
 * scroll. The three answers it can give are the whole of the contract above:
 * this is the journey's destination (keep it, so the page's Back control can
 * name where it came from), this is the journey's start (restore, forget), or
 * this is neither (forget).
 */
export function arriveAt(hash: string): number | null {
  const from = origin
  if (!from) return null
  if (from.hash === hash) {
    origin = null
    return from.scrollY
  }
  // The first arrival after the click is the journey's destination, and the
  // page standing there is the one that reads the label.
  if (from.to === null) {
    from.to = hash
    return null
  }
  // Somewhere else entirely. The journey is over and nobody finished it.
  origin = null
  return null
}
