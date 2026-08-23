import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { STORE_APPS, packKey } from '../data/store'

/**
 * Which packs the signed-in account owns, across every app on the shelf.
 *
 * Read straight from each app's `<app>_entitlements` over RLS. Every one of
 * those tables grants the owner `select` on their own row and carries no client
 * write policy at all, so this is a read of the same row the app itself reads
 * and the same row that app's Stripe webhook writes. One answer, three readers.
 *
 * ## Four states, and why "could not read" is one of them
 *
 * A shop must never draw "you do not own this" from a failed request. Telling
 * somebody they have not bought what they have bought is the one mistake this
 * page cannot make, so an error is its own state and the card says the reading
 * failed rather than offering to sell it again. An ABSENT row is not an error:
 * it is the ordinary answer for an account that has never bought anything.
 *
 * ## The state is PER APP, because the tables are
 *
 * Each app owns its own ownership table on purpose, for isolation on a money
 * path (see `src/data/store.ts`), which means each read can fail on its own. Folded
 * into one state, a hiccup reading Veditor's table would hide DevFleet's
 * prices behind a failure that has nothing to do with it, so every shelf
 * answers for itself and speaks for nobody else.
 *
 * ## And ownership is keyed per app too
 *
 * Both apps sell a pack whose id is `themes`. `owned` therefore holds
 * `packKey(app, pack)` and never a bare pack id. The alternative is buying one
 * Theme Pack and being told you own the other.
 *
 * ## Ownership can be taken away, so this has to keep asking
 *
 * A pack can stop being owned: a refund, a chargeback, a subscription that
 * lapses, or a developer revoking it from `#/dev`. None of those happen in this
 * tab, and none of them tell it anything.
 *
 * This used to be read once on mount and then only while a checkout was open,
 * which made ownership one-way for the life of the page: a pack revoked while
 * the shop sat open went on reading **Owned** until somebody reloaded. Selling
 * somebody what they already own is the mistake this page guards hardest
 * against, and it was quietly making the mirror-image one — telling them they
 * own something the database had already taken back.
 *
 * So it asks again at the moments a person would expect an answer, which is the
 * same set `src/auth/sessionGuard.ts` settled on for the same reason: coming
 * back to the tab, focusing the window, the network returning, and otherwise
 * every few minutes. Foreground is the one that matters — clicking back onto
 * the shop after changing something elsewhere is exactly when it has to be
 * right.
 */
export type OwnedState = 'loading' | 'signedOut' | 'ready' | 'error'

export type OwnedPacks = {
  /** One app's shelf state. An id no app claims stays `loading`, never `ready`. */
  readonly stateFor: (appId: string) => OwnedState
  /** `packKey(app, pack)` for every pack owned. Per app, meaningful once ready. */
  readonly owned: ReadonlySet<string>
  /** Re-ask now, after a purchase or when the tab comes back to the front. */
  readonly refresh: () => void
}

/** A tab left open with nobody touching it. The events cover somebody who is here. */
const RECHECK_MS = 5 * 60 * 1000

function everyApp(state: OwnedState): Record<string, OwnedState> {
  return Object.fromEntries(STORE_APPS.map((app) => [app.id, state]))
}

export function useOwnedPacks(): OwnedPacks {
  const { status, user } = useAuth()
  const [states, setStates] = useState<Record<string, OwnedState>>(() => everyApp('loading'))
  const [owned, setOwned] = useState<ReadonlySet<string>>(() => new Set<string>())
  // Bumped by refresh(). A counter rather than calling the query directly, so
  // a refresh that lands after the user signed out cannot revive stale packs.
  const [tick, setTick] = useState(0)
  const live = useRef(true)
  // Whose answers are currently on screen. A refresh for the SAME account keeps
  // them until the new ones land; a different account starts from nothing, so a
  // switch can never show the previous person's purchases for a frame.
  const loadedFor = useRef<string | null>(null)
  // Which shelves have ever answered for the account currently loaded.
  //
  // Only the FIRST read of a shelf may turn it red. Once a shelf has answered,
  // a later read that fails says nothing new — the connection dropped, the tab
  // woke up mid-suspend — and replacing a settled answer with "we couldn't
  // check" would punish the reader for our own hiccup. Same rule sessionGuard
  // keeps: only an answer FROM the server changes anything.
  const answered = useRef<Set<string>>(new Set())

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  const userId = user?.id ?? null

  useEffect(() => {
    if (status === 'loading') {
      setStates(everyApp('loading'))
      return
    }
    if (status === 'signedOut' || !userId) {
      loadedFor.current = null
      answered.current = new Set()
      setOwned(new Set())
      setStates(everyApp('signedOut'))
      return
    }

    if (loadedFor.current !== userId) {
      loadedFor.current = userId
      answered.current = new Set()
      setOwned(new Set())
      setStates(everyApp('loading'))
    }

    let cancelled = false

    // Every shelf at once, each landing on its own: one table refusing must not
    // hold up another, or answer for it.
    for (const app of STORE_APPS) {
      supabase
        .from(app.entitlementsTable)
        .select('owned_packs')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled || !live.current) return
          if (error) {
            // A re-check that failed is not an answer. Leave the shelf saying
            // whatever it last actually knew.
            if (!answered.current.has(app.id)) {
              setStates((prev) => ({ ...prev, [app.id]: 'error' }))
            }
            return
          }
          answered.current.add(app.id)
          const ids = Array.isArray(data?.owned_packs)
            ? (data.owned_packs as unknown[]).filter((id): id is string => typeof id === 'string')
            : []
          setOwned((prev) => {
            // This app's keys are REPLACED rather than merged in: a pack that
            // was refunded or revoked has to be able to leave the set, and a
            // merge would make ownership one-way for as long as the tab is open.
            const next = new Set([...prev].filter((key) => !key.startsWith(`${app.id}:`)))
            for (const id of ids) next.add(packKey(app.id, id))
            return next
          })
          setStates((prev) => ({ ...prev, [app.id]: 'ready' }))
        })
    }

    return () => {
      cancelled = true
    }
  }, [status, userId, tick])

  /*
   * Ask again when something might have changed while this tab was not looking.
   *
   * Only while signed in: a signed-out shelf has nothing to re-read, and a timer
   * firing for every visitor who never signs in is a request per tab per five
   * minutes to be told the same nothing.
   *
   * `refresh` rather than a read of its own, so every answer still arrives
   * through the one effect above and keeps its rules — the previous answers stay
   * on screen until the new ones land, and a read for an account that has since
   * changed cannot revive the last one's packs.
   */
  useEffect(() => {
    if (status !== 'signedIn' || !userId) return

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(refresh, RECHECK_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [status, userId, refresh])

  const stateFor = useCallback((appId: string): OwnedState => states[appId] ?? 'loading', [states])

  return { stateFor, owned, refresh }
}
