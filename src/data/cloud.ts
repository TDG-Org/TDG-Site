/**
 * TDG Cloud, as this site describes it when the server has not spoken.
 *
 * ## TDG Core owns the truth; this file is the failure mode
 *
 * Everything about the Cloud plans — the names, the storage, the prices,
 * whether they can be bought at all — lives in `tdg_cloud_config` on tdg-core
 * and is read at runtime through `tdg_cloud_public_config()`
 * (`src/cloud/config.ts`). That is deliberate and different from `store.ts`:
 * a pack's price changes rarely and by hand, but Cloud's launch is a FLAG,
 * and a launch that needed a site deploy to show a Buy button would be a
 * launch waiting on GitHub Pages.
 *
 * So this file is the overlay pattern's other half, exactly like `src/data/`
 * under `src/content/`: the built-in copy a visitor sees while the read is in
 * flight, when it fails, and in any build of this site that outlives a
 * network. It FAILS CLOSED — `available` is not a field here because the
 * fallback is never allowed to open a shop: payment links only ever come from
 * the server's own answer, so a stale build or a broken read can show plans
 * and can never sell them.
 *
 * ## Where else these numbers are written down
 *
 * The quotas and prices below mirror `tdg_cloud_config.doc.plans` and the
 * Stripe prices `cloud-provision` created from it. Change a plan there and
 * change it here in the same sitting — the mistake this copy can make is
 * showing an old number for one round trip, never charging one, but a
 * fallback that drifts for months is a page that lies whenever the network
 * hiccups.
 *
 * ## `unlocks` is site copy, not config
 *
 * What each plan is FOR is prose, written here the way every product's words
 * are written in `src/data/` (rule 1). The server merge in
 * `src/cloud/config.ts` keeps these lists beside whatever names and numbers
 * the server answers with.
 */

export type CloudPlanId = 'standard' | 'studio'

export type CloudPlan = {
  id: string
  /** Title Case: the plan's name everywhere it appears. */
  name: string
  /** Sentence case: one line on who it is for. */
  tagline: string
  /** The pooled allowance, in GB (1024 = 1 TB). */
  quotaGb: number
  /** USD cents, exactly as Stripe charges. */
  monthlyCents: number
  annualCents: number
  /** Live Stripe Payment Links — ONLY ever from the server, and only while
   *  Cloud is on sale. Null here by construction; see the header. */
  linkMonthly: string | null
  linkAnnual: string | null
  /** What the plan covers, in the words the Store card lists. */
  unlocks: string[]
}

export const CLOUD_PLANS: CloudPlan[] = [
  {
    id: 'standard',
    name: 'Cloud Standard',
    tagline: 'Your TDG world, on every machine. Settings, saves, documents and projects, synced.',
    quotaGb: 200,
    monthlyCents: 299,
    annualCents: 2999,
    linkMonthly: null,
    linkAnnual: null,
    unlocks: [
      '200 GB of pooled storage, shared across your TDG apps',
      'Your app data synced to every machine you sign in on',
      'Kept safe on your TDG Account, not on a device',
      'Cancel any time — your data stays readable',
    ],
  },
  {
    id: 'studio',
    name: 'Cloud Studio',
    tagline: 'Room for the heavy work: TDG Veditor projects and media, Developer builds, large assets.',
    quotaGb: 1024,
    monthlyCents: 999,
    annualCents: 9999,
    linkMonthly: null,
    linkAnnual: null,
    unlocks: [
      '1 TB of pooled storage, shared across your TDG apps',
      'Built for TDG Veditor projects, media and large assets',
      'Everything Cloud Standard covers, five times the room',
      'Cancel any time — your data stays readable',
    ],
  },
]

/** How many days hosted data stays readable after a plan ends, when the
 *  server has not said. Mirrors `retention.read_only_days` in config. */
export const CLOUD_RETENTION_DAYS_FALLBACK = 90

/**
 * What a year saves against paying monthly, in cents. DERIVED, never typed,
 * for the reason `annualSavingCents` in `store.ts` is: a saving is arithmetic,
 * and the only way to get it wrong is to state it twice. Null when there is
 * nothing honest to say.
 */
export function cloudSavingCents(monthlyCents: number, annualCents: number): number | null {
  const saved = monthlyCents * 12 - annualCents
  return saved > 0 ? saved : null
}

/** `200` → `200 GB`, `1024` → `1 TB`. Whole terabytes get the bigger unit
 *  because that is how the plan is talked about; everything else stays GB. */
export function formatQuota(quotaGb: number): string {
  if (quotaGb >= 1024 && quotaGb % 1024 === 0) {
    const tb = quotaGb / 1024
    return `${tb} TB`
  }
  return `${quotaGb} GB`
}

/**
 * Bytes for a reader: `0 B` → `1.2 MB` → `200 GB` → `1.5 TB`.
 *
 * One decimal below 10 of a unit and none above, so a usage bar reads
 * `3.4 GB of 200 GB` rather than eleven digits. Never used for a QUOTA the
 * plan sells — that is `formatQuota`, from the GB figure the config states —
 * so rounding here can never misstate what somebody bought.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u += 1
  }
  const rounded = n >= 10 || u === 0 ? Math.round(n) : Math.round(n * 10) / 10
  return `${rounded} ${units[u]}`
}

/**
 * The buy URL for one Cloud plan, aimed at one account — the same
 * `client_reference_id` contract `buyUrl` in `store.ts` keeps, because
 * `cloud-stripe-webhook` reads the same field first when deciding whose
 * account a payment lands on.
 */
export function cloudBuyUrl(link: string, userId: string, email?: string | null): string {
  const url = new URL(link)
  url.searchParams.set('client_reference_id', userId)
  if (email) url.searchParams.set('prefilled_email', email)
  return url.toString()
}
