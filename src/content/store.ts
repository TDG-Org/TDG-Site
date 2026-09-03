import { useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import { EMPTY_DOC, parseDoc, type SiteContentDoc } from './types'

/**
 * The one copy of the site-content overlay this tab holds, and how a component
 * reads it.
 *
 * ## Why a module store and not a provider
 *
 * Four surfaces need it — the Apps grid, the Tools grid, the Games panel and
 * whichever product page is open — and they are in three different lazy chunks.
 * A context would have to be mounted in `App.tsx` above all of them and
 * threaded through two `Suspense` boundaries to be read inside a chunk that has
 * not loaded yet. An external store is read where it is needed and fetched the
 * first time anything subscribes, so a visitor who never scrolls past the hero
 * still makes the request once and a visitor who opens a page deep-linked makes
 * it exactly once too.
 *
 * ## Why there is a localStorage cache
 *
 * The overlay decides which cards EXIST. Painting the built-in six and then
 * removing one when the fetch lands is a card that visibly appears and
 * vanishes, which reads as a bug rather than as a page loading — and it would
 * happen on every visit, to everybody, for the whole life of the feature. So
 * the last document this browser saw is written to `localStorage` and read back
 * synchronously on boot, before the first paint, and the network answer
 * replaces it when it arrives. A returning visitor sees the right grid
 * immediately; a first-time visitor sees the built-in grid for one round trip,
 * which is the one case that cannot be avoided without blocking the render.
 *
 * `localStorage` rather than `sessionStorage`, deliberately, and it is the
 * opposite choice from `dev/viewState.ts`: that file remembers where somebody
 * was standing and should forget it tomorrow, this one remembers what the site
 * SAYS and should still know it next week.
 *
 * ## What happens when the read fails
 *
 * The built-in copy, which is a complete and correct site. A visitor with no
 * connection to tdg-core, a blocked request, or an outage sees exactly what the
 * repo ships. That is the whole reason `src/data/` is still the source and this
 * is an overlay on top of it rather than the other way round.
 */

const CACHE_KEY = 'tdg.site.content.v1'

type Phase = 'cold' | 'loading' | 'ready' | 'error'

function readCache(): SiteContentDoc {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? parseDoc(JSON.parse(raw)) : EMPTY_DOC
  } catch {
    // Private mode, a blocked store, a half-written value. None of it is a
    // reason for the home page to fail to render.
    return EMPTY_DOC
  }
}

function writeCache(raw: unknown) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(raw))
  } catch {
    /* Over quota or blocked; this tab is still correct, the next boot is slow. */
  }
}

let doc: SiteContentDoc = readCache()
let phase: Phase = 'cold'
let failure: string | null = null

const listeners = new Set<() => void>()

function announce() {
  for (const fn of listeners) fn()
}

/** Swap the document, and only re-render if it is genuinely a different one. */
function adopt(next: SiteContentDoc) {
  // `useSyncExternalStore` compares snapshots by identity, so handing out a
  // fresh object every fetch would re-render four sections for an answer that
  // said nothing new. Two documents with the same JSON are the same document.
  if (JSON.stringify(next) === JSON.stringify(doc)) return
  doc = next
  announce()
}

let inflight: Promise<void> | null = null

/**
 * Fetch the published document, once per page load.
 *
 * `tdg_site_content()` takes no argument, carries no identity and cannot
 * refuse: see the migration's header for why that is what earns it the `anon`
 * grant, and why a visitor who is not signed in can read it.
 */
export function loadSiteContent(force = false): Promise<void> {
  if (inflight && !force) return inflight
  phase = 'loading'
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('tdg_site_content')
      if (error) throw error
      adopt(parseDoc(data))
      writeCache(data ?? {})
      phase = 'ready'
      failure = null
    } catch (e) {
      phase = 'error'
      failure = e instanceof Error ? e.message : String(e)
    } finally {
      inflight = null
      announce()
    }
  })()
  return inflight
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  // The first subscriber is what triggers the read. Nothing fetches at import
  // time: a module that makes a network request just for being imported is one
  // that cannot be imported by a test, a script, or the console's own editor.
  if (phase === 'cold') void loadSiteContent()
  return () => {
    listeners.delete(fn)
  }
}

const snapshot = () => doc

/** The live overlay. Re-renders the caller when a new document lands. */
export function useSiteContent(): SiteContentDoc {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** The overlay right now, for code that is not a component. */
export const siteContent = (): SiteContentDoc => doc

/** Whether the last read worked, for a surface that wants to say so. */
export const siteContentState = (): { phase: Phase; error: string | null } => ({
  phase,
  error: failure,
})

/**
 * Adopt a document this tab just published, without waiting for a re-read.
 *
 * The Developer console runs inside the same page as the site it is editing, so
 * a publish that only wrote to Postgres would leave this tab printing the old
 * copy until it was reloaded — the one reader guaranteed to notice, seeing the
 * one thing that would make them doubt the write landed.
 */
export function adoptPublished(raw: unknown) {
  adopt(parseDoc(raw))
  writeCache(raw ?? {})
  phase = 'ready'
  failure = null
  announce()
}
