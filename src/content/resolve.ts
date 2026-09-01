import { APPS, MARANATHA, TOOLS, type AppCard, type Chip, type IconShape, type Shot, type ToolCard } from '../data/content'
import type { SiteContentDoc } from './types'

/**
 * The built-in copy, plus whatever the overlay changed, as one answer.
 *
 * Every surface that lists our products reads its list from here rather than
 * from `src/data/content.ts` directly. That is rule 17 of `AGENTS.md` one turn
 * further on: the list is still derived and never typed, and now it is derived
 * from the two sources together, so there is no place where a hidden card is
 * hidden on one surface and printed on another.
 *
 * **Nothing here reads `src/data/appPages.ts`.** That file is a large lazy
 * chunk and only a visitor who opens a product page pays for it — `route.ts`
 * says so at length. Page resolution lives in `resolvePage.ts`, which is
 * imported by `AppPage.tsx` alone and so travels in that same chunk.
 */

/** The game panel's card, which is the one card with a shape of its own. */
export type SiteGame = {
  page: string
  /** The game's NAME, for a button or a probe — `heading` is its headline. */
  title: string
  icon: string
  iconShape: IconShape
  heading: string
  copy: string
  note: string
  tag: string
  /** The words on the button, or the caption where there is no link. */
  status: string
  count: string
  chips: Chip[]
  shot: Shot | undefined
  /** Where the button goes. `''` leaves the words as a plain caption. */
  href: string
}

/** Which grid a product sits in. The three lists are ordered separately. */
export type ItemKind = 'app' | 'tool' | 'game'

/**
 * Put a list in the overlay's order.
 *
 * A slug the overlay does not name keeps its built-in position AFTER the ones
 * it does, so a product added to `content.ts` next month appears on the site
 * without anybody re-publishing the document — it simply lands at the end,
 * which is where a new card would have gone anyway.
 */
function ordered<T>(items: readonly T[], order: readonly string[], keyOf: (t: T) => string): T[] {
  if (!order.length) return [...items]
  const rank = new Map(order.map((slug, i) => [slug, i]))
  return items
    .map((item, i) => ({ item, i, r: rank.get(keyOf(item)) }))
    .sort((a, b) => {
      if (a.r !== undefined && b.r !== undefined) return a.r - b.r
      if (a.r !== undefined) return -1
      if (b.r !== undefined) return 1
      return a.i - b.i
    })
    .map((x) => x.item)
}

/** Every field the overlay states, over the built-in card. */
function mergeCard<T extends object>(base: T, over: object | undefined): T {
  if (!over) return base
  const out = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(over)) {
    // `null` is a removal — a card asked to have no cover, or no download
    // button — and the card types say that with an absent field.
    if (value === null) delete out[key]
    else out[key] = value
  }
  return out as T
}

/** Is this product off the site's grids? */
export const isHidden = (doc: SiteContentDoc, slug: string): boolean =>
  doc.items[slug]?.hidden === true

/** Has anything at all been said about this product? */
export const isEdited = (doc: SiteContentDoc, slug: string): boolean => {
  const item = doc.items[slug]
  if (!item) return false
  return item.hidden === true || item.card !== undefined || item.page !== undefined
}

/* ── the three lists ───────────────────────────────────────────────────── */

/**
 * `KeyArtSpec.icon` is documented in `content.ts` as "the app's own icon, the
 * same filename its card already names". Enforced here rather than hoped for:
 * the console lets somebody change a card's icon, and a cover still drawing the
 * old one would be one app wearing two different marks on one card.
 */
function coverWearsTheCardsIcon(card: AppCard): AppCard {
  if (!card.art || (card.art.icon === card.icon && card.art.iconShape === card.iconShape)) {
    return card
  }
  return { ...card, art: { ...card.art, icon: card.icon, iconShape: card.iconShape } }
}

/** Every app card, in site order, hidden ones included. For the console. */
export function resolvedApps(doc: SiteContentDoc): AppCard[] {
  return ordered(APPS, doc.order.apps, (a) => a.page).map((app) =>
    coverWearsTheCardsIcon(mergeCard(app, doc.items[app.page]?.card)),
  )
}

/** Every tool card, in site order, hidden ones included. For the console. */
export function resolvedTools(doc: SiteContentDoc): ToolCard[] {
  return ordered(TOOLS, doc.order.tools, (t) => t.page).map((tool) =>
    mergeCard(tool, doc.items[tool.page]?.card),
  )
}

/**
 * The game panel, hidden or not. For the console.
 *
 * Built field by field rather than spread, because the panel's built-in shape
 * has no `href` — the game has never had a link to open — and this is the one
 * card whose access button is being given one for the first time.
 */
export function resolvedGame(doc: SiteContentDoc): SiteGame {
  const over = doc.items[MARANATHA.page]?.card
  const base: SiteGame = {
    page: MARANATHA.page,
    title: MARANATHA.title,
    icon: MARANATHA.icon,
    iconShape: MARANATHA.iconShape,
    heading: MARANATHA.heading,
    copy: MARANATHA.copy,
    note: MARANATHA.note,
    tag: MARANATHA.tag,
    status: MARANATHA.status,
    count: MARANATHA.count,
    chips: MARANATHA.chips,
    shot: MARANATHA.shot,
    href: '',
  }
  if (!over) return base
  const merged = { ...base }
  if (over.icon !== undefined) merged.icon = over.icon
  if (over.iconShape !== undefined) merged.iconShape = over.iconShape
  if (over.heading !== undefined) merged.heading = over.heading
  if (over.copy !== undefined) merged.copy = over.copy
  if (over.note !== undefined) merged.note = over.note
  if (over.tag !== undefined) merged.tag = over.tag
  if (over.status !== undefined) merged.status = over.status
  if (over.count !== undefined) merged.count = over.count
  if (over.chips !== undefined) merged.chips = over.chips
  if (over.shot !== undefined) merged.shot = over.shot ?? undefined
  if (over.href !== undefined) merged.href = over.href
  return merged
}

/** What the Apps grid draws. */
export const visibleApps = (doc: SiteContentDoc): AppCard[] =>
  resolvedApps(doc).filter((app) => !isHidden(doc, app.page))

/** What the Tools grid draws. */
export const visibleTools = (doc: SiteContentDoc): ToolCard[] =>
  resolvedTools(doc).filter((tool) => !isHidden(doc, tool.page))

/** What the Building section draws, or null when the game is hidden. */
export const visibleGame = (doc: SiteContentDoc): SiteGame | null =>
  isHidden(doc, MARANATHA.page) ? null : resolvedGame(doc)

/* ── what a product's own page borrows from its card ───────────────────── */

/**
 * The screenshot, the icon and the chips a page shows, taken from the card it
 * was opened from — the same three that used to live in `data/appPages.ts`,
 * moved here because they now have to read the live cards rather than the
 * built-in ones. Their reason for existing is unchanged: one alt text, one
 * crop, one icon file, one chip row, so a page and its card can never end up
 * describing the same product differently.
 */
export function shotFor(doc: SiteContentDoc, slug: string): Shot | undefined {
  if (slug === MARANATHA.page) return resolvedGame(doc).shot
  return resolvedApps(doc).find((app) => app.page === slug)?.shot
}

export function iconFor(
  doc: SiteContentDoc,
  slug: string,
): { icon: string; shape: IconShape } | undefined {
  if (slug === MARANATHA.page) {
    const game = resolvedGame(doc)
    return { icon: game.icon, shape: game.iconShape }
  }
  const app = resolvedApps(doc).find((card) => card.page === slug)
  if (app) return { icon: app.icon, shape: app.iconShape }
  const tool = resolvedTools(doc).find((card) => card.page === slug)
  return tool ? { icon: tool.icon, shape: tool.iconShape } : undefined
}

export function chipsFor(doc: SiteContentDoc, slug: string): Chip[] {
  if (slug === MARANATHA.page) return [...resolvedGame(doc).chips]
  const app = resolvedApps(doc).find((card) => card.page === slug)
  if (app) return [...app.chips]
  const tool = resolvedTools(doc).find((card) => card.page === slug)
  return tool ? [...tool.chips] : []
}
