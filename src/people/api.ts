import { supabase } from '../lib/supabase'
import { asStanding, type Standing } from '../account/api'

/**
 * Reading somebody else's account.
 *
 * The server half is `tdg_profile` / `tdg_profile_at` / `tdg_public_friends`
 * in tdg-core (see
 * supabase/migrations/20260828230000_tdg_people_and_profiles.sql). There is no
 * table access here and there could not be: `profiles` is readable only
 * through those functions, and every column on the answer has already been
 * through `tdg_can_view` before it reaches this file.
 *
 * ## Reads answer null. The seven verbs still throw.
 *
 * The split the whole project keeps. A failed READ is null — "we could not
 * find out" — which this page must draw as a sentence rather than as an empty
 * profile, because an empty profile is a real answer about a real person and
 * these two must never look the same.
 *
 * The WRITES are not here. Adding, accepting, blocking and the rest are
 * `socialAct` in `src/account/api.ts`, imported rather than repeated: they are
 * one mechanism with one set of refusals, and a second copy of the seven verb
 * names is the beginning of the two surfaces disagreeing about what a press
 * does. This folder holds what is true of ANOTHER account; that one holds the
 * graph itself.
 *
 * ## Nothing here decides what may be seen
 *
 * Every `can*` below is the server's answer, carried through untouched. This
 * file never infers one from another, never hides a section because a value
 * came back null, and never guesses. A null with `canBadges` true means they
 * have no badges; a null with it false means they keep them to themselves, and
 * those are two different sentences on the page.
 */

/** One badge as it appears on somebody else's page: the catalogue row they
 *  hold, and when. `grantedAt` is null for the two derived badges, which are
 *  computed on every read and were never granted on a date. */
export type ProfileBadge = {
  id: string
  label: string
  blurb: string
  derived: boolean
  grantedAt: string | null
}

/** A run of days, per app, in the same shape the Account page's own stats
 *  arrive in — so one formatter draws both. */
export type ProfileStreak = {
  current: number | null
  longest: number | null
  days: number | null
  lastActive: string | null
}

export type ProfileApp = {
  since: string | null
  earned: Record<string, string>
}

export type PublicProfile = {
  userId: string
  username: string | null
  displayName: string | null
  bio: string | null
  createdAt: string | null
  standing: Standing
  /** May the caller open this page's contents at all — `tdg_privacy`'s
   *  `profile` key, which gates every `content` key under it. */
  visible: boolean
  canBio: boolean
  canFriends: boolean
  canAccountAge: boolean
  canBadges: boolean
  canStreak: boolean
  canApps: boolean
  /** May the caller ask to be their friend. Drawn, never enforced: the
   *  boundary is `tdg_add_friend` and the refusal is its sentence. */
  canRequest: boolean
  /** How many of their friends the caller may see — counted from the same
   *  list the page draws, so the number and the names cannot disagree. */
  friendCount: number
  /** Friends you have in common, or null when their list is not yours to
   *  read. Zero and "not shown" are different answers. */
  mutualCount: number | null
  badges: ProfileBadge[] | null
  apps: Record<string, ProfileApp> | null
  streaks: Record<string, ProfileStreak> | null
}

type ProfileRow = {
  user_id: string
  username: string | null
  display_name: string | null
  bio: string | null
  created_at: string | null
  standing: string | null
  visible: boolean | null
  can_bio: boolean | null
  can_friends: boolean | null
  can_account_age: boolean | null
  can_badges: boolean | null
  can_streak: boolean | null
  can_apps: boolean | null
  can_request: boolean | null
  friend_count: number | null
  mutual_count: number | null
  badges: ProfileBadge[] | null
  apps: Record<string, ProfileApp> | null
  streaks: Record<string, ProfileStreak> | null
}

const toProfile = (row: ProfileRow): PublicProfile => ({
  userId: row.user_id,
  username: row.username,
  displayName: row.display_name,
  bio: row.bio,
  createdAt: row.created_at,
  standing: asStanding(row.standing),
  visible: row.visible ?? false,
  canBio: row.can_bio ?? false,
  canFriends: row.can_friends ?? false,
  canAccountAge: row.can_account_age ?? false,
  canBadges: row.can_badges ?? false,
  canStreak: row.can_streak ?? false,
  canApps: row.can_apps ?? false,
  canRequest: row.can_request ?? false,
  friendCount: row.friend_count ?? 0,
  mutualCount: row.mutual_count ?? null,
  badges: row.badges ?? null,
  apps: row.apps ?? null,
  streaks: row.streaks ?? null,
})

/**
 * Three answers, and they are all different.
 *
 * `null` — the read failed, and the page says so rather than inventing a
 * missing person. `'missing'` — the handle belongs to nobody, or to an account
 * a moderator has hidden, which are deliberately the same answer for the
 * reason `src/auth/README.md` gives everywhere else. A profile — the account
 * exists, and `standing` and the `can*` flags say what may be drawn.
 *
 * An account that has BLOCKED the caller answers with a profile, not with
 * `'missing'`. That is the one thing this verb does that `tdg_find_profile`
 * refuses to: a block is a fact about two people and the honest render of it
 * is a page saying so, not an account that appears not to exist.
 */
export async function profileAt(username: string): Promise<PublicProfile | 'missing' | null> {
  const handle = username.trim().replace(/^@/, '')
  if (!handle) return 'missing'
  const { data, error } = await supabase.rpc('tdg_profile_at', { p_username: handle })
  // Any error at all, including PostgREST's PGRST202 for an RPC this project
  // has not been given yet: a site deployed ahead of its migration says it
  // could not read the page, never that the person is not there.
  if (error) return null
  const row = (data as ProfileRow[] | null)?.[0]
  return row ? toProfile(row) : 'missing'
}

export type ProfileFriend = {
  userId: string
  username: string | null
  displayName: string | null
}

type FriendRow = { user_id: string; username: string | null; display_name: string | null }

/**
 * Their friends, as far as the caller is allowed to see them.
 *
 * `tdg_public_friends` applies BOTH gates — their `friends_list` key, and each
 * friend's own `profile` key — so a friend who has closed their page is not in
 * this list even when the list itself is open. That is why `friendCount` on
 * the profile is counted from this same query rather than from the array: a
 * heading saying 8 over a list of 5 is a page that looks broken, and the
 * explanation ("three of them are private") is not one anybody should have to
 * guess.
 *
 * Null means the read failed; an empty array means there is nobody to show.
 */
export async function profileFriends(userId: string): Promise<ProfileFriend[] | null> {
  const { data, error } = await supabase.rpc('tdg_public_friends', { target: userId })
  if (error) return null
  return ((data as FriendRow[] | null) ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
  }))
}
