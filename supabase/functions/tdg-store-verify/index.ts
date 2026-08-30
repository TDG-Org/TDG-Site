/** `tdg-store-verify` — does Stripe still agree with what the Store advertises?
 *
 *  ── The failure this exists to catch ──
 *  The one mistake a shop may not make is advertising one amount and charging
 *  another, and this project's shape makes that mistake POSSIBLE by design: a
 *  static page cannot ask Stripe what a price is, so `src/data/store.ts`
 *  states amounts as literals beside links, and `tdg_cloud_config` states the
 *  Cloud plans' amounts beside theirs. Every reprice therefore has to move
 *  several places in the same sitting — and nothing, until this function,
 *  could PROVE they all moved. A link quietly deactivated, a link still
 *  selling last month's price, a webhook endpoint somebody disabled in a
 *  dashboard: each breaks purchases with every offline check green.
 *
 *  ── What it checks ──
 *  GET, no body — the checks that need no catalogue:
 *    · every payment link in Stripe carrying `metadata.app`: its amount,
 *      cadence, active state and metadata, reported as facts;
 *    · the Cloud half completely, because the server holds BOTH sides:
 *      each configured plan's links exist, sell exactly the configured cents
 *      at the configured cadence, carry subscription metadata, and are
 *      active if and only if `availability.available` says Cloud is on sale;
 *    · the three app webhook endpoints: enabled, at the right URLs, with at
 *      least the checkout events (and the subscription events where grants
 *      can lapse).
 *  POST `{catalog: [{url, cents, recurring}]}` — the site's half: the caller
 *  (scripts/verify-store.mjs, which reads `store.ts`) sends what the shop
 *  advertises, and each entry is answered with a verdict: the link must
 *  exist, be ACTIVE, sell exactly `cents`, and match the cadence.
 *
 *  ── Why it may be called by anybody ──
 *  Deployed `--no-verify-jwt`, the `tdg-site-deploys` precedent: the caller
 *  sends no identity and the answer contains nothing that is not already
 *  public — every amount here is printed on the Store, every link URL is in
 *  the page source, and the verdicts are booleans. The Stripe key stays in
 *  the environment and only its CONCLUSIONS leave. The catalogue POST is
 *  capped and shape-checked, and verdicts are computed against Stripe's own
 *  answers, so a hostile body can at worst be told "unknown link".
 *
 *  Run it as `npm run verify:store` in TDG-Site, or curl the GET before a
 *  release. It answers `ok: false` the day any of this drifts.
 */

const SOURCE_STAMP = 'tdg-store-verify@1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
const STRIPE_SECRET_KEY =
  Deno.env.get('TDG_APPS_STRIPE_SECRET_KEY') ?? Deno.env.get('STRIPE_SECRET_KEY') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`stripe ${path} → ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

type LinkFact = {
  id: string;
  url: string;
  active: boolean;
  metadata: Record<string, string>;
  subscriptionMetadata: boolean;
  managedPayments: boolean;
  /** From the first line item: what pressing Pay would charge. */
  cents: number | null;
  currency: string | null;
  recurring: string | null; // 'month' | 'year' | null
};

/** Every link on the account that names an app, with what it actually sells.
 *  The line-items fetch is per link, so this stays a tool you run, not a hot
 *  path — a dozen sequential reads, each answered by Stripe in tens of ms. */
async function linkFacts(): Promise<Map<string, LinkFact>> {
  const out = new Map<string, LinkFact>();
  const list = await stripeGet('/v1/payment_links?limit=100');
  for (const raw of (list.data as Record<string, unknown>[]) ?? []) {
    const metadata = (raw.metadata ?? {}) as Record<string, string>;
    if (!metadata.app) continue;
    const items = await stripeGet(`/v1/payment_links/${String(raw.id)}/line_items?limit=1`);
    const price = ((items.data as Record<string, unknown>[]) ?? [])[0]?.price as
      | Record<string, unknown>
      | undefined;
    const recurring = (price?.recurring ?? null) as Record<string, unknown> | null;
    out.set(String(raw.url), {
      id: String(raw.id),
      url: String(raw.url),
      active: raw.active === true,
      metadata,
      subscriptionMetadata:
        Object.keys(((raw.subscription_data as Record<string, unknown> | null)?.metadata ?? {}) as object)
          .length > 0,
      managedPayments:
        ((raw.managed_payments ?? {}) as Record<string, unknown>).enabled === true,
      cents: typeof price?.unit_amount === 'number' ? price.unit_amount : null,
      currency: typeof price?.currency === 'string' ? price.currency : null,
      recurring: recurring ? String(recurring.interval) : null,
    });
  }
  return out;
}

type Problem = { where: string; what: string };

/** The Cloud half, verified end to end: config vs Stripe, both directions. */
function checkCloud(
  doc: Record<string, unknown>,
  links: Map<string, LinkFact>,
  problems: Problem[],
): Record<string, unknown> {
  const available =
    ((doc.availability ?? {}) as Record<string, unknown>).available === true;
  const plans = (doc.plans ?? {}) as Record<string, Record<string, unknown>>;
  const report: Record<string, unknown> = { available };

  for (const [pack, plan] of Object.entries(plans)) {
    for (const cadence of ['monthly', 'annual'] as const) {
      const where = `cloud/${pack}/${cadence}`;
      const url = plan[`payment_link_${cadence}`];
      const cents = Number(plan[`${cadence}_cents`]);
      if (typeof url !== 'string' || url === '') {
        problems.push({ where, what: 'config holds no payment link' });
        continue;
      }
      const fact = links.get(url);
      if (!fact) {
        problems.push({ where, what: 'configured link does not exist in Stripe' });
        continue;
      }
      if (fact.cents !== cents) {
        problems.push({
          where,
          what: `link sells ${fact.cents ?? '?'}¢ but config says ${cents}¢ — the advertise-one-charge-another bug`,
        });
      }
      const wantInterval = cadence === 'monthly' ? 'month' : 'year';
      if (fact.recurring !== wantInterval) {
        problems.push({ where, what: `link recurs '${fact.recurring}', want '${wantInterval}'` });
      }
      if (fact.active !== available) {
        problems.push({
          where,
          what: available
            ? 'Cloud is on sale but this link is DEACTIVATED'
            : 'Cloud is Coming Soon but this link is ACTIVE — buyable while unpurchasable',
        });
      }
      if (!fact.subscriptionMetadata) {
        problems.push({ where, what: 'no subscription_data metadata — renewals would be unattributable' });
      }
      report[where] = { link: fact.id, cents: fact.cents, active: fact.active };
    }
  }
  return report;
}

/** The endpoints every purchase depends on reaching. */
function checkWebhooks(
  endpoints: Record<string, unknown>[],
  problems: Problem[],
): Record<string, unknown> {
  const need: Record<string, string[]> = {
    [`${SUPABASE_URL}/functions/v1/veditor-stripe-webhook`]: [
      'checkout.session.completed',
      'customer.subscription.updated',
    ],
    [`${SUPABASE_URL}/functions/v1/devfleet-stripe-webhook`]: ['checkout.session.completed'],
    [`${SUPABASE_URL}/functions/v1/cloud-stripe-webhook`]: [
      'checkout.session.completed',
      'customer.subscription.updated',
    ],
  };
  const report: Record<string, unknown> = {};
  for (const [url, events] of Object.entries(need)) {
    const name = url.split('/').pop() ?? url;
    const ep = endpoints.find((e) => e.url === url);
    if (!ep) {
      problems.push({ where: name, what: 'webhook endpoint missing from Stripe' });
      report[name] = 'missing';
      continue;
    }
    if (ep.status !== 'enabled') {
      problems.push({ where: name, what: `webhook endpoint is '${String(ep.status)}'` });
    }
    const enabled = (ep.enabled_events ?? []) as string[];
    for (const ev of events) {
      if (!enabled.includes(ev)) {
        problems.push({ where: name, what: `endpoint not subscribed to ${ev}` });
      }
    }
    report[name] = { status: ep.status, events: enabled.length };
  }
  return report;
}

type CatalogEntry = { url: string; cents: number; recurring: 'month' | 'year' | null };

/** The site's own catalogue, held against Stripe entry by entry. */
function checkCatalog(
  entries: CatalogEntry[],
  links: Map<string, LinkFact>,
  problems: Problem[],
): Record<string, unknown>[] {
  return entries.map((entry) => {
    const where = entry.url.slice(-12);
    const fact = links.get(entry.url);
    if (!fact) {
      problems.push({ where, what: 'catalogue link does not exist in Stripe (or carries no app metadata)' });
      return { url: entry.url, verdict: 'missing' };
    }
    const wrongs: string[] = [];
    if (!fact.active) wrongs.push('link is DEACTIVATED');
    if (fact.cents !== entry.cents) wrongs.push(`sells ${fact.cents}¢, site advertises ${entry.cents}¢`);
    if ((fact.recurring ?? null) !== entry.recurring) {
      wrongs.push(`recurs '${fact.recurring}', site says '${entry.recurring}'`);
    }
    if (fact.currency !== 'usd') wrongs.push(`currency ${fact.currency}`);
    for (const what of wrongs) problems.push({ where, what });
    return {
      url: entry.url,
      app: fact.metadata.app,
      pack: fact.metadata.pack,
      cents: fact.cents,
      active: fact.active,
      verdict: wrongs.length === 0 ? 'ok' : 'WRONG',
    };
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SERVICE_KEY) return json({ error: 'server_error' }, 500);

  let catalog: CatalogEntry[] = [];
  if (req.method === 'POST') {
    const raw = await req.text();
    if (raw.length > 65536) return json({ error: 'bad_request' }, 400);
    try {
      const body = JSON.parse(raw) as { catalog?: unknown };
      if (!Array.isArray(body.catalog) || body.catalog.length > 64) throw new Error('shape');
      catalog = body.catalog.map((e) => {
        const entry = e as Record<string, unknown>;
        const url = String(entry.url ?? '');
        const cents = Number(entry.cents);
        const recurring = entry.recurring === 'month' || entry.recurring === 'year' ? entry.recurring : null;
        if (!url.startsWith('https://buy.stripe.com/') || !Number.isFinite(cents)) throw new Error('entry');
        return { url, cents, recurring };
      });
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
  }

  try {
    const [links, endpoints, cfgRes] = await Promise.all([
      linkFacts(),
      stripeGet('/v1/webhook_endpoints?limit=100'),
      fetch(`${SUPABASE_URL}/rest/v1/tdg_cloud_config?select=doc`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      }),
    ]);
    const doc = (((await cfgRes.json()) as { doc?: unknown }[] | null)?.[0]?.doc ?? {}) as Record<string, unknown>;

    const problems: Problem[] = [];
    const cloud = checkCloud(doc, links, problems);
    const webhooks = checkWebhooks((endpoints.data as Record<string, unknown>[]) ?? [], problems);
    const catalogReport = catalog.length > 0 ? checkCatalog(catalog, links, problems) : undefined;

    return json({
      function: 'tdg-store-verify',
      stamp: SOURCE_STAMP,
      ok: problems.length === 0,
      problems,
      cloud,
      webhooks,
      ...(catalogReport ? { catalog: catalogReport } : {}),
      links: [...links.values()].map((f) => ({
        url: f.url,
        app: f.metadata.app,
        pack: f.metadata.pack,
        plan: f.metadata.plan ?? null,
        cents: f.cents,
        recurring: f.recurring,
        active: f.active,
        managedPayments: f.managedPayments,
      })),
    });
  } catch (err) {
    console.error('tdg-store-verify failed', err);
    return json({ error: 'verify_failed', message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
