import { STORE_APPS, formatUsd, isSubscription, type StorePack } from '../data/store'
import { standingOfGrant } from '../store/grant'
import type {
  DevAccount,
  DevCatalog,
  DevCatalogApp,
  DevGrant,
  DevRevocation,
  DevStoreEntry,
} from './api'
import { prettyId } from './format'

/**
 * Which apps the Developer console shows, and what it says about each.
 *
 * ## Why this file exists
 *
 * The console used to name its apps. `AccountDetail` rendered a `PacksPanel`
 * for `veditor` and one for `devfleet`, the overview had a `veditor_owners`
 * stat and a `devfleet_owners` stat, the Purchases dropdown listed three
 * sources by hand, and `DevAccount` carried four columns per app. Adding a
 * seventh TDG product meant finding all of those and a migration besides —
 * eleven edits across two languages, all of which had to agree.
 *
 * They did not have to agree LOUDLY, which was the real problem. A forgotten
 * dropdown option is a filter that silently omits an app's payments. A
 * forgotten panel is a product whose packs nobody can grant, discovered when
 * a customer writes in. **A console that quietly omits a product is not
 * trustworthy about the products it does show**, so the omission had to become
 * impossible rather than merely unlikely.
 *
 * ## The two answers, and why both are needed
 *
 * There are two honest sources here and they answer different questions:
 *
 * | Source | Question it answers |
 * | --- | --- |
 * | `catalog.apps`, from `tdg_store_apps()` | What can this console actually grant? |
 * | `STORE_APPS`, from `src/data/store.ts` | What does the site actually sell? |
 *
 * The server's answer is discovered — it is every `public.<app>_entitlements`
 * table that exists — so it is the truth about what a switch on this page can
 * do. The site's answer is written by hand, because prices and prose cannot be
 * derived from a schema, so it is the truth about what a customer is offered.
 *
 * Neither is a subset of the other, and every way they can disagree is a real
 * fault worth seeing:
 *
 * - **On the server, not in the shop.** A product being built. Grantable, not
 *   yet buyable. Normal, and the panel says so plainly rather than showing an
 *   app with no explanation of why it has no prices.
 * - **In the shop, not on the server.** The shop is taking money for something
 *   the database has nowhere to put. A payment would land in a webhook with no
 *   table to write. This is an alarm, and the panel is loud about it.
 * - **A pack neither list knows, sitting on an account.** Left by a retired
 *   pack id or a hand-run SQL statement. It is rendered as a real tile that can
 *   be switched off, because a thing you can see and cannot fix is worse than
 *   one you cannot see.
 *
 * So this file MERGES rather than picking a winner, and every entry it returns
 * records which sources it came from. Nothing gets dropped for being unknown to
 * one of them; being unknown is the interesting part.
 *
 * ## Adding an app
 *
 * You do not. Create `public.<app>_entitlements` — the one table an app needs
 * before it can sell anything at all — and this console grows a panel, an
 * overview tile, a Purchases filter and working grant switches for it. Give the
 * app an entry in `STORE_APPS` when there are prices to show, and the same
 * panel gains its name, its prose and its amounts. See `src/dev/README.md`.
 */

/**
 * Makullveny's product id, and the one id in this folder that is written down.
 *
 * Rule 17 of `AGENTS.md` forbids naming a product here and this is its stated
 * exception: Makullveny is a genuinely different SHAPE — a tier ladder plus a
 * one-time bundle plus themes plus two flags — not the pack-Store shape wearing
 * a different name, so it keeps a hand-written panel.
 *
 * The constant exists because a REVOCATION can name any product at all,
 * Makullveny included, and `storeApps` grows a panel for every app a block
 * mentions so that no block is unreachable. Without this the one Makullveny
 * block would manufacture a second, empty pack Store beside the real panel and
 * paint it as a red NO TABLE alarm — the console inventing a fault out of a
 * product it already draws correctly one section up.
 */
export const MAK_APP_ID = 'makullveny'

/** One pack, as the console shows it: what it is, and who has heard of it. */
export type DevStorePack = {
  id: string
  /** Title Case. The shop's own name, or the id made readable. */
  name: string
  /**
   * `$7.99` or `$5.99/mo`. Null when the shop does not sell this pack.
   *
   * The cadence is why this is a string rather than a number: `/mo` is how a
   * tile says a pack is rented, and it comes free with the amount. Whether it
   * is rented ON THIS ACCOUNT is a different question, and `grant` below
   * answers it from the account's own row rather than from the shop's opinion.
   */
  price: string | null
  /** Is it in the app's own `<app>_known_packs()` list? */
  onServer: boolean
  /** Does the site sell it? */
  inShop: boolean
  /** Does the account on screen hold it right now? */
  owned: boolean
  /**
   * May this pack truthfully be put into a recurring-plan state?
   *
   * A `grants` column belongs to the APP, not to every item in it. TDG
   * Veditor needs one because Pro Export can recur, but the Theme Pack beside
   * it is still bought once. Treating the column as a property of every pack
   * offered Ended and Subscribed for Theme Pack and let the console write an
   * impossible shape. The shop's own plans are the item-level answer.
   */
  supportsSubscriptionStates: boolean
  /** How it is held, for an app that records that. */
  grant: DevGrant | null
  /**
   * The standing block on this pack, or null.
   *
   * Its own field rather than a fourth value of `owned`, because it answers a
   * different question. `owned` is "does this account have it"; this is "may
   * it". A revoked pack is not owned — the server took the grant when the
   * block went on — and drawing it as merely not-owned would put a Buy button
   * in front of somebody we have decided may not buy.
   */
  revoked: DevRevocation | null
}

/**
 * What the SERVER said about an app, which is three answers and not two.
 *
 * `unknown` is the one that matters. Before this existed, a catalog that had
 * not arrived — a failed read, a shape this client does not recognise — made
 * every app look ABSENT, and absent renders as a red alarm claiming the app's
 * table does not exist, with its switches turned off. So a page that had simply
 * not been told anything told the reader, in confident red, a thing that was
 * not true, and disabled the controls that would have disproved it.
 *
 * **Not knowing is never the same as knowing something is missing**, and it may
 * never be rendered as though it were.
 */
export type ServerState = 'listed' | 'absent' | 'unknown'

/** One app with a pack Store, as the console shows it. */
export type DevStoreApp = {
  id: string
  /** Title Case. The shop's own title, or the id made readable. */
  title: string
  /** Sentence case: what the app is. Null when only the server has heard of it. */
  copy: string | null
  /** The table its ownership lives in. Null when only the shop has heard of it,
   *  which is the fault case: there is nowhere for a purchase to land. */
  entitlementsTable: string | null
  /** Its money ledger, if it keeps one. */
  eventsTable: string | null
  /** Whether its table records how each pack is held. */
  hasGrants: boolean
  /** What the server said: listed, genuinely absent, or not yet known. */
  serverState: ServerState
  /** Shorthand for `serverState === 'listed'`. Never true when unknown. */
  onServer: boolean
  /**
   * Did the payload actually report this account's holdings for this app?
   *
   * False means the answer is missing, NOT that the account owns nothing. A
   * tile drawn "Not owned" from a missing answer is the console telling somebody
   * they do not have what they paid for, which is the one thing
   * `store/useOwnedPacks.ts` refuses to do on the shop side and which this page
   * has no more right to do than the shop does.
   */
  holdingsKnown: boolean
  inShop: boolean
  /**
   * Whether the app publishes a `<app>_known_packs()` list at all.
   *
   * The difference between "this pack is not on the list" and "there is no
   * list" — which is the difference between an alarm and a Tuesday. An app on
   * its first day has no list, so every pack an account holds would otherwise
   * be reported as unrecognised, and a warning that fires on the normal case is
   * a warning nobody reads by the second week.
   */
  hasList: boolean
  /** Everything the app sells, everything the server will grant, and everything
   *  this account holds — merged, so none of the three can hide the others. */
  packs: DevStorePack[]
  /** How many of them this account holds. */
  ownedCount: number
  /**
   * The block on the WHOLE app, or null. Every pack inside it is out of reach
   * whether or not it has a block of its own.
   */
  revoked: DevRevocation | null
  /** How many of its packs are individually blocked. Zero when the whole app is. */
  revokedCount: number
}

/** `$5.99/mo`, `$7.99`, or null for a pack the shop does not price. */
function priceOf(pack: StorePack | undefined): string | null {
  if (!pack) return null
  // `plans[0]` is the primary plan and matches `priceCents` by contract, so
  // this reads one number either way — it only borrows the cadence.
  const lead = pack.plans?.[0]
  return `${formatUsd(pack.priceCents)}${lead?.cadence ?? ''}`
}

/**
 * Every app the console should draw a Store panel for, in the order to draw
 * them, merged from the server's list and the site's shop.
 *
 * Ordered shop-first so the panels run in the same order as the public Store
 * page — the two are read side by side often enough that a different order
 * costs a second every time. Apps only the server knows follow, alphabetically,
 * which is also newest-work-last in practice.
 *
 * `account` is optional: with one, each pack knows whether it is held and the
 * account's own stray packs are folded in; without one, this is just the
 * catalogue, which is what the overview and the Purchases filter need.
 */
export function storeApps(
  catalog: DevCatalog | null,
  account?: DevAccount | null,
): DevStoreApp[] {
  /*
   * An ARRAY means the server answered, even when it is empty — a project with
   * no `<app>_entitlements` table anywhere genuinely has no apps. Anything else
   * (no catalog yet, a failed read, a payload whose shape this client does not
   * recognise) means we were not told, and must not be reported as an answer.
   */
  const listed: DevCatalogApp[] | null = Array.isArray(catalog?.apps) ? catalog.apps : null
  const server = new Map<string, DevCatalogApp>((listed ?? []).map((a) => [a.id, a]))
  const shop = new Map(STORE_APPS.map((a) => [a.id, a]))
  // Same distinction one level down: a missing `store` object is a payload this
  // client cannot read, not an account that owns nothing.
  const reported: Record<string, DevStoreEntry | undefined> | null =
    account == null ? null
    : account.store != null && typeof account.store === 'object' ? account.store
    : null
  const held = reported ?? {}
  /*
   * Blocks, indexed the way the panels ask for them. A revocation is the same
   * kind of thing as a holding — a fact about this account and one product —
   * so it is folded in here rather than read separately by every panel that
   * needs it, which is what keeps the roster, the panel and the tile from
   * disagreeing about who may have what.
   */
  const blocks = Array.isArray(account?.revocations) ? account.revocations : []
  const blockOf = new Map(blocks.map((r) => [`${r.app}:${r.pack}`, r]))

  const ids = [
    ...STORE_APPS.map((a) => a.id),
    ...[...server.keys()].filter((id) => !shop.has(id)).sort(),
    // An account can hold packs in an app neither list mentions — a table
    // dropped, or a grant made before the app was registered. It still gets a
    // panel, because the switch that takes those packs back has to live
    // somewhere. A REVOKED app is the same argument one step further: a block
    // with no panel is a block nobody can lift.
    ...[...new Set([...Object.keys(held), ...blocks.map((r) => r.app)])]
      .filter((id) => !shop.has(id) && !server.has(id) && id !== MAK_APP_ID)
      .sort(),
  ]

  return ids.map((id) => {
    const srv = server.get(id)
    const shp = shop.get(id)
    const mine = held[id]
    const ownedPacks = mine?.packs ?? []
    const grants = mine?.grants ?? {}

    const knownHere = (p: string) =>
      shp?.packs.some((sp) => sp.id === p) === true || srv?.packs.includes(p) === true
    const packIds = [
      ...(shp?.packs ?? []).map((p) => p.id),
      ...(srv?.packs ?? []).filter((p) => !shp?.packs.some((sp) => sp.id === p)),
      ...ownedPacks.filter((p) => !knownHere(p)),
      // A pack that is blocked and nothing else — retired from the shop after
      // it was revoked, say — still gets a tile, or the only way back is SQL.
      ...blocks
        .filter((r) => r.app === id && r.pack !== '*' && !knownHere(r.pack))
        .map((r) => r.pack)
        .filter((p) => !ownedPacks.includes(p)),
    ]

    const packs: DevStorePack[] = packIds.map((packId) => {
      const sold = shp?.packs.find((p) => p.id === packId)
      return {
        id: packId,
        name: sold?.name ?? prettyId(packId),
        price: priceOf(sold),
        onServer: srv?.packs.includes(packId) ?? false,
        inShop: sold != null,
        owned: ownedPacks.includes(packId),
        // For a pack the site sells, its checkout plans are authoritative even
        // when a broken old grant claims otherwise. That is what keeps an
        // accidentally-ended Theme Pack from continuing to offer subscription
        // controls. A server-only pack has no catalogue answer, so an existing
        // subscription grant is the honest fallback and still gets a face.
        supportsSubscriptionStates:
          sold != null ? isSubscription(sold) : grants[packId]?.kind === 'subscription',
        grant: grants[packId] ?? null,
        revoked: blockOf.get(`${id}:${packId}`) ?? null,
      }
    })

    // The app-level block covers everything inside it, so a pack's own tile
    // reads as revoked under it whether or not the pack has a row. Two rows
    // for one pack cannot happen — the server refuses to write the second —
    // and this is what makes that guarantee visible one level down.
    const appBlock = blockOf.get(`${id}:*`) ?? null

    const serverState: ServerState =
      listed == null ? 'unknown' : srv != null ? 'listed' : 'absent'

    return {
      id,
      title: shp?.title ?? prettyId(id),
      copy: shp?.copy ?? null,
      entitlementsTable: srv?.entitlements_table ?? shp?.entitlementsTable ?? null,
      eventsTable: srv?.events_table ?? null,
      hasGrants: srv?.has_grants ?? false,
      serverState,
      onServer: serverState === 'listed',
      // An app the server never mentioned has no holdings to have reported.
      holdingsKnown: reported != null && mine != null,
      inShop: shp != null,
      hasList: (srv?.packs.length ?? 0) > 0,
      packs: appBlock ? packs.map((p) => ({ ...p, revoked: p.revoked ?? appBlock })) : packs,
      ownedCount: packs.filter((p) => p.owned).length,
      revoked: appBlock,
      revokedCount: appBlock ? 0 : packs.filter((p) => p.revoked).length,
    }
  })
}

/**
 * Blocks that landed on no panel at all.
 *
 * `storeApps` gives every revoked app a panel, so this is normally empty — and
 * it is drawn anyway, because the day it is not is the day a block exists that
 * nothing on this page can lift. Same argument as the badge panel's list of
 * catalogue rows it could not read: a list that quietly drops what it cannot
 * place is a list you cannot trust about anything else on it.
 */
export function orphanRevocations(
  a: DevAccount | null | undefined,
  stores: DevStoreApp[],
): DevRevocation[] {
  const rows = Array.isArray(a?.revocations) ? a.revocations : []
  // Makullveny draws its own; see MAK_APP_ID.
  const drawn = new Set([MAK_APP_ID, ...stores.map((s) => s.id)])
  return rows.filter((r) => !drawn.has(r.app))
}

/** Every block on an account, whatever app it names. */
export function revocationsOf(a: DevAccount | null | undefined): DevRevocation[] {
  return Array.isArray(a?.revocations) ? a.revocations : []
}

/**
 * Everything one account owns that is worth counting on a roster row.
 *
 * Every app's packs, plus Makullveny's themes and its Candle bundle. Derived
 * from the account's own `store` object rather than from a list of apps, so a
 * product added tomorrow is in the number without this line being edited.
 */
export function ownedCount(a: DevAccount): number {
  const packs = Object.values(a.store ?? {}).reduce((n, s) => n + (s?.packs.length ?? 0), 0)
  return packs + a.mak_themes.length + (a.mak_candle_purchased_at ? 1 : 0)
}

/**
 * What to call an app, anywhere on this page: the shop's title where the shop
 * knows it, the id made readable where it does not. An app is never shown as a
 * bare key.
 *
 * One function because there were three copies of the same line — the Overview
 * tiles, the Feedback tab's rows, and the search hint that counts what those
 * rows will match. The third is what made it a bug rather than a tidiness note:
 * the hint builds its haystack from a title, so a copy left behind would have
 * had the counter and the list disagreeing about the same report.
 *
 * Returns the lookup rather than one title, so a caller naming a whole list
 * pays for `stores` once instead of scanning it per row.
 */
export function appTitles(stores: DevStoreApp[]): (id: string) => string {
  const byId = new Map(stores.map((s) => [s.id, s.title]))
  return (id) => byId.get(id) ?? prettyId(id)
}

/** Every app id and pack id an account holds, for the page search's haystack. */
export function ownedTerms(a: DevAccount): string[] {
  return Object.entries(a.store ?? {}).flatMap(([app, s]) => [app, ...(s?.packs ?? [])])
}

/** `23 Sep`. A tile has room for a date, not for a timestamp. */
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

function on(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : shortDate.format(d)
}

/**
 * What a `grants` entry means, in the few words that fit beside a tile's name.
 *
 * Null when there is nothing worth saying. A pack held outright needs no note,
 * and neither does one whose app records no grant — **a note printed on every
 * tile is a note nobody reads**, which is how the one saying `ends 23 Sep` gets
 * missed. So `perpetual` is deliberately silent.
 *
 * The date is the payload, not the word. "Owned" is what the tile already says
 * and it is not the whole truth about a rented pack; when it stops being true
 * is the fact a developer is actually looking for, and it fits.
 */
export function grantNote(grant: DevGrant | null): string | null {
  if (!grant) return null
  const kind = (grant.kind ?? '').toLowerCase()
  if (kind === 'perpetual' || kind === '') return null
  const ends = on(grant.currentPeriodEnd)
  // Past tense first, and read through the same `standingOfGrant` the customer's
  // own card reads through. A grant that is over is also `cancelAtPeriodEnd`,
  // so the branch below would have printed `ends 25 Aug` about something that
  // had already ended — the console and the Store describing one row in two
  // tenses, which is exactly the drift `standingOfGrant` is shared to prevent.
  if (standingOfGrant(grant).kind === 'lapsed') return ends ? `ended ${ends}` : 'ended'
  if (grant.cancelAtPeriodEnd) return ends ? `ends ${ends}` : 'ending'
  if (grant.status && grant.status !== 'active') return grant.status
  return ends ? `renews ${ends}` : kind
}
