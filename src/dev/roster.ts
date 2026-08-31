import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import type { DevAccount } from './api'
import { ownedCount } from './apps'
import { nameOf } from './format'

/**
 * How the Accounts rail is ordered, and which accounts are held at the top.
 *
 * Two separate ideas that share one list, so they share one file:
 *
 * **Pins** are a developer's own shortlist. They live in Postgres
 * (`tdg_dev_pins`) rather than in this browser, because a shortlist is WORK —
 * you build it while dealing with somebody — and losing it by opening the
 * console on the other machine is the same loss as losing a bookmark folder.
 * `devMode.ts` is per device for the opposite reason: "hide the tab before I
 * share a screen" is a fact about this screen.
 *
 * **The sort** is a view preference and stays in this browser, alongside the
 * tab, the search and the open sections in `viewState.ts`.
 *
 * The pinned group is always drawn ABOVE the sorted list and is never touched
 * by the sort. That is the whole point of pinning: a sort you change to answer
 * one question must not take the four people you are working with away with it.
 */

/* ── the sort ──────────────────────────────────────────────────────────── */

export type RosterSort = 'joined-desc' | 'joined-asc' | 'name' | 'seen' | 'owned'

/** What the rail does when nothing has been chosen: the server's own order. */
export const DEFAULT_SORT: RosterSort = 'joined-desc'

export const ROSTER_SORTS: { value: RosterSort; label: string; what: string }[] = [
  { value: 'joined-desc', label: 'Newest First', what: 'The order the server sends: the account that joined most recently at the top.' },
  { value: 'joined-asc', label: 'Oldest First', what: 'Account #1 at the top, then everybody in the order they joined.' },
  { value: 'name', label: 'Name A–Z', what: 'By the name the account shows, then by its number.' },
  { value: 'seen', label: 'Recently Seen', what: 'By the last time the account signed in to any TDG app. Never-signed-in last.' },
  { value: 'owned', label: 'Most Owned', what: 'By how many packs and products the account holds, most first.' },
]

export function isRosterSort(v: unknown): v is RosterSort {
  return typeof v === 'string' && ROSTER_SORTS.some((s) => s.value === v)
}

/** Milliseconds, or -Infinity for an account that has never signed in — which
 *  is what puts those last under `seen` rather than first. */
function seenAt(a: DevAccount): number {
  const t = a.last_sign_in_at ? Date.parse(a.last_sign_in_at) : NaN
  return Number.isFinite(t) ? t : -Infinity
}

/**
 * Every comparator ends on `signup_no`, which is unique. A sort with ties is a
 * list that reshuffles under the reader every time a write re-reads a row, and
 * the only thing on an account guaranteed both stable and unique is the order
 * it joined in.
 */
export function sortRows(rows: readonly DevAccount[], sort: RosterSort): DevAccount[] {
  const by = [...rows]
  switch (sort) {
    case 'joined-asc':
      return by.sort((a, b) => a.signup_no - b.signup_no)
    case 'name':
      return by.sort(
        (a, b) =>
          nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }) ||
          a.signup_no - b.signup_no,
      )
    case 'seen':
      return by.sort((a, b) => seenAt(b) - seenAt(a) || a.signup_no - b.signup_no)
    case 'owned':
      return by.sort((a, b) => ownedCount(b) - ownedCount(a) || a.signup_no - b.signup_no)
    case 'joined-desc':
    default:
      return by.sort((a, b) => b.signup_no - a.signup_no)
  }
}

/* ── the pins ──────────────────────────────────────────────────────────── */

export type PinsState = 'loading' | 'ready' | 'error'

export type Pins = {
  /** The pinned account ids, in the developer's own order. */
  order: readonly string[]
  /** The same set, for the per-row test that runs on every render. */
  has: (userId: string) => boolean
  state: PinsState
  /** The server's own sentence when the read was refused, for the rail to print. */
  error: string | null
  /** Pin or unpin one account. Optimistic; puts it back if the write refuses. */
  toggle: (userId: string) => void
  /** Move one pin by `delta` places. `-1` is up. A move off either end is a
   *  no-op rather than a wrap, because a wrap is never what the press meant. */
  move: (userId: string, delta: number) => void
  /** Drop the pin held at `from` immediately before the one at `to`. For drag. */
  reorder: (from: string, to: string) => void
  /** Re-read from the server. On the page's own Refresh, and after a failure. */
  reload: () => Promise<boolean>
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong, and it didn't say what."
}

/**
 * The shortlist, and the four ways it changes.
 *
 * Every write is OPTIMISTIC and every one of them re-reads afterwards. The rail
 * has to answer a click in the frame it happened — a star that waits 200ms to
 * light up reads as a star that did not work — and the re-read is what makes
 * the optimism honest: if the server refused, or if the other tab moved
 * something in the meantime, what lands is what the table says and not what
 * this browser hoped.
 *
 * Reorders are sequenced. Two drags in quick succession are two round trips,
 * and the older answer must never land on top of the newer one; the counter is
 * the same device the console's five reads use.
 */
export function usePins(onError: (text: string) => void): Pins {
  const [order, setOrder] = useState<readonly string[]>([])
  const [state, setState] = useState<PinsState>('loading')
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  // Held in a ref as well as in state so a write started from an event handler
  // reads the list as it is NOW, not as it was when the handler was made.
  const now = useRef<readonly string[]>([])
  const report = useRef(onError)
  report.current = onError

  const put = useCallback((next: readonly string[]) => {
    now.current = next
    setOrder(next)
  }, [])

  const reload = useCallback(async () => {
    const mine = ++seq.current
    try {
      const rows = await api.getPins()
      if (mine !== seq.current) return false
      put(rows.map((p) => p.user_id))
      setError(null)
      setState('ready')
      return true
    } catch (e) {
      if (mine === seq.current) {
        setError(message(e))
        setState('error')
      }
      return false
    }
  }, [put])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Send a whole order, then re-read. The optimistic list is already on
   *  screen; this is what makes it true. */
  const commit = useCallback(
    (next: readonly string[]) => {
      const before = now.current
      put(next)
      const mine = ++seq.current
      void (async () => {
        try {
          await api.reorderPins(next)
        } catch (e) {
          if (mine === seq.current) {
            put(before)
            report.current(message(e))
          }
          return
        }
        if (mine === seq.current) void reload()
      })()
    },
    [put, reload],
  )

  const toggle = useCallback(
    (userId: string) => {
      const before = now.current
      const on = !before.includes(userId)
      // Appended, never prepended. Dropping a new pin on top would rearrange a
      // list somebody arranged by hand every time they pinned anybody, which is
      // the one thing a hand-arranged list may not do to itself. The server
      // does the same, so the optimistic list and the table agree.
      const next = on ? [...before, userId] : before.filter((id) => id !== userId)
      put(next)
      const mine = ++seq.current
      void (async () => {
        try {
          await api.setPin(userId, on)
        } catch (e) {
          if (mine === seq.current) {
            put(before)
            report.current(message(e))
          }
          return
        }
        if (mine === seq.current) void reload()
      })()
    },
    [put, reload],
  )

  const move = useCallback(
    (userId: string, delta: number) => {
      const before = now.current
      const from = before.indexOf(userId)
      if (from < 0) return
      const to = from + delta
      if (to < 0 || to >= before.length) return
      const next = [...before]
      next.splice(to, 0, ...next.splice(from, 1))
      commit(next)
    },
    [commit],
  )

  const reorder = useCallback(
    (from: string, to: string) => {
      const before = now.current
      const i = before.indexOf(from)
      const j = before.indexOf(to)
      if (i < 0 || j < 0 || i === j) return
      const next = before.filter((id) => id !== from)
      next.splice(next.indexOf(to) + (i < j ? 1 : 0), 0, from)
      commit(next)
    },
    [commit],
  )

  const setOf = useMemo(() => new Set(order), [order])

  return useMemo(
    () => ({
      order,
      has: (id: string) => setOf.has(id),
      state,
      error,
      toggle,
      move,
      reorder,
      reload,
    }),
    [order, setOf, state, error, toggle, move, reorder, reload],
  )
}

/**
 * The rail, in the two groups it is drawn in.
 *
 * `pinned` is in the developer's own order and `rest` is in whatever the sort
 * says. Both are drawn from the SAME filtered list, so a search narrows the
 * shortlist exactly as it narrows everything else: a pinned account that does
 * not match what you typed is not shown, because a count that excludes it while
 * the row is still on screen is a count nobody can check.
 */
export function groupRows(
  rows: readonly DevAccount[],
  pinOrder: readonly string[],
  sort: RosterSort,
): { pinned: DevAccount[]; rest: DevAccount[] } {
  if (pinOrder.length === 0) return { pinned: [], rest: sortRows(rows, sort) }
  const byId = new Map(rows.map((r) => [r.user_id, r]))
  const pinned: DevAccount[] = []
  for (const id of pinOrder) {
    const row = byId.get(id)
    if (row) pinned.push(row)
  }
  const held = new Set(pinned.map((r) => r.user_id))
  return { pinned, rest: sortRows(rows.filter((r) => !held.has(r.user_id)), sort) }
}
