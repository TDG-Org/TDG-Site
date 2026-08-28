import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  myAccountStats,
  myPrivacy,
  privacyAudiences,
  privacyGroups,
  setPrivacy,
  setPrivacyMany,
} from './api'
import type { AccountStats, Audience, PrivacyControl, PrivacyGroup } from './types'

/**
 * The two reads the Account page makes, and the one write.
 *
 * Neither hook can throw during a render. `api.ts` answers null on ANY failed
 * read — a dropped connection, a 500, or PostgREST's `PGRST202` for an RPC
 * this project has not been given yet — and both hooks turn that into a state
 * the page draws in words. A site deployed ahead of its migration renders an
 * Account page saying it could not read something, not a blank screen.
 */

/**
 * Four states, and "could not read" is one of them.
 *
 * The rule `src/store/useOwnedPacks.ts` settled and `src/badges/useBadges.ts`
 * repeats: an answer invented from a failed request is the one mistake these
 * pages may not make. It matters more here than anywhere else on the site,
 * because the invented answer would be *your profile is public*.
 */
export type AccountStatsState =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'error' }
  | { kind: 'ok'; stats: AccountStats }

export function useAccountStats(): AccountStatsState {
  const { status, user } = useAuth()
  const [state, setState] = useState<AccountStatsState>({ kind: 'checking' })
  const userId = user?.id ?? null

  useEffect(() => {
    if (status === 'loading') {
      setState({ kind: 'checking' })
      return
    }
    // Never fired while signed out: the verb resolves the caller from their
    // JWT and answers 28000 without one, so a request here could only collect
    // a refusal for somebody who is not asking anything.
    if (status === 'signedOut' || !userId) {
      setState({ kind: 'signedOut' })
      return
    }

    // Keyed on the account, so switching users re-reads rather than leaving
    // the previous person's figures on screen. Starting from `checking` again
    // is deliberate: the old answer is about somebody else.
    setState({ kind: 'checking' })
    let cancelled = false

    void myAccountStats().then((stats) => {
      if (cancelled) return
      setState(stats === null ? { kind: 'error' } : { kind: 'ok', stats })
    })

    return () => {
      cancelled = true
    }
  }, [status, userId])

  return state
}

export type PrivacyState =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'error' }
  | {
      kind: 'ok'
      controls: PrivacyControl[]
      audiences: Audience[]
      groups: PrivacyGroup[]
    }

export type PrivacyPanel = {
  state: PrivacyState
  /** Control ids with a save in flight. A control mid-save is still readable. */
  saving: ReadonlySet<string>
  /** The last refusal, in the server's own words, or null. */
  problem: string | null
  dismissProblem: () => void
  setOne: (key: string, audience: string) => void
  /** Every control that allows this audience, in one call. */
  setAll: (audience: string) => void
}

/**
 * The privacy list, and the two ways to change it.
 *
 * ## The three reads land together or not at all
 *
 * The catalogue, the audiences and the headings are three calls, and a panel
 * drawn from two of them is a panel with controls whose options are missing or
 * whose heading is absent. So they are awaited together and one failure is the
 * whole panel's `error` — the alternative is a half-drawn list that looks like
 * a working one.
 *
 * ## A press paints immediately and un-paints on a refusal
 *
 * The control repaints from local state before the round trip, because a
 * segmented control that does not move until the server answers reads as a
 * control that did not take the press. If the write is refused the value goes
 * back to exactly what it was and the server's sentence is shown — never a
 * silent revert, which would look like the site undoing the reader's choice
 * for reasons of its own.
 *
 * The revert restores the value captured BEFORE the press rather than
 * re-reading the list, so a refusal cannot also throw away a different control
 * that saved successfully while this one was in flight.
 */
export function usePrivacy(): PrivacyPanel {
  const { status, user } = useAuth()
  const [state, setState] = useState<PrivacyState>({ kind: 'checking' })
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set())
  const [problem, setProblem] = useState<string | null>(null)
  const userId = user?.id ?? null

  // A write that lands after the account changed, or after the page closed,
  // must land on nothing. One ref rather than a flag per call: what makes an
  // answer stale is that the reader is no longer the person who asked.
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  /*
   * The current list, readable from an event handler.
   *
   * `setOne` has to know what the control was set to BEFORE the press, both to
   * skip a press that changes nothing and to have something to revert to. The
   * obvious place to read that is inside a `setState` updater — and an updater
   * that also fires a request is a bug: React calls updaters twice under
   * StrictMode in development, which sends every save to the server twice.
   * So the handlers read here and write through the setter, which is what
   * keeps them pure.
   */
  const latest = useRef<PrivacyState>(state)
  latest.current = state

  useEffect(() => {
    if (status === 'loading') {
      setState({ kind: 'checking' })
      return
    }
    if (status === 'signedOut' || !userId) {
      setState({ kind: 'signedOut' })
      return
    }

    setState({ kind: 'checking' })
    setProblem(null)
    let cancelled = false

    void Promise.all([myPrivacy(), privacyAudiences(), privacyGroups()]).then(
      ([controls, audiences, groups]) => {
        if (cancelled) return
        if (!controls || !audiences || !groups) {
          setState({ kind: 'error' })
          return
        }
        setState({ kind: 'ok', controls, audiences, groups })
      },
    )

    return () => {
      cancelled = true
    }
  }, [status, userId])

  /**
   * Paint a set of controls at once, whichever direction it is going.
   *
   * Both the optimistic press and the revert after a refusal are the same
   * operation with different values, so they are the same function — two
   * lookalike `map`s would be two chances to disagree about what `isDefault`
   * does. Once a reader has chosen, it is no longer a default, and the row
   * stops saying so in the same paint as the value changes.
   */
  const apply = useCallback((next: Record<string, string>) => {
    setState((prev) => {
      if (prev.kind !== 'ok') return prev
      return {
        ...prev,
        controls: prev.controls.map((control) =>
          next[control.id] === undefined
            ? control
            : { ...control, audience: next[control.id], isDefault: false },
        ),
      }
    })
  }, [])

  const mark = useCallback((keys: string[], on: boolean) => {
    setSaving((prev) => {
      const next = new Set(prev)
      for (const key of keys) {
        if (on) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }, [])

  const setOne = useCallback(
    (key: string, audience: string) => {
      const now = latest.current
      if (now.kind !== 'ok') return
      const control = now.controls.find((c) => c.id === key)
      // A press on the option that is already chosen is not a change, and
      // sending it would spend a round trip to be told what we knew.
      if (!control || control.audience === audience) return

      const was = control.audience
      setProblem(null)
      mark([key], true)
      apply({ [key]: audience })

      void setPrivacy(key, audience)
        .catch((err: unknown) => {
          if (!live.current) return
          setProblem(err instanceof Error ? err.message : String(err))
          apply({ [key]: was })
        })
        .finally(() => {
          if (live.current) mark([key], false)
        })
    },
    [apply, mark],
  )

  const setAll = useCallback(
    (audience: string) => {
      const now = latest.current
      if (now.kind !== 'ok') return
      // Only the controls that ALLOW it. A catalogue is free to offer one
      // control two audiences where the rest offer three, and sending one an
      // audience it does not allow would refuse the whole batch — taking the
      // other seven down with it.
      const targets = now.controls.filter(
        (c) => c.allowed.includes(audience) && c.audience !== audience,
      )
      if (targets.length === 0) return

      const before = Object.fromEntries(targets.map((c) => [c.id, c.audience]))
      const after = Object.fromEntries(targets.map((c) => [c.id, audience]))
      const ids = targets.map((c) => c.id)

      setProblem(null)
      mark(ids, true)
      apply(after)

      void setPrivacyMany(after)
        .catch((err: unknown) => {
          if (!live.current) return
          setProblem(err instanceof Error ? err.message : String(err))
          apply(before)
        })
        .finally(() => {
          if (live.current) mark(ids, false)
        })
    },
    [apply, mark],
  )

  return {
    state,
    saving,
    problem,
    dismissProblem: useCallback(() => setProblem(null), []),
    setOne,
    setAll,
  }
}
