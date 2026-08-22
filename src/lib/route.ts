import { useEffect, useState } from 'react'
import { APPS, MARANATHA, TOOLS } from '../data/content'

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
  | { kind: 'store' }
  | { kind: 'dev' }
  | { kind: 'app'; slug: string }

export const ABOUT_HASH = '#/about'
export const STORE_HASH = '#/store'
export const DEV_HASH = '#/dev'

/** The hash that opens one app's own page. */
export const appHash = (slug: string) => `#/app/${slug}`

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
  if (key === 'dev') return { kind: 'dev' }
  if (key.startsWith('app/')) {
    const slug = key.slice(4)
    // An app we do not have a page for behaves like `#/banana`: the home page,
    // hash untouched. A typo'd link must not render an empty shell.
    return APP_SLUGS.includes(slug) ? { kind: 'app', slug } : HOME
  }
  return HOME
}

const same = (a: Route, b: Route) =>
  a.kind === b.kind && (a.kind !== 'app' || b.kind !== 'app' || a.slug === b.slug)

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
type Origin = { hash: string; scrollY: number }

let origin: Origin | null = null

/** Called as a card link is followed, before the hash changes. */
export function rememberOrigin() {
  origin = { hash: window.location.hash, scrollY: window.scrollY }
}

/** True while there is a place on this site to go back to. */
export function hasOrigin() {
  return origin !== null
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
