import { supabase } from '../lib/supabase'

/**
 * The privileged Cloud calls behind the Developer console's Cloud tab.
 *
 * They live here rather than in `src/dev/api.ts` for the reason the badge and
 * site-content verbs live in their own folders: TDG Cloud is a whole surface
 * of this site — the Store shelf and the Account fold read the same state —
 * and the folder that owns the surface owns its client. The console is one
 * caller of it, not its home.
 *
 * Every verb re-checks `tdg_admin_uid()` in Postgres, so nothing here is a
 * permission layer (rule 12).
 */

export class CloudAdminError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message)
    this.name = 'CloudAdminError'
  }
}

function toError(error: { message?: string; code?: string } | null): CloudAdminError {
  const raw = (error?.message ?? '').trim()
  const code = error?.code ?? null
  if (!raw) return new CloudAdminError("Something went wrong, and the server didn't say what.", code)
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return new CloudAdminError("Couldn't reach the server. Check the connection and try again.", code)
  }
  const clean = raw.replace(/^tdg:\s*/i, '')
  return new CloudAdminError(clean.charAt(0).toUpperCase() + clean.slice(1), code)
}

/** The whole config document, verbatim, plus who last wrote it. */
export type CloudConfigMeta = {
  doc: Record<string, unknown>
  updatedAt: string | null
  updatedByName: string | null
}

export async function getCloudConfig(): Promise<CloudConfigMeta> {
  const { data, error } = await supabase.rpc('tdg_admin_cloud_config')
  if (error) throw toError(error)
  const row = (data as { doc: unknown; updated_at: string | null; updated_by: string | null; updated_by_name: string | null }[] | null)?.[0]
  const doc = row?.doc
  return {
    doc: doc !== null && typeof doc === 'object' && !Array.isArray(doc) ? (doc as Record<string, unknown>) : {},
    updatedAt: row?.updated_at ?? null,
    updatedByName: row?.updated_by ? (row.updated_by_name ?? null) : null,
  }
}

/** Publish the whole document — what is being edited IS one document. The
 *  note is one line for the audit trail. */
export async function setCloudConfig(doc: Record<string, unknown>, note: string): Promise<void> {
  const { error } = await supabase.rpc('tdg_admin_cloud_config_set', {
    p_doc: doc,
    p_note: note.trim() || null,
  })
  if (error) throw toError(error)
}

/** The metrics document `tdg_admin_cloud_metrics()` computes — subscribers,
 *  revenue, the usage distribution, per-app and heavy-user tables, costs,
 *  margin and the growth snapshots. Shapes are read defensively where drawn. */
export async function getCloudMetrics(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('tdg_admin_cloud_metrics')
  if (error) throw toError(error)
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {}
}

/**
 * One account's whole Cloud standing, for the Developer console.
 *
 * The same picture `tdg_cloud_status()` gives a person about themselves —
 * `useCloudStatus.ts` reads that one — answered about SOMEBODY ELSE. It has to
 * be its own verb rather than a parameter on that one: `tdg_cloud_status` takes
 * the uuid from the caller's token and never from an argument, and that is
 * exactly what makes it safe to grant to every account.
 *
 * Every field is read defensively, because a console that threw on a shape it
 * did not recognise would take the whole account page down with it.
 */
export type CloudAccountStanding = {
  /** Cloud is on sale for everybody. */
  available: boolean
  /** Cloud works for THIS account — launched, or the developer/tester door. */
  enabledForThem: boolean
  plan: { pack: string; name: string | null } | null
  quotaBytes: number
  /** A per-account bump written into config, in GB, or null. */
  quotaOverrideGb: number | null
  usedBytes: number
  reservedBytes: number
  freeBytes: number
  files: number
  perApp: { app: string; bytes: number; files: number }[]
  egress: { monthBytes: number; allowanceBytes: number }
  retention: { state: 'none' | 'read_only' | 'purge_eligible'; lapsedAt: string | null; deadline: string | null }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export async function getCloudAccount(userId: string): Promise<CloudAccountStanding> {
  const { data, error } = await supabase.rpc('tdg_admin_cloud_account', { p_target: userId })
  if (error) throw toError(error)
  const d = (data !== null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {}) as Record<string, unknown>
  const plan = d.plan as Record<string, unknown> | null
  const egress = (d.egress ?? {}) as Record<string, unknown>
  const retention = (d.retention ?? {}) as Record<string, unknown>
  const retState = String(retention.state ?? 'none')
  return {
    available: d.available === true,
    enabledForThem: d.enabled_for_them === true,
    plan:
      plan !== null && typeof plan === 'object' && typeof plan.pack === 'string'
        ? { pack: plan.pack, name: typeof plan.name === 'string' ? plan.name : null }
        : null,
    quotaBytes: num(d.quota_bytes),
    quotaOverrideGb: typeof d.quota_override_gb === 'number' ? d.quota_override_gb : null,
    usedBytes: num(d.used_bytes),
    reservedBytes: num(d.reserved_bytes),
    freeBytes: num(d.free_bytes),
    files: num(d.files),
    perApp: Array.isArray(d.per_app)
      ? (d.per_app as Record<string, unknown>[])
          .filter((r) => typeof r?.app === 'string')
          .map((r) => ({ app: String(r.app), bytes: num(r.bytes), files: num(r.files) }))
      : [],
    egress: { monthBytes: num(egress.month_bytes), allowanceBytes: num(egress.allowance_bytes) },
    retention: {
      state: retState === 'read_only' || retState === 'purge_eligible' ? retState : 'none',
      lapsedAt: typeof retention.lapsed_at === 'string' ? retention.lapsed_at : null,
      deadline: typeof retention.deadline === 'string' ? retention.deadline : null,
    },
  }
}

export type RetentionRow = {
  user_id: string
  username: string | null
  bytes: number
  files: number
  lapsed_at: string | null
  deadline: string
  purge_ready: boolean
}

export async function getRetentionReport(): Promise<RetentionRow[]> {
  const { data, error } = await supabase.rpc('tdg_admin_cloud_retention_report')
  if (error) throw toError(error)
  return Array.isArray(data) ? (data as RetentionRow[]) : []
}

/**
 * What Backblaze itself says the bucket holds, against what the catalogue
 * claims — the only place the two sides of TDG Cloud are ever compared.
 *
 * This one does not go through Postgres: the B2 credential lives in Vault and
 * only an Edge Function may read it, so the call is a POST to
 * `cloud-maintenance` carrying the developer's own session token (the
 * function resolves it and re-checks `profiles.is_admin` — rule 12 again,
 * nothing here is the permission layer).
 *
 * It is a slow read by nature: a full ListObjectVersions sweep of the bucket.
 * The Cloud tab therefore asks for it on a press rather than folding it into
 * the console's Refresh, so looking at the tab never costs a bucket walk.
 */
export type BucketAudit = {
  bucket: string
  stored: { objects: number; bytes: number }
  oldVersions: { count: number; bytes: number }
  hideMarkers: number
  catalogue: { rows: number; bytes: number }
  /** At most 200 of each, to look at. `counts` carries the REAL totals — a
   *  list that silently stops at 200 reads as "only 200 are wrong". */
  orphans: { key: string; bytes: number }[]
  ghosts: { key: string; bytes: number }[]
  mismatched: { key: string; bucketBytes: number; catalogueBytes: number }[]
  counts: { orphans: number; ghosts: number; mismatched: number; orphanBytes: number }
  /** True when the bucket was too large to walk in one call — the ghost list
   *  is then suppressed entirely, because an unlisted file is not a missing
   *  one and reporting it as such would be the worst kind of false alarm. */
  truncated: boolean
}

export async function getBucketAudit(): Promise<BucketAudit> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new CloudAdminError('Sign in first.', '28000')

  let res: Response
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cloud-maintenance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action: 'bucket' }),
    })
  } catch {
    throw new CloudAdminError("Couldn't reach the server. Check the connection and try again.", null)
  }

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const code = String(payload.error ?? 'server_error')
    throw new CloudAdminError(
      code === 'unauthorized'
        ? 'That account is not a TDG developer.'
        : "The bucket read failed. It may have timed out — Backblaze is slow to list a large bucket.",
      code,
    )
  }

  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const stored = (payload.stored ?? {}) as Record<string, unknown>
  const old = (payload.old_versions ?? {}) as Record<string, unknown>
  const cat = (payload.catalogue ?? {}) as Record<string, unknown>
  const counts = (payload.counts ?? {}) as Record<string, unknown>
  const list = (raw: unknown) => (Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [])

  return {
    bucket: typeof payload.bucket === 'string' ? payload.bucket : '',
    stored: { objects: n(stored.objects), bytes: n(stored.bytes) },
    oldVersions: { count: n(old.count), bytes: n(old.bytes) },
    hideMarkers: n(payload.hide_markers),
    catalogue: { rows: n(cat.rows), bytes: n(cat.bytes) },
    orphans: list(payload.orphans).map((r) => ({ key: String(r.key ?? ''), bytes: n(r.bytes) })),
    ghosts: list(payload.ghosts).map((r) => ({ key: String(r.key ?? ''), bytes: n(r.bytes) })),
    mismatched: list(payload.mismatched).map((r) => ({
      key: String(r.key ?? ''),
      bucketBytes: n(r.bucket_bytes),
      catalogueBytes: n(r.catalogue_bytes),
    })),
    counts: {
      orphans: n(counts.orphans),
      ghosts: n(counts.ghosts),
      mismatched: n(counts.mismatched),
      orphanBytes: n(counts.orphan_bytes),
    },
    truncated: payload.truncated === true,
  }
}
