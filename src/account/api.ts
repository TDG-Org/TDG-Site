import { supabase } from '../lib/supabase'
import type { AccountStats, Audience, PrivacyControl, PrivacyGroup, StreakSummary } from './types'

/**
 * The site's half of a TDG account: what it can see about itself, and who else
 * may see it.
 *
 * Everything here talks to the `tdg_privacy_*` / `tdg_my_*` functions in
 * tdg-core (see
 * supabase/migrations/20260828090000_tdg_privacy_and_table_merges.sql). There
 * is no table access: `public.tdg_privacy` has RLS on and no client policies at
 * all, so these verbs are the whole surface there is.
 *
 * ## Reads answer null. Writes throw.
 *
 * The same split `src/badges/api.ts` settled, for the same reasons.
 *
 * A failed READ answers **null**, which is "we could not find out" — a
 * different fact from "you have nothing", and the caller must draw it as
 * something other than an empty list. A privacy panel that rendered a failed
 * read as a row of default switches would tell somebody their profile is
 * public when the site has no idea what it is.
 *
 * A failed WRITE **throws with the server's own sentence**, because a refusal
 * is the point: `tdg_set_privacy` refuses an audience a control does not allow
 * with a line written to be read, and a switch that silently does nothing is
 * worse than one that says no.
 */

/**
 * The server's refusals are worded to be read. The `tdg: ` prefix is for
 * server logs, and a request that never landed is not a refusal and must not
 * read like one. A deliberate twin of the same helper in `src/badges/api.ts`
 * and `src/feedback/api.ts`: a handful of lines duplicated rather than a
 * shared module, for the reason `src/feedback/README.md` gives about coupling
 * folders that otherwise have nothing to do with each other.
 */
function worded(message: string | null | undefined): string {
  const raw = (message ?? '').trim()
  if (!raw) return "Something went wrong, and the server didn't say what."
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return "Couldn't reach the server. Check the connection and try again."
  }
  const clean = raw.replace(/^tdg:\s*/i, '')
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

type AudienceRow = {
  id: string
  label: string
  blurb: string
  contact_blurb: string
  rank: number
}

type ControlRow = {
  id: string
  label: string
  blurb: string
  group: string
  kind: string
  allowed: string[] | null
  audience: string
  is_default: boolean
  sort: number
}

type GroupRow = { id: string; label: string; blurb: string; sort: number }

type StatsRow = {
  created_at: string
  friends: number
  requests_in: number
  requests_out: number
  blocked: number
  badges: number
  feedback_sent: number
  apps: Record<string, { since: string | null; earned: Record<string, string> }> | null
  packs: Record<string, string[]> | null
  streaks: Record<string, StreakSummary> | null
}

/**
 * The three words a control can be set to, and what each one means.
 *
 * Read from the server rather than typed here, so the page can render a
 * fourth one the day a migration adds it — and so the *contact* wording, where
 * "friends" means friends of friends, arrives with the audience instead of
 * being a special case this file would have to know about.
 */
export async function privacyAudiences(): Promise<Audience[] | null> {
  const { data, error } = await supabase.rpc('tdg_privacy_audiences')
  if (error) return null
  return ((data as AudienceRow[] | null) ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    blurb: row.blurb,
    contactBlurb: row.contact_blurb,
    rank: row.rank,
  }))
}

/** The headings the list is written under. */
export async function privacyGroups(): Promise<PrivacyGroup[] | null> {
  const { data, error } = await supabase.rpc('tdg_privacy_groups')
  if (error) return null
  return (data as GroupRow[] | null) ?? []
}

/**
 * Every control in the catalogue with what this account has it set to.
 *
 * There is no user id to pass and there never will be: the server resolves the
 * caller from their JWT. A verb that answered "what has THAT account chosen"
 * would be a way to read somebody's privacy settings, which is itself one of
 * the things privacy settings are for.
 */
export async function myPrivacy(): Promise<PrivacyControl[] | null> {
  const { data, error } = await supabase.rpc('tdg_my_privacy')
  // Any error at all, including PostgREST's PGRST202 for an RPC this project
  // has not been given yet: a site deployed ahead of its migration must render
  // "we could not find out", never a crash and never a row of made-up switches.
  if (error) return null
  return ((data as ControlRow[] | null) ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    blurb: row.blurb,
    group: row.group,
    kind: row.kind,
    allowed: row.allowed ?? [],
    audience: row.audience,
    isDefault: row.is_default,
    sort: row.sort,
  }))
}

/**
 * Set one control. Idempotent: this sends the state the control should be IN,
 * not a delta, so a double-press and a stale page land on the same answer.
 *
 * Throws with the server's sentence on refusal. Do not pre-empt the check
 * here — `tdg_set_privacy` validates against exactly the catalogue the page
 * was drawn from, and the boundary is in Postgres and only in Postgres
 * (AGENTS.md rule 12).
 */
export async function setPrivacy(key: string, audience: string): Promise<void> {
  const { error } = await supabase.rpc('tdg_set_privacy', {
    p_key: key,
    p_audience: audience,
  })
  if (error) throw new Error(worded(error.message))
}

/**
 * Set several at once — what "Set Everything To" presses.
 *
 * One call rather than a loop of them, and not only for the round trips: the
 * server validates every key before it writes any key, so a batch containing
 * one value a control does not allow changes nothing rather than half of
 * something. A loop here would leave the reader looking at a list that is part
 * one answer and part another, with no way to tell which.
 */
export async function setPrivacyMany(settings: Record<string, string>): Promise<void> {
  const { error } = await supabase.rpc('tdg_set_privacy_many', { p_settings: settings })
  if (error) throw new Error(worded(error.message))
}

/**
 * Everything this account counts, in one round trip.
 *
 * One call because a page that lands in eight pieces reads as a page still
 * loading — the same reason `.store__action` reserves its height. Null means
 * the read failed.
 */
export async function myAccountStats(): Promise<AccountStats | null> {
  const { data, error } = await supabase.rpc('tdg_my_account_stats')
  if (error) return null
  const row = (data as StatsRow[] | null)?.[0]
  if (!row) return null
  return {
    createdAt: row.created_at,
    friends: row.friends,
    requestsIn: row.requests_in,
    requestsOut: row.requests_out,
    blocked: row.blocked,
    badges: row.badges,
    feedbackSent: row.feedback_sent,
    apps: row.apps ?? {},
    packs: row.packs ?? {},
    streaks: row.streaks ?? {},
  }
}

/* ── editing the account ─────────────────────────────────────────────────────
 *
 * A direct `update` on `public.profiles`, not an RPC, because this is the one
 * write on this page an account genuinely owns: `profiles_update_own` scopes it
 * to the caller's row and the column grants scope it to the seven fields
 * `authenticated` may set. There is no privileged verb to add — a function here
 * would only re-implement a policy Postgres is already enforcing.
 *
 * **Never name `updated_at` or `username_changed_at` in the patch.** Both are
 * trigger-maintained and neither is client-writable, and Postgres does not
 * ignore an ungranted column — it refuses the WHOLE statement with 42501. That
 * is what silently broke every profile save in Bible Educator the day the
 * column grants were tightened, so this file builds the row key by key and
 * cannot accidentally spread one in.
 */

/** What the Account page may change. Every field is optional; only what is
 *  present is sent, so a save is always exactly what the reader touched. */
export type ProfilePatch = {
  displayName?: string
  username?: string
  bio?: string
  /** `''` clears it: a null column and "no backup address" are one fact. */
  recoveryEmail?: string
}

/**
 * The four refusals this write can collect, each with the sentence the reader
 * actually needs.
 *
 * Matched on `code`, never on message text — the rule `src/auth/wording.ts`
 * settled and explains at length: a code cannot be a prefix of another code,
 * and a table of substrings answers the wrong arm the day two messages
 * overlap.
 *
 * **PT429's own message is passed through**, because it already names the date
 * the cooldown ends and a rewrite here could only lose it. That is also why
 * nothing here computes that date: the fourteen days are the SERVER's, kept by
 * a trigger on a column no client may write, and a local guess would drift.
 */
function profileRefusal(error: { code?: string; message?: string } | null): string {
  const code = error?.code
  if (code === '23505') return 'That username is already taken. Try another.'
  if (code === 'PT429') return error?.message || 'Usernames can change once every 2 weeks.'
  if (code === 'PT409') {
    return 'That address is already in use on another account. Pick a different one.'
  }
  if (code === '23514') return "That doesn't look like a valid email address."
  if (code === '42501') {
    // Not a permission problem the reader can act on: it means this file named
    // a column `authenticated` may not set. Say something true rather than
    // something reassuring.
    return "We couldn't save that. Something on our side is set up wrong."
  }
  return worded(error?.message)
}

/**
 * Save what changed. Throws with the server's sentence on refusal, because
 * every one of them is something the reader has to read and act on: a taken
 * username, a cooldown with a date in it, an address somebody else uses.
 */
export async function saveProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.displayName !== undefined) row.display_name = patch.displayName.trim() || null
  if (patch.username !== undefined) row.username = patch.username.trim().replace(/^@/, '') || null
  if (patch.bio !== undefined) row.bio = patch.bio.trim()
  if (patch.recoveryEmail !== undefined) row.recovery_email = patch.recoveryEmail.trim() || null
  if (!Object.keys(row).length) return

  const { error } = await supabase.from('profiles').update(row).eq('user_id', userId)
  if (error) throw new Error(profileRefusal(error))
}

/* ── the social graph ────────────────────────────────────────────────────────
 *
 * Four reads and seven writes, every one of them a `tdg_*` verb: friends,
 * requests and blocks live on `tdg_profile_state`, which has no client write
 * policies at all, so the verbs are the whole surface. They validate, they
 * write both sides of a friendship, and they are where the friend-request
 * privacy control is enforced — which is why adding somebody is
 * `tdg_add_friend` and never an insert.
 */

/**
 * Where the caller stands with one account, in the server's own vocabulary.
 *
 * Written down here rather than derived from which list somebody turned up in,
 * because the two surfaces that draw people no longer agree on that: the
 * Account page reads four lists and knows the standing from the list, and a
 * search result or a profile arrives on its own with no list behind it. One
 * word from `tdg_standing` is what lets both draw the same buttons.
 *
 * `they_asked` / `you_asked` rather than incoming/outgoing: a card says a
 * sentence about two people, and it should not have to work out which end of
 * an arrow it is holding.
 */
export type Standing =
  | 'self'
  | 'friend'
  | 'they_asked'
  | 'you_asked'
  | 'blocked'
  | 'blocked_by'
  | 'none'

/** Anything the server says is a standing this build has not been taught falls
 *  back to `none`, which draws as an account you may ask to be friends with —
 *  and the server refuses if that is wrong. Rule 17: an unknown value still
 *  gets a face. */
export const asStanding = (value: string | null | undefined): Standing => {
  const known: Standing[] = [
    'self',
    'friend',
    'they_asked',
    'you_asked',
    'blocked',
    'blocked_by',
    'none',
  ]
  return known.includes(value as Standing) ? (value as Standing) : 'none'
}

export type Person = {
  userId: string
  username: string | null
  displayName: string | null
  bio: string | null
  /** When THEY joined TDG, on the lists that carry it — null both when they
   *  keep it to themselves and when the list has no column for it. */
  createdAt: string | null
  /** Starred by you. Only ever true for a friend; the server enforces it. */
  favorite: boolean
  /** 1-based place in your own ordering, or null for a friend you have not
   *  placed. Null sorts LAST, which is what an unplaced remainder wants. */
  sortOrder: number | null
  /** Set on a search result, where there is no list to infer it from. */
  standing?: Standing
  /** Set on a search result: may you open their page at all. */
  visible?: boolean
}

type PersonRow = {
  user_id: string
  username: string | null
  display_name: string | null
  bio?: string | null
  created_at?: string | null
  favorite?: boolean | null
  sort_order?: number | null
  standing?: string | null
  visible?: boolean | null
}

const toPerson = (row: PersonRow): Person => ({
  userId: row.user_id,
  username: row.username,
  displayName: row.display_name,
  bio: row.bio ?? null,
  createdAt: row.created_at ?? null,
  favorite: row.favorite ?? false,
  sortOrder: row.sort_order ?? null,
  standing: row.standing === undefined ? undefined : asStanding(row.standing),
  visible: row.visible ?? undefined,
})

export type SocialGraph = {
  friends: Person[]
  incoming: Person[]
  outgoing: Person[]
  blocked: Person[]
}

/**
 * All four lists in one go. Null means the read FAILED — not "no friends",
 * which is a real and common answer and draws a different sentence.
 *
 * Fetched together because a panel that showed friends but not the requests
 * waiting on you would have quietly hidden the only part of it that needed an
 * answer from you.
 */
export async function socialGraph(): Promise<SocialGraph | null> {
  const [f, i, o, b] = await Promise.all([
    supabase.rpc('tdg_my_friends'),
    supabase.rpc('tdg_incoming_requests'),
    supabase.rpc('tdg_outgoing_requests'),
    supabase.rpc('tdg_my_blocks'),
  ])
  if (f.error || i.error || o.error || b.error) return null
  const list = (data: unknown) => ((data as PersonRow[] | null) ?? []).map(toPerson)
  return {
    friends: list(f.data),
    incoming: list(i.data),
    outgoing: list(o.data),
    blocked: list(b.data),
  }
}

/** Every verb that changes a relationship, by the name the database uses. One
 *  map rather than seven exported functions: the panel draws its buttons from
 *  what a person's standing allows, so it looks one up rather than knowing all
 *  seven by name. */
const SOCIAL_VERBS = {
  add: 'tdg_add_friend',
  accept: 'tdg_accept_friend',
  decline: 'tdg_decline_friend',
  cancel: 'tdg_cancel_request',
  remove: 'tdg_remove_friend',
  block: 'tdg_block_user',
  unblock: 'tdg_unblock_user',
} as const

export type SocialAction = keyof typeof SOCIAL_VERBS

/**
 * Do one thing to one person. Throws with the server's sentence, because every
 * refusal here is worth reading — *this account is not taking friend requests*
 * is a fact about them, and swallowing it would leave a button that looked
 * like it worked.
 */
export async function socialAct(action: SocialAction, userId: string): Promise<void> {
  const { error } = await supabase.rpc(SOCIAL_VERBS[action], { target: userId })
  if (error) throw new Error(worded(error.message))
}

/**
 * Everybody on TDG, or everybody whose name has this in it.
 *
 * **An empty query browses rather than refusing.** A directory that answers
 * nothing until you have guessed part of a name is one nobody can explore, and
 * "type something to search" is the emptiest of empty states. The server
 * decides who is on that list — see `tdg_search_profiles` in
 * `20260828230000_tdg_people_and_profiles.sql`: people whose profile you may
 * open, anybody you already have a standing with, and an exact handle match —
 * which is the door `tdg_find_profile` has always been, kept at its old width,
 * so an account that keeps its page to itself is still reachable by somebody
 * who knows how to spell its handle and can still be sent a request.
 *
 * **A miss and a hidden account are deliberately the same answer.** A
 * different sentence for the second would turn this box into a way to test
 * whether a handle exists, which is the property `src/auth/README.md` protects
 * everywhere else on this site.
 *
 * Null means the read failed, the rule the whole folder keeps. An empty ARRAY
 * is a real and different answer — nobody matched — and the panel says so in
 * different words.
 */
export async function searchPeople(query: string, limit = 24): Promise<Person[] | null> {
  const { data, error } = await supabase.rpc('tdg_search_profiles', {
    p_q: query.trim(),
    p_limit: limit,
  })
  if (error) return null
  return ((data as PersonRow[] | null) ?? []).map(toPerson)
}

/**
 * Star or unstar one friend.
 *
 * `tdg_set_favorite`, not `tdg_set_favorites`: the plural takes the WHOLE set,
 * which is right for a screen that reorders a list and wrong for a star you
 * press — two presses in flight together each send a set computed before the
 * other landed, and the loser silently un-stars what the winner just starred.
 *
 * Throws like every other write here. A star that quietly did nothing would be
 * indistinguishable from the one this project shipped for months, where the
 * write landed and the READ threw the answer away.
 */
export async function setFavorite(userId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('tdg_set_favorite', { target: userId, on_off: on })
  if (error) throw new Error(worded(error.message))
}
