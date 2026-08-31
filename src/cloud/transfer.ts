/**
 * The site's client for `cloud-storage` — the Edge Function that stands
 * between every TDG Cloud client and the Backblaze B2 bucket the bytes
 * live in.
 *
 * The site needs exactly two of its verbs. `download` meters the read
 * (`tdg_cloud_begin_download` behind the function) and answers a presigned
 * URL — a capability for ONE object, GET only, minutes long — which the
 * browser then follows straight to B2, so the bytes never pass through
 * Supabase at all. `delete-all` is the Account fold's typed-confirmation
 * wipe: the function destroys every hosted object version (delete means
 * GONE, not hidden) and settles the catalogue in one call, which replaced
 * the page-and-batch loop the site ran when the bytes lived in Supabase
 * Storage.
 *
 * Refusals are matched on CODES, never message text (`src/store/billing.ts`
 * says why at length). The function passes Postgres SQLSTATEs through
 * verbatim — `28000` signed out, `02000` no such file — plus its own
 * `storage_error`/`server_error`; anything unrecognised lands on
 * `server_error` so a new refusal can never crash an old build.
 */

import { supabase } from '../lib/supabase'

const STORAGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cloud-storage`

export type TransferError = 'unauthorized' | 'not_found' | 'storage_error' | 'server_error' | 'offline'

export type TransferResult<T> = { ok: true; value: T } | { ok: false; error: TransferError }

function asError(code: unknown): TransferError {
  const raw = String(code ?? '')
  if (raw === '28000') return 'unauthorized'
  if (raw === '02000') return 'not_found'
  if (raw === 'storage_error') return 'storage_error'
  return 'server_error'
}

async function call(body: Record<string, unknown>): Promise<TransferResult<Record<string, unknown>>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'unauthorized' }

  let res: Response
  try {
    res = await fetch(STORAGE_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, error: 'offline' }
  }

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = (payload.error ?? {}) as Record<string, unknown>
    return { ok: false, error: asError(err.code) }
  }
  return { ok: true, value: payload }
}

/** A minutes-long presigned URL for one hosted file, egress metered. The
 *  `filename` rides inside the signature as a content-disposition, so the
 *  browser saves under the file's own name even from B2's origin. */
export async function cloudDownloadUrl(
  app: string,
  path: string,
  filename: string,
): Promise<TransferResult<string>> {
  const res = await call({ action: 'download', app, path, filename })
  if (!res.ok) return res
  const url = String(res.value.url ?? '')
  return url === '' ? { ok: false, error: 'server_error' } : { ok: true, value: url }
}

/** Everything hosted for this account, gone for good — objects, catalogue,
 *  sync state. Resumable: a retry after a mid-way failure picks up where the
 *  books still disagree. */
export async function cloudDeleteAll(): Promise<TransferResult<number>> {
  const res = await call({ action: 'delete-all' })
  if (!res.ok) return res
  return { ok: true, value: Number(res.value.removed ?? 0) }
}
