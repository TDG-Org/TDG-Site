/**
 * `tdg-site-billing` — change or stop a TDG subscription, from the Store.
 *
 * ── Why this exists at all ───────────────────────────────────────────────
 * The Store sells the Pro Export Pack monthly and yearly. A shop that can take
 * a recurring payment and cannot stop one is not a shop somebody should give a
 * card to, and "email us to cancel" is that shop wearing a politer sentence.
 * So the card carries Change Plan and Cancel Plan, and this is what they reach.
 *
 * Every one of those verbs needs the Stripe secret key, and a static site
 * served from GitHub Pages may never hold one. Same division of labour the buy
 * path already keeps: the browser gets a Stripe-hosted URL or a yes, never a
 * key and never a raw Stripe response.
 *
 * ── Identity: the client cannot name the account, the plan, or the sub ──
 * The request carries an app id and a pack id and NOTHING ELSE that matters.
 * The account comes from the caller's own access token through Supabase's
 * `/auth/v1/user` — never decoded by hand — and the Stripe customer and
 * subscription come from that account's own entitlements row, read through
 * `tdg_billing_subscription`, which is `service_role`-only.
 *
 * A body naming somebody else's customer or subscription id would change
 * nothing, because no field of the body is ever passed to Stripe. That is the
 * whole design: there is no id in this function that a client chose.
 *
 * ── Why the app's table is resolved in SQL and not here ─────────────────
 * Ownership lives in `<app>_entitlements`, one table per app, so reading it
 * means building a table name out of a string the browser sent — the one shape
 * of query that cannot be parameterised. `tdg_billing_subscription` matches
 * that string against `tdg_store_apps()`, which discovers the real tables, and
 * raises on anything else. See the migration for the full reasoning; §12 of
 * AGENTS.md is the rule it follows.
 *
 * ── Cancelling means STOP RENEWING, and that is not a courtesy ──────────
 * `cancel` sets `cancel_at_period_end` and never `cancel_now`. Stripe leaves
 * the subscription `active` until the period actually ends, and
 * `<app>_packs_in_force` in tdg-core keeps a pack in force while its
 * subscription is active and its period end is in the future — so the pack the
 * reader paid for goes on working, in the app as well as on this page, for
 * every day already bought. It is the database that guarantees that, not this
 * function and not the card's wording.
 *
 * Doing it here rather than sending them to Stripe's cancel flow is deliberate:
 * the portal's cancel behaviour is a DASHBOARD SETTING, and a dashboard setting
 * flipped to "immediately" would take away days somebody had paid for, silently,
 * with nothing in this repo changed and nothing to notice it. One API call with
 * the parameter written down cannot drift.
 *
 * ── Why changing a plan is a portal and not a call ──────────────────────
 * Cancelling has one correct outcome. Changing a plan has proration, a card
 * that may need re-authorising, and a price list that is Stripe's to state
 * rather than ours to re-render. That belongs on Stripe's own page.
 *
 * ── This function writes NOTHING ────────────────────────────────────────
 * Not to `<app>_entitlements`, not to any ledger. That table has exactly one
 * writer — the app's own Stripe webhook, from Stripe's own events — and a
 * second writer would be a second opinion about what somebody has paid for.
 * The cancel lands at Stripe, `customer.subscription.updated` follows within
 * seconds, the webhook writes the grant, and the card reads it back. What this
 * returns to the browser is only what Stripe just said, so the card can say
 * the right date in the second before that round trip finishes.
 *
 * ── verify_jwt is ON ────────────────────────────────────────────────────
 * Unlike `tdg-site-account`, every caller here is signed in by definition.
 * Deploy WITHOUT `--no-verify-jwt`. The gateway's check is not the
 * authentication though — a project's publishable key is also a valid JWT —
 * so the `/auth/v1/user` resolve below is what actually decides who this is.
 */

// Set by hand when this file changes, and answered by `action: 'version'`.
// See supabase/README.md: there is no script that digests this file, so the
// stamp is only as honest as whoever last edited it.
const SOURCE_STAMP = '2026-08-25-a';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
/** The key that may call `tdg_billing_subscription`. Never reaches the caller. */
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
/** The public key `/auth/v1/user` expects in `apikey`. */
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

/**
 * Which Stripe ACCOUNT's key to use, named the way `veditor-stripe-webhook`
 * names it and for the same reasons — its header carries the full story.
 *
 * `TDG_APPS_STRIPE_SECRET_KEY` is the account every TDG app sells on. The
 * per-app name is read FIRST purely as an escape hatch for the day one app
 * moves to a Stripe account of its own; setting it while they still share one
 * recreates the one-value-two-secrets hazard that naming was chosen to remove.
 */
function stripeKeyFor(app: string): { name: string | null; value: string } {
  const perApp = `${app.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_STRIPE_SECRET_KEY`;
  for (const name of [perApp, 'TDG_APPS_STRIPE_SECRET_KEY', 'TDG_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY']) {
    const value = Deno.env.get(name);
    if (value !== undefined && value !== '') return { name, value };
  }
  return { name: null, value: '' };
}

/**
 * Where Stripe may send somebody back to.
 *
 * An exact-origin allow-list, checked against the parsed origin and never
 * against a prefix: `https://tdg-org.github.io.example.com` starts with the
 * real origin as a string and is not it. A `return_url` taken on trust is an
 * open redirect with our name on the referrer.
 */
const RETURN_ORIGINS: readonly string[] = [
  'https://tdg-org.github.io',
  // The dev server, so this path can be exercised locally without a deploy.
  'http://localhost:5180',
];

const DEFAULT_RETURN = 'https://tdg-org.github.io/TDG-Site/#/store';

function returnUrlFrom(candidate: unknown): string {
  const raw = String(candidate ?? '');
  if (raw === '') return DEFAULT_RETURN;
  try {
    const url = new URL(raw);
    return RETURN_ORIGINS.includes(url.origin) ? url.toString() : DEFAULT_RETURN;
  } catch {
    return DEFAULT_RETURN;
  }
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/** The signed-in account, resolved by Supabase itself. Null for anything that
 *  is not a real user token — including the project's own publishable key,
 *  which the gateway's `verify_jwt` accepts and this does not. */
async function resolveUser(authHeader: string): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: PUBLIC_KEY, Authorization: authHeader },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.id === 'string' && body.id !== '' ? body.id : null;
  } catch {
    return null;
  }
}

type Billing = {
  customerId: string | null;
  subscriptionId: string | null;
  kind: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasGrants: boolean;
};

/** What this account's own entitlements row says about this pack. Throws on a
 *  failed read rather than answering "nothing", because "nothing" is a real
 *  answer here and would be worded to the reader as "you are not subscribed". */
async function billingFor(app: string, userId: string, pack: string): Promise<Billing | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tdg_billing_subscription`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_app: app, p_user: userId, p_pack: pack }),
  });
  // An app the registry does not know raises `02000` in SQL and arrives here
  // as a 400. That is a bad request, not an outage: null says so.
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`tdg_billing_subscription failed: ${res.status}`);
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;
  return {
    customerId: row.stripe_customer_id ?? null,
    subscriptionId: row.subscription_id ?? null,
    kind: row.kind ?? null,
    status: row.status ?? null,
    currentPeriodEnd: row.current_period_end ?? null,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    hasGrants: row.has_grants === true,
  };
}

/**
 * A refusal Stripe made because of OUR configuration rather than the reader's
 * account: a key without the permission, a portal that was never configured.
 *
 * Worth its own answer because the two need different sentences. "Stripe
 * refused" tells somebody to try their card again; this one means nothing they
 * do will help and they should write to us — and it means somebody here has a
 * setting to fix, which is why it is logged at error level rather than shrugged
 * off.
 */
function isOurFault(status: number, body: unknown): boolean {
  if (status === 401 || status === 403) return true;
  // Stripe's own name for "this restricted key was not given that permission",
  // which it answers with a 400 rather than a 403. Without this the most likely
  // misconfiguration of all would be worded to the reader as their problem.
  const error = (body as { error?: { code?: unknown } } | null)?.error;
  return String(error?.code ?? '') === 'more_permissions_required';
}

async function stripe(
  key: string,
  path: string,
  fields: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody(fields),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
}

/** Stripe sends period ends as epoch SECONDS. */
function isoOfEpochSeconds(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLIC_KEY) return json({ error: 'server_error' }, 500);

  let payload: Record<string, unknown>;
  try {
    // Two ids and an intent. Anything larger is not one of these.
    const raw = await req.text();
    if (raw.length > 2048) return json({ error: 'bad_request' }, 400);
    payload = JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const action = String(payload.action ?? '');

  // Answered before anything needs a token, so asking costs no identity and
  // touches no account.
  if (action === 'version') return json({ stamp: SOURCE_STAMP });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader) return json({ error: 'unauthorized' }, 401);
  const userId = await resolveUser(authHeader);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const app = String(payload.app ?? '').trim().toLowerCase();
  const pack = String(payload.pack ?? '').trim();
  // A shape check as well as the registry check below. The registry is the
  // authority; this only keeps a hostile string out of a log line.
  if (!/^[a-z0-9_-]{2,32}$/.test(app) || !/^[a-z0-9_-]{1,64}$/.test(pack)) {
    return json({ error: 'bad_request' }, 400);
  }

  const key = stripeKeyFor(app);
  if (key.value === '') {
    console.error('tdg-site-billing: no Stripe key in this environment for', app);
    return json({ error: 'billing_unavailable' }, 503);
  }

  let billing: Billing | null;
  try {
    billing = await billingFor(app, userId, pack);
  } catch (err) {
    console.error('tdg-site-billing could not read the entitlement', app, pack, err);
    return json({ error: 'server_error' }, 500);
  }
  if (billing === null) return json({ error: 'bad_request' }, 400);

  const returnUrl = returnUrlFrom(payload.returnTo);

  if (action === 'manage') {
    if (!billing.customerId) return json({ error: 'no_customer' }, 404);
    const intent = String(payload.intent ?? 'billing');

    const base: Record<string, string> = {
      customer: billing.customerId,
      return_url: returnUrl,
    };

    // The plan picker is a DEEP LINK into the portal, and a deep link needs the
    // portal configuration to have that flow switched on. When it does not,
    // Stripe answers 400 — so the plain portal is tried next rather than
    // handing back a refusal. The plain portal still reaches every one of these
    // controls; it just costs the reader one more click to find them.
    if (intent === 'update' && billing.subscriptionId) {
      const flow = await stripe(key.value, 'billing_portal/sessions', {
        ...base,
        'flow_data[type]': 'subscription_update',
        'flow_data[subscription_update][subscription]': billing.subscriptionId,
        'flow_data[after_completion][type]': 'redirect',
        'flow_data[after_completion][redirect][return_url]': returnUrl,
      });
      if (flow.ok && typeof flow.body.url === 'string') {
        return json({ url: flow.body.url, deepLinked: true });
      }
      if (isOurFault(flow.status, flow.body)) {
        console.error('tdg-site-billing: Stripe refused the portal for a reason of ours', flow.status, flow.body);
        return json({ error: 'billing_unavailable' }, 503);
      }
      console.warn('tdg-site-billing: subscription_update flow unavailable, falling back', flow.status);
    }

    const plain = await stripe(key.value, 'billing_portal/sessions', base);
    if (plain.ok && typeof plain.body.url === 'string') {
      return json({ url: plain.body.url, deepLinked: false });
    }
    if (isOurFault(plain.status, plain.body)) {
      console.error('tdg-site-billing: the billing portal is not usable with this key', plain.status, plain.body);
      return json({ error: 'billing_unavailable' }, 503);
    }
    console.error('tdg-site-billing: Stripe refused the portal', plain.status, plain.body);
    return json({ error: 'stripe_error' }, 502);
  }

  if (action === 'cancel' || action === 'resume') {
    // Nothing to act on. Told apart from "no Stripe customer" on purpose: one
    // of them means this pack was bought outright or granted by hand, and the
    // other means the account has never paid us anything.
    if (!billing.subscriptionId || billing.kind !== 'subscription') {
      return json({ error: 'not_a_subscription' }, 409);
    }
    if (billing.status === 'canceled') return json({ error: 'not_a_subscription' }, 409);

    // `cancel_at_period_end`, and never `cancel_now`. See the header: the days
    // already paid for are kept, and it is the database that enforces that.
    const result = await stripe(key.value, `subscriptions/${billing.subscriptionId}`, {
      cancel_at_period_end: action === 'cancel' ? 'true' : 'false',
    });

    if (result.ok) {
      return json({
        cancelAtPeriodEnd: result.body.cancel_at_period_end === true,
        currentPeriodEnd:
          isoOfEpochSeconds(result.body.current_period_end) ?? billing.currentPeriodEnd,
        status: typeof result.body.status === 'string' ? result.body.status : billing.status,
      });
    }
    if (isOurFault(result.status, result.body)) {
      console.error(
        'tdg-site-billing: this Stripe key may not change subscriptions.',
        'Grant it write on Subscriptions, or nobody can cancel from the site.',
        result.status,
        result.body,
      );
      return json({ error: 'billing_unavailable' }, 503);
    }
    console.error('tdg-site-billing: Stripe refused the change', result.status, result.body);
    return json({ error: 'stripe_error' }, 502);
  }

  return json({ error: 'bad_request' }, 400);
});
