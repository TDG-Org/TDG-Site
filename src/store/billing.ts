import { supabase } from '../lib/supabase'

/**
 * Changing or stopping a subscription, from the Store card that shows it.
 *
 * ## Why none of this happens in the browser
 *
 * Every call here goes to `tdg-site-billing`, an Edge Function on tdg-core.
 * Acting on a subscription needs the Stripe secret key, and a public site may
 * never hold one — the same division of labour the buy path already keeps,
 * where the browser only ever opens a Stripe-hosted page.
 *
 * The request carries **no customer id and no subscription id**, and neither
 * would be honoured if it did. The function resolves the caller from their
 * Supabase access token, reads that account's own `<app>_entitlements` row with
 * the service key, and takes the subscription id from the grant it finds there.
 * So a client can only ever act on its own subscription, whatever it sends.
 *
 * ## Cancelling means "stop renewing", never "stop now"
 *
 * `cancel` asks Stripe to set `cancel_at_period_end`, so the pack keeps working
 * for every day already paid for and simply does not renew. That is not a
 * courtesy this page arranges: `<app>_packs_in_force` in tdg-core keeps a
 * cancelled-but-unexpired subscription in force, and the app reads the same
 * function, so the entitlement genuinely survives to the date the card names.
 * `resume` is the same call the other way and puts the renewals back.
 *
 * ## Why cancelling is a direct call and changing plans is a portal
 *
 * Cancelling has exactly one correct outcome, and doing it here guarantees the
 * at-period-end behaviour rather than inheriting whatever a Stripe dashboard
 * setting happens to say. Changing a plan does not: it is proration, a payment
 * method that may need re-authorising, and a price list that is Stripe's to
 * state. That belongs on Stripe's own page, so `manage` returns a short-lived
 * URL and the card opens it in a new tab — the same new-tab rule the buy path
 * follows, so the shop is still there to see the answer land.
 */

const BILLING_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tdg-site-billing`

/** What the card is asking Stripe's own page to open at. */
export type ManageIntent =
  /** The plan picker: switch between the recurring plans, prorated. */
  | 'update'
  /** The billing home: card details, receipts, and the renew button. */
  | 'billing'

/**
 * Every refusal this path can produce, as a CODE.
 *
 * Matched on codes and never on message text, for the reason
 * `src/auth/wording.ts` sets out at length: a table of substrings answers the
 * wrong sentence the first time two messages overlap, and which arm wins is
 * decided by nothing more principled than the order they were written in.
 */
export type BillingError =
  | 'unauthorized'
  | 'bad_request'
  | 'no_customer'
  | 'not_a_subscription'
  | 'billing_unavailable'
  | 'stripe_error'
  | 'server_error'
  | 'offline'

export type BillingResult<T> = { ok: true; value: T } | { ok: false; error: BillingError }

const KNOWN_ERRORS: readonly string[] = [
  'unauthorized',
  'bad_request',
  'no_customer',
  'not_a_subscription',
  'billing_unavailable',
  'stripe_error',
  'server_error',
]

function asError(code: unknown): BillingError {
  const raw = String(code ?? '')
  return (KNOWN_ERRORS.includes(raw) ? raw : 'server_error') as BillingError
}

async function call(body: Record<string, unknown>): Promise<BillingResult<Record<string, unknown>>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  // No session is not a server problem and must not be worded as one: the card
  // that offered this button is only ever drawn for a signed-in reader, so
  // reaching here means the session ended underneath them.
  if (!token) return { ok: false, error: 'unauthorized' }

  let res: Response
  try {
    res = await fetch(BILLING_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    })
  } catch {
    // Never reached the server at all. A different thing from a refusal, and
    // the reader can do something about this one.
    return { ok: false, error: 'offline' }
  }

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) return { ok: false, error: asError(payload.error) }
  return { ok: true, value: payload }
}

/** A short-lived Stripe-hosted URL for this account's own billing. */
export async function openBilling(input: {
  app: string
  pack: string
  intent: ManageIntent
}): Promise<BillingResult<string>> {
  const result = await call({
    action: 'manage',
    app: input.app,
    pack: input.pack,
    intent: input.intent,
    // Where Stripe should send them back to. Checked against an exact-origin
    // allow-list on the server and quietly replaced with the live Store if it
    // is not one of ours, so this can only ever shorten the walk home — never
    // become somewhere we did not mean.
    returnTo: window.location.href,
  })
  if (!result.ok) return result
  const url = String(result.value.url ?? '')
  return url.startsWith('https://') ? { ok: true, value: url } : { ok: false, error: 'stripe_error' }
}

/**
 * Stop the renewals, or put them back.
 *
 * Answers with the period end Stripe reported, so the card can name the date
 * the moment it changes rather than waiting for the webhook to write the grant
 * and the next read to fetch it. The grant is still what the card believes
 * afterwards — this is only what it says in the second before that lands.
 */
export async function setRenewal(input: {
  app: string
  pack: string
  renew: boolean
}): Promise<BillingResult<{ currentPeriodEnd: string | null }>> {
  const result = await call({
    action: input.renew ? 'resume' : 'cancel',
    app: input.app,
    pack: input.pack,
  })
  if (!result.ok) return result
  const end = result.value.currentPeriodEnd
  return { ok: true, value: { currentPeriodEnd: typeof end === 'string' ? end : null } }
}

/**
 * What a refusal SAYS. Sentence case, and every one of them ends in something
 * the reader can do — a message that only names a fault is a dead end wearing
 * an apology.
 */
export function billingMessage(error: BillingError): string {
  switch (error) {
    case 'unauthorized':
      return 'That session has ended. Sign in again and this will be here.'
    case 'no_customer':
      return 'There is no Stripe billing record on this account, so there is nothing here to change. If you did pay for this, write to us and we will sort it out.'
    case 'not_a_subscription':
      return 'This one is not on a plan, so there is nothing to renew or cancel.'
    case 'billing_unavailable':
      // Ours to fix, not theirs, so it does not ask them to try their card.
      // The Edge Function logs which setting is missing at error level.
      return 'Our billing setup would not let that through, and nothing on your account has changed. Write to us and we will do it for you the same day.'
    case 'stripe_error':
      return 'Stripe refused that just now, and nothing on your account has changed. Try again in a moment, or write to us.'
    case 'offline':
      return "Couldn't reach the billing server. Check your connection and try again."
    case 'bad_request':
    case 'server_error':
    default:
      return 'Something went wrong and nothing was changed. Try again in a moment, or write to us.'
  }
}
