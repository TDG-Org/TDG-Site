import { useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import {
  CLOUD_PLANS,
  CLOUD_RETENTION_DAYS_FALLBACK,
  type CloudPlan,
} from '../data/cloud'

/**
 * The one copy of TDG Core's public Cloud config this tab holds.
 *
 * The same module-store shape as `src/content/store.ts`, for the same
 * reasons: the Store shelf and the Account fold both read it from different
 * lazy chunks, the first subscriber triggers the one fetch, and the last
 * answer this browser saw comes back from localStorage before first paint so
 * a returning visitor's shelf does not repaint when the network answers.
 *
 * ## What the server owns, and what this file will not let it break
 *
 * `tdg_cloud_public_config()` owns availability, the plan names, quotas,
 * prices and — while Cloud is on sale — the payment links. `src/data/cloud.ts`
 * is the built-in copy underneath it, and the merge here FAILS CLOSED:
 *
 *   - `available` is only ever true from a fresh server answer. The cache and
 *     the fallback both read as Coming Soon, so a build that outlived the
 *     shop, an outage, or a blocked request can show the plans and can never
 *     open a checkout. (The server's document is stored as it came, and the
 *     stripping happens on the way BACK out of the cache — so a hand-edited
 *     cache row cannot arm it either, because nothing that reads the cache
 *     ever trusts those two fields.)
 *   - payment links come only from the same fresh answer, for the same
 *     reason: the one mistake a shop may not make is charging a number it did
 *     not advertise, and a stale link is that mistake wearing a URL.
 *
 * A plan id the site has never heard of still renders with the server's own
 * name and numbers: a plan the server sells and the site refuses to draw
 * would be a product nobody can find (rule 17).
 */

const CACHE_KEY = 'tdg.cloud.config.v1'

export type CloudConfig = {
  /** True only while TDG Cloud is on sale — and only ever said by the server. */
  available: boolean
  plans: CloudPlan[]
  /** Days hosted data stays readable after a plan ends. */
  retentionDays: number
}

type Phase = 'cold' | 'loading' | 'ready' | 'error'

const FALLBACK: CloudConfig = {
  available: false,
  plans: CLOUD_PLANS,
  retentionDays: CLOUD_RETENTION_DAYS_FALLBACK,
}

function planOf(raw: unknown, live: boolean): CloudPlan | null {
  if (raw === null || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const id = typeof entry.id === 'string' ? entry.id : ''
  if (id === '') return null
  const builtIn = CLOUD_PLANS.find((p) => p.id === id)
  return {
    id,
    name: typeof entry.name === 'string' && entry.name !== '' ? entry.name : (builtIn?.name ?? id),
    tagline:
      typeof entry.tagline === 'string' && entry.tagline !== ''
        ? entry.tagline
        : (builtIn?.tagline ?? ''),
    quotaGb: typeof entry.quota_gb === 'number' && entry.quota_gb > 0 ? entry.quota_gb : (builtIn?.quotaGb ?? 0),
    monthlyCents:
      typeof entry.monthly_cents === 'number' && entry.monthly_cents > 0
        ? entry.monthly_cents
        : (builtIn?.monthlyCents ?? 0),
    annualCents:
      typeof entry.annual_cents === 'number' && entry.annual_cents > 0
        ? entry.annual_cents
        : (builtIn?.annualCents ?? 0),
    // Only a LIVE server answer may carry a way to pay; see the header.
    linkMonthly:
      live && typeof entry.payment_link_monthly === 'string' && entry.payment_link_monthly !== ''
        ? entry.payment_link_monthly
        : null,
    linkAnnual:
      live && typeof entry.payment_link_annual === 'string' && entry.payment_link_annual !== ''
        ? entry.payment_link_annual
        : null,
  }
}

/** `live` marks a document that arrived from the server THIS page load —
 *  the only provenance allowed to open a checkout. */
function parse(raw: unknown, live: boolean): CloudConfig {
  if (raw === null || typeof raw !== 'object') return FALLBACK
  const doc = raw as Record<string, unknown>
  const plans = Array.isArray(doc.plans)
    ? doc.plans.map((p) => planOf(p, live)).filter((p): p is CloudPlan => p !== null)
    : []
  return {
    available: live && doc.available === true,
    plans: plans.length > 0 ? plans : CLOUD_PLANS,
    retentionDays:
      typeof doc.retention_read_only_days === 'number' && doc.retention_read_only_days > 0
        ? doc.retention_read_only_days
        : CLOUD_RETENTION_DAYS_FALLBACK,
  }
}

function readCache(): CloudConfig {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? parse(JSON.parse(raw), false) : FALLBACK
  } catch {
    return FALLBACK
  }
}

function writeCache(raw: unknown) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(raw))
  } catch {
    /* Over quota or blocked; this tab is still correct, the next boot is slow. */
  }
}

let config: CloudConfig = readCache()
let phase: Phase = 'cold'

const listeners = new Set<() => void>()

function announce() {
  for (const fn of listeners) fn()
}

function adopt(next: CloudConfig) {
  if (JSON.stringify(next) === JSON.stringify(config)) return
  config = next
  announce()
}

let inflight: Promise<void> | null = null

/** Fetch the public config, once per page load. Identity-free by design —
 *  see the migration for why this function is granted to `anon`. */
export function loadCloudConfig(force = false): Promise<void> {
  if (inflight && !force) return inflight
  phase = 'loading'
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('tdg_cloud_public_config')
      if (error) throw error
      adopt(parse(data, true))
      writeCache(data ?? {})
      phase = 'ready'
    } catch {
      phase = 'error'
    } finally {
      inflight = null
      announce()
    }
  })()
  return inflight
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (phase === 'cold') void loadCloudConfig()
  return () => {
    listeners.delete(fn)
  }
}

const snapshot = () => config

/** The live Cloud config. Re-renders the caller when a new answer lands. */
export function useCloudConfig(): CloudConfig {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
