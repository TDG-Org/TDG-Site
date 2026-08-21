import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { STORE_APPS, packKey } from '../data/store'

/**
 * Which packs the signed-in account owns, across every app on the shelf.
 *
 * Read straight from each app's `<app>_entitlements` over RLS — every one of
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
 * Each app owns its own ownership table on purpose — isolation on a money path,
 * see `src/data/store.ts` — which means each read can fail on its own. Folded
 * into one state, a hiccup reading Veditor's table would hide DevFleet's
 * prices behind a failure that has nothing to do with it, so every shelf
 * answers for itself and speaks for nobody else.
 *
 * ## And ownership is keyed per app too
 *
 * Both apps sell a pack whose id is `themes`. `owned` therefore holds
 * `packKey(app, pack)` and never a bare pack id — the alternative is buying one
 * Theme Pack and being told you own the other.
 */
export type OwnedState = 'loading' | 'signedOut' | 'ready' | 'error'

export type OwnedPacks = {
  /** One app's shelf state. An id no app claims stays `loading`, never `ready`. */
  readonly stateFor: (appId: string) => OwnedState
  /** `packKey(app, pack)` for every pack owned. Per app, meaningful once ready. */
  readonly owned: ReadonlySet<string>
  /** Re-ask now — after a purchase, or when the tab comes back to the front. */
  readonly refresh: () => void
}

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
      setOwned(new Set())
      setStates(everyApp('signedOut'))
      return
    }

    if (loadedFor.current !== userId) {
      loadedFor.current = userId
      setOwned(new Set())
      setStates(everyApp('loading'))
    }

    let cancelled = false

    // Every shelf at once, each landing on its own: one table refusing must not
    // hold up — or answer for — another.
    for (const app of STORE_APPS) {
      supabase
        .from(app.entitlementsTable)
        .select('owned_packs')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled || !live.current) return
          if (error) {
            setStates((prev) => ({ ...prev, [app.id]: 'error' }))
            return
          }
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

  const stateFor = useCallback((appId: string): OwnedState => states[appId] ?? 'loading', [states])

  return { stateFor, owned, refresh }
}
