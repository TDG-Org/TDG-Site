import { useEffect, useState } from 'react'
import { APPS, MARANATHA, TOOLS } from '../data/content'
import { STORE_APPS } from '../data/store'

/**
 * The pages this site can be showing.
 *
 * A hash route rather than a path: the site is served from GitHub Pages, where
 * a real path needs a 404.html rewrite to survive a refresh or a shared link,
 * and every existing nav item is already a hash anchor. `#/store` is
 * deliberately shaped with the slash so it can never collide with a section
 * id: `#story` and `#store` are one letter apart, and a route that ate a section
 * anchor would break the one-page scroll. Every route added since carries the
 * same leading slash for the same reason; `#/app/<slug>` also puts the slug
 * behind a segment, so no future app name can collide with a section either.
 *
 * A route may also name a PLACE on the page it opens, which is what
 * `#/store/<app>` is: the Store, landed at that app's shelf rather than at its
 * top. A link that has already said which shelf it means should not make the
 * reader find it again, so anything pointing at one thing on a long page gets
 * a route of this shape rather than a bare page hash.
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
   * The Store, and optionally the one shelf on it that was asked for. A link
   * that says "Veditor packs are in the Store" has named a place, and landing
   * the reader at the top of a page with somebody else's shelf on it makes
   * them do the finding the link already did.
   */
  | { kind: 'store'; app?: string }
  | { kind: 'dev' }
  | { kind: 'app'; slug: string }

export const ABOUT_HASH = '#/about'
export const STORE_HASH = '#/store'
export const DEV_HASH = '#/dev'

/** The hash that opens one app's own page. */
export const appHash = (slug: string) => `#/app/${slug}`

/**
 * The DOM id of one app's shelf on the Store, so the route and the page agree
 * on the target without either of them writing the string twice. The hash that
 * asks for one is `#/store/<the same id>`, written as a literal wherever a
 * page links to a shelf, the way every other in-site href on this site is.
 */
export const storeShelfId = (appId: string) => `shelf-${appId}`

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
    // A shelf we do not have still lands on the Store rather than on the home
    // page, because `#/store/banana` is unmistakably a request for the shop.
    // Only the part naming a shelf is dropped.
    return STORE_APPS.some((a) => a.id === app) ? { kind: 'store', app } : { kind: 'store' }
  }
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
  // Two Store routes naming different shelves are two different journeys, and
  // treating them as one would leave a reader who clicked the second link
  // standing at the first shelf.
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
 * The remembered hash is checked on the way back. Somebody who leaves an app
 * page by clicking Story in the nav is not returning to the list, and restoring
 * a scroll position over their anchor would drop them somewhere they did not
 * ask to be.
 */
type Origin = { hash: string; scrollY: number; label: string }

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
  origin = { hash: window.location.hash, scrollY: window.scrollY, label: from }
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
 * The scroll position to restore for `hash`, or null when the reader is not
 * returning to the place they left. Consumes the memory either way: it
 * describes one journey, and a stale one would hijack the next scroll.
 */
export function takeOrigin(hash: string): number | null {
  const from = origin
  origin = null
  if (!from) return null
  return from.hash === hash ? from.scrollY : null
}
