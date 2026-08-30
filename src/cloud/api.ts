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
