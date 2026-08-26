import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { myBadges, publicStats } from './api'
import type { Badge } from './types'

/**
 * The two reads a page makes about badges: the signed-in account's own, and
 * the one public number.
 *
 * Neither hook can throw during a render. `api.ts` answers null on ANY failed
 * read — a dropped connection, a 500, or PostgREST's `PGRST202` for an RPC
 * this project has not been given yet — and both hooks turn that into a state
 * the caller can draw. A site deployed ahead of its migration renders a page
 * with one line missing, not a blank screen.
 */

/**
 * Four states, and "could not read" is one of them.
 *
 * `ok` with an empty list is a real answer: an account that has not been given
 * anything. `error` is the different fact that we do not know, and the caller
 * must render it as something other than an empty shelf — the same rule
 * `src/store/useOwnedPacks.ts` keeps about ownership, for the same reason.
 */
export type BadgesState =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'error' }
  | { kind: 'ok'; badges: Badge[] }

export function useMyBadges(): BadgesState {
  const { status, user } = useAuth()
  const [state, setState] = useState<BadgesState>({ kind: 'checking' })
  const userId = user?.id ?? null

  useEffect(() => {
    if (status === 'loading') {
      setState({ kind: 'checking' })
      return
    }
    // Never fired while signed out: the verb resolves the caller from their
    // JWT and answers 28000 without one, so a request here could only ever
    // collect a refusal for somebody who is not asking anything.
    if (status === 'signedOut' || !userId) {
      setState({ kind: 'signedOut' })
      return
    }

    // Keyed on the account, so switching users re-reads rather than leaving the
    // previous person's badges on screen. Starting from `checking` again is
    // deliberate: the old answer is about somebody else.
    setState({ kind: 'checking' })
    let cancelled = false

    void myBadges().then((badges) => {
      if (cancelled) return
      setState(badges === null ? { kind: 'error' } : { kind: 'ok', badges })
    })

    return () => {
      cancelled = true
    }
  }, [status, userId])

  return state
}

/**
 * How many TDG accounts there are, remembered for the life of the tab.
 *
 * The footer is on every page, and this site's routes are hashes — so a
 * visitor moving from home to the Store to an app page can remount the footer
 * several times in a minute. A number that moves a handful of times a year
 * does not need asking again each time, so a SUCCESSFUL answer is kept at
 * module scope and every later caller reads it without a round trip. Two
 * mounts in the same frame share the one request in flight rather than making
 * two.
 *
 * A FAILED read is never remembered. Caching a hiccup would mean the count
 * stays missing for the whole visit because one request at boot lost the
 * network; the next mount simply asks again.
 */
let knownCount: number | null = null
let inFlight: Promise<number | null> | null = null

function askCount(): Promise<number | null> {
  if (knownCount !== null) return Promise.resolve(knownCount)
  if (!inFlight) {
    inFlight = publicStats().then((stats) => {
      inFlight = null
      if (stats) knownCount = stats.accounts
      return stats?.accounts ?? null
    })
  }
  return inFlight
}

/** null while unknown or unreadable — the caller renders nothing rather than a
 *  made-up number. */
export function useAccountCount(): number | null {
  const [count, setCount] = useState<number | null>(knownCount)

  useEffect(() => {
    if (knownCount !== null) return
    let cancelled = false

    void askCount().then((n) => {
      // No setState after unmount: the footer is mounted and unmounted by every
      // hash route change, and a promise that lands afterwards must land on
      // nothing.
      if (!cancelled) setCount(n)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return count
}
