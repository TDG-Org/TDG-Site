import type { DevAccount } from './api'

/**
 * Display helpers for the Developer console.
 *
 * Dates are shown in the READER'S timezone, not UTC. The console is used by two
 * people in one place; "yesterday at 7pm" is the question being asked, and a
 * UTC stamp makes them do arithmetic before they can answer it.
 */

const dateTime = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'not set'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'not set' : dateTime.format(d)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "3 days ago" / "in 2 hours" / "never". Deliberately coarse: this is a glance. */
export function fmtRelative(iso: string | null | undefined, never = 'never'): string {
  if (!iso) return never
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return never
  const delta = t - Date.now()
  const ahead = delta > 0
  const abs = Math.abs(delta)

  const say = (n: number, unit: string) =>
    `${ahead ? 'in ' : ''}${n} ${unit}${n === 1 ? '' : 's'}${ahead ? '' : ' ago'}`

  if (abs < MINUTE) return ahead ? 'in a moment' : 'just now'
  if (abs < HOUR) return say(Math.round(abs / MINUTE), 'minute')
  if (abs < DAY) return say(Math.round(abs / HOUR), 'hour')
  if (abs < 30 * DAY) return say(Math.round(abs / DAY), 'day')
  if (abs < 365 * DAY) return say(Math.round(abs / (30 * DAY)), 'month')
  return say(Math.round(abs / (365 * DAY)), 'year')
}

/**
 * How long ago, in two or three characters: `now`, `2m`, `3h`, `1d`.
 *
 * For the Refresh tile, where the age sits under a 74px button and its only job
 * is to answer "is what I am looking at old?" at a glance. `fmtRelative` says
 * the same thing in words and is what the tile's label and tooltip use; this is
 * the version that fits.
 */
export function fmtAgeShort(at: number | null): string {
  if (at == null) return '—'
  const abs = Math.max(0, Date.now() - at)
  if (abs < MINUTE) return 'now'
  if (abs < HOUR) return `${Math.floor(abs / MINUTE)}m`
  if (abs < DAY) return `${Math.floor(abs / HOUR)}h`
  return `${Math.floor(abs / DAY)}d`
}

export function fmtUsd(cents: number | null | undefined): string {
  if (cents == null) return 'none'
  return `$${(cents / 100).toFixed(2)}`
}

/** An end time, or the word for not having one. */
export function fmtUntil(iso: string | null | undefined): string {
  return iso ? `until ${fmtDate(iso)}` : 'indefinitely'
}

/** Is a timestamped state still in force? A null end time means yes, for ever. */
export function stillInForce(iso: string | null | undefined): boolean {
  if (!iso) return true
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? true : t > Date.now()
}

export type Standing = {
  /** Title Case, because it is a state name shown as a tag. */
  label: string
  tone: 'ok' | 'warn' | 'bad'
  /** Sentence case: what it means for the person, in one line. */
  meaning: string
}

/**
 * The one sentence that answers "what is going on with this account?".
 *
 * Order matters and is worst-first: an account that is both deleted and banned
 * is DELETED, because that is the state that decides what happens next.
 */
export function standingOf(a: DevAccount): Standing {
  if (a.deleted_by_admin) {
    return {
      label: 'Soft Deleted',
      tone: 'bad',
      meaning: 'hidden and locked out everywhere, but every row is still here, and Restore brings it all back.',
    }
  }
  const authLocked = a.auth_banned_until != null && stillInForce(a.auth_banned_until)
  if (a.status === 'banned' && stillInForce(a.ban_until)) {
    return {
      label: 'Suspended',
      tone: 'bad',
      meaning: `cannot sign in to any TDG app ${fmtUntil(a.ban_until)}.`,
    }
  }
  if (authLocked) {
    return {
      label: 'Sign-In Locked',
      tone: 'bad',
      meaning:
        "GoTrue is refusing this account even though Bible Educator doesn't think it is banned. Lift it with Unsuspend.",
    }
  }
  if (a.hidden_by_admin && stillInForce(a.hidden_until)) {
    return {
      label: 'Hidden',
      tone: 'warn',
      meaning: `signs in normally, but is invisible in Bible Educator's search and friend list ${fmtUntil(a.hidden_until)}.`,
    }
  }
  if (!a.email_confirmed_at) {
    return {
      label: 'Unconfirmed',
      tone: 'warn',
      meaning: 'has never clicked the confirmation link, so cannot sign in yet.',
    }
  }
  return { label: 'Active', tone: 'ok', meaning: 'nothing is restricting this account.' }
}

/** How long a suspension or a hide should last. Null is "no end time". */
export const DURATIONS: { label: string; hours: number | null }[] = [
  { label: '1 Hour', hours: 1 },
  { label: '1 Day', hours: 24 },
  { label: '3 Days', hours: 72 },
  { label: '1 Week', hours: 168 },
  { label: '1 Month', hours: 720 },
  { label: 'Indefinitely', hours: null },
]

export function untilFromHours(hours: number | null): string | null {
  return hours == null ? null : new Date(Date.now() + hours * HOUR).toISOString()
}

/** `pro-export` → `Pro Export`. Pack and theme ids are kebab-case everywhere.
 *  `tdg` keeps its capitals: it is an acronym wherever it appears, and
 *  `tdg-site` reading as "Tdg Site" would misspell the project's own name. */
export function prettyId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w.toLowerCase() === 'tdg' ? 'TDG' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/**
 * `4d300dc5…f226` — a uuid at the width a table column can afford.
 *
 * Both ends rather than a prefix alone: sequentially created accounts share
 * long prefixes, so the tail is what actually tells two of them apart at a
 * glance. Copying always copies the full id; this is only for reading.
 */
export function shortId(id: string | null | undefined): string {
  if (!id) return '—'
  return id.length <= 13 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`
}

/** The tag tone for a feedback kind. Unknown kinds render plain rather than
 *  vanishing: a kind added on the server tomorrow is still a real report. */
export function feedbackKindTone(kind: string): 'plain' | 'ok' | 'warn' | 'bad' | 'hot' {
  if (kind === 'bug') return 'bad'
  if (kind === 'suggestion') return 'ok'
  if (kind === 'question') return 'warn'
  if (kind === 'praise') return 'hot'
  return 'plain'
}

/** The tag tone for a feedback status: 'new' asks for attention, 'replied'
 *  says the ball is with them, the rest sit quiet. */
export function feedbackStatusTone(status: string): 'plain' | 'ok' | 'warn' | 'bad' | 'hot' {
  if (status === 'new') return 'warn'
  if (status === 'replied') return 'ok'
  return 'plain'
}

/** The name to call somebody, in the order a human would reach for. */
export function nameOf(a: DevAccount): string {
  return a.display_name || a.username || a.email || a.user_id
}
