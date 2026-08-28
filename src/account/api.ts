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
