import { supabase } from '../lib/supabase'

/**
 * Every call the Developer console can make, in one file.
 *
 * There is no direct table access here on purpose. The console reads and writes
 * ONLY through the `tdg_admin_*` functions, each of which re-checks
 * `profiles.is_admin` in Postgres before it does anything, so this file is a
 * convenience layer, never a permission layer. The full reasoning lives in
 * supabase/migrations/20260821090000_tdg_core_admin_console.sql.
 *
 * Shapes here are hand-written to match that migration's `returns table (…)`
 * lists column for column. There is no generated types package on this project,
 * so if you add a column there, add it here in the same sitting.
 */

/** One account, seen across every TDG product at once. */
export type DevAccount = {
  user_id: string
  email: string | null
  username: string | null
  display_name: string | null
  bio: string | null
  recovery_email: string | null
  is_admin: boolean
  public_profile: boolean
  public_friend_list: boolean
  created_at: string
  updated_at: string
  username_changed_at: string | null
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  /** GoTrue's own lock. Set, and in the future, means no TDG app will sign them in. */
  auth_banned_until: string | null
  status: string
  ban_until: string | null
  hidden_by_admin: boolean
  hidden_until: string | null
  deleted_by_admin: boolean
  deleted_at: string | null
  friend_count: number
  streak_current: number
  streak_longest: number
  streak_total: number
  core_tier: string
  core_status: string
  core_stripe_customer_id: string | null
  core_renewed_at: string | null
  /** Above 1 means duplicate rows in public.subscriptions, which is a real fault. */
  core_row_count: number
  mak_tier: string
  mak_status: string
  mak_themes: string[]
  mak_candle_purchased_at: string | null
  mak_support_badge_at: string | null
  mak_period_end: string | null
  mak_cancel_at_period_end: boolean
  mak_stripe_customer_id: string | null
  veditor_packs: string[]
  veditor_stripe_customer_id: string | null
  devfleet_packs: string[]
  devfleet_stripe_customer_id: string | null
}

export type DevOverview = {
  accounts: number
  developers: number
  suspended: number
  hidden: number
  soft_deleted: number
  unconfirmed: number
  new_7d: number
  new_30d: number
  active_7d: number
  core_paid: number
  mak_paid: number
  veditor_owners: number
  devfleet_owners: number
  gross_cents: number
}

/** One row of the merged money/entitlement ledger. */
export type DevEvent = {
  at: string
  source: 'veditor' | 'devfleet' | 'makullveny'
  event_type: string
  user_id: string | null
  who: string
  item: string | null
  amount_cents: number | null
  currency: string | null
  event_id: string
}

/** One row of the moderation / permission trail, from every TDG app. */
export type DevAuditRow = {
  id: number
  at: string
  app: string
  action: string
  detail: string | null
  actor_id: string | null
  actor_name: string
  target_id: string | null
  target_name: string
}

/** The lists the dropdowns offer, straight from the database that validates them. */
export type DevCatalog = {
  core_tiers: string[]
  statuses: string[]
  mak_tiers: string[]
  mak_themes: string[]
  veditor_packs: string[]
  devfleet_packs: string[]
}

/** The two Store apps this console can grant packs for. */
export type PackApp = 'veditor' | 'devfleet'

/** The verbs tdg_admin_moderate accepts. */
export type ModerateAction =
  | 'ban'
  | 'unban'
  | 'hide'
  | 'unhide'
  | 'soft_delete'
  | 'restore'
  | 'sign_out_everywhere'

/**
 * A refusal from Postgres, already worded for a human.
 *
 * The functions raise messages meant to be READ ("soft-delete the account
 * first"), so the console shows them rather than inventing its own. The `tdg: `
 * prefix is for server logs and is stripped here; a network failure gets its
 * own sentence, because "could not reach the server" and "the server said no"
 * are different problems and telling them apart is most of debugging.
 */
export class DevError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message)
    this.name = 'DevError'
  }
}

function toDevError(error: { message?: string; code?: string; details?: string } | null): DevError {
  const raw = (error?.message ?? '').trim()
  const code = error?.code ?? null
  if (!raw) return new DevError("Something went wrong, and the server didn't say what.", code)
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return new DevError("Couldn't reach the server. Check the connection and try again.", code)
  }
  const clean = raw.replace(/^tdg:\s*/i, '')
  return new DevError(clean.charAt(0).toUpperCase() + clean.slice(1), code)
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw toDevError(error)
  return data as T
}

/* ── reads ─────────────────────────────────────────────────────────────── */

export const getOverview = async (): Promise<DevOverview> =>
  // `returns table` of one row arrives as a one-element array.
  ((await rpc<DevOverview[]>('tdg_admin_overview'))[0] ?? {
    accounts: 0,
    developers: 0,
    suspended: 0,
    hidden: 0,
    soft_deleted: 0,
    unconfirmed: 0,
    new_7d: 0,
    new_30d: 0,
    active_7d: 0,
    core_paid: 0,
    mak_paid: 0,
    veditor_owners: 0,
    devfleet_owners: 0,
    gross_cents: 0,
  })

export const getCatalog = (): Promise<DevCatalog> => rpc<DevCatalog>('tdg_admin_catalog')

export const searchAccounts = (q: string, maxRows = 200): Promise<DevAccount[]> =>
  rpc<DevAccount[]>('tdg_admin_accounts', { p_q: q, p_target: null, p_max_rows: maxRows })

/** Re-read ONE account. Used after every write, so the panel shows what landed
 *  rather than what the form hoped would land. */
export const getAccount = async (userId: string): Promise<DevAccount | null> =>
  (await rpc<DevAccount[]>('tdg_admin_accounts', { p_q: '', p_target: userId, p_max_rows: 1 }))[0] ??
  null

export const getEvents = (userId: string | null = null, maxRows = 200): Promise<DevEvent[]> =>
  rpc<DevEvent[]>('tdg_admin_events', { p_target: userId, p_max_rows: maxRows })

export const getAudit = (
  userId: string | null = null,
  q = '',
  maxRows = 200,
): Promise<DevAuditRow[]> =>
  rpc<DevAuditRow[]>('tdg_admin_audit', { p_target: userId, p_q: q, p_max_rows: maxRows })

/**
 * The accounts whose Developer permission cannot be removed, and which cannot
 * be deleted. See supabase/migrations/20260821200000_protected_developer_accounts.sql.
 *
 * Fetched once per page load and held, rather than threaded down from
 * DevConsole like the catalog is. The list is two rows that change about never
 * and only the Permissions panel and one header tag read it, so a prop through
 * three components buys nothing. If a third caller ever appears, hoist it.
 *
 * This is for DISPLAY. It is what lets the page render the switch as locked
 * instead of offering a control the server will refuse, which is the one thing
 * a console must never do. Nothing here decides anything: a BEFORE trigger on
 * public.profiles is what actually refuses, whichever path the write came from.
 */
let protectedIds: Promise<readonly string[]> | null = null

export const getProtectedAccounts = (): Promise<readonly string[]> =>
  (protectedIds ??= rpc<string[] | null>('tdg_admin_protected_accounts').then((ids) => ids ?? []))

/* ── writes ────────────────────────────────────────────────────────────── */

export const setDeveloper = (userId: string, isDeveloper: boolean): Promise<null> =>
  rpc<null>('tdg_admin_set_admin', { p_target: userId, p_admin: isDeveloper })

/**
 * Identity fields.
 *
 * `undefined` leaves a field alone; `''` clears it. That distinction is the
 * whole reason this takes a partial. A save that sent every field would wipe
 * the display name every time somebody only edited the bio.
 */
export const setProfile = (
  userId: string,
  patch: {
    displayName?: string
    username?: string
    bio?: string
    publicProfile?: boolean
    publicFriendList?: boolean
  },
): Promise<null> =>
  rpc<null>('tdg_admin_set_profile', {
    p_target: userId,
    p_display_name: patch.displayName ?? null,
    p_username: patch.username ?? null,
    p_bio: patch.bio ?? null,
    p_public_profile: patch.publicProfile ?? null,
    p_public_friend_list: patch.publicFriendList ?? null,
  })

export const setCoreSubscription = (
  userId: string,
  tier: string,
  status: string,
): Promise<null> =>
  rpc<null>('tdg_admin_set_core_subscription', {
    p_target: userId,
    p_tier: tier,
    p_status: status,
  })

export const setMakSubscription = (userId: string, tier: string, status: string): Promise<null> =>
  rpc<null>('tdg_admin_set_mak_subscription', { p_target: userId, p_tier: tier, p_status: status })

export const setMakTheme = (userId: string, theme: string, owned: boolean): Promise<string[]> =>
  rpc<string[]>('tdg_admin_set_mak_theme', { p_target: userId, p_theme: theme, p_owned: owned })

export const setMakFlag = (
  userId: string,
  flag: 'candle_bundle' | 'support_badge',
  on: boolean,
): Promise<null> => rpc<null>('tdg_admin_set_mak_flag', { p_target: userId, p_flag: flag, p_on: on })

export const setPack = (
  userId: string,
  app: PackApp,
  pack: string,
  owned: boolean,
): Promise<string[]> =>
  rpc<string[]>('tdg_admin_set_pack', {
    p_target: userId,
    p_app: app,
    p_pack: pack,
    p_owned: owned,
  })

/** `until` is an ISO string, or null for indefinite. */
export const moderate = (
  userId: string,
  action: ModerateAction,
  until: string | null = null,
  detail: string | null = null,
): Promise<null> =>
  rpc<null>('tdg_admin_moderate', {
    p_target: userId,
    p_action: action,
    p_until: until,
    p_detail: detail,
  })

export const deleteForever = (userId: string): Promise<null> =>
  rpc<null>('tdg_admin_delete_forever', { p_target: userId })
