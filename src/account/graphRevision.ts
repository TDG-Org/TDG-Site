import { useSyncExternalStore } from 'react'

/**
 * One number that goes up every time this account's social graph changes.
 *
 * ## What it is for, and the bug it ends
 *
 * Three surfaces draw facts derived from the graph, and each reads them for
 * itself: the Account page's counters (`useAccountStats`), the account menu in
 * the nav (a SECOND `useAccountStats`, in a component that knows nothing about
 * the page), and the Find People directory (`usePeopleSearch`). Only the four
 * lists themselves go through `useSocial`, which re-reads on every press.
 *
 * So a press moved one list and left the rest of the screen saying what was
 * true a moment ago — all of it visible at once, all of it wrong together.
 * Driven and measured on 2026-08-28: unfriending somebody from the Friends
 * list left them in the search results above it still chipped **Friend**, with
 * Unfriend and Block under their name; blocking somebody from the search
 * results left them **unchipped** in that same list; and the tiles above both
 * — and the nav's glance — went on printing a friend count from before the
 * press. A panel contradicting itself in three places is not a stale cache, it
 * is a page that looks broken.
 *
 * ## Why a module-level store rather than a prop
 *
 * The nav's account menu is not inside the Account page and never will be, so
 * there is no prop to thread and no common parent to hold state on. This site
 * has no state library on purpose (AGENTS.md §1), and it does not need one for
 * a counter: `useSyncExternalStore` is React's own answer for reading a value
 * that lives outside React, and it is twenty lines with no dependency.
 *
 * ## What bumps it, and what deliberately does not
 *
 * **Only an action that can change a STANDING or a COUNT**, and only once the
 * server has answered and the graph has been read back — bumping on the press
 * would send every reader off to fetch a world that has not changed yet, which
 * is exactly the too-early re-read this replaced.
 *
 * `tdg_set_favorite` does not bump it. A star changes no standing, no counter
 * and nothing any other surface draws, so a re-read of the counters and the
 * whole directory for one would be two round trips spent to redraw the same
 * numbers.
 */

let revision = 0
const listeners = new Set<() => void>()

/**
 * Say that the graph has moved. Called after a verb has landed AND the graph
 * has been re-read, never at the press.
 */
export function graphChanged(): void {
  revision += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const read = (): number => revision

/**
 * The current revision, as a value a component re-renders on.
 *
 * Both arguments to `useSyncExternalStore` past the first are the same
 * function on purpose: there is no server render on this site, and a separate
 * server snapshot would be a second source for one number.
 */
export function useGraphRevision(): number {
  return useSyncExternalStore(subscribe, read, read)
}
