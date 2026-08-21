import { useEffect, useState } from 'react'

/**
 * The pages this site can be showing.
 *
 * A hash route rather than a path: the site is served from GitHub Pages, where
 * a real path needs a 404.html rewrite to survive a refresh or a shared link,
 * and every existing nav item is already a hash anchor. `#/store` is
 * deliberately shaped with the slash so it can never collide with a section id
 * — `#story` and `#store` are one letter apart, and a route that ate a section
 * anchor would break the one-page scroll.
 *
 * `dev` is the Developer console, and it is not a secret because of this file:
 * anything the router can recognise has to be named here. What keeps it out of
 * everyone's way is that App renders HOME for it unless the signed-in account
 * is a TDG developer — the same thing `#/banana` does — and that every byte of
 * data behind it comes from `tdg_admin_*` functions that refuse a non-admin.
 * See src/dev/README.md.
 */
export type Route = 'home' | 'store' | 'dev'

export const STORE_HASH = '#/store'
export const DEV_HASH = '#/dev'

export function routeFromHash(hash: string): Route {
  const key = hash.replace(/^#/, '').replace(/^\/+/, '').toLowerCase()
  if (key === 'store') return 'store'
  if (key === 'dev') return 'dev'
  return 'home'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return route
}
