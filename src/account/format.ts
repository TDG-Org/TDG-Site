/**
 * The three display helpers the Account page needs.
 *
 * **Deliberately a twin of the same three in `src/dev/format.ts`, not an
 * import of them.** That file is the Developer console's, its header says so,
 * and it carries a dozen other things about moderation standings and Stripe
 * amounts that this page has no business knowing. The reason is the one
 * `src/feedback/README.md` gives about coupling folders: a page every reader
 * opens should not depend on a folder documented as internal, and thirty lines
 * repeated is cheaper than a shared module that then belongs to neither.
 *
 * **The one thing the twins must agree on is `TDG`.** `prettyId` exists
 * because app, pack and badge ids are kebab-case everywhere, and `tdg-site`
 * rendered as "Tdg Site" would misspell the project's own name on its own
 * account page. If that rule changes, it changes in both files.
 */

const longDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * `18 August 2026`, in the READER'S timezone.
 *
 * The day somebody's account began is a fact about their life, not about the
 * server's clock, so it is shown where they are — the same decision
 * `src/dev/format.ts` records for the console.
 */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return 'not recorded'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'not recorded' : longDate.format(d)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "3 days ago" / "just now". Deliberately coarse: this is a glance, not a log. */
export function fmtRelative(iso: string | null | undefined, never = 'never'): string {
  if (!iso) return never
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return never
  const abs = Math.max(0, Date.now() - t)
  const say = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`

  if (abs < MINUTE) return 'just now'
  if (abs < HOUR) return say(Math.round(abs / MINUTE), 'minute')
  if (abs < DAY) return say(Math.round(abs / HOUR), 'hour')
  if (abs < 30 * DAY) return say(Math.round(abs / DAY), 'day')
  if (abs < 365 * DAY) return say(Math.round(abs / (30 * DAY)), 'month')
  return say(Math.round(abs / (365 * DAY)), 'year')
}

/**
 * `pro-export` → `Pro Export`, `tdg-site` → `TDG Site`.
 *
 * What gives a face to an id this site has never been taught to read — an app,
 * a pack, an audience or a privacy group added by a migration after this build
 * shipped. AGENTS.md rule 17: a list that silently omits what it cannot name
 * is a list you cannot trust about anything else on it.
 */
export function prettyId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w.toLowerCase() === 'tdg' ? 'TDG' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** `1` → `1`, `0` → `0`. Grouped, so a four-figure count is readable. */
const counts = new Intl.NumberFormat()
export function fmtCount(n: number): string {
  return counts.format(n)
}

/**
 * When the username cooldown ends, or null when a change is free right now.
 *
 * Fourteen days from the stamp on the profile row. **The stamp is the
 * server's** — `touch_profile_timestamps` writes `username_changed_at` on a
 * column no client may set — so this is arithmetic on a fact rather than a
 * guess at one. The interval is the only thing repeated, and it is repeated
 * because Postgres has no way to hand it over: the trigger holds it as a
 * `constant interval` and refuses with `PT429`.
 *
 * That refusal, not this, is the authority. What this buys is saying so
 * BEFORE somebody types a new name and presses save, which is the difference
 * between a rule and an ambush. If the two ever disagree, the server's
 * sentence is the one shown, because it is the one that decided.
 */
const USERNAME_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000

export function usernameFreeAt(changedAt: string | null | undefined): Date | null {
  if (!changedAt) return null
  const t = Date.parse(changedAt)
  if (Number.isNaN(t)) return null
  const free = t + USERNAME_COOLDOWN_MS
  return free > Date.now() ? new Date(free) : null
}
