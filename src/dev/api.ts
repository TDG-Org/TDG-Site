import { supabase } from '../lib/supabase'
import type { PackGrant } from '../store/grant'

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

/**
 * How ONE account stands in ONE app's pack Store.
 *
 * Keyed by app id inside `DevAccount.store`, and the keys are whatever the
 * server found — never a list written here. See `apps.ts` for why this shape
 * replaced the four `veditor_*` / `devfleet_*` columns it used to be.
 */
export type DevStoreEntry = {
  packs: string[]
  stripe_customer_id: string | null
  /**
   * How each pack is held, for an app that records it — `veditor_entitlements`
   * has a `grants` column because its Pro Export Pack is a subscription, and
   * "Owned" is not the whole truth about a thing that can lapse. `{}` for an
   * app whose table has no such column, which means every pack is held
   * outright.
   */
  grants: Record<string, DevGrant | undefined>
}

/**
 * One entry of an app's `grants` column. Every field is optional: this is an
 * app's own jsonb, not a shape this project controls.
 *
 * The SAME type the shop reads, not a copy of it. It used to be declared twice
 * — once here and once in `store/grant.ts` — which is two places to update when
 * an app's webhook starts recording a field, and the console is the half that
 * would go quiet rather than break. One declaration also means the console and
 * the Store can never disagree about what a grant MEANS, because
 * `standingOfGrant` reads them both.
 */
export type DevGrant = PackGrant

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
  /**
   * Every pack Store this account touches, keyed by app id.
   *
   * One object rather than a pair of columns per app, because a column per app
   * is a column somebody has to add — and the day they forget, the roster says
   * an account owns nothing while the panel below grants it a pack. The server
   * builds this from whatever `<app>_entitlements` tables exist, so an app that
   * shipped after this file was last edited is in here anyway.
   */
  store: Record<string, DevStoreEntry | undefined>
  /**
   * Every product this account may not hold and may not buy.
   *
   * An ARRAY and not a per-app field, for the same reason `store` is one
   * object: a block can name an app this console has never heard of — one
   * whose table was dropped, one that is a tier ladder rather than a pack
   * Store — and **a block nobody can see is a block nobody can lift**. So the
   * server hands over every row it has, and `apps.ts` folds them into the
   * panels it does draw while `AppsPanel` names any that landed nowhere.
   */
  revocations: DevRevocation[]
  /**
   * This account's place in the order everybody joined. 1 is the first account
   * ever made on TDG Core.
   *
   * Ranked in Postgres over the WHOLE of `profiles`, never over the rows this
   * read happened to return. `tdg_admin_accounts` both filters (the search box
   * re-queries it) and caps (`p_max_rows`), so a number counted in the browser
   * would change as you typed — which is worse than no number, because it
   * looks like a fact. See the migration for the long version.
   */
  signup_no: number
}

/** One standing "may not have this, may not buy it" on one account. */
export type DevRevocation = {
  /** App id, as `tdg_store_apps()` reports it — or any product id at all. */
  app: string
  /** A pack id, or `*` for the whole app. */
  pack: string
  /** Why, in the words the account holder is shown. */
  reason: string | null
  /**
   * Did it actually take something away?
   *
   * False means the row is a block and nothing more: the account held nothing
   * at the time, or the product has no entitlements table for the server to
   * take from. The panel says which, because "revoked" and "revoked, and here
   * is what came off" are different facts and only one of them is reversible
   * in the sense a reader assumes.
   */
  held: boolean
  at: string
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
  /** Feedback reports still marked 'new': the "is anything waiting?" number. */
  feedback_new: number
  /** App id → how many accounts own at least one of its packs. One key per
   *  discovered app, so a new app gets a tile in the numbers on its first day. */
  store_owners: Record<string, number>
  gross_cents: number
}

/** One row of the merged money/entitlement ledger. */
export type DevEvent = {
  at: string
  /** An app id, or `makullveny` for the tier ledger. Open, not a union: the
   *  server unions in every ledger it finds. */
  source: string
  event_type: string
  user_id: string | null
  who: string
  item: string | null
  amount_cents: number | null
  currency: string | null
  event_id: string
}

/** One developer reply on a feedback report, with its delivery state. */
export type DevFeedbackReply = {
  id: number
  body: string
  at: string
  author_id: string | null
  /** The developer's display name, or 'deleted account'. */
  by: string
  /**
   * When the person's app confirmed the reply was SHOWN — not when it was
   * written. Null means it is still waiting in their inbox, which is the fact
   * the console prints: "sent" and "seen" are different promises.
   */
  seen_at: string | null
}

/**
 * One user feedback report, with its whole exchange.
 *
 * `app` is a plain string, not a union of today's products, for the same
 * reason DevStoreEntry is keyed openly: any TDG app can submit under its own
 * id, and one that ships tomorrow must land here without this file changing.
 * The console titles an id it has no copy for from the id itself.
 */
export type DevFeedback = {
  id: number
  at: string
  updated_at: string
  /** Null once the account has been deleted; the report outlives it. */
  user_id: string | null
  who: string
  username: string | null
  email: string | null
  app: string
  app_version: string | null
  os: string | null
  kind: string
  message: string
  /** Volunteered, free-form — "my instagram is @tdgluke". Never required. */
  contact: string | null
  status: string
  replies: DevFeedbackReply[]
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

/**
 * One app with a pack Store, as the SERVER knows it.
 *
 * Discovered, not declared: `tdg_store_apps()` finds every
 * `public.<app>_entitlements` table and reports what it found beside it. So
 * this list is the honest answer to "what can this console actually grant?",
 * which is not the same question as "what does the site sell?" — see
 * `apps.ts`, which holds the two answers against each other.
 */
export type DevCatalogApp = {
  id: string
  entitlements_table: string
  /** Its money ledger, if it keeps one. Null means grants work and simply do
   *  not show up in Purchases. */
  events_table: string | null
  /** What `<app>_known_packs()` says it sells. Empty when the app publishes no
   *  such function, in which case the server accepts any well-formed pack id. */
  packs: string[]
  /** Whether its table records HOW each pack is held (rented, and until when). */
  has_grants: boolean
}

/** The lists the dropdowns offer, straight from the database that validates them. */
export type DevCatalog = {
  core_tiers: string[]
  statuses: string[]
  mak_tiers: string[]
  mak_themes: string[]
  /** What a feedback report can be, and where it can stand. The Feedback tab's
   *  filters and its status control both derive from these, so they can never
   *  offer a value tdg_feedback_submit or _set_status would refuse. */
  feedback_kinds: string[]
  feedback_statuses: string[]
  apps: DevCatalogApp[]
}

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
    feedback_new: 0,
    store_owners: {},
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

/**
 * One row of the signed-in developer's own pinned-accounts shortlist.
 *
 * Private to the developer who made it: the account it points at is never told
 * it is on anybody's list, and neither is the other developer. See
 * `tdg_dev_pins` in the migration.
 */
export type DevPin = {
  user_id: string
  /** Its place in the owner's own order, low first. Gaps are normal — only the
   *  ORDER is ever read, never the number. */
  sort: number
  pinned_at: string
}

/** This developer's shortlist, in this developer's order. */
export const getPins = (): Promise<DevPin[]> => rpc<DevPin[]>('tdg_admin_pins')

/** Pin one account, or unpin it. A new pin lands at the END of the list, so
 *  pinning somebody never rearranges a list arranged by hand. */
export const setPin = (userId: string, on: boolean): Promise<unknown> =>
  rpc('tdg_admin_set_pin', { p_target: userId, p_on: on })

/**
 * Put the whole shortlist in a new order, in one call.
 *
 * The server is forgiving in both directions, because this browser's copy can
 * be a moment behind the table: an id it names that is not pinned is ignored,
 * and a pin it fails to name keeps its relative place after the ones it did.
 * So a stale list can reorder, but it can neither invent a pin nor drop one.
 */
export const reorderPins = (order: readonly string[]): Promise<unknown> =>
  rpc('tdg_admin_reorder_pins', { p_order: order })

export const getEvents = (userId: string | null = null, maxRows = 200): Promise<DevEvent[]> =>
  rpc<DevEvent[]>('tdg_admin_events', { p_target: userId, p_max_rows: maxRows })

export const getAudit = (
  userId: string | null = null,
  q = '',
  maxRows = 200,
): Promise<DevAuditRow[]> =>
  rpc<DevAuditRow[]>('tdg_admin_audit', { p_target: userId, p_q: q, p_max_rows: maxRows })

/** Every feedback report, newest first, each with its whole reply exchange. */
export const getFeedback = (
  userId: string | null = null,
  maxRows = 500,
): Promise<DevFeedback[]> =>
  rpc<DevFeedback[]>('tdg_admin_feedback', { p_target: userId, p_max_rows: maxRows })

/**
 * The accounts whose Developer permission cannot be removed, and which cannot
 * be deleted. See supabase/migrations/20260822015840_protected_developer_accounts.sql.
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

/**
 * The Candle bundle, and the tier that mirrors it, in ONE write.
 *
 * `mak_subscriptions` stores the bundle twice and only one of them is the
 * authority. `candle_purchased_at` is what Makullveny's `entitlements.js`
 * actually gates every piece of Candle content on — the themes, the Journal,
 * the Scroll, the raised limits — and `tier = 'candle'` grants NOTHING: the
 * app's own comment explains that ranking a one-time purchase inside
 * TIER_ORDER would hand it to every Lantern subscriber, so it does not.
 *
 * The tier is a MIRROR the app's Stripe webhook keeps beside the flag. The
 * console used to offer both, unrelated — a dropdown where `candle` looked
 * exactly like the thing that grants everything and granted nothing, beside a
 * switch that was the real one. There is a live row on this project in exactly
 * that state, which is how the trap was found.
 *
 * So this writes the pair the way the webhook writes it, in one statement, and
 * the console offers one control. `setMakFlag` above is untouched and stays the
 * narrow verb; nothing calls it for Candle any more.
 *
 * See supabase/migrations/20260828160000_admin_mak_candle_one_press.sql.
 */
export const setMakCandle = (userId: string, on: boolean): Promise<null> =>
  rpc<null>('tdg_admin_set_mak_candle', { p_target: userId, p_on: on })

/**
 * One Store pack on or off, for any account, in any app the server knows.
 *
 * `app` is a plain string rather than a union of the apps that existed when
 * this was written. The server matches it against its own discovered list and
 * refuses anything else with a sentence naming what registers an app, so a typo
 * is caught by the thing that actually knows — and a product that ships
 * tomorrow needs no edit here.
 */
export const setPack = (
  userId: string,
  app: string,
  pack: string,
  owned: boolean,
): Promise<string[]> =>
  rpc<string[]>('tdg_admin_set_pack', {
    p_target: userId,
    p_app: app,
    p_pack: pack,
    p_owned: owned,
  })

/**
 * The SHAPE of a grant, for an app that records one: held outright, or rented
 * with a status and a date.
 *
 * `setPack` above can only say on or off, and a bare "on" is read by the app's
 * own trigger as PERPETUAL — the historically true reading of a pack id with
 * nothing beside it. Correct, and it left every state a real subscription
 * passes through unreachable by hand: renewing, cancelled and running out, in
 * a trial, behind on a payment, lapsed. Those are on the money path and nobody
 * could look at one.
 *
 * Returns the app's whole `grants` object as it now stands, so a caller can
 * see what it did rather than assume.
 *
 * **It never writes a `subscriptionId`.** The server carries whatever was
 * already there and refuses to invent one, because that id is the only handle
 * `tdg-site-billing` has: a made-up one would be a Cancel button aimed into a
 * live Stripe account at something that was never there.
 */
export const setPackGrant = (
  userId: string,
  app: string,
  pack: string,
  grant: {
    kind: 'perpetual' | 'subscription'
    status?: string | null
    /** ISO. Required for a subscription; the server refuses one without it. */
    periodEnd?: string | null
    cancelAtPeriodEnd?: boolean
  },
): Promise<Record<string, DevGrant | undefined>> =>
  rpc<Record<string, DevGrant | undefined>>('tdg_admin_set_pack_grant', {
    p_target: userId,
    p_app: app,
    p_pack: pack,
    p_kind: grant.kind,
    p_status: grant.status ?? null,
    p_period_end: grant.periodEnd ?? null,
    p_cancel_at_period_end: grant.cancelAtPeriodEnd ?? false,
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

/* ── revoking, and telling somebody ────────────────────────────────────── */

/**
 * Put a product out of an account's reach, or give it back.
 *
 * This is NOT `setPack(false)` wearing a stronger word, and the difference is
 * the whole reason it exists. Switching a pack off says "they do not have this
 * right now", and the Store's next move is to offer to sell it again — right
 * for a refund or a lapse, exactly wrong for an account that must not have the
 * product at all. Revoking is a standing fact with its own row, its own reason
 * and its own date, and it survives everything a purchase can do.
 *
 * `pack` is `'*'` for the whole app.
 *
 * **It takes the access away and remembers what it took.** The server lifts the
 * grant (or, for an app that records no grants, the pack ids) into
 * `held_before` and writes it straight back when the revocation is lifted — so
 * restoring returns the row as it was, `since` included, rather than inventing
 * a purchase this project never received. See
 * supabase/migrations/20260828235900_product_revocations_and_notices.sql.
 */
export const setRevocation = (
  userId: string,
  app: string,
  pack: string,
  on: boolean,
  reason: string | null = null,
): Promise<unknown> =>
  rpc<unknown>('tdg_admin_set_revocation', {
    p_target: userId,
    p_app: app,
    p_pack: pack,
    p_on: on,
    p_reason: reason,
  })

/** What one reset actually did, so the console can say it rather than imply it. */
export type DevReset = {
  app: string
  /** The pack it was scoped to, or `*` for the whole app. */
  pack: string
  /** Pack ids the reset took back, because nothing but this console explained them. */
  removed: string[]
  /** Pack ids Stripe is on the record for on this account. These survive. */
  paid_for: string[]
  blocks_lifted: number
}

/**
 * Forget everything this console did to one product on one account.
 *
 * Not `setPack(false)` on each pack in turn, and not a lift of every block:
 * those are DECISIONS, and this is the absence of one. It removes the grants
 * that only a hand grant explains, lifts the blocks in scope, and leaves
 * standing whatever Stripe actually paid for — so what is left is what the
 * money says, which is what "reset" has to mean on a page whose whole job is
 * trying states out on real accounts.
 *
 * `pack` is `'*'` for the whole app. The server decides what counts as a real
 * purchase — a `subscriptionId` only a webhook can write, or a ledger row that
 * is not an `admin:` one — and refuses outright for an app with no ledger,
 * because a reset that could only guess is a guess about money. The whole
 * argument is in
 * supabase/migrations/20260830140000_reset_a_product_to_what_was_paid_for.sql.
 */
export const resetProduct = (
  userId: string,
  app: string,
  pack = '*',
): Promise<DevReset> =>
  rpc<DevReset>('tdg_admin_reset_product', { p_target: userId, p_app: app, p_pack: pack })

/**
 * Tell an account what we changed about what it owns.
 *
 * Its own verb rather than a flag on every entitlement function: the WORDS are
 * the point. "We ended your Pro Export Pack because the payment was reversed"
 * is not derivable from a status column, so the developer who made the change
 * types it beside the change, and a tick box on a new panel is a client edit
 * rather than a migration.
 *
 * Delivery is the same promise `replyToFeedback` makes and no bigger: it waits
 * in tdg-core until the person's own app asks. There is no email on this path
 * and deliberately so — see the migration header.
 */
export const notify = (
  userId: string,
  app: string,
  subject: string,
  body: string,
): Promise<number> =>
  rpc<number>('tdg_admin_notify', {
    p_target: userId,
    p_app: app,
    p_subject: subject,
    p_body: body,
  })

/* ── feedback writes ───────────────────────────────────────────────────── */

export const setFeedbackStatus = (id: number, status: string): Promise<null> =>
  rpc<null>('tdg_admin_feedback_set_status', { p_id: id, p_status: status })

/**
 * The same, for many reports at once. Answers how many actually MOVED.
 *
 * The console sends the exact ids it is looking at rather than a filter, so
 * what gets written is what was on screen — a server-side "everything matching
 * X" would also catch rows that arrived between the page loading and the button
 * being pressed. Reports already in the target status are skipped and are not
 * counted, which is why the toast can say "12 marked read" and mean it.
 *
 * One audit line for the whole press, naming the count and the ids: forty lines
 * saying the same thing at the same second is a log nobody reads past. See
 * supabase/migrations/20260828190000_admin_feedback_status_many.sql.
 */
export const setFeedbackStatusMany = (ids: number[], status: string): Promise<number> =>
  rpc<number>('tdg_admin_feedback_set_status_many', { p_ids: ids, p_status: status })

/**
 * Answer one report. Writing the reply IS the whole send: the person's own app
 * calls `tdg_feedback_inbox()` when it next starts and shows it. There is no
 * push and no email, which is why the console words it as "next time they
 * open the app" rather than "sent".
 */
export const replyToFeedback = (id: number, body: string): Promise<number> =>
  rpc<number>('tdg_admin_feedback_reply', { p_id: id, p_body: body })

/** Gone for good, replies included. For spam; a handled report is 'resolved'. */
export const deleteFeedback = (id: number): Promise<null> =>
  rpc<null>('tdg_admin_feedback_delete', { p_id: id })
