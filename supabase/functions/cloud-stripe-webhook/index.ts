/** `cloud-stripe-webhook` — Stripe → TDG Cloud plan ownership.
 *
 *  ── Why this exists ──
 *  Nothing anywhere may trust a client-supplied "I have a Cloud plan". Stripe
 *  is the only source of truth for who has actually paid, so
 *  `cloud_entitlements` is written ONLY from here, using the service role
 *  key — the same rule `veditor-stripe-webhook` and `devfleet-stripe-webhook`
 *  keep on this same project, and this function is deliberately a sibling of
 *  those rather than a shared endpoint: two products behind one webhook means
 *  a change made for one can break the other's purchases.
 *
 *  It deploys and answers TODAY, while TDG Cloud is still Coming Soon, on
 *  purpose: the payment links are deactivated, so nothing arrives — but the
 *  launch checklist is "activate the links", not "also remember the webhook".
 *
 *  ── What is DIFFERENT from the veditor copy, and why ──
 *  1. The grant carries `plan` ('monthly' | 'annual'). The Cloud metrics
 *     normalise revenue per cadence (`tdg_admin_cloud_metrics`), and a grants
 *     object that cannot say which price is behind it makes MRR a guess.
 *     Stamped from the payment link's metadata at checkout, and kept true by
 *     rule 2 afterwards.
 *  2. Subscription events resolve the pack and plan FROM THE LIVE PRICE ID,
 *     against the price ids `tdg_cloud_config` records. Stripe's billing
 *     portal can move a subscription between prices — Standard to Studio,
 *     monthly to annual — and the subscription's metadata does NOT follow.
 *     A webhook that trusted the stored pack would leave somebody paying for
 *     Studio while holding Standard's quota. When the price maps to a
 *     different pack than the grant is stored under, the grant MOVES.
 *  3. There is no lifetime branch. Cloud is rent for storage that costs us
 *     rent; a one-off payment reaching this endpoint with `app=cloud` is a
 *     mistake, so it is RECORDED and grants nothing, and the ledger row is
 *     the support trail.
 *  4. The grant write is a Postgres function, `cloud_apply_grant`, and not a
 *     PostgREST upsert, so a pack under a revocation can never come back
 *     through here — see "A pack a developer has revoked stays revoked"
 *     below. The veditor copy still upserts, and needs the same treatment.
 *
 *  ── Authentication: the event is REFETCHED, never trusted ──
 *  The posted body is used for exactly one thing: the event id. The event is
 *  then fetched back from Stripe's own API with this project's secret key,
 *  and only the FETCHED copy is processed. A forged body can therefore never
 *  inject data — the worst it can do is name a genuine event, which
 *  re-applies an idempotent write. This replaces a `Stripe-Signature` HMAC
 *  check on purpose: a signing secret is per-endpoint and has to be
 *  provisioned into the project's secrets by hand, and a webhook that
 *  silently no-ops until somebody remembers a dashboard step is a purchase
 *  that vanishes. The Stripe key is already in this project's environment.
 *
 *  ── Ordering: read the ledger, write the state, then write the ledger ──
 *  Inherited from `mak-stripe-webhook`, which learned it the expensive way:
 *  a ledger row written BEFORE the state write turns one transient PostgREST
 *  failure into a purchase that is never granted, because the retry is
 *  dismissed as a duplicate. So:
 *    1. READ `cloud_purchase_events`. A row means this event already
 *       completed; answer 200 and touch nothing. Fails OPEN on a ledger
 *       outage — re-applying an idempotent write costs nothing, refusing a
 *       real grant costs somebody their plan.
 *    2. Apply the state write, checking every response. A failed READ throws
 *       too: computing "what do they already hold" from a quietly-null row
 *       would drop grants on the floor.
 *    3. Only then insert the ledger row. If the state write failed, answer
 *       500 with no ledger row, so Stripe's retry re-applies.
 *
 *  ── Whose purchase is this ──
 *  `client_reference_id` first (the Store appends it to the payment link),
 *  then `metadata.user_id`, then the payer's email resolved through
 *  `cloud_user_for_email` — SECURITY DEFINER, granted to `service_role` only,
 *  so this fallback is not an account-existence oracle. A payment that
 *  resolves to nobody is RECORDED with a null user and granted to no one.
 *
 *  ── A pack a developer has revoked stays revoked ──
 *  `tdg_admin_set_revocation` takes a pack's grant OFF the live row and keeps
 *  it in `tdg_product_revocations.held_before`, and the Store's revoked card
 *  can cancel the subscription behind it — but Stripe goes on raising events
 *  for that subscription until somebody does. Every write on this path goes
 *  through `cloud_apply_grant` in Postgres, and for a pack under a block
 *  (its own row, or the whole app's `*` row) that function writes Stripe's
 *  latest word into the block's held copy and leaves the live row alone.
 *  `cloud_user_for_subscription` looks under the block too, so the renewal
 *  is still attributed to its account in the ledger: money taken is money
 *  taken, revoked or not. Lifting the block then restores the CURRENT
 *  grant — the latest period end, the latest status — not a snapshot from
 *  the day of the block. Before @3 this function upserted straight onto the
 *  live row, so the first renewal after a revocation put the pack back in
 *  force inside TDG Cloud itself, since `cloud_packs_in_force()` reads that
 *  row. Latent (no Cloud subscription exists yet), and found by reading.
 *
 *  ── Two checkout events, because a payment is not always instant ──
 *  Managed Payments means Stripe picks the payment methods, several of which
 *  are delayed-notification: `checkout.session.completed` can arrive carrying
 *  `payment_status: 'unpaid'` and the money clears later as
 *  `checkout.session.async_payment_succeeded`. Both are handled and the
 *  `payment_status` guard separates them; see the veditor copy's header for
 *  the long form.
 *
 *  ── One Stripe account, several apps ──
 *  Webhook endpoints receive matching events for the WHOLE account. Anything
 *  whose `metadata.app` is not 'cloud' is answered 200 and NOT recorded.
 *  `customer.subscription.*` events are exempt from the metadata test and
 *  identified by subscription id or price id instead, because Stripe raises
 *  them without a checkout and metadata only follows if the link was
 *  configured to copy it — refusing them would mean a plan that never lapses.
 *
 *  ── verify_jwt is OFF ──
 *  Stripe calls this endpoint directly with no Supabase session. The refetch
 *  IS the authentication. GET answers a version stamp.
 */

const SOURCE_STAMP = 'cloud-stripe-webhook@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';

/**
 * Which env name holds the Stripe key. The prefix names the STRIPE ACCOUNT:
 * `TDG_APPS_` is the account every TDG app sells on (`acct_1TdSpoARQpFmoZHJ`).
 * The per-app name is an escape hatch for the day Cloud moves to an account
 * of its own, and is meant to stay unset — see `veditor-stripe-webhook`'s
 * header for the two wrong names that preceded this rule and what each cost.
 */
const STRIPE_KEY_NAMES = [
  // Escape hatch. Leave unset while the TDG apps share one Stripe account.
  'CLOUD_STRIPE_SECRET_KEY',
  // The account every TDG app sells on. This is the one that should be set.
  'TDG_APPS_STRIPE_SECRET_KEY',
  // Deprecated, in order of how misleading they are.
  'TDG_STRIPE_SECRET_KEY',
  'STRIPE_SECRET_KEY',
] as const;

const DEPRECATED_STRIPE_KEY_NAMES: readonly string[] = [
  'TDG_STRIPE_SECRET_KEY',
  'STRIPE_SECRET_KEY',
];

function resolveEnv(names: readonly string[]): { name: string | null; value: string } {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value !== undefined && value !== '') return { name, value };
  }
  return { name: null, value: '' };
}

const STRIPE_KEY = resolveEnv(STRIPE_KEY_NAMES);
const STRIPE_SECRET_KEY = STRIPE_KEY.value;
/** Optional. Present only where the money path is meant to be drivable. */
const STRIPE_SECRET_KEY_TEST = resolveEnv([
  'CLOUD_STRIPE_SECRET_KEY_TEST',
  'TDG_APPS_STRIPE_SECRET_KEY_TEST',
  'TDG_STRIPE_SECRET_KEY_TEST',
  'STRIPE_SECRET_KEY_TEST',
]).value;

/** Mirror of `cloud_known_packs()` in tdg-core. A webhook must never write a
 *  pack id it does not recognise. */
const KNOWN_PACKS = ['standard', 'studio'];

const EVENT_ID = /^evt_[A-Za-z0-9]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function fetchWith(key: string, eventId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`https://api.stripe.com/v1/events/${eventId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`event fetch failed: ${res.status}`);
  const body = await res.json();
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
}

/** The FETCHED event — Stripe's own copy. Live key first; the test key, when
 *  set, lets the money path be driven without spending real money, and a test
 *  grant is ledgered `#test` so it can never be mistaken for revenue. */
async function fetchEvent(eventId: string): Promise<Record<string, unknown> | null> {
  const live = await fetchWith(STRIPE_SECRET_KEY, eventId);
  if (live !== null) return live;
  if (STRIPE_SECRET_KEY_TEST === '') return null;
  return await fetchWith(STRIPE_SECRET_KEY_TEST, eventId);
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cloud_purchase_events?stripe_event_id=eq.${encodeURIComponent(eventId)}&select=stripe_event_id`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

type EventAnnotation = {
  userId: string | null;
  pack: string | null;
  amountCents: number | null;
  currency: string | null;
};

async function recordEvent(eventId: string, eventType: string, annotation: EventAnnotation): Promise<void> {
  const write = async (userId: string | null): Promise<Response> =>
    await fetch(`${SUPABASE_URL}/rest/v1/cloud_purchase_events`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify([
        {
          stripe_event_id: eventId,
          event_type: eventType,
          user_id: userId,
          pack: annotation.pack,
          amount_cents: annotation.amountCents,
          currency: annotation.currency,
        },
      ]),
    });
  try {
    let res = await write(annotation.userId);
    if (!res.ok && annotation.userId !== null) {
      // The merged ledger keys `user_id` to `profiles`, so an id that names
      // no account (deleted since, or never one) is refused — and a refused
      // ledger row is money taken with no trail. The row is written again
      // with no user rather than not at all; the amount and the event id
      // are what a refund needs, and the console prints it as unattributed.
      console.error('cloud-stripe-webhook ledger write refused, retrying unattributed', eventId, res.status, await res.text());
      res = await write(null);
    }
    if (!res.ok) console.error('cloud-stripe-webhook ledger write failed', eventId, res.status, await res.text());
  } catch (err) {
    console.error('cloud-stripe-webhook ledger write threw', eventId, err);
  }
}

async function userForEmail(email: string): Promise<string | null> {
  if (email.trim() === '') return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cloud_user_for_email`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ addr: email }),
  });
  if (!res.ok) throw new Error(`cloud_user_for_email failed: ${res.status}`);
  const body = await res.json();
  return typeof body === 'string' && body !== '' ? body : null;
}

/**
 * The shape stored under one key of `cloud_entitlements.grants`. The same
 * fields the veditor grants carry — `src/store/grant.ts` on the site reads
 * both — plus `plan`, which is what lets the Cloud metrics tell a $2.99
 * monthly from a $29.99 annual without guessing from dates.
 */
interface PackGrant {
  kind: 'perpetual' | 'subscription';
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionId: string | null;
  since: string | null;
  plan: string | null;
}

/**
 * The price-id → (pack, plan) map, from the same config row every other part
 * of Cloud reads. Fetched per delivery rather than cached: a webhook warm
 * across a price rotation would otherwise map the OLD ids for as long as the
 * isolate lives, and one delivery per event makes the read cheap.
 */
async function priceMap(): Promise<Map<string, { pack: string; plan: string }>> {
  const map = new Map<string, { pack: string; plan: string }>();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tdg_cloud_config?select=doc`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) return map;
    const rows = await res.json();
    const plans = rows?.[0]?.doc?.plans;
    if (plans === null || typeof plans !== 'object') return map;
    for (const [pack, entry] of Object.entries(plans as Record<string, Record<string, unknown>>)) {
      if (typeof entry?.stripe_price_monthly === 'string' && entry.stripe_price_monthly !== '') {
        map.set(entry.stripe_price_monthly, { pack, plan: 'monthly' });
      }
      if (typeof entry?.stripe_price_annual === 'string' && entry.stripe_price_annual !== '') {
        map.set(entry.stripe_price_annual, { pack, plan: 'annual' });
      }
    }
  } catch (err) {
    console.error('cloud-stripe-webhook could not read the price map', err);
  }
  return map;
}

/** The first price id on a subscription object, from the event payload. */
function priceOfSubscription(subscription: Record<string, unknown>): string | null {
  const items = (subscription.items as Record<string, unknown> | undefined)?.data;
  const price = Array.isArray(items) ? (items[0] as Record<string, unknown>)?.price : null;
  const id = typeof price === 'object' && price !== null ? (price as Record<string, unknown>).id : null;
  return typeof id === 'string' && id !== '' ? id : null;
}

/** Which pack a subscription names in its own metadata, if any. */
function packOfSubscription(subscription: Record<string, unknown>): string | null {
  const meta = (subscription.metadata ?? {}) as Record<string, unknown>;
  const named = String(meta.pack ?? '');
  return KNOWN_PACKS.includes(named) ? named : null;
}

function isoOfEpochSeconds(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

/** How long a subscription checkout buys, derived from the PRICE because this
 *  project's restricted key may not read the subscription itself — measured,
 *  and the story is in `veditor-stripe-webhook`'s copy of this function. The
 *  subscription's own events correct it within seconds. */
const FALLBACK_PERIOD_DAYS = 31;

async function periodEndForSession(
  sessionId: string,
  createdEpochSeconds: unknown,
): Promise<{ end: string; plan: string | null }> {
  const startMs =
    typeof createdEpochSeconds === 'number' && Number.isFinite(createdEpochSeconds)
      ? createdEpochSeconds * 1000
      : Date.now();

  let months = 1;
  let plan: string | null = null;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=1`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
    );
    if (res.ok) {
      const body = await res.json();
      const recurring = body?.data?.[0]?.price?.recurring;
      const interval = String(recurring?.interval ?? '');
      const count = Number(recurring?.interval_count ?? 1) || 1;
      if (interval === 'year') {
        months = 12 * count;
        plan = 'annual';
      } else if (interval === 'month') {
        months = count;
        plan = count >= 12 ? 'annual' : 'monthly';
      }
    }
  } catch {
    // Fall through to the default month. A floor is safe; see the veditor copy.
  }

  if (months <= 0) months = 1;
  const end = new Date(startMs);
  end.setUTCMonth(end.getUTCMonth() + months);
  if (!Number.isFinite(end.getTime())) {
    return {
      end: new Date(startMs + FALLBACK_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      plan,
    };
  }
  return { end: end.toISOString(), plan };
}

/**
 * Write one pack's grant — through `cloud_apply_grant` in Postgres, which is
 * the ONE writer of `cloud_entitlements.grants` on this path since @3, for
 * the reason every other Cloud rule lives there (AGENTS.md rule 12): the
 * revocation boundary. A pack a developer has revoked (its own row in
 * `tdg_product_revocations`, or the whole app's `*` row) never lands on the
 * live row again — not on a renewal, a plan change, a cancellation, or a
 * payment link used by hand. It lands in the block's `held_before`, which is
 * what lifting the block writes back, so the lift restores Stripe's latest
 * word rather than the day of the block. `cloud_packs_in_force()` reads the
 * live row, so a revoked account stays out of TDG Cloud itself, not only
 * off the Store's card.
 *
 * The function keeps everything the upsert here used to keep: `since`
 * survives a renewal, a perpetual grant is never downgraded, an event that
 * changes nothing writes nothing (the retention anchor reads `updated_at`),
 * `stripe_customer_id` is written once and a second payer is reported rather
 * than written, and the pack a portal plan change moved away from is taken
 * off in the same write — from the live row or from a held copy — or the
 * account would hold both quotas on one payment.
 *
 * It WRITES `grants` AND NOT `owned_packs`: `cloud_entitlements_sync_owned`,
 * a BEFORE trigger, derives `owned_packs` through `cloud_packs_in_force()`.
 * A write that set `owned_packs` directly would be wiped on INSERT and
 * honoured on UPDATE — the veditor webhook's header carries the story of
 * what that asymmetry costs.
 */
async function applyGrant(
  userId: string,
  pack: string,
  grant: PackGrant,
  customerId: string | null,
  removePack: string | null = null,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cloud_apply_grant`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_user: userId,
      p_pack: pack,
      p_grant: grant,
      p_customer: customerId,
      p_remove_pack: removePack,
    }),
  });
  // A refused write throws, so the handler answers 500 with no ledger row
  // and Stripe's retry re-applies — the ordering the header argues for.
  if (!res.ok) throw new Error(`cloud_apply_grant failed: ${res.status} ${await res.text()}`);
  const outcome = (await res.json()) as Record<string, unknown> | null;
  if (outcome?.blocked === true) {
    console.warn(
      'cloud-stripe-webhook: pack is under a revocation; written to the block, not the live row',
      userId,
      pack,
      outcome.block,
    );
  }
  if (outcome?.second_customer === true) {
    console.warn('cloud-stripe-webhook: account paid from a second Stripe customer', userId, customerId);
  }
}

/** Whose subscription is this, from the id recorded when it started.
 *
 *  Asked of Postgres (`cloud_user_for_subscription`, service role only)
 *  rather than by reading every `cloud_entitlements` row and searching the
 *  grants here: PostgREST caps one read at 1000 rows and says nothing when
 *  it does, so past a thousand subscribers the scan simply did not contain
 *  the newest of them, their renewals were dismissed as a sibling app's, and
 *  their grant expired on schedule while they were paying. */
async function userForSubscription(subscriptionId: string): Promise<{ userId: string; pack: string } | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cloud_user_for_subscription`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_subscription_id: subscriptionId }),
  });
  if (!res.ok) throw new Error(`cloud_user_for_subscription failed: ${res.status}`);
  const rows = await res.json();
  const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
  const userId = String(row?.user_id ?? '');
  const pack = String(row?.pack ?? '');
  return userId !== '' && pack !== '' ? { userId, pack } : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is this a real account? The Buy button writes the buyer's uuid into
 *  `client_reference_id`, and the URL is the buyer's to edit: `hello`, or a
 *  uuid that was deleted, used to reach the grant upsert and fail there —
 *  a 500 Stripe retried for three days, with no ledger row written for money
 *  that was taken. A value that is not an account falls through to the
 *  email, and failing that to a null user: recorded, granted to no one. */
async function userExists(userId: string): Promise<boolean> {
  if (!UUID_RE.test(userId)) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cloud_user_exists`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user: userId }),
  });
  if (!res.ok) throw new Error(`cloud_user_exists failed: ${res.status}`);
  return (await res.json()) === true;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'GET') {
    return json({
      function: 'cloud-stripe-webhook',
      stamp: SOURCE_STAMP,
      configured: {
        supabase: SUPABASE_URL !== '' && SERVICE_KEY !== '',
        stripe: STRIPE_SECRET_KEY !== '',
        stripeTest: STRIPE_SECRET_KEY_TEST !== '',
      },
      stripeKeyName: STRIPE_KEY.name,
      stripeKeyDeprecated:
        STRIPE_KEY.name !== null && DEPRECATED_STRIPE_KEY_NAMES.includes(STRIPE_KEY.name),
    });
  }
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !STRIPE_SECRET_KEY) return json({ error: 'server_error' }, 500);

  const rawBody = await req.text();
  if (rawBody.length > 262144) return json({ error: 'bad_request' }, 400);

  let eventId = '';
  try {
    const posted = JSON.parse(rawBody);
    eventId = String(posted?.id ?? '');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!EVENT_ID.test(eventId)) return json({ error: 'bad_request' }, 400);

  // ── The authentication step. Only the fetched copy is processed. ──
  let event: Record<string, unknown> | null;
  try {
    event = await fetchEvent(eventId);
  } catch (err) {
    console.error('cloud-stripe-webhook could not fetch the event', eventId, err);
    return json({ error: 'stripe_unreachable' }, 502);
  }
  if (event === null) return json({ error: 'unknown_event' }, 400);

  const eventType = String(event.type ?? '');
  /* The ledger's type carries the MODE — a test grant and a sale must never
   * read alike in the support trail. A SECOND name on purpose: suffixing
   * eventType itself would stop test events matching the branches below. */
  const ledgerType = eventType + (event.livemode === true ? '' : '#test');
  const object = ((event.data as Record<string, unknown> | undefined)?.object ?? {}) as Record<string, unknown>;
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;

  const subscriptionEvent = eventType.startsWith('customer.subscription.');
  if (!subscriptionEvent && String(metadata.app ?? '') !== 'cloud') {
    return json({ received: true, foreign: true });
  }

  if (await alreadyProcessed(eventId)) return json({ received: true, duplicate: true });

  const annotation: EventAnnotation = {
    userId: null,
    pack: null,
    amountCents: typeof object.amount_total === 'number' ? object.amount_total : null,
    currency: typeof object.currency === 'string' ? object.currency : null,
  };

  try {
    if (subscriptionEvent) {
      /*
       * A renewal, a cancellation, a failed card, a plan change. Identified by
       * the subscription id against grants this function has already written
       * — on the live row, or held under a revocation — with the LIVE PRICE
       * deciding which pack and cadence it now buys, the one fact portal plan
       * changes move that metadata does not follow.
       */
      const subscriptionId = String(object.id ?? '');
      const known = subscriptionId === '' ? null : await userForSubscription(subscriptionId);
      const prices = await priceMap();
      const priced = (() => {
        const id = priceOfSubscription(object);
        return id !== null ? (prices.get(id) ?? null) : null;
      })();

      const pack = priced?.pack ?? known?.pack ?? packOfSubscription(object);
      const userId = known?.userId ?? (String(metadata.user_id ?? '') || null);

      if (pack === null || userId === null || !KNOWN_PACKS.includes(pack)) {
        // A sibling app's subscription on the shared Stripe account.
        return json({ received: true, foreign: true });
      }

      annotation.pack = pack;
      annotation.userId = userId;

      const grant: PackGrant =
        eventType === 'customer.subscription.deleted'
          ? {
              kind: 'subscription',
              status: 'canceled',
              currentPeriodEnd: isoOfEpochSeconds(object.current_period_end),
              cancelAtPeriodEnd: true,
              subscriptionId: subscriptionId || null,
              since: null,
              plan: priced?.plan ?? null,
            }
          : {
              kind: 'subscription',
              status: String(object.status ?? ''),
              currentPeriodEnd: isoOfEpochSeconds(object.current_period_end),
              cancelAtPeriodEnd: object.cancel_at_period_end === true,
              subscriptionId: subscriptionId || null,
              since: null,
              plan: priced?.plan ?? null,
            };

      await applyGrant(
        userId,
        pack,
        grant,
        typeof object.customer === 'string' ? object.customer : null,
        // The pack the subscription USED to be stored under, taken away when
        // the live price says it moved.
        known !== null && known.pack !== pack ? known.pack : null,
      );
    } else if (
      (eventType === 'checkout.session.completed' ||
        eventType === 'checkout.session.async_payment_succeeded') &&
      String(metadata.kind ?? '') === 'pack'
    ) {
      const pack = String(metadata.pack ?? '');
      annotation.pack = KNOWN_PACKS.includes(pack) ? pack : null;

      let userId = String(object.client_reference_id ?? metadata.user_id ?? '');
      if (userId !== '' && !(await userExists(userId))) userId = '';
      if (userId === '') {
        const details = (object.customer_details ?? {}) as Record<string, unknown>;
        userId = (await userForEmail(String(details.email ?? ''))) ?? '';
      }
      annotation.userId = userId || null;

      const paid = String(object.payment_status ?? '') !== 'unpaid';

      if (paid && annotation.userId !== null && annotation.pack !== null) {
        const customerId = typeof object.customer === 'string' ? object.customer : null;
        const subscriptionId = typeof object.subscription === 'string' ? object.subscription : '';

        if (String(object.mode ?? '') === 'subscription' && subscriptionId !== '') {
          const derived = await periodEndForSession(String(object.id ?? ''), object.created);
          const metaPlan = String(metadata.plan ?? '');
          await applyGrant(
            annotation.userId,
            annotation.pack,
            {
              kind: 'subscription',
              status: 'active',
              currentPeriodEnd: derived.end,
              cancelAtPeriodEnd: false,
              subscriptionId,
              since: null,
              plan: metaPlan === 'monthly' || metaPlan === 'annual' ? metaPlan : derived.plan,
            },
            customerId,
          );
        }
        /*
         * A one-off `app=cloud` payment grants NOTHING, deliberately. Cloud
         * has no lifetime plan — storage that costs rent cannot be sold once
         * — so a payment shaped like one is a link misconfigured, and the
         * honest handling is the ledger row below, which is the support
         * trail for refunding it.
         */
      }
    }
  } catch (err) {
    // Nothing reached the ledger, so Stripe's retry is treated as fresh
    // rather than dismissed as a duplicate — the whole point of the ordering.
    console.error('cloud-stripe-webhook state write failed', eventId, ledgerType, err);
    return json({ error: 'state_write_failed' }, 500);
  }

  await recordEvent(eventId, ledgerType, annotation);
  return json({ received: true });
});
