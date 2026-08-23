import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { AccountDetail, type Run } from './AccountDetail'
import * as api from './api'
import type { DevAccount, DevAuditRow, DevCatalog, DevEvent, DevOverview } from './api'
import { ownedCount, ownedTerms, storeApps, type DevStoreApp } from './apps'
import {
  Panel,
  RefreshRail,
  SectionControls,
  Select,
  Switch,
  Tag,
  Toasts,
  useToasts,
} from './controls'
import { SectionsProvider, useSections } from '../lib/sections'
import { Highlight, SearchProvider, hay, searchTerms, matchesTerms } from './search'
import { setDevMode, useDevMode } from './devMode'
import { fmtDate, fmtRelative, fmtUsd, nameOf, prettyId, standingOf } from './format'
import { captureAnchor, holdAnchor, readView, useRememberView, useRestoreView } from './viewState'
import './DevConsole.css'

/**
 * The TDG Core Developer console.
 *
 * ## Reaching this file at all
 *
 * App imports it with a dynamic `import()`, and only once `useAuth().isAdmin`
 * is true, so for everybody else the chunk is never even fetched, and `#/dev`
 * renders the home page exactly the way `#/banana` does. That is camouflage,
 * not security: the security is that every function this page calls refuses a
 * non-admin in Postgres. See src/dev/README.md for the honest threat model.
 *
 * ## What it is for
 *
 * One place to see and change a person's standing across all of TDG Core:
 * identity, the developer permission, the TDG-wide subscription, Makullveny's
 * own ladder and themes, the Veditor and DevFleet Store packs, suspensions, and
 * the whole money-and-moderation trail behind it. Bible Educator's own
 * Developer tab is deliberately narrower: it manages Bible Educator.
 */

/** The server clamps every ledger read to this, so asking for more is a lie. */
const LEDGER_CAP = 1000

type Tab = 'accounts' | 'purchases' | 'audit'

const TABS: { id: Tab; label: string; what: string }[] = [
  { id: 'accounts', label: 'Accounts', what: 'Find anyone, and change anything about them.' },
  { id: 'purchases', label: 'Purchases', what: 'Every payment and free grant TDG has recorded.' },
  { id: 'audit', label: 'Audit Log', what: 'Every action a developer has taken, in every app.' },
]

/**
 * The provider has to sit OUTSIDE the component that renders the panels, so it
 * survives every re-render one of them causes. A provider mounted inside would
 * reset every section to shut each time a write landed.
 *
 * The remembered view is read ONCE, here, before anything renders. It is what a
 * real page reload gets put back from: the tab, the account, the search, the
 * open sections and the place on the page. See `viewState.ts` for why the
 * arrangement has to come back before the scroll position can mean anything.
 */
export default function DevConsole() {
  const [saved] = useState(readView)
  const [query, setQuery] = useState(() => saved?.query ?? '')
  return (
    <SectionsProvider initialOpen={saved?.open}>
      <SearchProvider query={query} setQuery={setQuery}>
        <DevConsoleBody query={query} setQuery={setQuery} saved={saved} />
      </SearchProvider>
    </SectionsProvider>
  )
}

function DevConsoleBody({
  query,
  setQuery,
  saved,
}: {
  query: string
  setQuery: (q: string) => void
  saved: ReturnType<typeof readView>
}) {
  const { user, profile } = useAuth()
  const devMode = useDevMode()
  const { toasts, push, dismiss } = useToasts()

  const [tab, setTab] = useState<Tab>(() =>
    TABS.some((t) => t.id === saved?.tab) ? (saved!.tab as Tab) : 'accounts',
  )
  const [overview, setOverview] = useState<DevOverview | null>(null)
  const [catalog, setCatalog] = useState<DevCatalog | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  const [rows, setRows] = useState<DevAccount[]>([])
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedId, setSelectedId] = useState<string | null>(saved?.selectedId ?? null)

  const [events, setEvents] = useState<DevEvent[]>([])
  const [audit, setAudit] = useState<DevAuditRow[]>([])
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading')

  const [allEvents, setAllEvents] = useState<DevEvent[]>([])
  const [allAudit, setAllAudit] = useState<DevAuditRow[]>([])
  const [ledgerState, setLedgerState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [source, setSource] = useState<string>('all')

  const [busy, setBusy] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)

  /** When the page last finished reading everything, and whether it is now. */
  const [readAt, setReadAt] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const meId = user?.id ?? ''
  const selected = useMemo(
    () => rows.find((r) => r.user_id === selectedId) ?? null,
    [rows, selectedId],
  )

  /**
   * Every app with a pack Store, in one place, for the three surfaces on this
   * page that used to name their apps by hand: the overview tiles, the
   * Purchases filter and the account panels. Account-independent here — the
   * detail pane merges the selected account's own holdings in itself.
   */
  const stores = useMemo(() => storeApps(catalog), [catalog])

  const message = (e: unknown) =>
    e instanceof Error ? e.message : "Something went wrong, and it didn't say what."

  /* ── the five reads, each on its own ──────────────────────────────────
   *
   * One function per thing the page shows, so Refresh can run all five and
   * every other caller can run the one it means. Each holds a sequence number
   * rather than a cancelled flag: a refresh fired while a debounced search is
   * still in flight must not have the older answer land on top of it.
   */

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api.getOverview())
      return true
    } catch (e) {
      setBootError(message(e))
      return false
    }
  }, [])

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await api.getCatalog())
      return true
    } catch (e) {
      setBootError(message(e))
      return false
    }
  }, [])

  /*
   * The instant filter renders from `rows` and never waits for this. This is
   * the bonus pass: `tdg_admin_accounts` caps what it returns, so a search that
   * only ever looked at what is already loaded could miss an account this
   * browser has never seen.
   */
  const rosterSeq = useRef(0)
  const loadRoster = useCallback(async (q: string) => {
    const seq = ++rosterSeq.current
    setListState('loading')
    try {
      const list = await api.searchAccounts(q.trim())
      if (seq !== rosterSeq.current) return false
      setRows(list)
      setListState('ready')
      return true
    } catch {
      if (seq === rosterSeq.current) setListState('error')
      return false
    }
  }, [])

  const historySeq = useRef(0)
  const loadHistory = useCallback(async (id: string | null) => {
    if (!id) return false
    const seq = ++historySeq.current
    setHistoryState('loading')
    try {
      const [e, a] = await Promise.all([api.getEvents(id, 100), api.getAudit(id, '', 100)])
      if (seq !== historySeq.current) return false
      setEvents(e)
      setAudit(a)
      setHistoryState('ready')
      return true
    } catch {
      if (seq === historySeq.current) setHistoryState('error')
      return false
    }
  }, [])

  /*
   * Both whole-project ledgers, unfiltered, once. They used to reload on every
   * keystroke of the audit box and to be filtered in Postgres; now the page
   * search filters them in memory, so a keystroke costs nothing and the
   * Purchases tab is already populated by the time you click it. LEDGER_CAP is
   * the server's own ceiling, and the count line says so when a list reaches it.
   */
  const ledgerSeq = useRef(0)
  const loadLedger = useCallback(async () => {
    const seq = ++ledgerSeq.current
    setLedgerState('loading')
    try {
      const [e, a] = await Promise.all([
        api.getEvents(null, LEDGER_CAP),
        api.getAudit(null, '', LEDGER_CAP),
      ])
      if (seq !== ledgerSeq.current) return false
      setAllEvents(e)
      setAllAudit(a)
      setLedgerState('ready')
      return true
    } catch {
      if (seq === ledgerSeq.current) setLedgerState('error')
      return false
    }
  }, [])

  /* ── Refresh: the whole page, without losing the page ─────────────────
   *
   * The five reads above, together, and NOT a reload. A reload would answer the
   * same question and charge you your place on a very long page, the account
   * you had open, your search and every section you had expanded.
   *
   * The place is kept by holding an anchor rather than a scroll offset: the
   * element at the top of your screen is measured before the reads go out and
   * put back where it was as they land, so a roster that comes back four rows
   * shorter moves nothing you were looking at. See viewState.ts.
   *
   * `boot` leaves the roster and the history to the two effects below, which
   * run on mount anyway, so opening the page does not ask for either twice.
   */
  const readAll = useCallback(
    async (scope: 'boot' | 'again') => {
      const here = scope === 'again' ? captureAnchor() : null
      if (scope === 'again') setRefreshing(true)
      const reads: Promise<boolean>[] = [loadOverview(), loadCatalog(), loadLedger()]
      if (scope === 'again') reads.push(loadRoster(query), loadHistory(selectedId))
      const landed = await Promise.all(reads)
      // Only when something actually came back. A rail that says "read 1m ago"
      // after five refused reads is telling you the page is fresh at the exact
      // moment it is stale, which is the one lie a freshness stamp can tell.
      if (landed.some(Boolean)) setReadAt(Date.now())
      if (scope === 'again') {
        setRefreshing(false)
        // After the commit, and then for a moment longer: five reads land in
        // more than one frame and each of them can move what is above you.
        holdAnchor(here, { ms: 900 })
      }
    },
    [loadOverview, loadCatalog, loadLedger, loadRoster, loadHistory, query, selectedId],
  )

  const refresh = useCallback(() => {
    void readAll('again')
  }, [readAll])

  /* ── boot, and the two reads with a life of their own ─────────────────── */

  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void readAll('boot')
  }, [readAll])

  /** The roster follows the search box, debounced: it is a round trip, and
   *  nothing on screen is waiting for it. */
  useEffect(() => {
    const timer = window.setTimeout(() => void loadRoster(query), 250)
    return () => window.clearTimeout(timer)
  }, [query, loadRoster])

  /** The open account's own history follows the selection. */
  useEffect(() => {
    void loadHistory(selectedId)
  }, [selectedId, loadHistory])

  /* ── one write, then re-read what actually landed ─────────────────────── */

  const run: Run = useCallback(
    (key, okMessage, fn) => {
      const id = selectedId
      // A write re-reads the account under you, and a panel that grows a
      // warning or loses a row moves everything below it. Same treatment as
      // Refresh: hold the thing you were looking at still.
      const here = captureAnchor()
      setBusy(key)
      void (async () => {
        try {
          await fn()
          push('ok', okMessage)
          if (id) {
            const fresh = await api.getAccount(id)
            if (fresh) {
              // Patch the roster row too, so its chips agree with the panel.
              setRows((list) => list.map((r) => (r.user_id === id ? fresh : r)))
            } else {
              // Gone, a delete-forever. Drop it and clear the selection.
              setRows((list) => list.filter((r) => r.user_id !== id))
              setSelectedId(null)
            }
            await loadHistory(id)
          }
          void loadOverview()
          setReadAt(Date.now())

        } catch (e) {
          push('bad', message(e))
        } finally {
          setBusy(null)
          holdAnchor(here, { ms: 600 })
        }
      })()
    },
    [selectedId, push, loadOverview, loadHistory],
  )

  /* ── selecting on a narrow screen should show the thing you selected ──── */

  const select = (id: string) => {
    setSelectedId(id)
    if (window.matchMedia('(max-width: 1040px)').matches) {
      // The detail renders below the roster there, and a click that changes
      // something 800px off-screen reads as a click that did nothing.
      window.requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    }
  }

  /* ── the instant filters ───────────────────────────────────────────────
   *
   * Every one of these is a plain array filter over data already in memory.
   * That is the whole search: no debounce, no request, nothing to wait for.
   * The haystacks include the things you would half-remember about a row, not
   * only the words it happens to print, so a purchase is findable by its
   * amount, its pack id, the buyer's email, or the raw Stripe event id.
   */
  const terms = useMemo(() => searchTerms(query), [query])
  const searching = terms.length > 0

  const shownRows = useMemo(
    () =>
      rows.filter((r) =>
        matchesTerms(
          hay(
            r.display_name, r.username, r.email, r.recovery_email, r.user_id,
            r.core_tier, r.core_status, r.mak_tier, r.mak_status,
            r.mak_themes,
            // Every app id and pack id the account holds, derived rather than
            // listed: a product added tomorrow is searchable the same day.
            ownedTerms(r),
            standingOf(r).label,
            r.is_admin ? 'developer admin' : '',
          ),
          terms,
        ),
      ),
    [rows, terms],
  )

  const shownEvents = useMemo(
    () =>
      allEvents
        .filter((e) => source === 'all' || e.source === source)
        .filter((e) =>
          matchesTerms(
            hay(
              e.who, e.source, e.event_type, e.item, e.currency, e.event_id, e.user_id,
              e.amount_cents == null ? '' : fmtUsd(e.amount_cents),
              e.event_id.startsWith('admin:') ? 'granted free grant' : 'paid stripe payment',
            ),
            terms,
          ),
        ),
    [allEvents, source, terms],
  )

  const shownAudit = useMemo(
    () =>
      allAudit.filter((r) =>
        matchesTerms(hay(r.app, r.action, r.detail, r.actor_name, r.target_name), terms),
      ),
    [allAudit, terms],
  )

  /* ── keeping the page you were reading ────────────────────────────────
   *
   * The restore runs first and the saving waits for it: writing the view while
   * the page is still assembling itself would record the top of a page it has
   * not finished arriving at, and that is the record the NEXT reload would use.
   */
  const { openIds } = useSections()
  const restored = useRestoreView(saved?.anchor ?? null)
  useRememberView({ tab, selectedId, query, open: openIds }, restored)

  /** What the toolbar says while a search is running, across every tab. */
  const searchHint = (() => {
    if (!searching) return null
    const parts = [
      shownRows.length && `${shownRows.length} account${shownRows.length === 1 ? '' : 's'}`,
      shownEvents.length && `${shownEvents.length} purchase${shownEvents.length === 1 ? '' : 's'}`,
      shownAudit.length && `${shownAudit.length} action${shownAudit.length === 1 ? '' : 's'}`,
    ].filter(Boolean)
    return parts.length ? `${parts.join(' · ')} match` : 'Nothing matches that'
  })()

  return (
    <section id="top" className="section section--flat dev">
      <div className="texture dev__grid" aria-hidden="true" />

      <div className="shell dev__shell">
        <header className="dev__head" data-dev-anchor="head">
          <div className="kicker">
            <span className="kicker__num">00</span>
            <span className="kicker__rule" />
            <span className="kicker__label">Developer</span>
          </div>
          <h1 className="h2 dev__heading">TDG Core</h1>
          <p className="lede dev__lede">
            Every account across Bible Educator, Makullveny, TDG Veditor and DevFleet, and everything
            we can change about one. Signed in as{' '}
            <strong>{profile?.display_name || profile?.username || user?.email}</strong>.
          </p>

          <p className="dev__live">
            <span className="dev__live-dot" aria-hidden="true" />
            This is the <strong>live</strong> tdg-core project. There is no staging copy and no
            undo. Every switch below changes a real person's account the moment you press it, and
            everything you do is written to the audit log with your name on it.
          </p>

          <div className="dev__tabvis">
            <Switch
              checked={devMode}
              onChange={setDevMode}
              label="Show The Developer Tab"
              hint={
                devMode
                  ? 'The Developer link is in the nav. Turn it off to hide the link before you share a screen.'
                  : 'The tab is hidden. This page still works, and the same switch in your account menu brings the tab back.'
              }
            />
          </div>
        </header>

        {bootError && (
          <p className="dev__warn dev__warn--wide">
            {bootError} If that says the console is limited to developer accounts, the flag on your
            profile is off. The page is showing because this browser thinks otherwise, and the
            server is the one that decides.
          </p>
        )}

        <SectionControls hint={searchHint} />

        <Overview overview={overview} stores={stores} />

        <nav className="dev__tabs" aria-label="Developer sections" data-dev-anchor="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="dev__tab"
              data-active={tab === t.id || undefined}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <span className="dev__tab-label">{t.label}</span>
              <span className="dev__tab-what">{t.what}</span>
            </button>
          ))}
        </nav>

        {tab === 'accounts' && (
          <div className="dev__split">
            <div className="dev__roster">
              <p className="dev__roster-count">
                {listState === 'loading' && rows.length === 0
                  ? 'Looking…'
                  : listState === 'error'
                    ? "Couldn't read the accounts."
                    : searching
                      ? `${shownRows.length} of ${rows.length} account${rows.length === 1 ? '' : 's'} match${shownRows.length === 1 ? 'es' : ''}`
                      : `${rows.length} account${rows.length === 1 ? '' : 's'} · search at the top of the page`}
              </p>

              <ul className="dev__list">
                {shownRows.map((r) => (
                  <RosterRow
                    key={r.user_id}
                    account={r}
                    active={r.user_id === selectedId}
                    isSelf={r.user_id === meId}
                    onSelect={() => select(r.user_id)}
                  />
                ))}
                {listState !== 'error' && shownRows.length === 0 && (
                  <li className="dev__empty">
                    {searching ? 'No account matches that.' : 'No accounts yet.'}
                  </li>
                )}
              </ul>
            </div>

            <div className="dev__pane" ref={detailRef} data-dev-anchor="pane">
              {selected && catalog ? (
                <AccountDetail
                  account={selected}
                  catalog={catalog}
                  meId={meId}
                  run={run}
                  busy={busy}
                  events={events}
                  audit={audit}
                  historyState={historyState}
                />
              ) : (
                <div className="dev__placeholder">
                  <h2 className="dev__placeholder-title">Pick an account</h2>
                  <p className="dev__placeholder-copy">
                    Everything about one person opens here: who they are, what they have paid for,
                    what we have given them, and whether anything is limiting the account.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'purchases' && (
          <div className="dev__wide">
            <div className="dev__search">
              {/* One option per app the console found, plus Makullveny, whose
                  ledger is tier-shaped rather than pack-shaped and so is not a
                  discovered Store. A filter that omits an app is a filter that
                  hides its money, so this list is never typed out. */}
              <Select
                value={source}
                onChange={setSource}
                options={[
                  { value: 'all', label: 'Every app' },
                  ...stores
                    .filter((s) => s.onServer)
                    .map((s) => ({ value: s.id, label: s.title })),
                  { value: 'makullveny', label: 'Makullveny' },
                ]}
              />
            </div>
            <p className="dev__roster-count">
              {ledgerState === 'loading' && allEvents.length === 0
                ? 'Reading the ledger…'
                : ledgerState === 'error'
                  ? "Couldn't read the ledger."
                  : `${shownEvents.length}${searching ? ` of ${allEvents.length}` : ''} entr${(searching ? allEvents.length : shownEvents.length) === 1 ? 'y' : 'ies'} · PAID came from Stripe, GRANTED came from this console${allEvents.length >= LEDGER_CAP ? ` · newest ${LEDGER_CAP} loaded` : ''}`}
            </p>
            <Panel
              title="Every Payment And Grant"
              what="All three Stripe ledgers merged, newest first. PAID is a real payment; GRANTED is somebody switching a pack on from this console. The page search filters this list as you type: try a pack id, an amount, or who bought it."
              writes="veditor_purchase_events + devfleet_purchase_events + mak_subscription_events"
              matchCount={shownEvents.length}
              right={<LedgerTag state={ledgerState} n={shownEvents.length} noun="ENTRIES" />}
            >
            <ul className="dev__log dev__log--wide">
              {shownEvents.map((e) => (
                <li key={e.event_id} className="dev__log-row">
                  <span className="dev__log-when" title={fmtDate(e.at)}>
                    {fmtRelative(e.at)}
                  </span>
                  <Tag tone={e.event_id.startsWith('admin:') ? 'warn' : 'ok'}>
                    {e.event_id.startsWith('admin:') ? 'GRANTED' : 'PAID'}
                  </Tag>
                  <Tag>{e.source}</Tag>
                  <span className="dev__log-who">
                    {e.user_id ? (
                      <button
                        type="button"
                        className="dev__link"
                        // Open them; do not filter the page down to their
                        // id. A uuid in the search box would hide most of the
                        // very detail this click is asking to see.
                        onClick={() => {
                          setTab('accounts')
                          setQuery('')
                          setSelectedId(e.user_id)
                        }}
                      >
                        <Highlight text={e.who} />
                      </button>
                    ) : (
                      <span className="dev__panel-quiet">nobody (account deleted)</span>
                    )}
                  </span>
                  <span className="dev__log-what">
                    <code className="dev__code">
                      <Highlight text={e.event_type} />
                    </code>
                    {e.item ? (
                      <>
                        {' · '}
                        <Highlight text={e.item} />
                      </>
                    ) : null}
                  </span>
                  <span className="dev__log-amount">
                    <Highlight text={fmtUsd(e.amount_cents)} />
                  </span>
                </li>
              ))}
              {ledgerState !== 'error' && shownEvents.length === 0 && (
                <li className="dev__empty">
                  {searching || source !== 'all'
                    ? 'No entry matches that.'
                    : 'Nothing recorded yet.'}
                </li>
              )}
            </ul>
            </Panel>
          </div>
        )}

        {tab === 'audit' && (
          <div className="dev__wide">
            <p className="dev__roster-count">
              {ledgerState === 'loading' && allAudit.length === 0
                ? 'Reading the log…'
                : ledgerState === 'error'
                  ? "Couldn't read the log."
                  : `${shownAudit.length}${searching ? ` of ${allAudit.length}` : ''} action${(searching ? allAudit.length : shownAudit.length) === 1 ? '' : 's'} · tdg-core is this console, the rest are each app's own tools${allAudit.length >= LEDGER_CAP ? ` · newest ${LEDGER_CAP} loaded` : ''}`}
            </p>
            <Panel
              title="Every Developer Action"
              what="Moderation and permission changes from every TDG app, newest first. Rows tagged tdg-core came from this console; the rest came from an app's own tools. The page search filters this list as you type."
              writes="bea_moderation_audit"
              matchCount={shownAudit.length}
              right={<LedgerTag state={ledgerState} n={shownAudit.length} noun="ACTIONS" />}
            >
            <ul className="dev__log dev__log--wide">
              {shownAudit.map((r) => (
                <li key={r.id} className="dev__log-row">
                  <span className="dev__log-when" title={fmtDate(r.at)}>
                    {fmtRelative(r.at)}
                  </span>
                  <Tag tone={r.app === 'tdg-core' ? 'hot' : 'plain'}>{r.app}</Tag>
                  <span className="dev__log-who">
                    <Highlight text={r.target_name} />
                  </span>
                  <span className="dev__log-what">
                    <strong>
                      <Highlight text={r.action} />
                    </strong>
                    {r.detail ? (
                      <>
                        {' · '}
                        <Highlight text={r.detail} />
                      </>
                    ) : null}
                  </span>
                  <span className="dev__log-amount">
                    by <Highlight text={r.actor_name} />
                  </span>
                </li>
              ))}
              {ledgerState !== 'error' && shownAudit.length === 0 && (
                <li className="dev__empty">
                  {searching ? 'No action matches that.' : 'No developer has done anything yet.'}
                </li>
              )}
            </ul>
            </Panel>
          </div>
        )}
      </div>

      <RefreshRail onRefresh={refresh} busy={refreshing} readAt={readAt} />

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </section>
  )
}

/** A shut section's tag is all it says about itself, so it never reports zero
 *  while the real answer is still in flight. */
function LedgerTag({
  state,
  n,
  noun,
}: {
  state: 'loading' | 'ready' | 'error'
  n: number
  noun: string
}) {
  if (state === 'loading') return <Tag>READING</Tag>
  if (state === 'error') return <Tag tone="bad">UNREADABLE</Tag>
  return (
    <Tag tone={n ? 'ok' : 'plain'}>
      {n} {noun}
    </Tag>
  )
}

/* ── the numbers ───────────────────────────────────────────────────────── */

/**
 * The numbers across the top.
 *
 * The fixed ones are written out; the per-app ones are not. `store_owners`
 * arrives keyed by app id — one key per app the server found — so a product
 * that ships tomorrow has a tile here the same day, named from the shop if the
 * shop knows it and from its own id if not.
 */
function Overview({ overview: o, stores }: { overview: DevOverview | null; stores: DevStoreApp[] }) {
  // Its title if the site sells it, its id made readable if this is the first
  // the shop has heard of it. An app is never shown as a bare key.
  const titleOf = (id: string) => stores.find((s) => s.id === id)?.title ?? prettyId(id)

  const stats: { label: string; value: string; what: string; tone?: 'warn' | 'bad' }[] = o
    ? [
        { label: 'Accounts', value: String(o.accounts), what: 'profiles that exist' },
        { label: 'Developers', value: String(o.developers), what: 'can open this page' },
        {
          label: 'Suspended',
          value: String(o.suspended),
          what: 'locked out of every app',
          tone: o.suspended ? 'bad' : undefined,
        },
        {
          label: 'Unconfirmed',
          value: String(o.unconfirmed),
          what: 'never clicked the email',
          tone: o.unconfirmed ? 'warn' : undefined,
        },
        { label: 'New (7d)', value: String(o.new_7d), what: 'signed up this week' },
        { label: 'Active (7d)', value: String(o.active_7d), what: 'signed in this week' },
        { label: 'Core Paid', value: String(o.core_paid), what: 'above the free tier' },
        { label: 'Makullveny', value: String(o.mak_paid), what: 'own something in Mak' },
        ...Object.entries(o.store_owners ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, n]) => ({
            label: titleOf(id),
            value: String(n),
            what: `own a ${titleOf(id)} pack`,
          })),
        { label: 'Taken', value: fmtUsd(o.gross_cents), what: 'across every ledger' },
      ]
    : []

  return (
    <Panel
      title="Overview"
      what="The whole project in numbers, re-read after every change you make below."
      terms={stats.map((x) => `${x.label} ${x.what} ${x.value}`)}
      right={<Tag tone={o ? 'plain' : undefined}>{o ? `${o.accounts} ACCOUNTS` : 'READING'}</Tag>}
    >
      <div className="dev__stats">
        {o
          ? stats.map((s) => (
            <div key={s.label} className="dev__stat" data-tone={s.tone}>
              <span className="dev__stat-value">{s.value}</span>
              <span className="dev__stat-label">{s.label}</span>
              <span className="dev__stat-what">{s.what}</span>
            </div>
          ))
          : // As many placeholders as there will be tiles, so the row does not
            // reflow when the real numbers land: nine fixed, plus one per app.
            // Every app, not only the ones confirmed on the server — this
            // branch runs while the catalog is still in flight, when the shop's
            // list is the only count available and is the right guess.
            Array.from({ length: 9 + stores.length }, (_, i) => (
              <div key={i} className="dev__stat dev__stat--skeleton" aria-hidden="true" />
            ))}
      </div>
    </Panel>
  )
}

/* ── one roster row ────────────────────────────────────────────────────── */

function RosterRow({
  account: a,
  active,
  isSelf,
  onSelect,
}: {
  account: DevAccount
  active: boolean
  isSelf: boolean
  onSelect: () => void
}) {
  const standing = standingOf(a)
  // Derived from the account's own store object rather than from a list of
  // apps, so this number cannot go stale when a product is added.
  const owns = ownedCount(a)

  return (
    // Anchored on the account rather than on its place in the list: a refresh
    // that returns a shorter roster must not slide the row you were reading.
    <li data-dev-anchor={`acct-${a.user_id}`}>
      <button
        type="button"
        className="dev__row-btn"
        data-active={active || undefined}
        aria-current={active ? 'true' : undefined}
        onClick={onSelect}
      >
        <span className="dev__row-top">
          <span className="dev__row-name">
            <Highlight text={nameOf(a)} />
          </span>
          <span className="dev__row-tags">
            {a.is_admin && <Tag tone="hot">DEV</Tag>}
            {isSelf && <Tag tone="hot">YOU</Tag>}
            {standing.tone !== 'ok' && <Tag tone={standing.tone}>{standing.label.toUpperCase()}</Tag>}
          </span>
        </span>
        <span className="dev__row-mid">
          {a.username ? <Highlight text={`@${a.username}`} /> : 'no username'} ·{' '}
          {a.email ? <Highlight text={a.email} /> : 'no email'}
        </span>
        <span className="dev__row-bot">
          <Tag tone={a.core_tier === 'free' ? 'plain' : 'ok'}>CORE {a.core_tier}</Tag>
          <Tag tone={a.mak_tier === 'free' ? 'plain' : 'ok'}>MAK {a.mak_tier}</Tag>
          <Tag tone={owns ? 'ok' : 'plain'}>{owns} OWNED</Tag>
          <span className="dev__row-seen">seen {fmtRelative(a.last_sign_in_at)}</span>
        </span>
      </button>
    </li>
  )
}
