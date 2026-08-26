import { supabase } from '../lib/supabase'
import type { AdminBadge, Badge } from './types'

/**
 * The site's half of TDG account badges.
 *
 * Everything here talks to the `tdg_*_badge*` functions in tdg-core (see
 * supabase/migrations/20260826120000_tdg_account_badges.sql). There is no
 * table access: `public.tdg_account_badges` has RLS on and no client policies
 * at all, so these four verbs are the whole surface there is.
 *
 * ## Two of these return null and two of them throw, and that is deliberate
 *
 * The public reads — `myBadges`, `publicStats` — answer **null** when the read
 * FAILED. Null is not "no badges" and not "no accounts": it is "we could not
 * find out", which is its own state and renders as nothing rather than as a
 * zero. `src/store/useOwnedPacks.ts` is the reference for why — telling
 * somebody they have not got what they have got is the one answer a page like
 * this may not invent, and a footer that prints `0 accounts` because a request
 * timed out is the same mistake wearing a smaller number.
 *
 * The two admin verbs **throw**, because their refusals are the point. The
 * server writes them to be shown — "Developer follows the account's developer
 * flag; it is not granted by hand" — and a console that swallowed that into a
 * null would leave a developer clicking a switch that silently does nothing,
 * which is exactly what `tdg_admin_uid()` raises rather than returns false to
 * avoid.
 */

/**
 * The server's refusals are worded to be read. The `tdg: ` prefix is for
 * server logs, and a request that never landed is not a refusal and must not
 * read like one. A deliberate twin of the same helper in
 * `src/feedback/api.ts`: four lines duplicated rather than a shared module,
 * for the reason `src/feedback/README.md` gives about coupling folders.
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

/** `tdg_my_badges()` and `tdg_admin_badges()` share these six columns. */
type BadgeRow = {
  id: string
  label: string
  blurb: string
  derived: boolean
  granted_at: string | null
  note: string | null
}

type AdminBadgeRow = BadgeRow & { held: boolean; granted_by: string | null }

function toBadge(row: BadgeRow): Badge {
  return {
    id: row.id,
    label: row.label,
    blurb: row.blurb,
    derived: row.derived,
    grantedAt: row.granted_at,
    note: row.note,
  }
}

/**
 * The signed-in account's own badges, derived first then most recently
 * granted. Null means the read FAILED, which is not the same fact as an
 * account with no badges — see src/store/useOwnedPacks.ts.
 *
 * There is no user id to pass and there never will be: the server resolves the
 * caller from their JWT, because a verb that answers "what does THAT account
 * hold" is a profile-scraping endpoint with a friendly name on it.
 */
export async function myBadges(): Promise<Badge[] | null> {
  const { data, error } = await supabase.rpc('tdg_my_badges')
  // Any error at all, including PostgREST's PGRST202 for an RPC this project
  // has not been given yet: an app deployed ahead of its migration must render
  // "we could not find out", never a crash and never an empty shelf.
  if (error) return null
  return ((data as BadgeRow[] | null) ?? []).map(toBadge)
}

/**
 * How many TDG accounts there are, and how many badges have been awarded.
 * Null means the read failed.
 *
 * The number is the server's own count of `public.profiles` — the same count
 * the Developer console's overview calls `accounts`. Nothing here rounds it,
 * floors it, pads it or falls back to one: a made-up count is a lie printed on
 * every page of the site, and a missing one is a line that simply is not drawn.
 */
export async function publicStats(): Promise<{
  accounts: number
  badgesAwarded: number
} | null> {
  const { data, error } = await supabase.rpc('tdg_public_stats')
  if (error) return null
  const row = (data as { accounts: number; badges_awarded: number }[] | null)?.[0]
  if (!row) return null
  return { accounts: row.accounts, badgesAwarded: row.badges_awarded }
}

/**
 * One account's whole switchboard, for the Developer console: every badge in
 * the catalogue with `held` set, so the console can draw a switch for a badge
 * nobody has yet.
 *
 * Throws on refusal — a non-developer gets `42501` from `tdg_admin_uid()`, and
 * the console shows what the server said.
 */
export async function adminBadges(userId: string): Promise<AdminBadge[]> {
  const { data, error } = await supabase.rpc('tdg_admin_badges', { p_target: userId })
  if (error) throw new Error(worded(error.message))
  return ((data as AdminBadgeRow[] | null) ?? []).map((row) => ({
    ...toBadge(row),
    held: row.held,
    grantedBy: row.granted_by,
  }))
}

/**
 * Turn one badge on or off for one account. Idempotent in both directions:
 * this sends the state the switch should be IN, not a delta, so a double-click
 * and a stale page land on the same answer.
 *
 * Throws on refusal, and a derived badge is a refusal with a sentence in it —
 * the server will not let Developer or Subscriber be set by hand, because both
 * follow something the database already knows. Show the message; do not
 * pre-empt it here. The boundary is in Postgres and only in Postgres.
 */
export async function adminSetBadge(
  userId: string,
  badge: string,
  on: boolean,
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('tdg_admin_badge_set', {
    p_target: userId,
    p_badge: badge,
    p_on: on,
    p_note: note?.trim() || null,
  })
  if (error) throw new Error(worded(error.message))
}
