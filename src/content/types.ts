import type { Chip, IconShape, KeyArtScene, KeyArtSpec, Shot } from '../data/content'
import type { PageBlock, PageLink, PageSection } from '../data/pageBlocks'

/**
 * The shape of the site-content overlay, and the reader that refuses to trust
 * it.
 *
 * ## What the overlay is
 *
 * `src/data/` is still where every product's words are WRITTEN. This is a thin
 * document on top of it, edited from the Developer console's Content tab and
 * stored as one jsonb row in tdg-core, holding only what somebody has changed
 * since: the order of the cards, whether each is shown, and any field of a
 * card or of that product's own page that has been overwritten. A field the
 * document does not mention comes from the built-in copy, which means a
 * cleared override is not an empty card — it is the card the repo ships.
 *
 * ## Why every field is checked on the way in
 *
 * This document is fetched at runtime, by every visitor, from a table the site
 * does not own the schema of. Three things can arrive that the page cannot
 * use: a document written by a NEWER console than the bundle reading it (a
 * block kind that did not exist yet), a document from an OLDER one (a field
 * since renamed), and a document somebody hand-edited in the SQL editor. In
 * all three the only acceptable failure is the built-in copy — never a blank
 * card, never a thrown render, never `undefined` printed into a heading.
 *
 * So nothing here is cast. `parseDoc` walks the whole document, keeps what it
 * recognises in the shape it recognises, and drops the rest for rendering. A
 * chip with no label is not a chip. A section with no id cannot be opened, so
 * it is not a section. What it dropped is COUNTED rather than forgotten:
 * `unreadableCount` below says how many values of the live document this
 * build could not read, and the Content tab refuses to publish over them
 * without an explicit tick — because a publish sends the parsed document
 * back, and for a while "the console shows what survived" was written here
 * while nothing did.
 */

/** Everything the overlay can say about one product. */
export type ItemOverride = {
  /**
   * Off the site's grids. The product's own page is untouched and stays at its
   * direct link — see `README.md` for why hiding a card is not unpublishing a
   * page, and what the console says about it.
   */
  hidden?: boolean
  card?: CardOverride
  page?: PageOverride
}

/**
 * A card's own fields, all optional, each REPLACING the built-in value rather
 * than merging into it.
 *
 * Whole-value replacement is the only rule that survives arrays. A `chips`
 * that merged would need a per-entry identity the source data has never had,
 * and the editor edits the whole list anyway: what you see in the box is what
 * is stored. `null` is different from absent on the two fields that can be
 * taken away — a card can have its download button or its cover REMOVED, and
 * absent would mean "leave the built-in one alone".
 */
export type CardOverride = {
  index?: string
  title?: string
  copy?: string
  /** The caption under an app card that has no access button. */
  status?: string
  /** A filename in `public/assets/`, extension included. */
  icon?: string
  iconShape?: IconShape
  chips?: Chip[]
  /** An app card's access button. `null` puts the plain status caption back. */
  download?: { href: string; label: string } | null
  /** A tool card's access button: its words, always shown. */
  cta?: string
  /** Where a tool card's button goes. `''` leaves the words with no link. */
  href?: string
  /** The game panel's own words, none of which any other card has. */
  heading?: string
  note?: string
  tag?: string
  count?: string
  /** The drawn cover. `null` takes it away and lets the screenshot show. */
  art?: KeyArtSpec | null
  /** The real screenshot. `null` takes it away. */
  shot?: Shot | null
}

/** A product page's own fields, replaced the same way. */
export type PageOverride = {
  index?: string
  group?: 'Apps' | 'Tools' | 'Game'
  backHash?: string
  backLabel?: string
  title?: string
  lede?: string
  intro?: string
  facts?: { label: string; value: string }[]
  links?: PageLink[]
  sections?: PageSection[]
}

/**
 * The whole document.
 *
 * `order` is a list of slugs per grid rather than a number on each item,
 * because reordering writes one array and reading it needs no sort: a slug the
 * list does not name keeps its built-in place after the ones it does, so an
 * app added to `content.ts` next month appears without anybody re-publishing.
 */
export type SiteContentDoc = {
  v: 1
  order: { apps: string[]; tools: string[] }
  items: Record<string, ItemOverride>
}

/** What the site draws before the overlay has landed, and if it never does. */
export const EMPTY_DOC: SiteContentDoc = { v: 1, order: { apps: [], tools: [] }, items: {} }

/* ── the reader ────────────────────────────────────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A string, trimmed of nothing: leading spaces in copy are the author's. */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)

/** Map an array, dropping every entry the mapper could not read. */
function list<T>(v: unknown, read: (row: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: T[] = []
  for (const row of v) {
    const one = read(row)
    if (one !== undefined) out.push(one)
  }
  return out
}

const strings = (v: unknown): string[] | undefined => list(v, str)

/** Assign only when the reader got something. `undefined` means "not stated". */
function put<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined) {
  if (value !== undefined) target[key] = value
}

const SHAPES: IconShape[] = ['tile', 'glyph']
const SCENES: KeyArtScene[] = ['pines', 'arch', 'ridge', 'bridge', 'dusk']
const GROUPS: ('Apps' | 'Tools' | 'Game')[] = ['Apps', 'Tools', 'Game']

const oneOf = <T extends string>(all: T[], v: unknown): T | undefined =>
  typeof v === 'string' && (all as string[]).includes(v) ? (v as T) : undefined

const chip = (v: unknown): Chip | undefined => {
  if (!isObj(v)) return undefined
  const label = str(v.label)
  // A chip with no words is a 9px empty box on a card, which reads as a
  // rendering fault rather than as an empty list.
  if (!label) return undefined
  return v.hot === true ? { label, hot: true } : { label }
}

const pair = (v: unknown, a: string, b: string): { [k: string]: string } | undefined => {
  if (!isObj(v)) return undefined
  const first = str(v[a])
  const second = str(v[b])
  if (first === undefined || second === undefined) return undefined
  return { [a]: first, [b]: second }
}

const fact = (v: unknown): { label: string; value: string } | undefined =>
  pair(v, 'label', 'value') as { label: string; value: string } | undefined

const link = (v: unknown): PageLink | undefined => {
  if (!isObj(v)) return undefined
  const label = str(v.label)
  const href = str(v.href)
  if (!label || !href) return undefined
  return v.external === true ? { label, href, external: true } : { label, href }
}

function shot(v: unknown): Shot | undefined {
  if (!isObj(v)) return undefined
  const slug = str(v.slug)
  if (!slug) return undefined
  const widths = Array.isArray(v.widths)
    ? v.widths.filter((w): w is number => typeof w === 'number' && w > 0)
    : []
  // Two widths, always: `srcSet` is built from exactly two candidates and a
  // one-entry array would render a `1x` set with a second `undefined` in it.
  if (widths.length !== 2) return undefined
  const out: Shot = { slug, widths: [widths[0], widths[1]], alt: str(v.alt) ?? '' }
  put(out, 'position', str(v.position))
  return out
}

function art(v: unknown): KeyArtSpec | undefined {
  if (!isObj(v)) return undefined
  const icon = str(v.icon)
  const title = str(v.title)
  const line = str(v.line)
  const iconShape = oneOf(SHAPES, v.iconShape)
  const scene = oneOf(SCENES, v.scene)
  const facts = strings(v.facts)
  if (!icon || !title || !line || !iconShape || !scene || !facts) return undefined
  return { icon, iconShape, title, line, facts, scene }
}

/**
 * One block of a page section.
 *
 * The `kind` decides the shape and an unrecognised one is dropped whole,
 * because there is nothing honest to draw for a block this bundle has never
 * heard of. `Folded.tsx` would render nothing for it anyway; dropping it here
 * means the console can say how many blocks actually survived.
 */
function block(v: unknown): PageBlock | undefined {
  if (!isObj(v)) return undefined
  switch (v.kind) {
    case 'text':
    case 'note': {
      const text = str(v.text)
      return text === undefined ? undefined : { kind: v.kind, text }
    }
    case 'steps': {
      const steps = list(v.steps, (row) => pair(row, 'title', 'text')) as
        | { title: string; text: string }[]
        | undefined
      return steps ? { kind: 'steps', steps } : undefined
    }
    case 'features': {
      const items = list(v.items, (row) => {
        const base = pair(row, 'name', 'text') as { name: string; text: string } | undefined
        if (!base) return undefined
        return isObj(row) && row.soon === true ? { ...base, soon: true } : base
      })
      return items ? { kind: 'features', items } : undefined
    }
    case 'facts': {
      const items = list(v.items, fact)
      return items ? { kind: 'facts', items } : undefined
    }
    case 'qa': {
      const items = list(v.items, (row) => pair(row, 'q', 'a')) as
        | { q: string; a: string }[]
        | undefined
      return items ? { kind: 'qa', items } : undefined
    }
    case 'signpost': {
      const items = list(v.items, (row) => {
        if (!isObj(row)) return undefined
        const name = str(row.name)
        const text = str(row.text)
        const href = str(row.href)
        return name && text && href ? { name, text, href } : undefined
      })
      return items ? { kind: 'signpost', items } : undefined
    }
    default:
      return undefined
  }
}

function section(v: unknown): PageSection | undefined {
  if (!isObj(v)) return undefined
  const id = str(v.id)
  const title = str(v.title)
  // No id and the open/closed register has nothing to key on, so the fold
  // could not be opened at all. That is not a section, it is a heading.
  if (!id || !title) return undefined
  const out: PageSection = {
    id,
    title,
    what: str(v.what) ?? '',
    blocks: list(v.blocks, block) ?? [],
  }
  put(out, 'tag', str(v.tag))
  return out
}

function cardOverride(v: unknown): CardOverride | undefined {
  if (!isObj(v)) return undefined
  const out: CardOverride = {}
  put(out, 'index', str(v.index))
  put(out, 'title', str(v.title))
  put(out, 'copy', str(v.copy))
  put(out, 'status', str(v.status))
  put(out, 'icon', str(v.icon))
  put(out, 'iconShape', oneOf(SHAPES, v.iconShape))
  put(out, 'chips', list(v.chips, chip))
  put(out, 'cta', str(v.cta))
  put(out, 'href', str(v.href))
  put(out, 'heading', str(v.heading))
  put(out, 'note', str(v.note))
  put(out, 'tag', str(v.tag))
  put(out, 'count', str(v.count))

  // The three that can be REMOVED as well as changed. `null` is the removal
  // and it has to survive the round trip; anything unreadable is treated as
  // "not stated", so a malformed cover leaves the built-in one alone rather
  // than blanking the card.
  if (v.download === null) out.download = null
  else {
    const d = pair(v.download, 'href', 'label') as { href: string; label: string } | undefined
    if (d) out.download = d
  }
  if (v.art === null) out.art = null
  else put(out, 'art', art(v.art))
  if (v.shot === null) out.shot = null
  else put(out, 'shot', shot(v.shot))

  return Object.keys(out).length ? out : undefined
}

function pageOverride(v: unknown): PageOverride | undefined {
  if (!isObj(v)) return undefined
  const out: PageOverride = {}
  put(out, 'index', str(v.index))
  put(out, 'group', oneOf(GROUPS, v.group))
  put(out, 'backHash', str(v.backHash))
  put(out, 'backLabel', str(v.backLabel))
  put(out, 'title', str(v.title))
  put(out, 'lede', str(v.lede))
  put(out, 'intro', str(v.intro))
  put(out, 'facts', list(v.facts, fact))
  put(out, 'links', list(v.links, link))
  put(out, 'sections', list(v.sections, section))
  return Object.keys(out).length ? out : undefined
}

/**
 * Read whatever the server sent, and answer something this bundle can draw.
 *
 * Never throws. A document it cannot make sense of at all comes back as
 * `EMPTY_DOC`, which is the built-in site — the same thing a visitor sees
 * before the fetch lands and if it never does.
 */
export function parseDoc(raw: unknown): SiteContentDoc {
  if (!isObj(raw)) return EMPTY_DOC

  const items: Record<string, ItemOverride> = {}
  if (isObj(raw.items)) {
    for (const [slug, value] of Object.entries(raw.items)) {
      if (!isObj(value)) continue
      const one: ItemOverride = {}
      put(one, 'hidden', bool(value.hidden))
      put(one, 'card', cardOverride(value.card))
      put(one, 'page', pageOverride(value.page))
      if (Object.keys(one).length) items[slug] = one
    }
  }

  const order = isObj(raw.order) ? raw.order : {}
  return {
    v: 1,
    order: { apps: strings(order.apps) ?? [], tools: strings(order.tools) ?? [] },
    items,
  }
}

/**
 * How many values in the stored document this bundle could NOT read.
 *
 * `parseDoc` keeps what it recognises and drops the rest — a block kind from
 * a newer build, a field renamed since, a hand-edited key — and a publish
 * sends the PARSED document back, so anything dropped is dropped from
 * tdg-core the moment an older console publishes any edit at all. That is
 * the stale-tab hazard the file header names, and for a while the header
 * claimed the console showed what survived while nothing counted it. This
 * counts it: the leaves (strings, numbers, booleans) in `raw` minus the
 * leaves that came through, corrected for the `v` the parser always writes.
 * Zero means a publish loses nothing; anything else is what the Content tab
 * warns about before it lets a publish go.
 */
export function unreadableCount(raw: unknown, parsed: SiteContentDoc): number {
  const leaves = (v: unknown): number => {
    if (Array.isArray(v)) return v.reduce<number>((n, x) => n + leaves(x), 0)
    if (isObj(v)) return Object.values(v).reduce<number>((n, x) => n + leaves(x), 0)
    return v === null || v === undefined ? 0 : 1
  }
  const rawHasV = isObj(raw) && 'v' in raw
  return Math.max(0, leaves(raw) - leaves(parsed) + (rawHasV ? 0 : 1))
}

/** True when this document says nothing at all, so the site is the repo's. */
export const isEmptyDoc = (doc: SiteContentDoc): boolean =>
  Object.keys(doc.items).length === 0 && !doc.order.apps.length && !doc.order.tools.length
