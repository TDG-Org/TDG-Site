/** `cloud-provision` — TDG Cloud's Stripe objects, created where the key lives.
 *
 *  ── What it makes, and in what state ──
 *  Two products (Cloud Standard, Cloud Studio), a monthly and an annual price
 *  on each, and a payment link per price — each link DEACTIVATED the moment
 *  it exists, because TDG Cloud is Coming Soon and a live link is a purchase
 *  path. It also registers the `cloud-stripe-webhook` endpoint for the
 *  checkout and subscription events, and writes every id and URL into
 *  `tdg_cloud_config`, which is where the site, the webhook's price map and
 *  the launch checklist read them.
 *
 *  Everything is IDEMPOTENT: products are found by `metadata.app/pack` before
 *  they are created, prices by product + interval + amount, links by their
 *  metadata, the endpoint by its URL. Run it twice and the second run finds
 *  everything and only rewrites config.
 *
 *  ── The settings, copied from the live veditor links deliberately ──
 *  Managed Payments on (Stripe as merchant of record — the flag is fixed at
 *  creation and cannot be toggled, which is why the veditor links had to be
 *  REMADE once), automatic tax with Stripe liability, session metadata AND
 *  `subscription_data.metadata` both carrying app/kind/pack/plan — the second
 *  copy is what lets `customer.subscription.*` events name their pack when
 *  nothing else can. If Stripe refuses the managed-payments parameter, the
 *  link is created without it and the report says so out loud; a link made
 *  that way should be remade before launch, exactly as veditor's were.
 *
 *  ── Why an Edge Function and not a laptop script ──
 *  The write-capable Stripe key lives in this project's environment and
 *  travels nowhere — the same reason `veditor-provision-prices` ran here. And
 *  like that one, this is a ONE-RUN tool: after a successful run the deployed
 *  copy is replaced with a retired stub, and this source stays in the repo
 *  for the day a price changes. The deployed copy bakes a one-time nonce into
 *  `PROVISION_KEY` (the repo copy carries a placeholder); the gateway's JWT
 *  check passes any holder of the publishable key, so the nonce is the actual
 *  door, and retiring the deploy destroys it.
 */

const SOURCE_STAMP = 'cloud-provision@1';

/** Replaced with a fresh random value at deploy time; '' refuses everything. */
const PROVISION_KEY = 'SET-AT-DEPLOY';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
const STRIPE_SECRET_KEY =
  Deno.env.get('CLOUD_STRIPE_SECRET_KEY') ?? Deno.env.get('TDG_APPS_STRIPE_SECRET_KEY') ?? '';

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/cloud-stripe-webhook`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Stripe speaks form-encoding. Nested keys arrive already bracketed. */
async function stripe(
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params);
  const url = method === 'GET' && body.size > 0 ? `${path}?${body}` : path;
  const res = await fetch(`https://api.stripe.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(method === 'POST' ? { body } : {}),
  });
  const out = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (out?.error ?? {}) as Record<string, unknown>;
    throw new StripeError(String(err.message ?? res.status), String(err.param ?? ''));
  }
  return out;
}

class StripeError extends Error {
  constructor(
    message: string,
    readonly param: string,
  ) {
    super(message);
  }
}

type PlanSpec = {
  pack: 'standard' | 'studio';
  name: string;
  description: string;
  monthlyCents: number;
  annualCents: number;
};

/** The one line the buyer reads after paying, per cadence. */
function confirmation(name: string, cadence: 'monthly' | 'annual'): string {
  const opener = cadence === 'annual' ? 'Subscription active for the year!' : 'Subscription active!';
  return (
    `${opener} ${name} is on your TDG Account within a minute. Your TDG apps ` +
    `share the storage it unlocks, and your Account page on the TDG site shows ` +
    `what is using it. - TDG Brothers`
  );
}

async function findProduct(pack: string): Promise<Record<string, unknown> | null> {
  const list = await stripe('GET', '/v1/products', { limit: '100', active: 'true' });
  for (const product of (list.data as Record<string, unknown>[]) ?? []) {
    const meta = (product.metadata ?? {}) as Record<string, unknown>;
    if (meta.app === 'cloud' && meta.kind === 'pack' && meta.pack === pack) return product;
  }
  return null;
}

async function findPrice(
  productId: string,
  interval: 'month' | 'year',
  cents: number,
): Promise<Record<string, unknown> | null> {
  const list = await stripe('GET', '/v1/prices', { product: productId, limit: '100', active: 'true' });
  for (const price of (list.data as Record<string, unknown>[]) ?? []) {
    const recurring = (price.recurring ?? {}) as Record<string, unknown>;
    if (
      recurring.interval === interval &&
      price.unit_amount === cents &&
      price.currency === 'usd'
    ) {
      return price;
    }
  }
  return null;
}

async function findLink(pack: string, plan: string): Promise<Record<string, unknown> | null> {
  // Inactive links are listed too, which is the point: a deactivated link
  // found here is reused rather than duplicated.
  const list = await stripe('GET', '/v1/payment_links', { limit: '100' });
  for (const link of (list.data as Record<string, unknown>[]) ?? []) {
    const meta = (link.metadata ?? {}) as Record<string, unknown>;
    if (meta.app === 'cloud' && meta.kind === 'pack' && meta.pack === pack && meta.plan === plan) {
      return link;
    }
  }
  return null;
}

/** The price a link actually sells. The list endpoint does not expand line
 *  items, and a link's price is fixed at creation — so on a REPRICE the link
 *  found by metadata still sells the old amount, and reusing it would be the
 *  one mistake a shop may not make. Null when unreadable. */
async function linkPriceId(linkId: string): Promise<string | null> {
  try {
    const items = await stripe('GET', `/v1/payment_links/${linkId}/line_items`, { limit: '1' });
    const price = ((items.data as Record<string, unknown>[]) ?? [])[0]?.price;
    const id = typeof price === 'object' && price !== null ? (price as Record<string, unknown>).id : null;
    return typeof id === 'string' && id !== '' ? id : null;
  } catch {
    return null;
  }
}

function linkBase(spec: PlanSpec, priceId: string, plan: 'monthly' | 'annual'): Record<string, string> {
  return {
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'after_completion[type]': 'hosted_confirmation',
    'after_completion[hosted_confirmation][custom_message]': confirmation(spec.name, plan),
    allow_promotion_codes: 'false',
    billing_address_collection: 'auto',
    // No customer_creation: Stripe refuses it on links with recurring prices
    // (a subscription always creates a customer) — measured, first run.
    payment_method_collection: 'always',
    'phone_number_collection[enabled]': 'false',
    submit_type: 'auto',
    'tax_id_collection[enabled]': 'true',
    'metadata[app]': 'cloud',
    'metadata[kind]': 'pack',
    'metadata[pack]': spec.pack,
    'metadata[plan]': plan,
    'subscription_data[metadata][app]': 'cloud',
    'subscription_data[metadata][kind]': 'pack',
    'subscription_data[metadata][pack]': spec.pack,
    'subscription_data[metadata][plan]': plan,
  };
}

async function makeLink(
  spec: PlanSpec,
  priceId: string,
  plan: 'monthly' | 'annual',
): Promise<{ link: Record<string, unknown>; managedPayments: boolean }> {
  const base = linkBase(spec, priceId, plan);
  try {
    return { link: await managedLink(base), managedPayments: true };
  } catch (err) {
    if (!(err instanceof StripeError)) throw err;
    // The account cannot take managed payments here (or the parameter moved).
    // A plain link still lets everything else be verified; the report flags
    // it, and it should be REMADE before launch — the flag is create-only.
    console.error('cloud-provision: managed payments refused, creating plain link', err.message);
    return { link: await stripe('POST', '/v1/payment_links', base), managedPayments: false };
  }
}

/** A Managed Payments link or an exception — no fallback, so a caller
 *  REPLACING a plain link cannot mint a second plain one by accident.
 *  `automatic_tax` rides along without a liability param: Managed Payments
 *  sets `liability: stripe` itself, and passing it explicitly is refused with
 *  "must be one of self or account" — measured, first run. */
async function managedLink(base: Record<string, string>): Promise<Record<string, unknown>> {
  return await stripe('POST', '/v1/payment_links', {
    ...base,
    'managed_payments[enabled]': 'true',
    'automatic_tax[enabled]': 'true',
  });
}

async function provision(): Promise<Record<string, unknown>> {
  const specs: PlanSpec[] = [
    {
      pack: 'standard',
      name: 'Cloud Standard',
      description:
        'Pooled TDG Cloud storage for your TDG Account: your settings, saves, documents and ' +
        'projects, synced across every TDG app and machine you sign into. Storage is shared ' +
        'across your apps from one allowance. Cancel any time; your data stays readable. - TDG Brothers',
      monthlyCents: 299,
      // 2026-08-31 (pm): annual 2999 → 3199 — the margin floor rose to >$1 at
      // 100% utilization on EVERY cadence, and $29.99/yr netted only +$0.87.
      // At $31.99 the two Standard cadences carry a matched ~$1.05 worst case.
      annualCents: 3199,
    },
    {
      pack: 'studio',
      name: 'Cloud Studio',
      description:
        'The big TDG Cloud allowance, for storage-heavy work: TDG Veditor projects and media, ' +
        'Developer builds and large assets, alongside everything the Standard plan covers. One ' +
        'pooled allowance across your TDG apps. Cancel any time; your data stays readable. - TDG Brothers',
      // 2026-08-30: raised from 999/9999 (1 TB) to match the market's big-tier
      // standard at 2 TB. 2026-08-31 (am): 1299/12999 → 1499/15999 for the B2
      // move's profit-at-100%-utilization rule. 2026-08-31 (pm): 1499/15999 →
      // 1999/21999 — the owner raised the floor to >$1 per cadence and asked
      // that Studio stop being a much better per-GB deal than Standard (it
      // was 39% cheaper per GB; now ~18%). Keep in step with
      // tdg_cloud_config.plans.studio.
      monthlyCents: 1999,
      annualCents: 21999,
    },
  ];

  const report: Record<string, unknown>[] = [];
  const configPatch: Record<string, Record<string, unknown>> = {};

  for (const spec of specs) {
    let product = await findProduct(spec.pack);
    const productExisted = product !== null;
    if (product === null) {
      product = await stripe('POST', '/v1/products', {
        name: `${spec.name} - TDG Cloud`,
        description: spec.description,
        tax_code: 'txcd_10000000',
        'metadata[app]': 'cloud',
        'metadata[kind]': 'pack',
        'metadata[pack]': spec.pack,
      });
    }
    const productId = String(product.id);

    const prices: Record<string, string> = {};
    const links: Record<string, { url: string; id: string; active: boolean; managedPayments: boolean }> = {};

    for (const plan of ['monthly', 'annual'] as const) {
      const interval = plan === 'monthly' ? 'month' : 'year';
      const cents = plan === 'monthly' ? spec.monthlyCents : spec.annualCents;

      let price = await findPrice(productId, interval, cents);
      if (price === null) {
        price = await stripe('POST', '/v1/prices', {
          product: productId,
          currency: 'usd',
          unit_amount: String(cents),
          'recurring[interval]': interval,
          'metadata[app]': 'cloud',
          'metadata[kind]': 'pack',
          'metadata[pack]': spec.pack,
          'metadata[plan]': plan,
        });
      }
      const priceId = String(price.id);
      prices[plan] = priceId;

      let link = await findLink(spec.pack, plan);
      if (link !== null) {
        // A reprice retires the old link rather than reusing it: the amount
        // is baked in at creation, and config must never point at a link that
        // charges a number the plan no longer says.
        const selling = await linkPriceId(String(link.id));
        if (selling !== null && selling !== priceId) {
          if (link.active === true) {
            await stripe('POST', `/v1/payment_links/${String(link.id)}`, { active: 'false' });
          }
          link = null;
        }
      }
      let managedPayments =
        ((link?.managed_payments ?? {}) as Record<string, unknown>).enabled === true;
      if (link === null) {
        const made = await makeLink(spec, priceId, plan);
        link = made.link;
        managedPayments = made.managedPayments;
      } else if (!managedPayments) {
        // A plain link from an earlier attempt. The managed flag is fixed at
        // creation, so the only fix is a REPLACEMENT — exactly what the
        // veditor links needed. The plain one stays deactivated and
        // unreferenced; Stripe has no link delete. Kept only if the account
        // still refuses a managed one.
        try {
          link = await managedLink(linkBase(spec, priceId, plan));
          managedPayments = true;
        } catch (err) {
          if (!(err instanceof StripeError)) throw err;
          console.error('cloud-provision: keeping plain link; managed refused', err.message);
        }
      }
      // Coming Soon means OFF. Every run re-asserts it, so a link somebody
      // activated by accident is put back to sleep by the next run.
      if (link.active === true) {
        link = await stripe('POST', `/v1/payment_links/${String(link.id)}`, { active: 'false' });
      }
      links[plan] = {
        url: String(link.url),
        id: String(link.id),
        active: link.active === true,
        managedPayments,
      };
    }

    configPatch[spec.pack] = {
      stripe_product: productId,
      stripe_price_monthly: prices.monthly,
      stripe_price_annual: prices.annual,
      payment_link_monthly: links.monthly.url,
      payment_link_annual: links.annual.url,
    };

    report.push({
      pack: spec.pack,
      product: productId,
      product_existed: productExisted,
      prices,
      links,
    });
  }

  // The webhook endpoint, found by URL or created.
  const endpoints = await stripe('GET', '/v1/webhook_endpoints', { limit: '100' });
  let endpoint = ((endpoints.data as Record<string, unknown>[]) ?? []).find(
    (e) => e.url === WEBHOOK_URL,
  );
  if (endpoint === undefined) {
    endpoint = await stripe('POST', '/v1/webhook_endpoints', {
      url: WEBHOOK_URL,
      description:
        'TDG Cloud: records plan purchases, renewals, plan changes and cancellations on the ' +
        'buyer’s TDG Account (cloud_entitlements). The endpoint authenticates by refetching ' +
        'each event from the Stripe API, so its signing secret is deliberately unused.',
      'enabled_events[0]': 'checkout.session.completed',
      'enabled_events[1]': 'checkout.session.async_payment_succeeded',
      'enabled_events[2]': 'customer.subscription.created',
      'enabled_events[3]': 'customer.subscription.updated',
      'enabled_events[4]': 'customer.subscription.deleted',
    });
  }

  // Write what was made into the one config row everything reads.
  const cfgRes = await fetch(`${SUPABASE_URL}/rest/v1/tdg_cloud_config?select=doc`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!cfgRes.ok) throw new Error(`config read failed: ${cfgRes.status}`);
  const doc = ((await cfgRes.json())?.[0]?.doc ?? {}) as Record<string, unknown>;
  const plans = (doc.plans ?? {}) as Record<string, Record<string, unknown>>;
  for (const [pack, patch] of Object.entries(configPatch)) {
    plans[pack] = { ...(plans[pack] ?? {}), ...patch };
  }
  doc.plans = plans;
  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/tdg_cloud_config?one=eq.true`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ doc, updated_at: new Date().toISOString() }),
  });
  if (!patchRes.ok) throw new Error(`config write failed: ${patchRes.status} ${await patchRes.text()}`);

  return {
    plans: report,
    webhook_endpoint: { id: String(endpoint.id), url: WEBHOOK_URL },
    config_written: true,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'GET') {
    return json({
      function: 'cloud-provision',
      stamp: SOURCE_STAMP,
      configured: {
        supabase: SUPABASE_URL !== '' && SERVICE_KEY !== '',
        stripe: STRIPE_SECRET_KEY !== '',
        armed: PROVISION_KEY !== 'SET-AT-DEPLOY' && PROVISION_KEY !== '',
      },
    });
  }
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !STRIPE_SECRET_KEY) return json({ error: 'server_error' }, 500);
  if (
    PROVISION_KEY === 'SET-AT-DEPLOY' ||
    PROVISION_KEY === '' ||
    req.headers.get('x-provision-key') !== PROVISION_KEY
  ) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    return json(await provision());
  } catch (err) {
    console.error('cloud-provision failed', err);
    return json({ error: 'provision_failed', message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
