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
    what: 'Paying and renewing. The card names the renewal date and offers Manage or Cancel Plan.',
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

/* ── one pack, one control ─────────────────────────────────────────────── */

/**
 * A pack's WHOLE state as a single value: not held at all, or the shape it is
 * held in.
 *
 * ## Why `none` belongs in this list
 *
 * The console used to ask two questions about one pack — a switch for whether
 * the account has it, and, only once that switch was on, a dropdown for how.
 * Two controls for one fact, in a fixed order, with a wrong state in between:
 * to make somebody a subscriber you first had to grant them the pack outright,
 * which wrote a perpetual grant and a purchase-event row, and only then could
 * you say what you actually meant. Turning it on was never what you wanted; it
 * was a toll on the way to the thing you wanted.
 *
 * So ownership is not a separate question. It is the first entry of the same
 * list, every choice is one write, and there is no order to get right.
 *
 * ## Why a one-time pack still gets a list of two
 *
 * Because the alternative is two different controls on one shelf — a switch on
 * the Theme Pack and a dropdown on the Pro Export Pack, side by side, in a grid
 * — and a reader would have to learn which packs work which way before they
 * could read either. One control, whose options are whatever that pack can
 * actually be, is the same idea `GRANT_SHAPES` already was: the states
 * themselves, named the way the Store names them.
 */
export type HoldingId = 'none' | GrantShape['id']

export type Holding = {
  id: HoldingId
  /** Title Case: it is the name of a state. */
  label: string
  /** Sentence case: what the Store card will say, so the picker previews itself. */
  what: string
}

const NOT_HELD: Holding = {
  id: 'none',
  label: 'Not Owned',
  what: 'The account does not have this pack, and the Store offers to sell it.',
}

/**
 * The states THIS pack can be in.
 *
 * A pack the shop sells on a recurring plan gets the six shapes; a one-time
 * pack gets the one it can be in, named the way a shelf names it. `Yours For
 * Good` earns its longer name only where it has rented states to be told apart
 * from — on a pack that is only ever bought once, that contrast does not exist
 * and `Owned` is what the card says.
 */
export function holdingsFor(supportsSubscriptionStates: boolean): Holding[] {
  if (!supportsSubscriptionStates) {
    return [
      NOT_HELD,
      {
        id: 'perpetual',
        label: 'Owned',
        what: 'Bought once and kept. There is no clock on it and nothing to renew.',
      },
    ]
  }
  return [NOT_HELD, ...GRANT_SHAPES.map((s) => ({ id: s.id, label: s.label, what: s.what }))]
}

/**
 * Which of those states a pack is in right now.
 *
 * `null` means the account holds it in a shape this site has no reading for —
 * `standingOfGrant`'s `unknown`, which by definition has no preset — and the
 * control says so rather than silently showing the first option.
 */
export function holdingOf(
  owned: boolean,
  grant: PackGrant | null | undefined,
  supportsSubscriptionStates: boolean,
): HoldingId | null {
  if (!owned) return 'none'
  if (!supportsSubscriptionStates) return 'perpetual'
  return shapeOfGrant(grant, owned)
}
