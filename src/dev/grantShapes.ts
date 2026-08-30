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
 * ## `lapsed` ends NOW, and used to end three days ago
 *
 * The date on a grant is not private bookkeeping: `standingOfGrant` prints it
 * on the customer's own card, word for word — *"Ended on 25 August 2026. Nothing
 * is being charged."* So a preset that backdates is a preset that puts a false
 * sentence on somebody's Store page, and `Ended` backdated by three days: press
 * it today and the shop told the account it had lapsed the Saturday before.
 *
 * The three days were defensive and bought nothing. They were reasoned from
 * `dunning`'s fortnight of retries — `<app>_packs_in_force()` keeps a *failed
 * payment* alive while Stripe retries, so a `past_due` row a day old still
 * reads as in force. `Ended` is not `past_due`. It carries `status =
 * 'canceled'`, which `veditor_packs_in_force` does not accept at any date and
 * which `standingOfGrant` reads as lapsed before it looks at the clock. The
 * pack leaves `owned_packs` the moment the grant is written either way, so the
 * only thing the offset changed was the date printed at the customer.
 *
 * Zero is therefore the honest offset AND the only one that needs no argument:
 * a developer pressing Ended is ending it now, and the card says so.
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
    what: 'Over as of now. The pack leaves owned_packs on its own, the card says it ended today, and the Store offers to sell it again.',
    kind: 'subscription',
    status: 'canceled',
    // Now, not a backdate. The card prints this date at the customer; see the
    // header. `canceled` is what takes the pack away, never the clock.
    days: 0,
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
export type HoldingId = 'none' | GrantShape['id'] | 'revoked' | 'restore' | 'reset'

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
 * Two states that are not about a grant at all, and belong in this list anyway.
 *
 * `Not Owned` and `Revoked` look alike from the account's side — neither of
 * them has the pack — and they are opposite decisions. Not Owned puts a Buy
 * button in front of somebody. Revoked is the standing answer that they may not
 * have it and may not buy it, and it survives everything a purchase can do.
 * Keeping it out of this list would mean a second switch beside the picker,
 * which is the two-controls-for-one-fact shape this whole file exists to
 * remove — and worse, it would make the difference between the two invisible
 * on the tile, which is the only place a tired developer reads it.
 *
 * `Restore What Was Taken` is offered ONLY while a pack is revoked, and it is
 * the one option here whose answer the console does not know. The block carries
 * the exact grant it removed and the server writes it back — dates, `since` and
 * all — so lifting is not "guess what they had", which is what every other
 * option in the list would make it. Picking a different state instead lifts the
 * block and then writes that state, which is a decision rather than a recovery.
 */
const REVOKED: Holding = {
  id: 'revoked',
  label: 'Revoked',
  what: 'Out of reach: the account cannot hold this and the Store will not sell it. The card says so, with the reason and the date.',
}

const RESTORE: Holding = {
  id: 'restore',
  label: 'Restore What Was Taken',
  what: 'Lifts the block and writes back exactly the grant it removed — the same dates, and the same day they first got it.',
}

/**
 * The third option whose answer this console does not know, and the only one
 * that is not a decision at all.
 *
 * Every other entry in this list SAYS something about the account: they have
 * it, they do not, they may not. This one says *forget that we said anything*
 * — the grants only a hand grant explains come off, the blocks come off, and
 * whatever Stripe actually paid for is left standing. It is the option a
 * developer wants after an afternoon of trying states out on a real person's
 * row, and until now the only way back was remembering which of the six states
 * had been real, which nothing on this page records.
 *
 * It belongs in this list rather than beside it for `Restore`'s reason one turn
 * further on: a second control for "what does this account hold" is the
 * two-controls-for-one-fact shape the whole file exists to remove. The server
 * decides what survives — see `tdg_admin_reset_product` — and the console shows
 * what it did afterwards rather than predicting it.
 */
const RESET: Holding = {
  id: 'reset',
  label: 'Reset To What Was Paid For',
  what: 'Forgets what this console did to this pack: any hand-made grant comes off and any block is lifted. What Stripe actually paid for stays, and that is what the account is left holding.',
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
export function holdingsFor(
  supportsSubscriptionStates: boolean,
  revoked = false,
  /** Can this app be reset at all? False for one with no purchase ledger,
   *  where the server refuses — an option that can only fail is worse than no
   *  option, which is this folder's own position (see `BadgesPanel`). */
  resettable = true,
): Holding[] {
  const grants: Holding[] = supportsSubscriptionStates
    ? GRANT_SHAPES.map((s) => ({ id: s.id, label: s.label, what: s.what }))
    : [
        {
          id: 'perpetual',
          label: 'Owned',
          what: 'Bought once and kept. There is no clock on it and nothing to renew.',
        },
      ]
  const undo: Holding[] = resettable ? [RESET] : []
  // Revoked FIRST while it is the answer, because it is the state the tile is
  // in and a picker whose current value is buried at the bottom reads as a
  // picker that has not been set. Reset sits with the other recovery option
  // there, and last of all otherwise: it is the one entry that is not a state,
  // so it must never sit where the eye looks for the current one.
  if (revoked) return [REVOKED, RESTORE, ...undo, NOT_HELD, ...grants]
  return [NOT_HELD, ...grants, REVOKED, ...undo]
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
  revoked = false,
): HoldingId | null {
  // A block outranks everything below it: the server takes the grant when the
  // block goes on, so a revoked pack IS unowned — and drawing it as `Not
  // Owned` would be the tile offering to sell somebody a thing we have decided
  // they may not buy.
  if (revoked) return 'revoked'
  if (!owned) return 'none'
  if (!supportsSubscriptionStates) return 'perpetual'
  return shapeOfGrant(grant, owned)
}
