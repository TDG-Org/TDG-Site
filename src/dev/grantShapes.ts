import { standingOfGrant, type PackGrant } from '../store/grant'

/**
 * The shapes a pack can be held in, as one press each.
 *
 * ## Why presets and not seven fields
 *
 * A grant is a kind, a status, a date and a flag, and typing four of those to
 * see one card is four chances to produce a combination the shop has no reading
 * for. What a developer actually wants is the STATE — "show me the one that is
 * about to run out" — so the list below is the states themselves, named the way
 * the Store names them, and the four fields are derived.
 *
 * There is one entry here for every reading `standingOfGrant` can return except
 * `unknown`, which is by definition a shape this site has not been taught and
 * so cannot be produced deliberately. That correspondence is the point: if the
 * Store can draw it, this list can reach it, and a state nobody can reach is a
 * state nobody has looked at.
 *
 * ## Why the dates are computed here and not in SQL
 *
 * The server takes an explicit timestamp rather than a shape name, so it stays
 * a general verb — support will one day need to move a real subscriber's period
 * end, and that must not require a migration to add a preset for. The offsets
 * below are only this console's opinion about what "a month from now" means.
 *
 * `lapsed` deliberately sits three days in the PAST. `<app>_packs_in_force()`
 * keeps a failed payment alive for a fortnight's worth of retries, so a date
 * merely a day old still reads as `dunning`; three days past with a `canceled`
 * status is unambiguous, and the pack drops out of `owned_packs` on its own the
 * moment it is written.
 */
export type GrantShape = {
  /** Matches `PackStanding.kind`, so the current shape can be read back off a grant. */
  id: 'perpetual' | 'active' | 'ending' | 'trial' | 'dunning' | 'lapsed'
  /** Title Case: what the Store's own card calls this state. */
  label: string
  /** Sentence case: what the card will say, so the picker is a preview of itself. */
  what: string
  kind: 'perpetual' | 'subscription'
  status: string | null
  /** Days from now to the period end. Negative is in the past. Null for perpetual. */
  days: number | null
  cancelAtPeriodEnd: boolean
}

export const GRANT_SHAPES: readonly GrantShape[] = [
  {
    id: 'perpetual',
    label: 'Yours For Good',
    what: 'Bought outright. No clock, nothing to renew, nothing to cancel.',
    kind: 'perpetual',
    status: null,
    days: null,
    cancelAtPeriodEnd: false,
  },
  {
    id: 'active',
    label: 'Subscribed',
    what: 'Paying and renewing. The card names the renewal date and offers Manage Plan.',
    kind: 'subscription',
    status: 'active',
    days: 30,
    cancelAtPeriodEnd: false,
  },
  {
    id: 'ending',
    label: 'Ends Soon',
    what: 'Cancelled but still in force. Kept in full to the date, then it stops.',
    kind: 'subscription',
    status: 'active',
    days: 12,
    cancelAtPeriodEnd: true,
  },
  {
    id: 'trial',
    label: 'Trial',
    what: 'Not billed yet. The first payment is taken when the trial ends.',
    kind: 'subscription',
    status: 'trialing',
    days: 14,
    cancelAtPeriodEnd: false,
  },
  {
    id: 'dunning',
    label: 'Payment Failed',
    what: 'The card was refused and Stripe is retrying. Still in force through the grace window.',
    kind: 'subscription',
    status: 'past_due',
    days: -1,
    cancelAtPeriodEnd: false,
  },
  {
    id: 'lapsed',
    label: 'Ended',
    what: 'Over. The pack leaves owned_packs on its own, and the Store offers to sell it again.',
    kind: 'subscription',
    status: 'canceled',
    days: -3,
    cancelAtPeriodEnd: true,
  },
]

/** The arguments `api.setPackGrant` wants for one shape, dated from now. */
export function grantArgsFor(shape: GrantShape): {
  kind: 'perpetual' | 'subscription'
  status: string | null
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
} {
  return {
    kind: shape.kind,
    status: shape.status,
    periodEnd:
      shape.days === null
        ? null
        : new Date(Date.now() + shape.days * 24 * 60 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: shape.cancelAtPeriodEnd,
  }
}

/**
 * Which shape a grant currently reads as, so the picker shows where the account
 * IS rather than an empty box.
 *
 * Read through `standingOfGrant` — the same function the Store card reads it
 * through — rather than by inspecting the fields again here. Two readings of
 * one row is how a console comes to disagree with the page it is about.
 *
 * Null when the account does not hold the pack at all, and for `unknown`, which
 * has no preset by design.
 */
export function shapeOfGrant(grant: PackGrant | null | undefined, owned: boolean): GrantShape['id'] | null {
  if (!owned && !grant) return null
  const kind = standingOfGrant(grant).kind
  return kind === 'unknown' ? null : kind
}
