import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APPS, MARANATHA, TOOLS, type Chip, type IconShape, type KeyArtScene } from '../data/content'
import { pageForSlug } from '../data/appPages'
import type { PageBlock, PageLink, PageSection } from '../data/pageBlocks'
import { getSiteContent, publishSiteContent, type SiteContentMeta } from '../content/api'
import {
  isEdited,
  isHidden,
  resolvedApps,
  resolvedGame,
  resolvedTools,
  type ItemKind,
} from '../content/resolve'
import {
  EMPTY_DOC,
  unreadableCount,
  type CardOverride,
  type PageOverride,
  type SiteContentDoc,
} from '../content/types'
import { asset } from '../lib/asset'
import { KeyArt } from '../components/KeyArt'
import { appHash } from '../lib/route'
import {
  Button,
  Check,
  Fact,
  Field,
  Panel,
  Switch,
  Tag,
  TextInput,
  TypeToConfirm,
} from './controls'
import {
  AssetPreview,
  ListOverride,
  Overridden,
  PanelReset,
  RowField,
  RowList,
  SelectOverride,
  TextOverride,
  sameJson,
} from './contentEdit'
import { fmtRelative } from './format'

/**
 * The Content tab: what this site says about our own products, editable here.
 *
 * ## What it actually changes
 *
 * `src/data/content.ts` and `src/data/appPages.ts` are still where every
 * product's words are written, and they are still what a visitor sees when
 * this tab has said nothing. What this writes is an OVERLAY on top of them —
 * one jsonb row in tdg-core — holding only the fields somebody changed: the
 * order of the cards, whether each is shown, its words, its icon, its cover,
 * its access button, and every section and block of its own page. Reading and
 * merging is `src/content/`; the boundary is `tdg_admin_uid()` in Postgres.
 *
 * ## Why this tab stages, when the rest of the console does not
 *
 * Every other switch on this page writes the moment it is pressed, because
 * every other switch changes one person's account and that person can see the
 * result. This changes the public home page, for everybody, and it is edited by
 * typing — so a live write per keystroke would publish "Downlo" to the internet
 * on the way to "Download". Edits are held here until **Publish Changes**, the
 * count of what is waiting is on screen the whole time and on the tab itself,
 * and leaving the browser with unsaved edits asks first.
 *
 * ## Where a hidden card goes
 *
 * Off the grids — Apps, Tools, or the Games panel — and that is all. The
 * product's own page stays exactly where it was, at its own link, because a
 * shared link that starts answering "nothing here" reads as a broken site
 * rather than as a decision. The switch says so in as many words, which is the
 * only honest way to ship a control whose scope somebody has to know.
 */

/* ── the item roster ───────────────────────────────────────────────────── */

type Item = {
  slug: string
  kind: ItemKind
  title: string
  icon: string
  iconShape: IconShape
  /** Its 1-based place in its own grid, and how many are in it. */
  n: number
  of: number
}

const GRID_OF: Record<ItemKind, { label: string; what: string; where: string }> = {
  app: {
    label: 'Apps',
    what: 'The cards in the Apps grid on the home page.',
    where: 'the Apps grid',
  },
  tool: {
    label: 'Tools',
    what: 'The cards on the Tools & extensions shelf.',
    where: 'the Tools shelf',
  },
  game: {
    label: 'Game',
    what: 'The feature panel in Games.',
    where: 'the Games panel',
  },
}

function roster(doc: SiteContentDoc): Item[] {
  const apps = resolvedApps(doc)
  const tools = resolvedTools(doc)
  const game = resolvedGame(doc)
  return [
    ...apps.map((a, i) => ({
      slug: a.page,
      kind: 'app' as const,
      title: a.title,
      icon: a.icon,
      iconShape: a.iconShape,
      n: i + 1,
      of: apps.length,
    })),
    ...tools.map((t, i) => ({
      slug: t.page,
      kind: 'tool' as const,
      title: t.title,
      icon: t.icon,
      iconShape: t.iconShape,
      n: i + 1,
      of: tools.length,
    })),
    {
      slug: game.page,
      kind: 'game' as const,
      title: game.heading,
      icon: game.icon,
      iconShape: game.iconShape,
      n: 1,
      of: 1,
    },
  ]
}

/* ── editing the document ──────────────────────────────────────────────── */

const itemOf = (doc: SiteContentDoc, slug: string) => doc.items[slug] ?? {}

/**
 * Put an item back, and drop it entirely when it has nothing left to say.
 *
 * An override that survives as `{}` would be a product the console reports as
 * edited and the site treats as untouched — the two answers disagreeing about
 * one card, which is the state this whole tab exists to make impossible.
 */
function withItem(
  doc: SiteContentDoc,
  slug: string,
  patch: { hidden?: boolean; card?: CardOverride; page?: PageOverride },
): SiteContentDoc {
  const next = { ...itemOf(doc, slug), ...patch }
  if (next.hidden !== true) delete next.hidden
  if (next.card && !Object.keys(next.card).length) delete next.card
  if (next.page && !Object.keys(next.page).length) delete next.page

  const items = { ...doc.items }
  if (!Object.keys(next).length) delete items[slug]
  else items[slug] = next
  return { ...doc, items }
}

function setCard<K extends keyof CardOverride>(
  doc: SiteContentDoc,
  slug: string,
  key: K,
  value: CardOverride[K] | undefined,
): SiteContentDoc {
  const card = { ...(itemOf(doc, slug).card ?? {}) }
  if (value === undefined) delete card[key]
  else card[key] = value
  return withItem(doc, slug, { card })
}

/**
 * Several card keys in ONE write.
 *
 * Two `setCard` calls in one handler both read the SAME `draft` out of the
 * render's closure, so the second builds its card object from a document that
 * does not have the first's change in it and silently drops it. That is exactly
 * what the cover's mode buttons did: `set('art', null)` followed by
 * `set('shot', …)` wrote the shot and lost the removal, so pressing Screenshot
 * on a card with key art left the key art in place — and key art wins on a
 * card, so the button appeared to do nothing at all.
 *
 * `undefined` removes a key, `null` is a stored null. Same rule as everywhere
 * else in this file.
 */
function setCardKeys(
  doc: SiteContentDoc,
  slug: string,
  patch: Partial<CardOverride>,
): SiteContentDoc {
  const card = { ...(itemOf(doc, slug).card ?? {}) } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete card[key]
    else card[key] = value
  }
  return withItem(doc, slug, { card: card as CardOverride })
}

/** The same, for the page half. Used by the per-panel resets. */
function clearPageKeys(
  doc: SiteContentDoc,
  slug: string,
  keys: readonly string[],
): SiteContentDoc {
  const page = { ...(itemOf(doc, slug).page ?? {}) } as Record<string, unknown>
  for (const key of keys) delete page[key]
  return withItem(doc, slug, { page: page as PageOverride })
}

/** How many of a panel's fields are overridden. One answer, used by that
 *  panel's shut-state tag AND by the count on its Reset, so the two cannot
 *  disagree about whether anything has been changed. */
function countKeys(over: object, keys: readonly string[]): number {
  return keys.filter((k) => k in over).length
}

function setPage<K extends keyof PageOverride>(
  doc: SiteContentDoc,
  slug: string,
  key: K,
  value: PageOverride[K] | undefined,
): SiteContentDoc {
  const page = { ...(itemOf(doc, slug).page ?? {}) }
  if (value === undefined) delete page[key]
  else page[key] = value
  return withItem(doc, slug, { page })
}

/** Reorder one grid, writing the WHOLE list so the stored order is explicit. */
function reorder(doc: SiteContentDoc, kind: 'app' | 'tool', slug: string, by: number) {
  const key = kind === 'app' ? 'apps' : 'tools'
  const list = (kind === 'app' ? resolvedApps(doc) : resolvedTools(doc)).map((c) => c.page)
  const i = list.indexOf(slug)
  if (i < 0) return doc
  const to = Math.max(0, Math.min(list.length - 1, i + by))
  if (to === i) return doc
  list.splice(to, 0, ...list.splice(i, 1))
  return { ...doc, order: { ...doc.order, [key]: list } }
}

/* ── the tab's whole state, owned by DevConsole ────────────────────────── */

export type ContentDraft = ReturnType<typeof useSiteContentDraft>

/**
 * Held by `DevConsole` rather than by this tab, so a draft survives a trip to
 * the Accounts tab and back. A half-written page lost because somebody wanted
 * to look up an email is the same class of loss as a lost scroll position, and
 * this console already refuses to have that one.
 */
export function useSiteContentDraft(push: (tone: 'ok' | 'bad', text: string) => void) {
  const [published, setPublished] = useState<SiteContentMeta | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<SiteContentDoc>(EMPTY_DOC)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [conflict, setConflict] = useState(false)
  /**
   * How many values of the LIVE document this build cannot read, and the
   * explicit tick that lets a publish drop them anyway. A publish sends the
   * parsed document, so anything the parser did not recognise — a block kind
   * from a newer build, a field this bundle predates — is removed from
   * tdg-core by any edit at all, silently, unless it is said here first.
   */
  const unreadable = useMemo(
    () => (published ? unreadableCount(published.raw, published.doc) : 0),
    [published],
  )
  const [dropTick, setDropTick] = useState(false)

  /** The published document the draft was seeded from, as text to compare. */
  const baseline = useRef<string>(JSON.stringify(EMPTY_DOC))
  const draftRef = useRef(draft)
  draftRef.current = draft

  const reload = useCallback(async () => {
    setState((s) => (s === 'ready' ? s : 'loading'))
    try {
      const meta = await getSiteContent()
      const incoming = JSON.stringify(meta.doc)
      const mine = JSON.stringify(draftRef.current)
      setPublished(meta)
      if (mine === baseline.current) {
        // No unsaved edits, so simply take what is live now.
        baseline.current = incoming
        setDraft(meta.doc)
        setConflict(false)
      } else if (incoming !== baseline.current) {
        // Somebody else published while this draft was open. Never silently
        // resolved: both versions are somebody's work and only a person can
        // say which one the site should say.
        setConflict(true)
      }
      setState('ready')
      setError(null)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
      return false
    }
  }, [])

  const dirty = JSON.stringify(draft) !== baseline.current

  const publish = useCallback(async () => {
    setPublishing(true)
    try {
      const doc = draftRef.current
      await publishSiteContent(doc, note)
      baseline.current = JSON.stringify(doc)
      setNote('')
      setConflict(false)
      setDropTick(false)
      push('ok', 'Published. The site is showing it now.')
      await reload()
    } catch (e) {
      push('bad', e instanceof Error ? e.message : String(e))
    } finally {
      setPublishing(false)
    }
  }, [note, push, reload])

  const discard = useCallback(() => {
    setDraft(published?.doc ?? EMPTY_DOC)
    baseline.current = JSON.stringify(published?.doc ?? EMPTY_DOC)
    setConflict(false)
  }, [published])

  /*
   * The browser's own "leave site?" prompt, and the only thing on this console
   * that uses it. Everything else here has already been written to Postgres by
   * the time you can see it; this is the one page where closing the tab can
   * lose work, so it is the one page that asks. Removed the moment the draft
   * is clean, so a tidy page never nags.
   */
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  /*
   * What is waiting, in the two shapes it comes in: products with an override,
   * and the grid order. Counted separately because a bare "2 unsaved changes"
   * over one renamed button and one dragged card is a number nobody can act
   * on — the bar says which, and the tab badge carries the total.
   */
  const products = Object.keys(draft.items).length
  const orderChanged =
    JSON.stringify(draft.order) !== JSON.stringify(published?.doc.order ?? EMPTY_DOC.order)
  const edits = products + (orderChanged ? 1 : 0)

  return {
    published,
    state,
    error,
    draft,
    setDraft,
    selected,
    setSelected,
    note,
    setNote,
    dirty,
    edits,
    products,
    orderChanged,
    conflict,
    publishing,
    unreadable,
    dropTick,
    setDropTick,
    reload,
    publish,
    discard,
  }
}

/* ── the tab ───────────────────────────────────────────────────────────── */

export function ContentTab({ c }: { c: ContentDraft }) {
  const { draft, setDraft } = c
  const items = useMemo(() => roster(draft), [draft])
  const selected = items.find((i) => i.slug === c.selected) ?? null

  const groups: { kind: ItemKind; rows: Item[] }[] = [
    { kind: 'app', rows: items.filter((i) => i.kind === 'app') },
    { kind: 'tool', rows: items.filter((i) => i.kind === 'tool') },
    { kind: 'game', rows: items.filter((i) => i.kind === 'game') },
  ]

  return (
    <div className="dev__content" data-dev-anchor="content">
      <PublishBar c={c} />

      <div className="dev__split">
        <div className="dev__roster">
          <p className="dev__roster-count">
            {c.state === 'loading' && !c.published
              ? 'Reading what is published…'
              : c.state === 'error'
                ? "Couldn't read the published content."
                : `${items.length} products · drag-free reordering with ↑ ↓`}
          </p>

          {groups.map(({ kind, rows }) => (
            <div key={kind} className="dev__cgroup">
              <h3 className="dev__cgroup-title">
                {GRID_OF[kind].label}
                <span className="dev__cgroup-what">{GRID_OF[kind].what}</span>
              </h3>
              <ul className="dev__list">
                {rows.map((item) => (
                  <li key={item.slug} className="dev__crow" data-active={item.slug === c.selected || undefined}>
                    <button
                      type="button"
                      className="dev__crow-main"
                      aria-current={item.slug === c.selected ? 'true' : undefined}
                      onClick={() => c.setSelected(item.slug)}
                    >
                      <span className="dev__crow-n">{item.n}</span>
                      <img
                        className="dev__crow-icon"
                        data-shape={item.iconShape}
                        src={asset(`assets/${item.icon}`)}
                        alt=""
                        aria-hidden="true"
                      />
                      <span className="dev__crow-name">{item.title}</span>
                      <span className="dev__crow-tags">
                        {isHidden(draft, item.slug) && <Tag tone="bad">HIDDEN</Tag>}
                        {isEdited(draft, item.slug) && !isHidden(draft, item.slug) && (
                          <Tag tone="warn">EDITED</Tag>
                        )}
                      </span>
                    </button>
                    {item.kind !== 'game' && (
                      <span className="dev__crow-move">
                        <button
                          type="button"
                          className="dev__mini"
                          disabled={item.n === 1}
                          aria-label={`Move ${item.title} up`}
                          onClick={() => setDraft(reorder(draft, item.kind as 'app' | 'tool', item.slug, -1))}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="dev__mini"
                          disabled={item.n === item.of}
                          aria-label={`Move ${item.title} down`}
                          onClick={() => setDraft(reorder(draft, item.kind as 'app' | 'tool', item.slug, 1))}
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="dev__pane">
          {selected ? (
            <ItemEditor key={selected.slug} item={selected} c={c} />
          ) : (
            <div className="dev__placeholder">
              <h2 className="dev__placeholder-title">Pick a product</h2>
              <p className="dev__placeholder-copy">
                Everything this site says about one app, tool or game opens here: whether its card is
                shown at all, where it sits in the grid, its words, its icon, its cover, the button
                on it and where that button goes, and every section of its own page. Nothing is live
                until you press Publish Changes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── the publish bar ───────────────────────────────────────────────────── */

function PublishBar({ c }: { c: ContentDraft }) {
  const when = c.published?.updatedAt
  const who = c.published?.updatedByName

  return (
    <div className="dev__publish" data-dirty={c.dirty || undefined}>
      <div className="dev__publish-text">
        <p className="dev__publish-state">
          {c.state === 'error' ? (
            <>Couldn&apos;t read the published content. {c.error}</>
          ) : c.dirty ? (
            <>
              <strong>Unsaved</strong> —{' '}
              {c.products > 0 && (
                <>
                  {c.products} {c.products === 1 ? 'product' : 'products'} edited
                </>
              )}
              {c.products > 0 && c.orderChanged && ', and '}
              {c.orderChanged && 'the order changed'}. Nothing here is on the site until you press
              Publish Changes.
            </>
          ) : (
            <>Everything here is published. The site is showing exactly this.</>
          )}
        </p>
        <p className="dev__publish-when">
          {when
            ? `Last published ${fmtRelative(when)}${who ? ` by ${who}` : ''}.`
            : 'Never published. Every card is the copy in the repo.'}
        </p>
      </div>

      <div className="dev__publish-act">
        <Field label="Why, in one line" hint="Optional. It goes in the audit log beside your name.">
          <TextInput
            value={c.note}
            onChange={c.setNote}
            maxLength={200}
            placeholder="hid Music Everything until the demo lands"
          />
        </Field>
        {c.unreadable > 0 && (
          <div className="dev__warn dev__warn--wide" role="alert">
            <p>
              The live document holds {c.unreadable} {c.unreadable === 1 ? 'value' : 'values'} this
              build of the console cannot read — a block kind or a field from a newer deploy, or
              something edited by hand. A publish sends back only what this build understands, so
              publishing from here would remove {c.unreadable === 1 ? 'it' : 'them'} from the site.
              Reload on the current build first, or tick below to publish anyway. The server keeps
              earlier versions, so a mistake can be put back.
            </p>
            <Check
              checked={c.dropTick}
              onChange={c.setDropTick}
              label={`Publish anyway, removing the ${c.unreadable === 1 ? 'value' : `${c.unreadable} values`} this console cannot read`}
            />
          </div>
        )}
        <div className="dev__row dev__row--end">
          <Button onClick={c.discard} disabled={!c.dirty || c.publishing}>
            Discard Changes
          </Button>
          <Button
            variant="primary"
            onClick={() => void c.publish()}
            disabled={!c.dirty || (c.unreadable > 0 && !c.dropTick)}
            busy={c.publishing}
          >
            Publish Changes
          </Button>
        </div>
      </div>

      {c.conflict && (
        <p className="dev__warn dev__warn--wide">
          Somebody else published while this draft was open, so what is live is no longer what these
          edits started from. Publishing now replaces theirs with yours, whole. Discard Changes
          takes theirs instead. Nothing has been merged, because only a person can say which
          sentence the site should carry.
        </p>
      )}
    </div>
  )
}

/* ── one product ───────────────────────────────────────────────────────── */

function ItemEditor({ item, c }: { item: Item; c: ContentDraft }) {
  const { draft, setDraft } = c
  const slug = item.slug
  const over = itemOf(draft, slug)
  const card = over.card ?? {}
  const hidden = over.hidden === true

  const builtInApp = APPS.find((a) => a.page === slug)
  const builtInTool = TOOLS.find((t) => t.page === slug)
  const builtInGame = item.kind === 'game' ? MARANATHA : undefined
  const page = pageForSlug(slug)

  const set = <K extends keyof CardOverride>(key: K, value: CardOverride[K] | undefined) =>
    setDraft(setCard(draft, slug, key, value))

  /** Several card keys at once — see `setCardKeys` for the bug that needs it. */
  const setMany = (patch: Partial<CardOverride>) => setDraft(setCardKeys(draft, slug, patch))

  /** Put one panel's worth of card fields back the way the repo has them. */
  const clearCard = (keys: readonly string[]) =>
    setDraft(
      setCardKeys(
        draft,
        slug,
        Object.fromEntries(keys.map((k) => [k, undefined])) as Partial<CardOverride>,
      ),
    )

  const clearPage = (keys: readonly string[]) => setDraft(clearPageKeys(draft, slug, keys))

  /** How many cards this grid still shows if this one goes. */
  const siblingsLeft =
    item.kind === 'app'
      ? resolvedApps(draft).filter((a) => a.page !== slug && !isHidden(draft, a.page)).length
      : item.kind === 'tool'
        ? resolvedTools(draft).filter((t) => t.page !== slug && !isHidden(draft, t.page)).length
        : 0

  return (
    <div className="dev__detail">
      <header className="dev__detail-head">
        <div>
          <h2 className="dev__detail-name">{item.title}</h2>
          <p className="dev__detail-sub">
            <span className="dev__handle">{slug}</span>
            <span className="dev__detail-email">
              {GRID_OF[item.kind].label} · position {item.n} of {item.of}
            </span>
          </p>
        </div>
        <div className="dev__detail-tags">
          {hidden ? <Tag tone="bad">OFF THE GRID</Tag> : <Tag tone="ok">IN ITS GRID</Tag>}
          {isEdited(draft, slug) && <Tag tone="warn">EDITED</Tag>}
          <a className="dev__link" href={appHash(slug)} target="_blank" rel="noopener">
            Open its page ↗
          </a>
        </div>
      </header>

      {/* ── 1 · on the site ───────────────────────────────────────────── */}
      <Panel
        id="content-live"
        title="On The Site"
        what="Whether this card is shown at all, and where it sits in its grid."
        writes="tdg_site_content.doc → items.<slug>.hidden, order"
        right={hidden ? <Tag tone="bad">OFF THE GRID</Tag> : <Tag tone="ok">SHOWN</Tag>}
        terms={[slug, item.title, hidden ? 'hidden' : 'shown']}
      >
        {/* "Show In Its Grid", not "Show On The Site": the switch takes the
            card off the home page's grid and the console's roster, and
            nothing else — the app's own page still opens, and if the app
            sells packs its Store card and its Store page are still on sale
            (rule 17 deliberately keeps the Store off this list). A label
            that said "the site" was reported as "hidden but still on the
            site", which is exactly what it was. */}
        <Switch
          checked={!hidden}
          onChange={(next) => setDraft(withItem(draft, slug, { hidden: next ? undefined : true }))}
          label="Show In Its Grid"
          tone={hidden ? 'danger' : 'plain'}
          hint={
            hidden ? (
              <>
                Off {GRID_OF[item.kind].where}. Its own page is untouched and still opens at{' '}
                <code className="dev__code">{appHash(slug)}</code> — a link somebody has already
                shared should not start answering &ldquo;nothing here&rdquo; — and if it sells
                packs, it is still on the Store index and at its own Store page. Turn this on to
                put the card back.
              </>
            ) : (
              <>
                The card is in {GRID_OF[item.kind].where}. Turning this off takes the card away
                and leaves the page at its own link; the Store, if the app sells packs, is not
                touched by this switch.
              </>
            )
          }
        />

        {!hidden && siblingsLeft === 0 && item.kind !== 'game' && (
          <p className="dev__warn">
            This is the only card left in {GRID_OF[item.kind].where}. Hiding it leaves that section
            with its heading and an empty grid, which reads as a page that failed to load.
          </p>
        )}

        {item.kind !== 'game' && (
          <>
            <div className="dev__rule" />
            <Fact label="Position" value={`${item.n} of ${item.of} in ${GRID_OF[item.kind].where}`} />
            <div className="dev__row">
              <Button
                disabled={item.n === 1}
                onClick={() => setDraft(reorder(draft, item.kind as 'app' | 'tool', slug, -item.n + 1))}
              >
                Move To Front
              </Button>
              <Button
                disabled={item.n === 1}
                onClick={() => setDraft(reorder(draft, item.kind as 'app' | 'tool', slug, -1))}
              >
                Move Up
              </Button>
              <Button
                disabled={item.n === item.of}
                onClick={() => setDraft(reorder(draft, item.kind as 'app' | 'tool', slug, 1))}
              >
                Move Down
              </Button>
              <Button
                disabled={item.n === item.of}
                onClick={() =>
                  setDraft(reorder(draft, item.kind as 'app' | 'tool', slug, item.of - item.n))
                }
              >
                Move To Back
              </Button>
            </div>
            <p className="dev__hint">
              The order here is the order on the home page. A product added to the repo later lands
              at the end of this list on its own, so a new app appears without anybody republishing.
            </p>

            <div className="dev__row">
              <Button
                disabled={draft.order[item.kind === 'app' ? 'apps' : 'tools'].length === 0}
                onClick={() =>
                  setDraft({
                    ...draft,
                    order: { ...draft.order, [item.kind === 'app' ? 'apps' : 'tools']: [] },
                  })
                }
              >
                Restore The Built-In Order
              </Button>
              <span className="dev__hint">
                The whole of {GRID_OF[item.kind].where}, not just this card — an order is one list,
                and a single card cannot be put back without saying where the others go.
              </span>
            </div>
          </>
        )}

        <PanelReset
          label="Reset On The Site"
          what={
            hidden
              ? 'Puts the card back on the site. It does not touch the order.'
              : 'Nothing to put back: this card is shown, which is what the repo says.'
          }
          n={hidden ? 1 : 0}
          onReset={() => setDraft(withItem(draft, slug, { hidden: undefined }))}
        />
      </Panel>

      {/* ── 2 · the words ────────────────────────────────────────────── */}
      <Panel
        id="content-words"
        title="Card Words"
        what="Everything written on the card itself, and the chips over it."
        writes="tdg_site_content.doc → items.<slug>.card"
        right={<EditedCount over={card} keys={WORD_KEYS} />}
        terms={[item.title, card.title, card.copy]}
      >
        {builtInGame ? (
          <>
            <TextOverride
              label="Heading"
              builtIn={builtInGame.heading}
              value={card.heading}
              onChange={(v) => set('heading', v)}
              hint="The line across the top of the Games panel."
            />
            <TextOverride
              label="Copy"
              area
              rows={4}
              builtIn={builtInGame.copy}
              value={card.copy}
              onChange={(v) => set('copy', v)}
            />
            <TextOverride
              label="Live Tag"
              builtIn={builtInGame.tag}
              value={card.tag}
              onChange={(v) => set('tag', v)}
              hint="The dotted tag beside GAME. Uppercase: every chip on this site is."
            />
            <TextOverride
              label="Note"
              builtIn={builtInGame.note}
              value={card.note}
              onChange={(v) => set('note', v)}
              hint="The quiet line beside the button. Sentence case."
            />
            <TextOverride
              label="Count"
              builtIn={builtInGame.count}
              value={card.count}
              onChange={(v) => set('count', v)}
              hint="The line at the top right of the section, over the card."
            />
          </>
        ) : (
          <>
            <TextOverride
              label="Number"
              builtIn={(builtInApp ?? builtInTool)?.index ?? ''}
              value={card.index}
              onChange={(v) => set('index', v)}
              hint="The small badge on the card. Its page prints the same one."
            />
            <TextOverride
              label="Title"
              builtIn={(builtInApp ?? builtInTool)?.title ?? ''}
              value={card.title}
              onChange={(v) => set('title', v)}
              hint="Title Case: it is a name."
            />
            <TextOverride
              label="Copy"
              area
              rows={4}
              builtIn={(builtInApp ?? builtInTool)?.copy ?? ''}
              value={card.copy}
              onChange={(v) => set('copy', v)}
              hint="The paragraph under the title. Two or three sentences somebody can decide from."
            />
            {builtInApp && (
              <TextOverride
                label="Status Caption"
                builtIn={builtInApp.status}
                value={card.status}
                onChange={(v) => set('status', v)}
                hint="Printed where the access button goes, when there is no button. Sentence case."
              />
            )}
          </>
        )}

        <div className="dev__rule" />

        <ChipsEditor
          builtIn={
            builtInGame ? builtInGame.chips : ((builtInApp ?? builtInTool)?.chips ?? [])
          }
          value={card.chips}
          onChange={(v) => set('chips', v)}
        />

        <PanelReset
          label="Reset Card Words"
          what="Every word on the card and its chips, back to the repo. The icon, the cover, the button and the page are not touched."
          n={countKeys(card, WORD_KEYS)}
          onReset={() => clearCard(WORD_KEYS)}
        />
      </Panel>

      {/* ── 3 · the icon and the cover ───────────────────────────────── */}
      <Panel
        id="content-cover"
        title="Icon And Cover"
        what="The mark beside the title, and the picture on the card."
        writes="tdg_site_content.doc → items.<slug>.card.icon / art / shot"
        right={<EditedCount over={card} keys={COVER_KEYS} />}
        terms={[card.icon, card.shot?.slug, card.art?.title]}
      >
        <IconEditor
          builtInIcon={(builtInApp ?? builtInTool ?? builtInGame)?.icon ?? ''}
          builtInShape={(builtInApp ?? builtInTool ?? builtInGame)?.iconShape ?? 'tile'}
          card={card}
          set={set}
        />

        <div className="dev__rule" />

        <CoverEditor
          kind={item.kind}
          builtInArt={builtInApp?.art}
          builtInShot={(builtInApp ?? builtInGame)?.shot}
          card={card}
          set={set}
          setMany={setMany}
        />

        <PanelReset
          label="Reset Icon And Cover"
          what="The icon file, its shape, and whichever cover this card draws, back to the repo."
          n={countKeys(card, COVER_KEYS)}
          onReset={() => clearCard(COVER_KEYS)}
        />
      </Panel>

      {/* ── 4 · the access button ────────────────────────────────────── */}
      <Panel
        id="content-button"
        title="Access Button"
        what="The words on the card's own button, and the link it opens."
        writes="tdg_site_content.doc → items.<slug>.card.download / cta / href"
        right={<EditedCount over={card} keys={BUTTON_KEYS} />}
        terms={[card.download?.label, card.download?.href, card.cta, card.href]}
      >
        <ButtonEditor
          kind={item.kind}
          title={item.title}
          builtInDownload={builtInApp?.download}
          builtInCta={builtInTool?.cta ?? ''}
          builtInHref={builtInTool?.href ?? ''}
          builtInStatus={builtInGame?.status ?? ''}
          card={card}
          set={set}
        />

        <PanelReset
          label="Reset Access Button"
          what="The words on the button and where it opens, back to the repo — including whether this card has one at all."
          n={countKeys(card, BUTTON_KEYS)}
          onReset={() => clearCard(BUTTON_KEYS)}
        />
      </Panel>

      {/* ── 5 · the page head ────────────────────────────────────────── */}
      {page ? (
        <>
          <Panel
            id="content-page-head"
            title="Page Header"
            what="The top of this product's own page: its two sentences, its facts, its links."
            writes="tdg_site_content.doc → items.<slug>.page"
            right={<EditedCount over={over.page ?? {}} keys={HEAD_KEYS} />}
            terms={[page.title, over.page?.title, over.page?.lede]}
          >
            <PageHeadEditor page={page} over={over.page ?? {}} slug={slug} c={c} />

            <PanelReset
              label="Reset Page Header"
              what="The top of the page — its two sentences, its facts and its links — back to the repo. The sections below are not touched."
              n={countKeys(over.page ?? {}, HEAD_KEYS)}
              onReset={() => clearPage(HEAD_KEYS)}
            />
          </Panel>

          <Panel
            id="content-page-sections"
            title="Page Sections"
            what="Every folding panel on the page, and every block inside it."
            writes="tdg_site_content.doc → items.<slug>.page.sections"
            right={
              <Tag tone={over.page?.sections ? 'warn' : 'plain'}>
                {(over.page?.sections ?? page.sections).length} SECTIONS
              </Tag>
            }
            terms={(over.page?.sections ?? page.sections).map((s) => s.title)}
          >
            <SectionsEditor
              builtIn={page.sections}
              value={over.page?.sections}
              onChange={(v) => setDraft(setPage(draft, slug, 'sections', v))}
            />

            <PanelReset
              label="Reset Page Sections"
              what="Every fold on this page and every block inside it, back to the repo."
              n={over.page?.sections ? 1 : 0}
              onReset={() => clearPage(['sections'])}
            />
          </Panel>
        </>
      ) : (
        <Panel
          id="content-page-head"
          title="Page Header"
          what="This product has no page in the repo, so there is nothing here to edit."
          right={<Tag>NO PAGE</Tag>}
        >
          <p className="dev__hint">
            <code className="dev__code">{slug}</code> has no entry in{' '}
            <code className="dev__code">src/data/appPages.ts</code>, so its card links to a page
            that says it has not been written yet. That is a repo edit, not a content one: this tab
            changes what a page says, and cannot bring one into existence.
          </p>
        </Panel>
      )}

      {/* ── 6 · what is overridden ───────────────────────────────────── */}
      <Panel
        id="content-overrides"
        title="Overrides"
        what="Exactly what this product is overriding, and the way back to the repo's own copy."
        writes="tdg_site_content.doc → items.<slug>"
        tone="danger"
        right={
          isEdited(draft, slug) ? <Tag tone="warn">EDITED</Tag> : <Tag tone="ok">BUILT-IN</Tag>
        }
      >
        {isEdited(draft, slug) ? (
          <>
            <div className="dev__facts dev__facts--tight">
              <Fact label="Hidden" value={hidden ? 'Yes' : 'No'} />
              <Fact
                label="Card fields"
                value={Object.keys(card).length ? Object.keys(card).sort().join(', ') : 'none'}
                mono
              />
              <Fact
                label="Page fields"
                value={
                  Object.keys(over.page ?? {}).length
                    ? Object.keys(over.page ?? {}).sort().join(', ')
                    : 'none'
                }
                mono
              />
            </div>
            <p className="dev__hint">
              Every field not listed comes from <code className="dev__code">src/data/</code> and
              follows the repo, so a line fixed there reaches the site on the next deploy without
              anybody touching this tab.
            </p>
            <div className="dev__action dev__action--last">
              <div className="dev__action-text">
                <p className="dev__action-title">Reset This Product To Built-In</p>
                <p className="dev__hint">
                  Drops every override above, including whether it is hidden. Its place in the grid
                  is part of the whole grid&apos;s order and is not touched by this.
                </p>
              </div>
              <div className="dev__action-controls">
                <TypeToConfirm
                  phrase={item.title}
                  actionLabel="Reset To Built-In"
                  label={
                    <>
                      Everything this tab has changed about <strong>{item.title}</strong> goes, and
                      the card goes back to the words in the repo. It is not live until you publish.
                    </>
                  }
                  onConfirm={() => {
                    const items = { ...draft.items }
                    delete items[slug]
                    setDraft({ ...draft, items })
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <p className="dev__hint">
            Nothing is overridden. Every word, chip and picture on this card is the copy in{' '}
            <code className="dev__code">src/data/</code>, and it will follow that file as it
            changes.
          </p>
        )}
      </Panel>
    </div>
  )
}

/* ── the panel summaries ───────────────────────────────────────────────── */

const WORD_KEYS = ['index', 'title', 'copy', 'status', 'chips', 'heading', 'note', 'tag', 'count'] as const
const COVER_KEYS = ['icon', 'iconShape', 'art', 'shot'] as const
const BUTTON_KEYS = ['download', 'cta', 'href'] as const
// Everything the Page Header panel owns. `sections` is deliberately NOT here:
// it is the panel below, and its own Reset.
const HEAD_KEYS = ['index', 'group', 'backHash', 'backLabel', 'title', 'lede', 'intro', 'facts', 'links'] as const

/** How many of a panel's fields are overridden — its whole shut-state summary,
 *  from the same `countKeys` its Reset counts with. */
function EditedCount({ over, keys }: { over: object; keys: readonly string[] }) {
  const n = countKeys(over, keys)
  return n ? <Tag tone="warn">{n} EDITED</Tag> : <Tag>BUILT-IN</Tag>
}

/* ── chips ─────────────────────────────────────────────────────────────── */

function ChipsEditor({
  builtIn,
  value,
  onChange,
}: {
  builtIn: Chip[]
  value: Chip[] | undefined
  onChange: (next: Chip[] | undefined) => void
}) {
  return (
    <ListOverride
      label="Chips"
      builtIn={builtIn}
      builtInCount={builtIn.length}
      value={value}
      onChange={onChange}
      addLabel="Add Chip"
      blank={(): Chip => ({ label: '' })}
      nameOf={(chip) => chip.label}
      empty="No chips. The card draws no tag row at all."
      hint="The 9px mono tags. Uppercase, because every chip on this site is. One of them may be hot, which is the accent colour — that is for the status somebody should read first."
      render={(chip, set) => (
        <div className="dev__grid2">
          <RowField label="Label" value={chip.label} onChange={(v) => set({ ...chip, label: v })} />
          <Switch
            checked={chip.hot === true}
            onChange={(hot) => set(hot ? { ...chip, hot: true } : { label: chip.label })}
            label="Hot"
            hint="Draws it in the accent colour."
          />
        </div>
      )}
    />
  )
}

/* ── the icon ──────────────────────────────────────────────────────────── */

function IconEditor({
  builtInIcon,
  builtInShape,
  card,
  set,
}: {
  builtInIcon: string
  builtInShape: IconShape
  card: CardOverride
  set: <K extends keyof CardOverride>(key: K, value: CardOverride[K] | undefined) => void
}) {
  const icon = card.icon ?? builtInIcon
  return (
    <>
      <div className="dev__preview">
        <AssetPreview
          src={asset(`assets/${icon}`)}
          alt=""
          frame="icon"
          missing={`There is no assets/${icon} in the repo, so the card draws a broken image.`}
        />
        <p className="dev__preview-what">
          The mark beside the title, on the card, on its page and on the Store.
        </p>
      </div>
      <TextOverride
        label="Icon File"
        builtIn={builtInIcon}
        value={card.icon}
        onChange={(v) => set('icon', v)}
        hint={
          <>
            A filename in <code className="dev__code">public/assets/</code>, extension included.
            The console cannot upload one — this site is static and its images live in the repo —
            so this chooses among the files that are already there.
          </>
        }
      />
      <SelectOverride
        label="Icon Shape"
        builtIn={builtInShape}
        value={card.iconShape}
        onChange={(v) => set('iconShape', v)}
        options={[
          { value: 'tile' as IconShape, label: 'Tile — its own background and corners' },
          { value: 'glyph' as IconShape, label: 'Glyph — a mark on nothing' },
        ]}
        hint="A tile gets the site's hairline ring around it. Around a glyph that ring is a box drawn about thin air, so glyphs are drawn bare."
      />
    </>
  )
}

/* ── the cover ─────────────────────────────────────────────────────────── */

const SCENES: { value: KeyArtScene; label: string }[] = [
  { value: 'pines', label: 'Pines — cold blue night, a faceted pine pair' },
  { value: 'arch', label: 'Arch — warm lamplight, a garden arch' },
  { value: 'ridge', label: 'Ridge — indigo distance, a low mountain ridge' },
  { value: 'bridge', label: 'Bridge — slate blue-green, a stone footbridge' },
  { value: 'dusk', label: 'Dusk — plum graphite, the light source alone' },
]

type CoverMode = 'art' | 'shot' | 'none'

function CoverEditor({
  kind,
  builtInArt,
  builtInShot,
  card,
  set,
  setMany,
}: {
  kind: ItemKind
  builtInArt: import('../data/content').KeyArtSpec | undefined
  builtInShot: import('../data/content').Shot | undefined
  card: CardOverride
  set: <K extends keyof CardOverride>(key: K, value: CardOverride[K] | undefined) => void
  /** Both cover keys in one write. The mode buttons need it: see setCardKeys. */
  setMany: (patch: Partial<CardOverride>) => void
}) {
  const art = card.art === undefined ? builtInArt : (card.art ?? undefined)
  const shot = card.shot === undefined ? builtInShot : (card.shot ?? undefined)
  // Key art wins over a screenshot on a card — `ImageSlot` says so and says
  // why — so the mode is what the card is ACTUALLY drawing, not a preference.
  const mode: CoverMode = art ? 'art' : shot ? 'shot' : 'none'

  const blankArt = (): import('../data/content').KeyArtSpec => ({
    icon: card.icon ?? '',
    iconShape: card.iconShape ?? 'tile',
    title: '',
    line: '',
    facts: [],
    scene: 'pines',
  })

  /*
   * Edited back into agreement with the repo drops the override, the same way a
   * text field typed back to its built-in words does. It is what makes the
   * per-field Resets below add up: reset the last edited line of a cover and
   * the cover as a whole stops being an override, rather than becoming a frozen
   * copy of today's repo that quietly stops following it.
   */
  const setArt = (next: import('../data/content').KeyArtSpec) =>
    set('art', sameJson(next, builtInArt) ? undefined : next)
  const setShot = (next: import('../data/content').Shot) =>
    set('shot', sameJson(next, builtInShot) ? undefined : next)

  return (
    <>
      <Field
        label="What The Card Shows"
        hint={
          kind === 'game'
            ? 'The Games panel has no drawn key art: it is a wide card and shows the real screenshot.'
            : 'Key art beats a screenshot on a card, because a screenshot at 280px is a grey rectangle. The screenshot is what the product’s own page shows, and it stays useful even on a card that never draws it.'
        }
      >
        <div className="dev__row">
          {kind !== 'game' && (
            <Button
              variant={mode === 'art' ? 'primary' : 'ghost'}
              // Where the repo HAS key art, this restores it rather than
              // starting a blank one. Pressed from No Cover it used to write an
              // empty spec, so choosing the cover back gave you an empty cover
              // and the built-in art could only be recovered by hand.
              onClick={() => set('art', builtInArt ? undefined : blankArt())}
            >
              Key Art
            </Button>
          )}
          <Button
            variant={mode === 'shot' ? 'primary' : 'ghost'}
            onClick={() =>
              setMany({
                ...(kind !== 'game' ? { art: null } : {}),
                shot: builtInShot ? undefined : { slug: '', widths: [560, 1120], alt: '' },
              })
            }
          >
            Screenshot
          </Button>
          <Button
            variant={mode === 'none' ? 'primary' : 'ghost'}
            onClick={() => setMany({ ...(kind !== 'game' ? { art: null } : {}), shot: null })}
          >
            No Cover
          </Button>
        </div>
      </Field>

      {mode === 'art' && art && (
        <>
          <div className="dev__preview">
            <div className="dev__keyart">
              <KeyArt spec={art} />
            </div>
            <p className="dev__preview-what">The cover, exactly as the card draws it.</p>
          </div>

          <Overridden
            label="Key Art"
            edited={card.art !== undefined}
            onReset={() => set('art', undefined)}
            was={builtInArt ? <q>{builtInArt.title}</q> : <em>no key art</em>}
            hint="Drawn as SVG, so it stays crisp at every card width and costs no image bytes. The layout is identical across all five covers — that is what makes them read as one set — so what varies here is the scene and the words."
          >
            <RowField
              label="Title"
              value={art.title}
              builtIn={builtInArt?.title}
              onChange={(v) => setArt({ ...art, title: v })}
            />
            <RowField
              label="Line"
              area
              value={art.line}
              builtIn={builtInArt?.line}
              onChange={(v) => setArt({ ...art, line: v })}
            />
            <Field
              label="Scene"
              hint="One of five restrained backdrops. A scene per app is how a data file turns back into a component, so the set is closed."
            >
              <div className="dev__select-wrap">
                <select
                  className="dev__select"
                  value={art.scene}
                  onChange={(e) => setArt({ ...art, scene: e.target.value as KeyArtScene })}
                >
                  {SCENES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="dev__select-chevron"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </Field>
            <Field
              label="Facts"
              hint="Three or four very short facts, joined with · on one line of SVG text. Keep the joined strip under about 56 characters: it cannot wrap, so a long one runs off the right edge."
            >
              <RowList
                rows={art.facts}
                onChange={(facts) => setArt({ ...art, facts })}
                blank={() => ''}
                addLabel="Add Fact"
                nameOf={(f) => f}
                empty="No facts. The strip under the line is left empty."
                render={(fact, setFact) => (
                  <RowField label="Fact" value={fact} onChange={setFact} />
                )}
              />
              <p className="dev__hint">
                Joined: <q>{art.facts.join(' · ')}</q> — {art.facts.join(' · ').length} characters.
              </p>
            </Field>
          </Overridden>
        </>
      )}

      {/* A screenshot taken away while the card draws key art is invisible from
          here — the screenshot editor only renders in `shot` mode — and it is
          not harmless: `shotForPage` is what puts the picture at the top of
          this product's own PAGE, which the card's cover has nothing to do
          with. A state you can reach and cannot see is a bug, so it gets a
          line and a way back. */}
      {mode === 'art' && card.shot === null && builtInShot && (
        <div className="dev__row">
          <Button onClick={() => set('shot', undefined)}>Put The Screenshot Back</Button>
          <span className="dev__hint">
            The screenshot is removed too, so this product&apos;s own page has no picture at the
            top of it. The card is unaffected — key art wins there either way.
          </span>
        </div>
      )}

      {mode === 'shot' && shot && (
        <>
          <div className="dev__preview">
            <AssetPreview
              src={asset(`shots/${shot.slug}-${shot.widths[0]}.webp`)}
              alt={shot.alt}
              frame="wide"
              missing={`There is no shots/${shot.slug}-${shot.widths[0]}.webp in the repo. Both widths have to exist as .avif and .webp.`}
            />
            <p className="dev__preview-what">
              The product page always shows this. The card shows it only when there is no key art.
            </p>
          </div>

          <Overridden
            label="Screenshot"
            edited={card.shot !== undefined}
            onReset={() => set('shot', undefined)}
            was={builtInShot ? <q>{builtInShot.slug}</q> : <em>no screenshot</em>}
            hint={
              <>
                Files live in <code className="dev__code">public/shots/</code> as{' '}
                <code className="dev__code">&lt;name&gt;-&lt;width&gt;.avif</code> and{' '}
                <code className="dev__code">.webp</code>, at both widths. The console cannot upload
                one; it names which of the files already in the repo this card uses.
              </>
            }
          >
            <RowField
              label="Name"
              value={shot.slug}
              builtIn={builtInShot?.slug}
              onChange={(v) => setShot({ ...shot, slug: v })}
              placeholder="makullveny"
            />
            <div className="dev__grid2">
              <RowField
                label="Small width"
                value={String(shot.widths[0])}
                builtIn={builtInShot ? String(builtInShot.widths[0]) : undefined}
                onChange={(v) => setShot({ ...shot, widths: [Number(v) || 0, shot.widths[1]] })}
              />
              <RowField
                label="Large width"
                value={String(shot.widths[1])}
                builtIn={builtInShot ? String(builtInShot.widths[1]) : undefined}
                onChange={(v) => setShot({ ...shot, widths: [shot.widths[0], Number(v) || 0] })}
              />
            </div>
            <RowField
              label="Alt text"
              area
              value={shot.alt}
              builtIn={builtInShot?.alt}
              onChange={(v) => setShot({ ...shot, alt: v })}
            />
            <RowField
              label="Crop"
              value={shot.position ?? ''}
              builtIn={builtInShot ? (builtInShot.position ?? '') : undefined}
              onChange={(v) =>
                setShot(
                  v
                    ? { ...shot, position: v }
                    : { slug: shot.slug, widths: shot.widths, alt: shot.alt },
                )
              }
              placeholder="left center"
            />
            <p className="dev__hint">
              Crop is a CSS <code className="dev__code">object-position</code>, for a shot whose
              subject is not in the middle. Leave it empty for centred.
            </p>
          </Overridden>
        </>
      )}

      {mode === 'none' && (
        <>
          <p className="dev__warn">
            This card has no cover. The slot keeps the card&apos;s proportions and draws nothing, so
            the card is shorter than its neighbours in the grid — which is visible immediately on a
            shelf where every other card has a picture.
          </p>
          {(builtInArt || builtInShot) && (
            <div className="dev__row">
              <Button onClick={() => setMany({ art: undefined, shot: undefined })}>
                Put The Built-In Cover Back
              </Button>
              <span className="dev__hint">
                The repo has {builtInArt ? 'key art' : 'a screenshot'} for this card. With both
                covers taken away there is no field on screen to reset, so the way back is here.
              </span>
            </div>
          )}
        </>
      )}
    </>
  )
}

/* ── the access button ─────────────────────────────────────────────────── */

function ButtonEditor({
  kind,
  title,
  builtInDownload,
  builtInCta,
  builtInHref,
  builtInStatus,
  card,
  set,
}: {
  kind: ItemKind
  title: string
  builtInDownload: { href: string; label: string } | undefined
  builtInCta: string
  builtInHref: string
  builtInStatus: string
  card: CardOverride
  set: <K extends keyof CardOverride>(key: K, value: CardOverride[K] | undefined) => void
}) {
  if (kind === 'app') {
    const download = card.download === undefined ? builtInDownload : (card.download ?? undefined)
    return (
      <>
        <Switch
          checked={Boolean(download)}
          onChange={(on) =>
            set('download', on ? (builtInDownload ?? { label: `Get ${title}`, href: '' }) : null)
          }
          label="Give This Card A Button"
          hint={
            download
              ? 'The card draws this link where the status caption would go. The linked page owns everything about the download itself — per-OS builds, the version, install notes — so nothing here restates it.'
              : 'No button. The card prints its status caption instead, which is on the Card Words panel above.'
          }
        />

        {download && (
          <>
            <ButtonPreview label={download.label} href={download.href} />
            <Overridden
              label="Button"
              edited={card.download !== undefined}
              onReset={() => set('download', undefined)}
              was={
                builtInDownload ? (
                  <q>
                    {builtInDownload.label} → {builtInDownload.href}
                  </q>
                ) : (
                  <em>no button</em>
                )
              }
            >
              <RowField
                label="Words on the button"
                value={download.label}
                onChange={(v) => set('download', { ...download, label: v })}
                placeholder="Visit!"
              />
              <RowField
                label="Where it opens"
                value={download.href}
                onChange={(v) => set('download', { ...download, href: v })}
                placeholder="https://tdg-org.github.io/makullveny-site/#download"
              />
            </Overridden>
            <p className="dev__hint">
              Title Case for the words: a button is a name for an action. The link opens in a new
              tab, so it can be anywhere — that app&apos;s own site, a store listing, a release
              page.
            </p>
          </>
        )}
      </>
    )
  }

  if (kind === 'tool') {
    const cta = card.cta ?? builtInCta
    const href = card.href ?? builtInHref
    return (
      <>
        <ButtonPreview label={cta} href={href} />
        <TextOverride
          label="Words On The Button"
          builtIn={builtInCta}
          value={card.cta}
          onChange={(v) => set('cta', v)}
          hint="A tool card always draws this. With no link it is a quiet caption; with one it is a real button."
        />
        <TextOverride
          label="Where It Opens"
          builtIn={builtInHref}
          value={card.href}
          onChange={(v) => set('href', v)}
          placeholder="https://chromewebstore.google.com/…"
          hint="Leave it empty and the words stay a caption. That is the honest look for something not published yet."
        />
      </>
    )
  }

  const status = card.status ?? builtInStatus
  const href = card.href ?? ''
  return (
    <>
      <ButtonPreview label={status} href={href} />
      <TextOverride
        label="Words On The Button"
        builtIn={builtInStatus}
        value={card.status}
        onChange={(v) => set('status', v)}
        hint="The button in the Games panel, or the caption where there is no link."
      />
      <TextOverride
        label="Where It Opens"
        builtIn=""
        value={card.href}
        onChange={(v) => set('href', v)}
        placeholder="https://tdg-org.github.io/maranatha/"
        hint="The game has never had a link, so the built-in value is empty and the words are drawn as a caption. Put a link here and the same element becomes a button in the same place, so the row does not move."
      />
    </>
  )
}

/** The button as the card will draw it, in both of its states. */
function ButtonPreview({ label, href }: { label: string; href: string }) {
  return (
    <div className="dev__preview">
      <span className="dev__btnpreview" data-live={Boolean(href) || undefined}>
        {label || <em>no words</em>}
        {href && <span aria-hidden="true"> →</span>}
      </span>
      <p className="dev__preview-what">
        {href ? (
          <>
            A link, opening <code className="dev__code">{href}</code> in a new tab.
          </>
        ) : (
          'No link, so this is drawn as a plain caption rather than a button.'
        )}
      </p>
    </div>
  )
}

/* ── the page head ─────────────────────────────────────────────────────── */

function PageHeadEditor({
  page,
  over,
  slug,
  c,
}: {
  page: NonNullable<ReturnType<typeof pageForSlug>>
  over: PageOverride
  slug: string
  c: ContentDraft
}) {
  const set = <K extends keyof PageOverride>(key: K, value: PageOverride[K] | undefined) =>
    c.setDraft(setPage(c.draft, slug, key, value))

  return (
    <>
      <TextOverride
        label="Page Title"
        builtIn={page.title}
        value={over.title}
        onChange={(v) => set('title', v)}
        hint="The heading at the top of the page. It does not have to match the card's title, and usually should."
      />
      <TextOverride
        label="Lede"
        area
        rows={4}
        builtIn={page.lede}
        value={over.lede}
        onChange={(v) => set('lede', v)}
        hint="The two sentences that decide it. Somebody who has never heard of this should know from these alone whether it is for them."
      />
      <TextOverride
        label="Intro"
        area
        rows={3}
        builtIn={page.intro}
        value={over.intro}
        onChange={(v) => set('intro', v)}
        hint="One more paragraph, for what the lede had to leave out."
      />

      <div className="dev__rule" />

      <div className="dev__grid2">
        <TextOverride
          label="Number"
          builtIn={page.index}
          value={over.index}
          onChange={(v) => set('index', v)}
        />
        <SelectOverride
          label="Group"
          builtIn={page.group}
          value={over.group}
          onChange={(v) => set('group', v)}
          options={[
            { value: 'Apps' as const, label: 'Apps' },
            { value: 'Tools' as const, label: 'Tools' },
            { value: 'Game' as const, label: 'Game' },
          ]}
        />
      </div>
      <div className="dev__grid2">
        <TextOverride
          label="Back Label"
          builtIn={page.backLabel}
          value={over.backLabel}
          onChange={(v) => set('backLabel', v)}
        />
        <TextOverride
          label="Back Hash"
          builtIn={page.backHash}
          value={over.backHash}
          onChange={(v) => set('backHash', v)}
        />
      </div>
      <p className="dev__hint">
        Where Back goes when the page was opened cold, from a shared link. Somebody who arrived from
        a card is returned to that card instead, at the exact spot they left.
      </p>

      <div className="dev__rule" />

      <ListOverride
        label="At A Glance"
        builtIn={page.facts}
        builtInCount={page.facts.length}
        value={over.facts}
        onChange={(v) => set('facts', v)}
        addLabel="Add Fact"
        blank={() => ({ label: '', value: '' })}
        nameOf={(f) => f.label}
        empty="No facts. The strip under the heading is not drawn."
        hint="The label/value strip under the heading, for the facts a paragraph of prose would bury."
        render={(fact, setFact) => (
          <div className="dev__grid2">
            <RowField label="Label" value={fact.label} onChange={(v) => setFact({ ...fact, label: v })} />
            <RowField label="Value" value={fact.value} onChange={(v) => setFact({ ...fact, value: v })} />
          </div>
        )}
      />

      <ListOverride
        label="Links"
        builtIn={page.links ?? []}
        builtInCount={(page.links ?? []).length}
        value={over.links}
        onChange={(v) => set('links', v)}
        addLabel="Add Link"
        blank={(): PageLink => ({ label: '', href: '' })}
        nameOf={(l) => l.label}
        empty="No links. The row under the facts is not drawn."
        hint="The row of links under the facts strip. An external one opens in a new tab and says so to a screen reader."
        render={(link, setLink) => (
          <>
            <div className="dev__grid2">
              <RowField label="Label" value={link.label} onChange={(v) => setLink({ ...link, label: v })} />
              <RowField label="Link" value={link.href} onChange={(v) => setLink({ ...link, href: v })} />
            </div>
            <Switch
              checked={link.external === true}
              onChange={(ext) =>
                setLink(ext ? { ...link, external: true } : { label: link.label, href: link.href })
              }
              label="Opens Off This Site"
              hint="Opens in a new tab, and is announced as doing so."
            />
          </>
        )}
      />
    </>
  )
}

/* ── the page sections ─────────────────────────────────────────────────── */

const BLOCK_KINDS: { id: PageBlock['kind']; label: string; what: string }[] = [
  { id: 'text', label: 'Paragraph', what: 'One block of prose.' },
  { id: 'steps', label: 'Steps', what: 'A numbered walkthrough.' },
  { id: 'features', label: 'Features', what: 'What it does, each with a real explanation.' },
  { id: 'facts', label: 'Facts', what: 'A label and value table.' },
  { id: 'qa', label: 'Questions', what: 'A question somebody actually asks, and the answer.' },
  { id: 'signpost', label: 'Signposts', what: 'One-line pointers to somewhere else on the site.' },
  { id: 'note', label: 'Note', what: 'One sentence set apart, usually a limit or a warning.' },
]

function blankBlock(kind: PageBlock['kind']): PageBlock {
  switch (kind) {
    case 'text':
    case 'note':
      return { kind, text: '' }
    case 'steps':
      return { kind, steps: [] }
    case 'features':
      return { kind, items: [] }
    case 'facts':
      return { kind, items: [] }
    case 'qa':
      return { kind, items: [] }
    case 'signpost':
      return { kind, items: [] }
  }
}

function SectionsEditor({
  builtIn,
  value,
  onChange,
}: {
  builtIn: PageSection[]
  value: PageSection[] | undefined
  onChange: (next: PageSection[] | undefined) => void
}) {
  const rows = value ?? builtIn
  /** The repo's version of one section, matched by ID rather than by position:
   *  a section moved up the page is still the same section, and index matching
   *  would offer to "reset" it to whichever one now sits where it used to. */
  const twin = (sec: PageSection) => builtIn.find((b) => b.id === sec.id)
  const setList = (next: PageSection[]) =>
    onChange(sameJson(next, builtIn) ? undefined : next)

  return (
    <ListOverride
      label="Sections"
      builtIn={builtIn}
      builtInCount={builtIn.length}
      value={value}
      onChange={onChange}
      addLabel="Add Section"
      blank={(): PageSection => ({ id: `section-${Date.now()}`, title: '', what: '', blocks: [] })}
      nameOf={(s) => s.title}
      empty="No sections. The page is its heading, its facts and nothing else."
      hint="Every section starts shut, so a closed row has to say what is inside it — that one line is what makes an unopened page read as an index rather than as ten mystery headings. The ↺ on a row puts that one section back the way the repo has it."
      rowReset={(section) => {
        const b = twin(section)
        // Nothing to offer for a section added here, or one already identical
        // to its built-in twin. A button that would do nothing is a button you
        // have to press to find that out.
        if (!b || sameJson(b, section)) return null
        return () => setList(rows.map((r) => (r.id === section.id ? b : r)))
      }}
      render={(section, setSection) => {
        const b = twin(section)
        return (
        <>
          <div className="dev__grid2">
            <RowField
              label="Title"
              value={section.title}
              builtIn={b?.title}
              onChange={(v) => setSection({ ...section, title: v })}
            />
            <RowField
              label="Tag"
              value={section.tag ?? ''}
              builtIn={b ? (b.tag ?? '') : undefined}
              onChange={(v) =>
                setSection(
                  v
                    ? { ...section, tag: v }
                    : { id: section.id, title: section.title, what: section.what, blocks: section.blocks },
                )
              }
              placeholder="START HERE"
            />
          </div>
          <RowField
            label="What the shut row says"
            area
            value={section.what}
            builtIn={b?.what}
            onChange={(v) => setSection({ ...section, what: v })}
          />
          <RowField
            label="Id"
            value={section.id}
            onChange={(v) => setSection({ ...section, id: v })}
          />
          <p className="dev__hint">
            The id keys the open/closed register and the region&apos;s DOM id. Changing it on a
            section somebody has linked to loses that link.
          </p>

          <BlocksEditor
            blocks={section.blocks}
            onChange={(blocks) => setSection({ ...section, blocks })}
          />
        </>
        )
      }}
    />
  )
}

function BlocksEditor({
  blocks,
  onChange,
}: {
  blocks: PageBlock[]
  onChange: (next: PageBlock[]) => void
}) {
  const [adding, setAdding] = useState<PageBlock['kind']>('text')
  const kindLabel = (k: PageBlock['kind']) => BLOCK_KINDS.find((b) => b.id === k)?.label ?? k

  return (
    <Field
      label="Blocks"
      hint="The vocabulary is deliberately small and closed: a page is content in a shape somebody can add to without opening a component, and a block type per paragraph would end that. A block's kind is fixed once it exists — remove it and add the kind you meant."
    >
      <RowList
        rows={blocks}
        onChange={onChange}
        blank={() => blankBlock(adding)}
        addLabel={`Add ${kindLabel(adding)}`}
        nameOf={(b) => kindLabel(b.kind)}
        empty="No blocks. The section opens onto nothing."
        render={(block, setBlock) => <BlockEditor block={block} set={setBlock} />}
      />
      <div className="dev__row">
        <div className="dev__select-wrap">
          <select
            className="dev__select"
            value={adding}
            aria-label="What kind of block to add"
            onChange={(e) => setAdding(e.target.value as PageBlock['kind'])}
          >
            {BLOCK_KINDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} — {b.what}
              </option>
            ))}
          </select>
          <svg
            className="dev__select-chevron"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    </Field>
  )
}

function BlockEditor({ block, set }: { block: PageBlock; set: (next: PageBlock) => void }) {
  switch (block.kind) {
    case 'text':
    case 'note':
      return (
        <RowField
          label={block.kind === 'note' ? 'The sentence' : 'The paragraph'}
          area
          rows={4}
          value={block.text}
          onChange={(text) => set({ ...block, text })}
        />
      )

    case 'steps':
      return (
        <RowList
          rows={block.steps}
          onChange={(steps) => set({ ...block, steps })}
          blank={() => ({ title: '', text: '' })}
          addLabel="Add Step"
          nameOf={(s) => s.title}
          empty="No steps yet."
          render={(step, setStep) => (
            <>
              <RowField label="Step" value={step.title} onChange={(v) => setStep({ ...step, title: v })} />
              <RowField label="What to do" area value={step.text} onChange={(v) => setStep({ ...step, text: v })} />
            </>
          )}
        />
      )

    case 'features':
      return (
        <RowList
          rows={block.items}
          onChange={(items) => set({ ...block, items })}
          blank={(): { name: string; text: string; soon?: boolean } => ({ name: '', text: '' })}
          addLabel="Add Feature"
          nameOf={(f) => f.name}
          empty="No features yet."
          render={(feature, setFeature) => (
            <>
              <RowField label="Name" value={feature.name} onChange={(v) => setFeature({ ...feature, name: v })} />
              <RowField label="What it does" area value={feature.text} onChange={(v) => setFeature({ ...feature, text: v })} />
              <Switch
                checked={feature.soon === true}
                onChange={(soon) =>
                  setFeature(soon ? { ...feature, soon: true } : { name: feature.name, text: feature.text })
                }
                label="Not Built Yet"
                hint="The row says so out loud. Only what it does today goes in a page without this."
              />
            </>
          )}
        />
      )

    case 'facts':
      return (
        <RowList
          rows={block.items}
          onChange={(items) => set({ ...block, items })}
          blank={() => ({ label: '', value: '' })}
          addLabel="Add Fact"
          nameOf={(f) => f.label}
          empty="No facts yet."
          render={(fact, setFact) => (
            <div className="dev__grid2">
              <RowField label="Label" value={fact.label} onChange={(v) => setFact({ ...fact, label: v })} />
              <RowField label="Value" value={fact.value} onChange={(v) => setFact({ ...fact, value: v })} />
            </div>
          )}
        />
      )

    case 'qa':
      return (
        <RowList
          rows={block.items}
          onChange={(items) => set({ ...block, items })}
          blank={() => ({ q: '', a: '' })}
          addLabel="Add Question"
          nameOf={(x) => x.q}
          empty="No questions yet."
          render={(qa, setQa) => (
            <>
              <RowField label="Question" value={qa.q} onChange={(v) => setQa({ ...qa, q: v })} />
              <RowField label="Answer" area value={qa.a} onChange={(v) => setQa({ ...qa, a: v })} />
            </>
          )}
        />
      )

    case 'signpost':
      return (
        <RowList
          rows={block.items}
          onChange={(items) => set({ ...block, items })}
          blank={() => ({ name: '', text: '', href: '' })}
          addLabel="Add Signpost"
          nameOf={(s) => s.name}
          empty="No signposts yet."
          render={(post, setPost) => (
            <>
              <div className="dev__grid2">
                <RowField label="Name" value={post.name} onChange={(v) => setPost({ ...post, name: v })} />
                <RowField label="Link" value={post.href} onChange={(v) => setPost({ ...post, href: v })} />
              </div>
              <RowField label="One line" value={post.text} onChange={(v) => setPost({ ...post, text: v })} />
            </>
          )}
        />
      )
  }
}
