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
