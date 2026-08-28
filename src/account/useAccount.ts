import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  myAccountStats,
  myPrivacy,
  privacyAudiences,
  privacyGroups,
  saveProfile,
  searchPeople,
  setFavorite,
  setPrivacy,
  setPrivacyMany,
  socialAct,
  socialGraph,
  type Person,
  type ProfilePatch,
  type SocialAction,
  type SocialGraph,
} from './api'
import { usernameShapeProblem } from '../auth/wording'
import type { Profile } from '../auth/AuthProvider'
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

/* ── the social graph ──────────────────────────────────────────────────────── */

export type SocialState =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'error' }
  | { kind: 'ok'; graph: SocialGraph }

export type SocialPanel = {
  state: SocialState
  /** User ids with an action in flight, so a card can go quiet without moving. */
  busy: ReadonlySet<string>
  problem: string | null
  dismissProblem: () => void
  /** Do one thing to one person, then re-read. Never throws at the caller. */
  act: (action: SocialAction, userId: string) => void
  /** Star or unstar one friend, then re-read. Never throws at the caller. */
  favorite: (userId: string, on: boolean) => void
  reload: () => void
}

/**
 * Friends, the requests in both directions, and the people you have blocked.
 *
 * ## Why every action re-reads instead of patching the lists
 *
 * One press moves a person between two of the four lists, and often both
 * sides of a friendship at once: accepting a request removes it from Waiting
 * On You AND adds them to Friends, blocking removes them from Friends AND adds
 * them to Blocked AND clears anything pending in either direction. Patching
 * four arrays for each of seven verbs is seven chances to get one of those
 * arms wrong, and the failure is silent — a card in two lists at once, or a
 * friend who never appears.
 *
 * So the verb runs and the graph is read again. It costs one round trip on an
 * action somebody takes a handful of times, and it cannot disagree with the
 * database. The card that was pressed is marked `busy` meanwhile, so it goes
 * quiet without the list moving under the pointer.
 */
export function useSocial(): SocialPanel {
  const { status, user } = useAuth()
  const [state, setState] = useState<SocialState>({ kind: 'checking' })
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())
  const [problem, setProblem] = useState<string | null>(null)
  const userId = user?.id ?? null

  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const read = useCallback(async () => {
    const graph = await socialGraph()
    if (!live.current) return
    setState(graph === null ? { kind: 'error' } : { kind: 'ok', graph })
  }, [])

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
    void read()
  }, [status, userId, read])

  const mark = useCallback((id: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const act = useCallback(
    (action: SocialAction, id: string) => {
      setProblem(null)
      mark(id, true)
      void socialAct(action, id)
        .then(read)
        .catch((err: unknown) => {
          if (!live.current) return
          setProblem(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (live.current) mark(id, false)
        })
    },
    [mark, read],
  )

  /*
   * A star is the one press on this panel that does NOT move anybody between
   * lists, so it could have been patched locally. It re-reads anyway, for the
   * reason the whole panel does: `tdg_set_favorite` refuses to star somebody
   * who is not a friend, and a locally-painted star over a refused write would
   * be a lie that survives until the next reload. One round trip on a press
   * somebody makes a handful of times is the cheaper half of that trade.
   */
  const favorite = useCallback(
    (id: string, on: boolean) => {
      setProblem(null)
      mark(id, true)
      void setFavorite(id, on)
        .then(read)
        .catch((err: unknown) => {
          if (!live.current) return
          setProblem(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (live.current) mark(id, false)
        })
    },
    [mark, read],
  )

  return {
    state,
    busy,
    problem,
    dismissProblem: useCallback(() => setProblem(null), []),
    act,
    favorite,
    reload: useCallback(() => void read(), [read]),
  }
}

/* ── finding people ────────────────────────────────────────────────────────── */

export type PeopleSearchState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'error' }
  | { kind: 'ok'; people: Person[] }

export type PeopleSearch = {
  query: string
  setQuery: (value: string) => void
  state: PeopleSearchState
  /** True while a read is in flight over results already on screen. The list
   *  is kept rather than blanked — a list that empties on every keystroke and
   *  fills again reads as a page breaking — so this is how the panel says the
   *  names under it are one query behind. */
  busy: boolean
  /** Read the current query again — what an action on a result needs, so the
   *  card it was made on picks up its new standing. */
  reload: () => void
}

/**
 * The people directory: everybody on TDG, filtered by what has been typed.
 *
 * ## Debounced, not on submit
 *
 * A search box with a button beside it is a box you have to be told how to
 * use. This one answers as you type, 220ms after you stop — long enough that
 * "Rosemary" is one request rather than eight, short enough that it never
 * feels like a form. The interval exemption in AGENTS.md rule 9 does not
 * apply and is not needed: this is a `setTimeout` that fires once per pause
 * and is cleared by the next keystroke, not a loop.
 *
 * ## An empty box is a browse, not an empty state
 *
 * It runs the read with an empty query and gets back the accounts this reader
 * may open. Somebody who has never used this before should see people in it,
 * not an instruction.
 *
 * ## `idle` exists so a shut section costs nothing
 *
 * The whole panel lives inside a fold. Until it is opened for the first time
 * there is no reason to have asked the server anything, and `idle` is what
 * lets the caller say when to start.
 */
export function usePeopleSearch(active: boolean): PeopleSearch {
  const { status } = useAuth()
  const [query, setQuery] = useState('')
  const [state, setState] = useState<PeopleSearchState>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!active || status !== 'signedIn') {
      // Back to `idle`, deliberately: a reader who signs out must not be left
      // holding somebody else's search results, and a section shut mid-read
      // must not reopen onto an answer to a question that is no longer on
      // screen.
      setState({ kind: 'idle' })
      setBusy(false)
      return
    }

    let cancelled = false
    // The first read has nothing to debounce — a fold opening should not wait
    // a fifth of a second to start. Only typing does.
    const wait = query.trim() === '' ? 0 : 220
    setBusy(true)
    const timer = window.setTimeout(() => {
      // `checking` only when there is nothing on screen yet. After that the
      // previous list stays and `busy` carries the news, because a list that
      // empties on every keystroke and fills again reads as a page breaking.
      setState((prev) => (prev.kind === 'ok' ? prev : { kind: 'checking' }))
      void searchPeople(query).then((people) => {
        if (cancelled) return
        setBusy(false)
        setState(people === null ? { kind: 'error' } : { kind: 'ok', people })
      })
    }, wait)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [active, status, query, nonce])

  return {
    query,
    setQuery,
    state,
    busy,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  }
}

/* ── editing your own details ──────────────────────────────────────────────── */

export type FieldState = {
  value: string
  /** True while this field has been typed in and not yet saved. */
  dirty: boolean
  saving: boolean
  /** The server's refusal, or a shape problem this browser can see for itself. */
  problem: string | null
  /** Set for the moment after a successful save, so the field can say so. */
  saved: boolean
}

export type ProfileEditor = {
  fields: Record<ProfileField, FieldState>
  set: (field: ProfileField, value: string) => void
  /** Commit one field. Called on blur and on Enter, never on every keystroke. */
  commit: (field: ProfileField) => void
  /** Throw the typing away and go back to what is stored. */
  reset: (field: ProfileField) => void
}

export type ProfileField = 'displayName' | 'username' | 'bio' | 'recoveryEmail'

/** The one place a field id maps to the column it writes and the value it
 *  starts from. A `switch` in three handlers would be three chances to add a
 *  field to two of them. */
const FIELD_OF = (profile: Profile | null): Record<ProfileField, string> => ({
  displayName: profile?.display_name ?? '',
  username: profile?.username ?? '',
  bio: profile?.bio ?? '',
  recoveryEmail: profile?.recovery_email ?? '',
})

const blank = (value: string): FieldState => ({
  value,
  dirty: false,
  saving: false,
  problem: null,
  saved: false,
})

/**
 * The four editable fields of a TDG account, each saving on its own.
 *
 * ## One field, one save
 *
 * Not a form with a Save button. Each field commits when you leave it, which
 * is what the rest of this account already does everywhere else — and it means
 * a refused username never takes an unrelated bio edit down with it. A Save
 * button over four independent columns would have to decide what to do when
 * three succeed and one is refused, and every answer to that is worse than not
 * having the question.
 *
 * ## Commit on blur, never on keystroke
 *
 * A username is checked against a unique index and a fourteen-day cooldown.
 * Sending one per keystroke would be a request per letter, and — worse — would
 * spend the cooldown on a half-typed name.
 *
 * ## The stored value is the truth, and it is re-read
 *
 * After a save the profile is fetched again rather than patched locally,
 * because the row has triggers: `recovery_email` is lowercased and trimmed on
 * the way in, and `username_changed_at` is stamped. What came back is what the
 * field then shows, so the box and the database cannot disagree.
 *
 * A refusal puts the field back to the stored value and says why. Leaving the
 * rejected text in the box would look like it had been accepted.
 */
export function useProfileEditor(): ProfileEditor {
  const { user, profile, refreshProfile } = useAuth()
  const [fields, setFields] = useState<Record<ProfileField, FieldState>>(() => {
    const start = FIELD_OF(profile)
    return {
      displayName: blank(start.displayName),
      username: blank(start.username),
      bio: blank(start.bio),
      recoveryEmail: blank(start.recoveryEmail),
    }
  })

  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  /*
   * Take the stored value for any field the reader is not part-way through.
   *
   * This fires whenever the profile object changes, which includes the refresh
   * a save triggers — so a committed field picks up whatever the database
   * actually stored. A field with unsaved typing in it is left alone: the
   * profile changing under somebody mid-edit is a save of a DIFFERENT field,
   * and taking their text away for that would be the page throwing work out.
   */
  useEffect(() => {
    const stored = FIELD_OF(profile)
    setFields((prev) => {
      let changed = false
      const next = { ...prev }
      for (const key of Object.keys(stored) as ProfileField[]) {
        if (prev[key].dirty || prev[key].saving) continue
        if (prev[key].value === stored[key]) continue
        next[key] = { ...prev[key], value: stored[key], problem: null }
        changed = true
      }
      return changed ? next : prev
    })
  }, [profile])

  const patch = useCallback((field: ProfileField, part: Partial<FieldState>) => {
    setFields((prev) => ({ ...prev, [field]: { ...prev[field], ...part } }))
  }, [])

  const set = useCallback(
    (field: ProfileField, value: string) => {
      patch(field, { value, dirty: true, problem: null, saved: false })
    },
    [patch],
  )

  const reset = useCallback(
    (field: ProfileField) => {
      patch(field, {
        value: FIELD_OF(profile)[field],
        dirty: false,
        problem: null,
        saved: false,
      })
    },
    [patch, profile],
  )

  const commit = useCallback(
    (field: ProfileField) => {
      const current = fields[field]
      const stored = FIELD_OF(profile)[field]
      if (!current.dirty || current.saving) return
      if (current.value.trim() === stored.trim()) {
        patch(field, { dirty: false, value: stored, problem: null })
        return
      }
      const uid = user?.id
      if (!uid) return

      // The one check this browser can make for itself, and the reason it is
      // worth making: a shape refusal from Postgres would arrive as a bare
      // constraint code with nothing a reader could act on, while
      // `usernameShapeProblem` already says exactly which rule was broken. The
      // server still checks — this only saves somebody a round trip to be told
      // something the page could see.
      if (field === 'username') {
        const shape = usernameShapeProblem(current.value)
        if (shape) {
          patch(field, { problem: shape, saving: false })
          return
        }
      }

      patch(field, { saving: true, problem: null, saved: false })
      void saveProfile(uid, { [field]: current.value } as ProfilePatch)
        .then(async () => {
          await refreshProfile()
          if (!live.current) return
          patch(field, { saving: false, dirty: false, saved: true })
          // The tick is a moment, not a state. Left up, it would still be
          // there the next time the section is opened, claiming a save that
          // happened yesterday.
          window.setTimeout(() => {
            if (live.current) patch(field, { saved: false })
          }, 2400)
        })
        .catch((err: unknown) => {
          if (!live.current) return
          patch(field, {
            saving: false,
            dirty: false,
            // Back to what is stored. Leaving the refused text in the box
            // would look like it had been taken.
            value: FIELD_OF(profile)[field],
            problem: err instanceof Error ? err.message : String(err),
          })
        })
    },
    [fields, patch, profile, refreshProfile, user?.id],
  )

  return { fields, set, commit, reset }
}
