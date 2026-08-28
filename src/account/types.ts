/**
 * What an account page is about, in the shape the server already answers in.
 *
 * **No privacy key, audience id or group id is written down in this folder.**
 * The vocabulary lives in `tdg_privacy_catalog()`, `tdg_privacy_audiences()`
 * and `tdg_privacy_groups()` in Postgres
 * (supabase/migrations/20260828090000_tdg_privacy_and_table_merges.sql and
 * ..._093000_tdg_privacy_groups.sql), for the reason `src/badges/types.ts`
 * gives about badge ids: a catalogue written down twice will eventually
 * disagree with itself, and the half that is wrong is the one offering a
 * choice the database then refuses.
 *
 * Every id below is therefore `string`, never a union. A control added by a
 * migration tomorrow renders here today.
 */

/** One of `tdg_privacy_audiences()` — everyone, friends only, only me. */
export type Audience = {
  id: string
  label: string
  blurb: string
  /**
   * The same audience said again for a **contact** control, where the middle
   * value means friends OF friends rather than friends. One row of copy per
   * meaning, in the one place the meanings are decided: without this the page
   * would have to know that `friend_requests` is the odd one out, which is
   * exactly the knowledge `kind` exists to keep out of TypeScript.
   */
  contactBlurb: string
  /** Narrowness. 0 is the widest audience, so a comparison is arithmetic. */
  rank: number
}

/** One row of the privacy list: a control, and what it is currently set to. */
export type PrivacyControl = {
  id: string
  label: string
  blurb: string
  /** Which heading it is written under; resolved through `PrivacyGroup`. */
  group: string
  /**
   * `content` is something the page SAYS about you and is gated by the
   * profile control above it. `contact` is something somebody may DO to you
   * and deliberately is not — a private profile can still receive a friend
   * request. The page reads this rather than naming the exception.
   */
  kind: string
  /** Exactly the audiences this control may be set to. Never assumed to be three. */
  allowed: string[]
  audience: string
  /** True while this is the value the catalogue chose, not one the reader did. */
  isDefault: boolean
  sort: number
}

/** A heading in the privacy list. */
export type PrivacyGroup = {
  id: string
  label: string
  blurb: string
  sort: number
}

/** One app's streak, as `tdg_my_account_stats()` answers it. */
export type StreakSummary = {
  current: number
  longest: number
  days: number
  /** `YYYY-MM-DD`, or null when nothing has been counted yet. */
  lastActive: string | null
}

/**
 * Everything the Account page counts, in one answer.
 *
 * `apps`, `packs` and `streaks` are keyed by app id and are **derived by the
 * server** from what it actually found — `tdg_store_apps()` for the packs, and
 * whatever has ever written a row for the other two. Nothing here lists an app
 * (AGENTS.md rule 17), so a product added tomorrow appears on this page with
 * no change to this file.
 */
export type AccountStats = {
  createdAt: string
  friends: number
  requestsIn: number
  requestsOut: number
  blocked: number
  badges: number
  feedbackSent: number
  apps: Record<string, { since: string | null; earned: Record<string, string> }>
  packs: Record<string, string[]>
  streaks: Record<string, StreakSummary>
}
