/**
 * How a pack is HELD, and what that means for the person holding it.
 *
 * ## Two kinds of ownership, and only one of them has a clock
 *
 * `<app>_entitlements.owned_packs` answers "do they have it right now" and is
 * the only thing the apps gate on. It is DERIVED, by a trigger, from a second
 * column: `grants`, an object keyed by pack id that records HOW each pack is
 * held. A pack bought outright is `perpetual` and has no clock at all. A pack
 * subscribed to carries Stripe's own status, the end of the period that has
 * been paid for, and whether it is set to stop at the end of it.
 *
 * This file gives those values a meaning for a reader. It decides nothing.
 *
 * ## The server owns the answer, and this only owns the SENTENCE
 *
 * `veditor_packs_in_force(grants)` in tdg-core is what actually decides whether
 * a pack is in force, and the app asks the same function. Everything here is
 * for the line the card prints beside it, so a browser with a wrong clock can
 * mis-word a date and can never grant or take away a pack. That split is the
 * reason this file may mirror the server's rules without being a second
 * authority on them: the worst a mismatch here can do is say "renews" for an
 * hour after it renewed.
 *
 * ## Why every field is optional
 *
 * `grants` is another app's jsonb, written by that app's own Stripe webhook.
 * This site reads it and never writes it. A field this site has not heard of is
 * not an error, and a field missing is not a lie — it is an older row, or an
 * app that records less. So the shape is permissive and `standingOfGrant`
 * always returns something with a face, including for a `kind` nobody here
 * recognises. A state a reader can reach and cannot read is a bug.
 */

/** One entry of an app's `grants` column, exactly as that app's webhook wrote it. */
export type PackGrant = {
  /** `perpetual` (bought outright) or `subscription` (rented). */
  kind?: string | null
  /** Stripe's own subscription status, for a subscription. Null for perpetual. */
  status?: string | null
  /** ISO: the end of the period already paid for. */
  currentPeriodEnd?: string | null
  /** Set to stop at the end of the period above, rather than renew. */
  cancelAtPeriodEnd?: boolean | null
  /** Stripe's `sub_…`. What `tdg-site-billing` acts on, and the only handle there is. */
  subscriptionId?: string | null
  /** ISO: when this pack was first granted. Never moves on a renewal. */
  since?: string | null
}

/**
 * How long a pack survives a payment that failed.
 *
 * Mirrors the grace window inside `veditor_packs_in_force`, which is the
 * authority — a card that said "gone" while the server still said "owned"
 * would be telling somebody they had lost what they had not. Stripe retries a
 * failed card for about two weeks; the pack stays on through that, and the
 * card says the payment failed rather than pretending everything is fine.
 */
const DUNNING_GRACE_DAYS = 14

export type StandingKind =
  /** Bought outright. There is nothing to renew and nothing to cancel. */
  | 'perpetual'
  /** Paying, and renewing on the date. */
  | 'active'
  /** In a free trial that has not been billed yet. */
  | 'trial'
  /** Still working, but set to stop at the end of the period. */
  | 'ending'
  /** The payment failed and Stripe is retrying. Still working, for now. */
  | 'dunning'
  /** Over: cancelled and the period ran out, or the retries did. */
  | 'lapsed'
  /** A `kind` this site has not heard of. Given a face rather than dropped. */
  | 'unknown'

export type PackStanding = {
  kind: StandingKind
  /** Title Case: the state's name, shown as a tag beside Owned. */
  label: string
  /** Sentence case: one line saying what happens next, and when. */
  note: string
  /** When the paid-for period runs out. Null when there is no clock. */
  endsAt: Date | null
  /**
   * Is there a live Stripe subscription behind this that can be changed?
   *
   * False for a perpetual grant, for a lapsed one, and — importantly — for a
   * subscription grant with no `subscriptionId` on it, which is what a pack
   * granted by hand from `#/dev` looks like. Offering to cancel something with
   * no handle to cancel would be a button that can only ever fail.
   */
  manageable: boolean
  /** Is it set to stop at the end of the period? Drives Cancel vs Resume. */
  ending: boolean
}

const day = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `2026-09-12T…` → `12 September 2026`, in the READER'S timezone. Null when
 *  there is no usable date, so a caller has to say something else rather than
 *  print `Invalid Date` at somebody. */
export function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? null : day.format(at)
}

function dateOf(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * What this grant means, in the words the card prints.
 *
 * Ordered worst-first among the things that are still true, the same way
 * `standingOf` in the Developer console is: a subscription that is both ending
 * and behind on payment is shown as BEHIND, because that is the one with
 * something to do about it.
 *
 * `null` in means the app records no grants at all — DevFleet's table has no
 * `grants` column today — which is not a subscription and not an error. It is
 * a pack held the way every pack on this shelf used to be held.
 */
export function standingOfGrant(grant: PackGrant | null | undefined): PackStanding {
  const kind = (grant?.kind ?? '').toLowerCase()

  if (!grant || kind === 'perpetual' || kind === '') {
    return {
      kind: 'perpetual',
      label: 'Yours For Good',
      note: 'Paid once. Nothing renews, and there is nothing to cancel.',
      endsAt: null,
      manageable: false,
      ending: false,
    }
  }

  if (kind !== 'subscription') {
    // A kind written by an app newer than this page. It is a real grant on a
    // real account, so it gets a real tile that says exactly what is known.
    return {
      kind: 'unknown',
      label: 'On Your Account',
      note: 'Held in a way this page cannot read yet. It is yours either way.',
      endsAt: dateOf(grant.currentPeriodEnd),
      manageable: false,
      ending: grant.cancelAtPeriodEnd === true,
    }
  }

  const status = (grant.status ?? '').toLowerCase()
  const endsAt = dateOf(grant.currentPeriodEnd)
  const ending = grant.cancelAtPeriodEnd === true
  const on = formatDay(grant.currentPeriodEnd)
  const subscriptionId = (grant.subscriptionId ?? '').trim()
  const manageable = subscriptionId !== ''
  const now = Date.now()

  const paidUpTo = endsAt ? endsAt.getTime() : 0
  const graceTo = paidUpTo + DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000

  if (status === 'past_due' || status === 'unpaid') {
    if (paidUpTo !== 0 && graceTo > now) {
      return {
        kind: 'dunning',
        label: 'Payment Failed',
        note: 'The last payment did not go through. It keeps working while your card is retried.',
        endsAt,
        manageable,
        ending,
      }
    }
    return {
      kind: 'lapsed',
      label: 'Lapsed',
      note: 'The payments stopped and the retries ran out. Subscribe again whenever you want it.',
      endsAt,
      manageable: false,
      ending,
    }
  }

  if (status === 'canceled' || (paidUpTo !== 0 && paidUpTo <= now)) {
    return {
      kind: 'lapsed',
      label: 'Ended',
      note: on
        ? `Ended on ${on}. Nothing is being charged.`
        : 'Ended. Nothing is being charged.',
      endsAt,
      manageable: false,
      ending,
    }
  }

  if (ending) {
    return {
      kind: 'ending',
      label: 'Ends Soon',
      note: on
        ? `Cancelled. Yours in full until ${on}, then it stops.`
        : 'Cancelled. Yours in full to the end of the period you paid for, then it stops.',
      endsAt,
      manageable,
      ending: true,
    }
  }

  if (status === 'trialing') {
    return {
      kind: 'trial',
      label: 'Trial',
      note: on
        ? `A free trial. The first payment is taken on ${on}.`
        : 'A free trial. The first payment is taken when it ends.',
      endsAt,
      manageable,
      ending: false,
    }
  }

  return {
    kind: 'active',
    label: 'Subscribed',
    note: on
      ? `Renews on ${on}. Cancel any time and you keep it to that date.`
      : 'Renewing. Cancel any time and you keep it to the end of the period you paid for.',
    endsAt,
    manageable,
    ending: false,
  }
}

/** The tone a standing is drawn in. Only three, and they mean what they mean
 *  everywhere else on this site: green is yours, warm needs you, plain is a fact. */
export function standingTone(standing: PackStanding): 'ok' | 'warn' | 'plain' {
  if (standing.kind === 'dunning') return 'warn'
  if (standing.kind === 'ending') return 'warn'
  if (standing.kind === 'lapsed') return 'plain'
  return 'ok'
}
