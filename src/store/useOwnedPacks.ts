import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

/**
 * Which TDG Veditor packs the signed-in account owns.
 *
 * Read straight from `veditor_entitlements` over RLS — the table grants the
 * owner `select` on their own row and no client write policy at all, so this
 * is a read of the same row the app itself reads and the same row the Stripe
 * webhook writes. One answer, three readers.
 *
 * ## Four states, and why "could not read" is one of them
 *
 * A shop must never draw "you do not own this" from a failed request. Telling
 * somebody they have not bought what they have bought is the one mistake this
 * page cannot make, so an error is its own state and the card says the reading
 * failed rather than offering to sell it again. An ABSENT row is not an error:
 * it is the ordinary answer for an account that has never bought anything.
 */
export type OwnedState = 'loading' | 'signedOut' | 'ready' | 'error'

export type OwnedPacks = {
  readonly state: OwnedState
  /** Pack ids owned. Meaningful only when `state` is `ready`. */
  readonly packs: readonly string[]
  /** Re-ask now — after a purchase, or when the tab comes back to the front. */
  readonly refresh: () => void
}

export function useOwnedPacks(): OwnedPacks {
  const { status, user } = useAuth()
  const [state, setState] = useState<OwnedState>('loading')
  const [packs, setPacks] = useState<readonly string[]>([])
  // Bumped by refresh(). A counter rather than calling the query directly, so
  // a refresh that lands after the user signed out cannot revive stale packs.
  const [tick, setTick] = useState(0)
  const live = useRef(true)

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
      setState('loading')
      return
    }
    if (status === 'signedOut' || !userId) {
      setPacks([])
      setState('signedOut')
      return
    }

    let cancelled = false
    supabase
      .from('veditor_entitlements')
      .select('owned_packs')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || !live.current) return
        if (error) {
          setState('error')
          return
        }
        const owned = Array.isArray(data?.owned_packs)
          ? (data.owned_packs as unknown[]).filter((id): id is string => typeof id === 'string')
          : []
        setPacks(owned)
        setState('ready')
      })

    return () => {
      cancelled = true
    }
  }, [status, userId, tick])

  return { state, packs, refresh }
}
