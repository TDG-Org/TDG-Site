import { visibleApps, visibleGame, visibleTools } from '../content/resolve'
import type { SiteContentDoc } from '../content/types'
import { APPS, MARANATHA, SITE_APP_ID, TOOLS } from '../data/content'
import { STORE_APPS } from '../data/store'
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

/**
 * What this site submits under. Every TDG app sends its own id.
 *
 * The literal lives in `src/data/content.ts` next to `SITE_NAME`, because the
 * id and the name are two different strings for one product and keeping them
 * apart is how `tdg-site` came to be printed as a NAME on the account page.
 */
export const FEEDBACK_APP_ID = SITE_APP_ID

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
 * What the optional contact box shows when it is empty.
 *
 * Here rather than in the dialog for the reason `FEEDBACK_KINDS` is here: it is
 * a sentence a visitor reads, and rule 1 keeps those out of components. A
 * placeholder is doing real work in this field — the label says "How To Reach
 * You" and the honest answer is "anything at all", which an example says faster
 * than a sentence can. `Instagram` is a proper noun and keeps its capital
 * (rule 7); the rest is sentence case, like every other hint on the form.
 */
export const CONTACT_PLACEHOLDER = 'My Instagram is @tdgluke'

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
  /**
   * Which app the report is ABOUT, when it is not this site.
   *
   * `#/feedback/<app>` sets it, and that route exists for the several apps of
   * ours with no sign-in of their own: they cannot carry the form, so their
   * Send Feedback opens this site's, and this is what stops every one of those
   * reports arriving in the console labelled `tdg-site`. The route has already
   * checked the id against the server's own shape, so an unrecognised value
   * cannot reach here — see `feedbackHash` in src/lib/route.ts.
   */
  app?: string
}): Promise<{ id: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('tdg_feedback_submit', {
    p_app: input.app || FEEDBACK_APP_ID,
    p_kind: input.kind,
    p_message: input.message,
    p_app_version: __TDG_SITE_VERSION__,
    p_os: await describePlatform(),
    p_contact: input.contact.trim() || null,
  })
  if (error) return { id: null, error: worded(error.message) }
  return { id: data as number, error: null }
}

/**
 * Where this account stands against the feedback limits, ready to render.
 *
 * The server owns the numbers (`tdg_feedback_limits()` in
 * 20260823210000_feedback_rate_limits.sql) and the gate; this is only what the
 * form is allowed to SAY about them, so a wall is never met without warning.
 * Nothing here decides whether a send is permitted — see `fetchQuota`.
 */
export type FeedbackQuota = {
  sentHour: number
  perHour: number
  sentDay: number
  perDay: number
  cooldownSeconds: number
  reason: 'ok' | 'cooldown' | 'hour' | 'day'
  /**
   * When the next report may go, on the LOCAL clock — null when that is now.
   *
   * The server sends an absolute instant plus its own `now`, and the two are
   * subtracted here rather than compared to `Date.now()`, so a machine whose
   * clock is a day out still counts down the right number of seconds. A raw
   * server timestamp read against a wrong local clock is how a countdown ends
   * up finishing in the past or never.
   */
  unblockAt: number | null
}

type QuotaRow = {
  sent_hour: number
  per_hour: number
  sent_day: number
  per_day: number
  cooldown_seconds: number
  reason: string
  wait_words: string | null
  next_allowed_at: string | null
  server_now: string
}

/**
 * Read the caller's standing. A failed read answers null and the form says
 * nothing about limits — like the inbox, this is opportunistic: it exists to
 * warn, and a warning that could not be fetched must never become an error
 * over a form that still works. The send itself is gated in Postgres, so a
 * null here costs a sentence, never the boundary.
 */
export async function fetchQuota(): Promise<FeedbackQuota | null> {
  const { data, error } = await supabase.rpc('tdg_feedback_quota')
  if (error) return null
  const row = (data as QuotaRow[] | null)?.[0]
  if (!row) return null

  const next = row.next_allowed_at ? Date.parse(row.next_allowed_at) : NaN
  const server = Date.parse(row.server_now)
  const ahead = Number.isFinite(next) && Number.isFinite(server) ? next - server : NaN

  return {
    sentHour: row.sent_hour,
    perHour: row.per_hour,
    sentDay: row.sent_day,
    perDay: row.per_day,
    cooldownSeconds: row.cooldown_seconds,
    reason: (['cooldown', 'hour', 'day'] as const).find((r) => r === row.reason) ?? 'ok',
    unblockAt: Number.isFinite(ahead) && ahead > 0 ? Date.now() + ahead : null,
  }
}

/**
 * "43 seconds" · "12 minutes" · "3 hours", rounded UP so a wait we quote is
 * never shorter than the wait we enforce.
 *
 * A deliberate twin of `tdg_feedback_wait_words()` in the migration, which
 * words the server's own refusals. Both exist because a refusal is a sentence
 * the server writes once, and a countdown is a sentence that has to be rewritten
 * every second — the server cannot tick. Change one and change the other; the
 * thresholds are the whole of the contract between them.
 */
export function waitWords(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds))
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`
  if (s < 5400) {
    const m = Math.ceil(s / 60)
    return `${m} minute${m === 1 ? '' : 's'}`
  }
  const h = Math.ceil(s / 3600)
  return `${h} hour${h === 1 ? '' : 's'}`
}

/**
 * What the limits look like from inside the form — the whole of the copy, so
 * the words live beside the call that fetches them rather than inside a
 * component (the same reason `FEEDBACK_KINDS` is here).
 *
 * This says NOTHING about whether a send will be allowed; the gate is
 * `tdg_feedback_submit` in Postgres. It only puts the wall on screen before
 * somebody walks into it. Three faces, and no fourth:
 *
 *   · blocked  — a warm notice naming which limit, counting down in words.
 *   · nearly   — a faint line once three or fewer reports are left today.
 *   · fine     — nothing at all. A form that opens by telling a first-time
 *                visitor about a quota reads as though we expect trouble.
 *
 * `justSent` swaps one clause: "you can send another in a minute" answers a
 * report that just landed, "one report at a time" answers a form somebody is
 * still filling in. Sentence case throughout — this is helper text.
 */
export function quotaLine(
  quota: FeedbackQuota | null,
  msLeft: number,
  justSent: boolean,
): string | null {
  if (!quota) return null

  if (msLeft > 0) {
    const inWords = waitWords(msLeft / 1000)
    if (quota.reason === 'day') {
      return `That's ${quota.perDay} reports in a day — thank you. The next one can go in ${inWords}.`
    }
    if (quota.reason === 'hour') {
      return `That's ${quota.perHour} reports in an hour, which is our limit. The next one can go in ${inWords}.`
    }
    return justSent
      ? `You can send another report in ${inWords}.`
      : `One report at a time — you can send the next one in ${inWords}.`
  }

  const left = quota.perDay - quota.sentDay
  if (left > 0 && left <= 3) {
    return `${left} more report${left === 1 ? '' : 's'} today.`
  }
  return null
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

/**
 * What to CALL an app, from its feedback id.
 *
 * One place, because two surfaces need it and they must not disagree: the send
 * form says which app a `#/feedback/<app>` report will be filed against, and
 * the inbox says which app a reply is about.
 *
 * **Read from the catalogue rather than typed**, so a name here cannot drift
 * from the name on that app's card — the feedback ids ARE the cards' page
 * slugs. It reads `content.ts` directly rather than through `src/content/`,
 * which rule 17 asks of a surface that DRAWS products. This draws none: it is
 * one label on one report, wanted outside React, and a title overridden at
 * runtime would only make the dialog disagree with what the console has already
 * stored against the report.
 *
 * An id the catalogue has never heard of still gets a face rather than being
 * dropped — rule 17's other half. The `app` column is open by design, so an app
 * that starts reporting tomorrow is a name made out of its own id today, which
 * is legible and honest, and becomes its real name the moment it has a card.
 */
const CATALOGUE: ReadonlyArray<{ id: string; title: string }> = [
  ...APPS.map((a) => ({ id: a.page, title: a.title })),
  ...TOOLS.map((t) => ({ id: t.page, title: t.title })),
  { id: MARANATHA.page, title: MARANATHA.title },
]

export function appName(id: string): string {
  const known = CATALOGUE.find((a) => a.id === id) ?? STORE_APPS.find((a) => a.id === id)
  if (known) return known.title
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w.toLowerCase() === 'tdg' ? 'TDG' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/**
 * Everything a report can be filed against, as the picker lists it.
 *
 * ## Why the form has a picker at all
 *
 * `#/feedback/<app>` was built for the apps with no sign-in of their own, and
 * it answered half the question: a report from MARANATHA arrives labelled
 * `maranatha` because the link said so. The other half is somebody standing on
 * THIS site who wants to tell us about TDG Veditor. Before this they could
 * only write the app's name into the message, and the report still arrived
 * labelled `tdg-site` — so the console's per-app view, the thing that decides
 * which of us reads it, was wrong about every report that mattered most.
 *
 * ## Derived, never typed — rule 17
 *
 * The list is the site's own product lists read through `src/content/`, so
 * adding an app to `content.ts` puts it in this picker with nothing here to
 * edit, and a card hidden from the Developer console's Content tab drops out
 * of it. A picker that named its apps would be a product nobody could report
 * about the day it shipped, and forgetting would not fail loudly.
 *
 * **The names come from `appName` rather than from the resolved cards**, on
 * purpose. That is the same function the eyebrow and the reply inbox use, so
 * the option somebody picks, the header over the form and the label on the
 * answer that comes back are one string in three places. A card renamed at
 * runtime is the case that would otherwise split them — see `appName`.
 *
 * ## What is NOT in it, and why
 *
 * The org repos `src/live/` discovers get a card on the Apps grid and are
 * still absent here, because this site has no id for them. A discovered card
 * is a repository NAME, and the feedback id is a page slug: `TDG-Veditor` is
 * `veditor`, not `tdg-veditor`. Guessing would file real reports under an app
 * that does not exist — a permanent wrong key in `tdg_feedback.app` — which is
 * worse than the option being absent, because the reader can still say which
 * app in the message and we can move it. When a discovered app earns a card in
 * `content.ts` it earns its id in the same edit, and appears here for free.
 *
 * `keep` is the other half of rule 17: an id that is in no list — an app of
 * ours that reports before it has a card, or one hidden from the grids since
 * the link was written — is added rather than dropped, wearing the face
 * `appName` makes out of its own id. A picker that silently swapped somebody's
 * app for this site would file their report against the wrong thing without
 * saying so.
 *
 * The caller passes BOTH the id the dialog arrived with and the one showing in
 * the field, and that is not belt and braces. Passing only the current value
 * would rebuild the list around it on every change, so an arrival from an app
 * with no card would vanish from the picker the moment somebody looked at
 * another option — a one-way door out of the app they were actually reporting
 * about. Passing only the arrival leaves the field able to hold a value the
 * list has since stopped offering, which a `<select>` renders as blank.
 */
export type FeedbackTarget = { id: string; name: string }

export function feedbackTargets(
  doc: SiteContentDoc,
  keep: readonly (string | undefined)[] = [],
): FeedbackTarget[] {
  const ids = [
    // First, because it is what the form opens on and what a report files
    // under when nobody touches this field.
    FEEDBACK_APP_ID,
    ...visibleApps(doc).map((app) => app.page),
    ...visibleTools(doc).map((tool) => tool.page),
    ...(visibleGame(doc) ? [MARANATHA.page] : []),
  ]
  for (const id of keep) {
    if (id && !ids.includes(id)) ids.splice(1, 0, id)
  }
  return ids.map((id) => ({ id, name: appName(id) }))
}
