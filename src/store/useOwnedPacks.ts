import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { STORE_APPS, packKey } from '../data/store'
import type { PackGrant } from './grant'

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
  /**
   * HOW one pack is held: bought outright, subscribed, ending, behind on
   * payment. Null when that app records nothing about it, which is not the
   * same as "bought outright" and is why this returns null rather than a
   * perpetual grant — `standingOfGrant` is the one place that reading is made.
   */
  readonly grantFor: (appId: string, packId: string) => PackGrant | null
  /** Re-ask now, after a purchase or when the tab comes back to the front. */
  readonly refresh: () => void
}

/** A tab left open with nobody touching it. The events cover somebody who is here. */
const RECHECK_MS = 5 * 60 * 1000

/**
 * PostgREST's code for "no such column", which is how this hook finds out
 * whether an app records grants at all.
 *
 * Every entitlements table has `owned_packs`; only an app that sells something
 * with a clock on it has grown a `grants` column beside it, and DevFleet's has
 * not. The alternative was writing "does this app have grants" down in
 * `store.ts` — a fact about a SCHEMA, typed into a catalogue, going stale the
 * day the column is added and failing silently in the direction that hides a
 * subscription. So the column is ASKED for, and the server's own refusal is
 * the answer. Remembered per table for the life of the tab, so an app without
 * one costs a single extra round trip rather than one per refresh.
 */
const NO_SUCH_COLUMN = '42703'

/** Which tables have been found to have no `grants` column. Module scope on
 *  purpose: the answer is about the SCHEMA, so it outlives a component and is
 *  identical for every reader in the tab. */
const withoutGrants = new Set<string>()

function everyApp(state: OwnedState): Record<string, OwnedState> {
  return Object.fromEntries(STORE_APPS.map((app) => [app.id, state]))
}

/** `packKey(app, pack)` → the grant that app recorded for it. */
type GrantMap = Readonly<Record<string, PackGrant>>

function grantsOf(value: unknown): Record<string, PackGrant> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, PackGrant> = {}
  for (const [pack, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      out[pack] = entry as PackGrant
    }
  }
  return out
}

export function useOwnedPacks(): OwnedPacks {
  const { status, user } = useAuth()
  const [states, setStates] = useState<Record<string, OwnedState>>(() => everyApp('loading'))
  const [owned, setOwned] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [grants, setGrants] = useState<GrantMap>(() => ({}))
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
      setGrants({})
      setStates(everyApp('signedOut'))
      return
    }

    if (loadedFor.current !== userId) {
      loadedFor.current = userId
      answered.current = new Set()
      setOwned(new Set())
      setGrants({})
      setStates(everyApp('loading'))
    }

    let cancelled = false

    const land = (appId: string, data: Record<string, unknown> | null) => {
      const ids = Array.isArray(data?.owned_packs)
        ? (data.owned_packs as unknown[]).filter((id): id is string => typeof id === 'string')
        : []
      setOwned((prev) => {
        // This app's keys are REPLACED rather than merged in: a pack that
        // was refunded or revoked has to be able to leave the set, and a
        // merge would make ownership one-way for as long as the tab is open.
        const next = new Set([...prev].filter((key) => !key.startsWith(`${appId}:`)))
        for (const id of ids) next.add(packKey(appId, id))
        return next
      })
      // Grants are replaced per app for the same reason, and by the same rule:
      // a subscription that lapsed has to be able to leave, and a cancellation
      // has to be able to arrive.
      setGrants((prev) => {
        const next: Record<string, PackGrant> = {}
        for (const [key, grant] of Object.entries(prev)) {
          if (!key.startsWith(`${appId}:`)) next[key] = grant
        }
        for (const [pack, grant] of Object.entries(grantsOf(data?.grants))) {
          next[packKey(appId, pack)] = grant
        }
        return next
      })
      setStates((prev) => ({ ...prev, [appId]: 'ready' }))
    }

    // Every shelf at once, each landing on its own: one table refusing must not
    // hold up another, or answer for it.
    for (const app of STORE_APPS) {
      const table = app.entitlementsTable
      const columns = withoutGrants.has(table) ? 'owned_packs' : 'owned_packs, grants'

      supabase
        .from(table)
        .select(columns)
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled || !live.current) return

          // Asked for a column this app does not have. That is an answer about
          // the SCHEMA, not about the account, so it is remembered and the read
          // is made again without it rather than turning the shelf red.
          if (error?.code === NO_SUCH_COLUMN && !withoutGrants.has(table)) {
            withoutGrants.add(table)
            supabase
              .from(table)
              .select('owned_packs')
              .eq('user_id', userId)
              .maybeSingle()
              .then(({ data: plain, error: plainError }) => {
                if (cancelled || !live.current) return
                if (plainError) {
                  if (!answered.current.has(app.id)) {
                    setStates((prev) => ({ ...prev, [app.id]: 'error' }))
                  }
                  return
                }
                answered.current.add(app.id)
                land(app.id, plain as Record<string, unknown> | null)
              })
            return
          }

          if (error) {
            // A re-check that failed is not an answer. Leave the shelf saying
            // whatever it last actually knew.
            if (!answered.current.has(app.id)) {
              setStates((prev) => ({ ...prev, [app.id]: 'error' }))
            }
            return
          }
          answered.current.add(app.id)
          land(app.id, data as Record<string, unknown> | null)
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

  const grantFor = useCallback(
    (appId: string, packId: string): PackGrant | null => grants[packKey(appId, packId)] ?? null,
    [grants],
  )

  return { stateFor, owned, grantFor, refresh }
}
