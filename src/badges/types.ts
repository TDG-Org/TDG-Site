/**
 * What a badge is on this site, in the shape the server already answers in.
 *
 * The vocabulary itself — which badges exist, what they are called, which of
 * them are computed — lives in `tdg_badge_catalog()` in Postgres
 * (supabase/migrations/20260826120000_tdg_account_badges.sql). Nothing here
 * lists a badge id, on purpose: a catalogue written down twice is a catalogue
 * that will eventually disagree with itself, and the half that is wrong is the
 * one that offers a badge the database then refuses.
 */

export type Badge = {
  id: string
  label: string
  blurb: string
  /** Computed by the database from something else it already knows, so it can
   *  never be granted or revoked by hand. */
  derived: boolean
  /** null for a derived badge — there was no moment somebody awarded it. */
  grantedAt: string | null
  note: string | null
}

/**
 * One row of the Developer console's switchboard: every badge in the
 * catalogue, whether this account holds it or not. `held` is what the switch
 * is set to; the console draws the full set rather than only what is already
 * on, so a badge nobody has is still reachable.
 */
export type AdminBadge = Badge & { held: boolean; grantedBy: string | null }
