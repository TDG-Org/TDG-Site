import { supabase } from '../lib/supabase'

/**
 * The site's half of TDG feedback: sending a report, and collecting the
 * replies developers write back.
 *
 * Everything here talks to the `tdg_feedback_*` functions in tdg-core (see
 * supabase/migrations/20260823170000_user_feedback.sql). There is no table
 * access and no admin surface: reading OTHER people's feedback is the
 * Developer console's job (src/dev/), and this file must never import from
 * there — src/dev/ is a lazy chunk that only a developer's browser fetches.
 */

/** What this site submits under. Every TDG app sends its own id. */
export const FEEDBACK_APP_ID = 'tdg-site'

/**
 * One kind a report can be, with the words the picker shows. The IDS mirror
 * `tdg_feedback_kinds()` on the server, which refuses anything else — this
 * list is copy, not authority. Names are Title Case; descriptions sentence
 * case, per the house rule.
 */
export type FeedbackKind = { id: string; name: string; what: string }

export const FEEDBACK_KINDS: FeedbackKind[] = [
  { id: 'bug', name: 'Bug', what: 'Something is broken or behaving wrong.' },
  { id: 'suggestion', name: 'Suggestion', what: 'An idea that would make this better.' },
  { id: 'question', name: 'Question', what: 'Something you want to ask us.' },
  { id: 'praise', name: 'Praise', what: 'Tell us what you liked. We read these twice.' },
  { id: 'other', name: 'Other', what: "Anything that doesn't fit the rest." },
]

/**
 * The server's refusals are written to be shown ("pick what kind of feedback
 * this is"), so show them. The `tdg: ` prefix is for server logs; a request
 * that never landed is not a refusal and must not read like one.
 */
function worded(message: string | null | undefined): string {
  const raw = (message ?? '').trim()
  if (!raw) return "Something went wrong, and the server didn't say what."
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return "Couldn't reach the server. Check the connection and try again."
  }
  const clean = raw.replace(/^tdg:\s*/i, '')
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

/**
 * Send one report. `os` is worked out here; the version is package.json's,
 * baked in at build time (see vite.config.ts) — the same number AGENTS.md
 * requires every shipped commit to bump, so a report names the exact deploy
 * the reporter was looking at. Returns the report's id so the thank-you can
 * name it.
 */
export async function submitFeedback(input: {
  kind: string
  message: string
  contact: string
}): Promise<{ id: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('tdg_feedback_submit', {
    p_app: FEEDBACK_APP_ID,
    p_kind: input.kind,
    p_message: input.message,
    p_app_version: __TDG_SITE_VERSION__,
    p_os: await describePlatform(),
    p_contact: input.contact.trim() || null,
  })
  if (error) return { id: null, error: worded(error.message) }
  return { id: data as number, error: null }
}

/** One reply waiting to be shown, with the report it answers for context. */
export type InboxReply = {
  reply_id: number
  feedback_id: number
  app: string
  kind: string
  message: string
  body: string
  replied_at: string
  replied_by: string
}

/**
 * Every reply this account has not yet been shown, oldest first. A failed
 * read answers an empty list: the inbox is opportunistic — checked at boot —
 * and a connection hiccup must not put an error dialog over a page that
 * otherwise works. The replies keep until a read succeeds.
 */
export async function fetchInbox(): Promise<InboxReply[]> {
  const { data, error } = await supabase.rpc('tdg_feedback_inbox')
  if (error) return []
  return (data as InboxReply[] | null) ?? []
}

/**
 * Mark one reply as shown, fire-and-forget. Only called after the panel has
 * actually rendered it and the reader pressed Got It — never on a dismissal,
 * so closing without reading means it comes back next time.
 *
 * The `.then` is not decoration. A supabase-js query builder is LAZY: it only
 * sends the request when something subscribes, so a bare
 * `void supabase.rpc(…)` compiles, runs, and dispatches nothing at all.
 * Found live: Got It closed the panel, the reply stayed unseen, and it came
 * back on the next boot. The empty handlers are what fire the call.
 */
export function ackReply(replyId: number): void {
  void supabase.rpc('tdg_feedback_ack', { p_reply_id: replyId }).then(
    () => undefined,
    () => undefined,
  )
}

/**
 * "Windows 11 · Chrome 139" — what the machine is, at the width a support
 * answer needs. The user agent freezes Windows at "NT 10.0" for both 10 and
 * 11, so where the client hints API exists the real answer is fetched from
 * it; everywhere else the coarse name is the honest one.
 */
type UaData = {
  getHighEntropyValues?: (hints: string[]) => Promise<{ platformVersion?: string }>
}

export async function describePlatform(): Promise<string> {
  const ua = navigator.userAgent
  let os =
    /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'unknown OS'

  const uad = (navigator as unknown as { userAgentData?: UaData }).userAgentData
  if (os === 'Windows' && uad?.getHighEntropyValues) {
    try {
      const { platformVersion } = await uad.getHighEntropyValues(['platformVersion'])
      const major = Number.parseInt(platformVersion?.split('.')[0] ?? '', 10)
      // Microsoft's own mapping: platformVersion 13+ is Windows 11.
      if (Number.isFinite(major)) os = major >= 13 ? 'Windows 11' : 'Windows 10'
    } catch {
      // The coarse name is fine; this was only ever a refinement.
    }
  }

  const browser =
    /Edg\//.test(ua) ? `Edge ${ua.match(/Edg\/(\d+)/)?.[1] ?? ''}`
    : /OPR\//.test(ua) ? `Opera ${ua.match(/OPR\/(\d+)/)?.[1] ?? ''}`
    : /Firefox\//.test(ua) ? `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1] ?? ''}`
    : /Chrome\//.test(ua) ? `Chrome ${ua.match(/Chrome\/(\d+)/)?.[1] ?? ''}`
    : /Safari\//.test(ua) ? 'Safari'
    : 'unknown browser'

  return `${os} · ${browser}`.trim()
}
