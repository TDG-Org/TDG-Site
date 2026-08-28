import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { socialAct, type SocialAction } from '../account/api'
import { profileAt, profileFriends, type ProfileFriend, type PublicProfile } from './api'

/**
 * One person's page: the read, the press, and the re-read after it.
 *
 * ## Five states, and `missing` is not `error`
 *
 * `checking` · `signedOut` · `missing` · `error` · `ok`. The pair that matters
 * is the middle two: **a handle nobody holds and a read that failed must never
 * draw the same sentence.** "There is no @rose" is a fact about the world;
 * "we couldn't reach the server" is a fact about this browser, and telling
 * somebody the first when the second happened sends them off to check a
 * spelling that was right. It is the rule `src/store/useOwnedPacks.ts` settled
 * for packs and `src/badges/` repeats, one step further: here the invented
 * answer is not "you own nothing", it is "that person does not exist".
 *
 * ## A press re-reads, exactly like the Account page
 *
 * One action changes the standing and often what may be SEEN with it —
 * accepting a friend request opens every `friends`-audience section on the
 * page at once, and blocking closes the lot. Patching a standing locally would
 * leave a page whose buttons say "Unfriend" over sections still drawn for a
 * stranger. So the verb runs and `tdg_profile_at` is asked again, which is the
 * same trade `useSocial` makes and for the same reason: one round trip on a
 * press somebody makes rarely, in exchange for a page that cannot disagree
 * with the database.
 *
 * ## The friends list is a second read, on purpose
 *
 * `tdg_profile` gives the COUNT in its one round trip, because a count is part
 * of the head and the head must not wait. The names are `tdg_public_friends`,
 * asked separately and only once there is somebody to ask about — a page whose
 * subject keeps their friends to themselves must not spend a request finding
 * that out twice.
 */

export type PersonState =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'ok'; profile: PublicProfile }

export type PersonPanel = {
  state: PersonState
  /** True while a verb is in flight. The page goes quiet without moving. */
  busy: boolean
  /** The server's refusal, in its own words, or null. */
  problem: string | null
  dismissProblem: () => void
  act: (action: SocialAction) => void
  /** Their friends: null while unknown or not readable, an array once read. */
  friends: ProfileFriend[] | null
  friendsFailed: boolean
}

export function usePerson(username: string): PersonPanel {
  const { status, user } = useAuth()
  const [state, setState] = useState<PersonState>({ kind: 'checking' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [friends, setFriends] = useState<ProfileFriend[] | null>(null)
  const [friendsFailed, setFriendsFailed] = useState(false)
  const meId = user?.id ?? null

  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const read = useCallback(async () => {
    const answer = await profileAt(username)
    if (!live.current) return
    if (answer === null) {
      setState({ kind: 'error' })
      return
    }
    if (answer === 'missing') {
      setState({ kind: 'missing' })
      return
    }
    setState({ kind: 'ok', profile: answer })
  }, [username])

  useEffect(() => {
    if (status === 'loading') {
      setState({ kind: 'checking' })
      return
    }
    /*
     * Signed out is its own answer rather than an attempt that will be
     * refused. `tdg_profile_at` is granted to `authenticated` only — the rule
     * in supabase/migrations/README.md, and this verb names a person, which is
     * exactly what disqualifies it from the two `anon` exceptions on this
     * project. So the page says "sign in to see profiles" on the page that was
     * asked for, the way `#/account` does, rather than firing a request whose
     * only possible answer is 28000.
     */
    if (status === 'signedOut' || !meId) {
      setState({ kind: 'signedOut' })
      return
    }
    // Keyed on the handle AND the account: following one profile to the next
    // must start over rather than leave the previous person on screen, and so
    // must switching users.
    setState({ kind: 'checking' })
    setProblem(null)
    setFriends(null)
    setFriendsFailed(false)
    void read()
  }, [status, meId, username, read])

  // The names, once the head has told us there are any to ask for. Keyed on
  // the id rather than the handle, so a rename mid-visit does not re-fetch.
  const profile = state.kind === 'ok' ? state.profile : null
  const targetId = profile?.userId ?? null
  const canFriends = profile?.canFriends ?? false
  const anyFriends = (profile?.friendCount ?? 0) > 0

  useEffect(() => {
    if (!targetId || !canFriends || !anyFriends) return
    let cancelled = false
    void profileFriends(targetId).then((list) => {
      if (cancelled || !live.current) return
      setFriendsFailed(list === null)
      setFriends(list)
    })
    return () => {
      cancelled = true
    }
  }, [targetId, canFriends, anyFriends])

  const act = useCallback(
    (action: SocialAction) => {
      const id = targetId
      if (!id || busy) return
      setProblem(null)
      setBusy(true)
      void socialAct(action, id)
        .then(read)
        .catch((err: unknown) => {
          if (!live.current) return
          setProblem(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (live.current) setBusy(false)
        })
    },
    [targetId, busy, read],
  )

  return {
    state,
    busy,
    problem,
    dismissProblem: useCallback(() => setProblem(null), []),
    act,
    friends,
    friendsFailed,
  }
}
