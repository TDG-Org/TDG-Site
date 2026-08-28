import { supabase } from '../lib/supabase'
import { adoptPublished } from './store'
import { parseDoc, type SiteContentDoc } from './types'

/**
 * The two privileged calls behind the Content tab.
 *
 * They live here rather than in `src/dev/api.ts` for the same reason
 * `src/badges/api.ts` does: site content is a whole surface of this site — the
 * home page reads it on every visit — and the folder that owns the surface owns
 * its client. The console is one caller of it, not its home. `src/dev/api.ts`
 * stays what its header says it is: every call the console makes *about an
 * account*.
 *
 * Both re-check `bea_is_admin()` in Postgres through `tdg_admin_uid()`, so
 * nothing here is a permission layer. See
 * `supabase/migrations/20260828120000_site_content_overrides.sql`.
 */

/** A refusal from Postgres, already worded for a human. Mirrors `DevError`. */
export class ContentError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message)
    this.name = 'ContentError'
  }
}

function toContentError(error: { message?: string; code?: string } | null): ContentError {
  const raw = (error?.message ?? '').trim()
  const code = error?.code ?? null
  if (!raw) return new ContentError("Something went wrong, and the server didn't say what.", code)
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return new ContentError("Couldn't reach the server. Check the connection and try again.", code)
  }
  const clean = raw.replace(/^tdg:\s*/i, '')
  return new ContentError(clean.charAt(0).toUpperCase() + clean.slice(1), code)
}

/** The published document, plus who published it and when. */
export type SiteContentMeta = {
  doc: SiteContentDoc
  /** The document exactly as it is stored, for the round trip a publish makes. */
  raw: unknown
  updatedAt: string | null
  updatedByName: string | null
  /** How many earlier versions the server is keeping. */
  versions: number
}

type Row = {
  doc: unknown
  updated_at: string | null
  updated_by: string | null
  updated_by_name: string | null
  versions: number | null
}

export async function getSiteContent(): Promise<SiteContentMeta> {
  const { data, error } = await supabase.rpc('tdg_admin_site_content')
  if (error) throw toContentError(error)
  // `returns table` of one row arrives as a one-element array.
  const row = (data as Row[] | null)?.[0]
  const raw = row?.doc ?? {}
  return {
    doc: parseDoc(raw),
    raw,
    updatedAt: row?.updated_at ?? null,
    // Nobody has published yet, which is a real state and not a missing name.
    updatedByName: row?.updated_by ? (row.updated_by_name ?? null) : null,
    versions: row?.versions ?? 0,
  }
}

/**
 * Publish. The whole document, because the thing being edited is one document.
 *
 * The tab it was published from adopts it immediately rather than waiting for a
 * re-read: the console renders inside the same page as the site it edits, and a
 * publish that left this tab printing the old copy would make the one person
 * who can see it doubt that the write landed.
 *
 * `note` is one line for the audit trail, which is the only place a publish can
 * explain itself.
 */
export async function publishSiteContent(doc: SiteContentDoc, note: string): Promise<string> {
  const { data, error } = await supabase.rpc('tdg_admin_site_content_set', {
    p_doc: doc,
    p_note: note.trim() || null,
  })
  if (error) throw toContentError(error)
  adoptPublished(doc)
  return (data as string | null) ?? new Date().toISOString()
}
