import { useEffect, useState } from 'react'

/**
 * The two things this site can be showing.
 *
 * A hash route rather than a path: the site is served from GitHub Pages, where
 * a real path needs a 404.html rewrite to survive a refresh or a shared link,
 * and every existing nav item is already a hash anchor. `#/store` is
 * deliberately shaped with the slash so it can never collide with a section id
 * — `#story` and `#store` are one letter apart, and a route that ate a section
 * anchor would break the one-page scroll.
 */
export type Route = 'home' | 'store'

export const STORE_HASH = '#/store'

export function routeFromHash(hash: string): Route {
  return hash.replace(/^#/, '').replace(/^\/+/, '').toLowerCase() === 'store' ? 'store' : 'home'
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
