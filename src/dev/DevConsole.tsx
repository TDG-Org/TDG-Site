import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { AccountDetail, type Run } from './AccountDetail'
import * as api from './api'
import type { DevAccount, DevAuditRow, DevCatalog, DevEvent, DevFeedback, DevOverview } from './api'
// The one read this page makes that does not live in `./api`. Badges are a
// whole TDG surface rather than a console feature — the site's footer and every
// app read the same four verbs — so the folder that owns them owns the client
// too, and this page is one of its callers. See src/badges/README.md.
import { adminBadges } from '../badges/api'
import type { AdminBadge } from '../badges/types'
import { appTitles, ownedCount, ownedTerms, storeApps, type DevStoreApp } from './apps'
import {
  LedgerTag,
  Panel,
  RefreshRail,
  SectionControls,
  Select,
  Switch,
  Tag,
  Toasts,
  useToasts,
} from './controls'
import { FeedbackTab, feedbackHaystacks } from './FeedbackTab'
import { ContentTab, useSiteContentDraft } from './ContentTab'
// The Cloud verbs live with the surface that owns them, like the badge and
// site-content clients do. See src/cloud/README.md.
import { getCloudConfig, getCloudMetrics, getRetentionReport } from '../cloud/api'
import type { CloudConfigMeta, RetentionRow } from '../cloud/api'
import { CloudTab } from './CloudTab'
import { SectionsProvider, useSections } from '../lib/sections'
import { Highlight, SearchProvider, hay, searchTerms, matchesTerms } from './search'
import { setDevMode, useDevMode } from './devMode'
import { eventKind, fmtDate, fmtRelative, fmtUsd, nameOf, standingOf } from './format'
import type { EventKind } from './format'
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

type Tab = 'accounts' | 'content' | 'cloud' | 'feedback' | 'purchases' | 'audit'

const TABS: { id: Tab; label: string; what: string }[] = [
  { id: 'accounts', label: 'Accounts', what: 'Find anyone, and change anything about them.' },
  { id: 'content', label: 'Content', what: 'What this site says about our apps, and which ones it shows.' },
  { id: 'cloud', label: 'Cloud', what: 'TDG Cloud: the launch switch, plans and prices, usage, economics and retention.' },
  { id: 'feedback', label: 'Feedback', what: 'What users sent us from inside the apps, and our replies.' },
  { id: 'purchases', label: 'Purchases', what: 'Every payment and free grant TDG has recorded.' },
  { id: 'audit', label: 'Audit Log', what: 'Every action a developer has taken, in every app.' },
]

/**
 * The Purchases ledger's other filter: not WHICH app, but what KIND of entry.
 *
 * Real money, Stripe's test mode and console grants live in the same three
 * tables, which is right — they are all things that turned an entitlement on —
 * but they are not the same question. "Did anybody buy this" and "did my test
 * card go through" want opposite halves of the same list, and reading a total
 * that quietly includes a test sale is how a project believes it has revenue it
 * has not got.
 *
 * The four options PARTITION the ledger: every entry is exactly one of real,
 * test or grant, so nothing can be unreachable from here. See `eventKind` in
 * `format.ts` for how a row is told apart.
 */
const KINDS: { id: 'all' | EventKind; label: string; what: string }[] = [
  { id: 'all', label: 'Everything', what: 'Every entry: real payments, Stripe tests and console grants.' },
  { id: 'real', label: 'Real', what: 'Live payments only. Real money, from a real card.' },
  { id: 'test', label: 'Test', what: "Stripe test mode only — tagged #test in the ledger. Nobody was charged." },
  { id: 'grant', label: 'Grants', what: 'Nobody paid: a pack switched on from this console or an app’s own tools.' },
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

  /*
   * The Content tab's whole state, held HERE rather than inside the tab.
   *
   * It is the one tab that stages its edits instead of writing them the moment
   * a control moves — see ContentTab.tsx for why a public page cannot be
   * published a keystroke at a time — so a draft has to survive a trip to
   * Accounts and back. A hook inside the tab would lose a half-written page to
   * somebody wanting to look up an email, which is the same class of loss as a
   * lost scroll position, and this console already refuses to have that one.
   */
  const content = useSiteContentDraft(push)

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

  /*
   * The open account's badges, and the sentence the server said if it refused.
   *
   * The message is kept beside the state rather than folded into it because a
   * badge read has exactly one interesting failure — `42501`, "the console is
   * limited to developer accounts" — and it is worded to be READ. A panel that
   * knew only 'error' would have to invent its own wording for the one case
   * where the server already wrote the right words.
   */
  const [badges, setBadges] = useState<AdminBadge[]>([])
  const [badgesState, setBadgesState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [badgesError, setBadgesError] = useState<string | null>(null)

  const [allEvents, setAllEvents] = useState<DevEvent[]>([])
  const [allAudit, setAllAudit] = useState<DevAuditRow[]>([])
  const [ledgerState, setLedgerState] = useState<'loading' | 'ready' | 'error'>('loading')
  /* The two Purchases filters: WHICH APP the money came from, and WHAT KIND of
   * entry it is — a live payment, a Stripe test, or a grant nobody paid for.
   * Two controls rather than one list, because they are independent questions
   * and the answers multiply: "TDG Veditor, real payments only" is the one a
   * revenue question actually asks. Neither is remembered across a reload; the
   * whole ledger is the honest thing to come back to. */
  const [source, setSource] = useState<string>('all')
  const [kind, setKind] = useState<'all' | EventKind>('all')

  const [allFeedback, setAllFeedback] = useState<DevFeedback[]>([])
  const [feedbackState, setFeedbackState] = useState<'loading' | 'ready' | 'error'>('loading')

  /* TDG Cloud's three reads: the config document the tab edits, the metrics
   * (a read with a snapshot side effect), and the retention report. Held here
   * so all three hang off the one Refresh, like everything else. */
  const [cloudConfig, setCloudConfig] = useState<CloudConfigMeta | null>(null)
  const [cloudConfigState, setCloudConfigState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [cloudMetrics, setCloudMetrics] = useState<Record<string, unknown> | null>(null)
  const [cloudMetricsState, setCloudMetricsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [cloudRetention, setCloudRetention] = useState<RetentionRow[] | null>(null)

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

  /**
   * The open account's badge switchboard: every catalogue row, held or not.
   *
   * Read here rather than inside the panel so it hangs off `readAll` with the
   * other five, which is the rule this console keeps about anything that
   * re-reads (see README, "Adding a new kind of verb"). One Refresh for the
   * whole page is the point of the rail; a panel with its own quiet fetch is a
   * second refresh button that refreshes less.
   *
   * Sequenced like the history read beside it: click three accounts quickly
   * and only the last answer may land.
   */
  const badgesSeq = useRef(0)
  const loadBadges = useCallback(async (id: string | null) => {
    if (!id) return false
    const seq = ++badgesSeq.current
    setBadgesState('loading')
    try {
      const list = await adminBadges(id)
      if (seq !== badgesSeq.current) return false
      setBadges(list)
      setBadgesError(null)
      setBadgesState('ready')
      return true
    } catch (e) {
      if (seq === badgesSeq.current) {
        // The server's own sentence, kept whole. `adminBadges` has already
        // stripped the `tdg: ` log prefix and told a refusal apart from a
        // request that never landed; there is nothing left here to improve.
        setBadgesError(message(e))
        setBadgesState('error')
      }
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

  /** The whole feedback ledger, like the two above: read once, filtered in
   *  memory, so the tab is already populated by the time it is clicked. */
  const feedbackSeq = useRef(0)
  const loadFeedback = useCallback(async () => {
    const seq = ++feedbackSeq.current
    setFeedbackState('loading')
    try {
      const list = await api.getFeedback(null, LEDGER_CAP)
      if (seq !== feedbackSeq.current) return false
      setAllFeedback(list)
      setFeedbackState('ready')
      return true
    } catch {
      if (seq === feedbackSeq.current) setFeedbackState('error')
      return false
    }
  }, [])

  const cloudSeq = useRef(0)
  const loadCloud = useCallback(async () => {
    const seq = ++cloudSeq.current
    setCloudConfigState((s) => (s === 'ready' ? s : 'loading'))
    setCloudMetricsState((s) => (s === 'ready' ? s : 'loading'))
    try {
      const [cfg, metrics, retention] = await Promise.all([
        getCloudConfig(),
        getCloudMetrics(),
        getRetentionReport(),
      ])
      if (seq !== cloudSeq.current) return false
      setCloudConfig(cfg)
      setCloudConfigState('ready')
      setCloudMetrics(metrics)
      setCloudMetricsState('ready')
      setCloudRetention(retention)
      return true
    } catch {
      if (seq === cloudSeq.current) {
        setCloudConfigState((s) => (s === 'ready' ? s : 'error'))
        setCloudMetricsState((s) => (s === 'ready' ? s : 'error'))
      }
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
      const reads: Promise<boolean>[] = [
        loadOverview(),
        loadCatalog(),
        loadLedger(),
        loadFeedback(),
        loadCloud(),
        // The published site content, on the same Refresh as everything else.
        // A panel with its own quiet fetch is a second refresh button that
        // refreshes less; see README, "Adding a new kind of verb".
        content.reload(),
      ]
      if (scope === 'again') {
        reads.push(loadRoster(query), loadHistory(selectedId), loadBadges(selectedId))
      }
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
    [
      loadOverview,
      loadCatalog,
      loadLedger,
      loadFeedback,
      loadCloud,
      content.reload,
      loadRoster,
      loadHistory,
      loadBadges,
      query,
      selectedId,
    ],
  )

  const refresh = useCallback(() => {
    void readAll('again')
  }, [readAll])

  /** After a feedback write: the list, the tab badge and the overview tile all
   *  re-read, so none of the three can claim a report is still new. */
  const reloadFeedback = useCallback(async () => {
    const landed = await Promise.all([loadFeedback(), loadOverview()])
    if (landed.some(Boolean)) setReadAt(Date.now())
  }, [loadFeedback, loadOverview])

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

  /** And its badges, which are per account for the same reason. */
  useEffect(() => {
    void loadBadges(selectedId)
  }, [selectedId, loadBadges])

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
            // Both, after EVERY write, not only after a badge write.
            //
            // Two of the badges are derived: Developer follows
            // `profiles.is_admin` and Subscriber follows the account's tier,
            // and both of those facts are owned by OTHER panels on this page.
            // Re-reading badges only when a badge switch was pressed would
            // mean granting Developer two panels up leaves the Badges panel
            // printing "not held" about the flag that had just been set —
            // which is the stale second opinion the derived design exists to
            // make impossible. One extra round trip per write, on a page two
            // people use, is the whole cost of never showing that.
            await Promise.all([loadHistory(id), loadBadges(id)])
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
    [selectedId, push, loadOverview, loadHistory, loadBadges],
  )

  /* ── selecting on a narrow screen should show the thing you selected ──── */

  const select = (id: string) => {
    setSelectedId(id)
    if (window.matchMedia('(max-width: 1040px)').matches) {
      // The detail renders below the roster there, and a click that changes
      // something 800px off-screen reads as a click that did nothing.
      //
      // One frame, and only one. `setSelectedId` above has not reached the DOM
      // yet — React commits in a microtask — so scrolling now aims at the
      // placeholder's height rather than at the account that is about to
      // replace it. This waits for the commit; it does not animate anything.
      // The smooth part is `scrollIntoView`'s, which is the browser's own.
      //
      // Rule 9's loop is the wrong instrument twice over: `onFrame` would have
      // to be subscribed and unsubscribed around a single frame, and
      // subscribing is what permanently wires that loop's eight wake listeners
      // onto a page that otherwise has none (see viewState.ts's holdAnchor for
      // the same trade). A `useEffect` on `selectedId` is the other candidate
      // and is worse here: it would also fire for the account the session
      // restore selects on boot, and scroll the reader away from the place
      // `useRestoreView` is at that moment putting them back to.
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

  /** The ledger with the app filter and the page search applied, but NOT the
   *  kind filter — so the kind buttons can say how many of each are in front of
   *  you before you press one, and pressing one can never hide a number it just
   *  claimed. */
  const eventsInScope = useMemo(
    () =>
      allEvents
        .filter((e) => source === 'all' || e.source === source)
        .filter((e) => {
          const k = eventKind(e)
          return matchesTerms(
            hay(
              e.who, e.source, e.event_type, e.item, e.currency, e.event_id, e.user_id,
              e.amount_cents == null ? '' : fmtUsd(e.amount_cents),
              // The words somebody would type for the kind, so the filter and
              // the search agree about what a row is.
              k === 'grant'
                ? 'granted free grant'
                : k === 'test'
                  ? 'test sandbox stripe payment'
                  : 'paid real live stripe payment',
            ),
            terms,
          )
        }),
    [allEvents, source, terms],
  )

  /** How many real payments, test payments and grants are in scope, and what
   *  the real ones came to. The money total is the reason the split exists:
   *  test rows carry amounts, so a ledger that mixes them reports takings that
   *  were never taken. */
  const kindTally = useMemo(() => {
    const n = { all: eventsInScope.length, real: 0, test: 0, grant: 0 }
    let realCents = 0
    for (const e of eventsInScope) {
      const k = eventKind(e)
      n[k] += 1
      if (k === 'real') realCents += e.amount_cents ?? 0
    }
    return { ...n, realCents }
  }, [eventsInScope])

  const shownEvents = useMemo(
    () => (kind === 'all' ? eventsInScope : eventsInScope.filter((e) => eventKind(e) === kind)),
    [eventsInScope, kind],
  )

  const shownAudit = useMemo(
    () =>
      allAudit.filter((r) =>
        matchesTerms(hay(r.app, r.action, r.detail, r.actor_name, r.target_name), terms),
      ),
    [allAudit, terms],
  )

  /** The one app-naming lookup this page uses, everywhere. See `appTitles`. */
  const appTitle = useMemo(() => appTitles(stores), [stores])

  /*
   * Every report's search haystack, built once per read and handed to the tab
   * as well — so the hint and the tab cannot disagree about what matches, and
   * neither of them rebuilds a thousand reports' worth of text on the search
   * input's render path. Depends on the ROWS, not on the terms.
   */
  const feedbackHays = useMemo(
    () => feedbackHaystacks(allFeedback, appTitle),
    [allFeedback, appTitle],
  )

  /* Counted here only for the toolbar hint; the tab filters and sorts its own
   * copy, from the same haystacks. */
  const shownFeedback = useMemo(
    () => allFeedback.filter((f) => matchesTerms(feedbackHays.get(f.id) ?? '', terms)),
    [allFeedback, feedbackHays, terms],
  )

  /** Reports nobody has looked at, for the badge on the tab itself: a report
   *  waiting behind an unopened tab is a report nobody knows about.
   *
   *  From the OVERVIEW, which counts the whole table server-side, not from the
   *  loaded rows. The read is capped at LEDGER_CAP, so past that a report still
   *  marked 'new' can sit outside the page — and a badge counting only what is
   *  in front of it would then disagree with the tile directly above it about
   *  how many are waiting. Both now come from the same number. Zero while the
   *  overview is in flight, which shows no badge rather than a wrong one. */
  const feedbackNew = overview?.feedback_new ?? 0

  /* ── keeping the page you were reading ────────────────────────────────
   *
   * The restore runs first and the saving waits for it: writing the view while
   * the page is still assembling itself would record the top of a page it has
   * not finished arriving at, and that is the record the NEXT reload would use.
   */
  const { openIds } = useSections()
  const restored = useRestoreView(saved?.anchor ?? null)
  useRememberView({ tab, selectedId, query, open: openIds }, restored)

  /**
   * Where the matches are, on the tabs themselves.
   *
   * The toolbar used to carry a second row of section buttons — one per tab,
   * each with its count, each going to that tab. The tab strip below it already
   * did the going, so the buttons went and the COUNTS stayed: while a search is
   * running every tab wears its own number, which is the fact the sentence
   * "12 matches across the sections below" could never tell you.
   *
   * Content and Cloud are `null` on purpose. Content filters its own panels as
   * you type and Cloud is settings and figures rather than a filterable list,
   * so neither has an honest number to show ahead of time; a zero would be a
   * claim rather than an absence, and they draw a dot instead. Keyed by Tab so
   * a tab added later cannot be left without an answer here.
   */
  const sectionCounts: Record<Tab, number | null> = {
    accounts: shownRows.length,
    content: null,
    cloud: null,
    feedback: shownFeedback.length,
    purchases: shownEvents.length,
    audit: shownAudit.length,
  }

  /** What the toolbar says while a search is running, across every tab. */
  const searchHint = (() => {
    if (!searching) return null
    const total =
      shownRows.length + shownFeedback.length + shownEvents.length + shownAudit.length
    return total ? `${total} match${total === 1 ? '' : 'es'} across the sections below` : 'Nothing matches that'
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

          <BuildStamp />

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
              <span className="dev__tab-top">
                <span className="dev__tab-label">{t.label}</span>
                {/* While a search is running, how many of ITS rows match. This
                    is what the toolbar's old "Search in" row was for; the tab
                    was always the thing you pressed afterwards, so the number
                    lives on the tab now. A dot means "this section filters
                    itself as you type and cannot say ahead of time". */}
                {searching && (
                  <Tag
                    tone={sectionCounts[t.id] ? 'ok' : 'plain'}
                    title={
                      sectionCounts[t.id] === null
                        ? `${t.label} filters its own panels as you type, so it has no count to show ahead of time`
                        : `${sectionCounts[t.id]} match${sectionCounts[t.id] === 1 ? '' : 'es'} in ${t.label}`
                    }
                  >
                    {sectionCounts[t.id] === null ? '·' : sectionCounts[t.id]}
                  </Tag>
                )}
                {/* A report waiting behind an unopened tab is a report nobody
                    knows about, so the tab itself says when there is one. */}
                {t.id === 'feedback' && feedbackNew > 0 && (
                  <Tag tone="warn">{feedbackNew} NEW</Tag>
                )}
                {/* Content is the one tab that can be left holding unpublished
                    work, so it is the one tab that has to say so from outside
                    itself: an edit waiting behind a tab nobody opened is an
                    edit that never reaches the site. */}
                {t.id === 'content' && content.dirty && (
                  <Tag tone="warn">{content.edits} UNSAVED</Tag>
                )}
                {/* The one flag that changes what the Store sells. LIVE has to
                    be visible from every tab, not only inside this one. */}
                {t.id === 'cloud' &&
                  (cloudConfig?.doc as { availability?: { available?: boolean } } | undefined)
                    ?.availability?.available === true && <Tag tone="warn">LIVE</Tag>}
              </span>
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
                  badges={badges}
                  badgesState={badgesState}
                  badgesError={badgesError}
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

        {tab === 'content' && <ContentTab c={content} />}

        {tab === 'cloud' && (
          <CloudTab
            config={cloudConfig}
            configState={cloudConfigState}
            metrics={cloudMetrics}
            metricsState={cloudMetricsState}
            retention={cloudRetention}
            push={push}
            onSaved={() => void loadCloud()}
          />
        )}

        {tab === 'feedback' && (
          <FeedbackTab
            rows={allFeedback}
            state={feedbackState}
            catalog={catalog}
            hays={feedbackHays}
            titleOf={appTitle}
            cap={LEDGER_CAP}
            push={push}
            reload={reloadFeedback}
            onOpenAccount={(id) => {
              // Open them; do not filter the page down to their id. Same rule
              // as the Purchases ledger's name links.
              setTab('accounts')
              setQuery('')
              setSelectedId(id)
            }}
          />
        )}

        {tab === 'purchases' && (
          <div className="dev__wide">
            <div className="dev__ledger-filters">
              {/* One option per app the console found, plus Makullveny, whose
                  ledger is tier-shaped rather than pack-shaped and so is not a
                  discovered Store. A filter that omits an app is a filter that
                  hides its money, so this list is never typed out. */}
              <Select
                value={source}
                onChange={setSource}
                ariaLabel="Which app's ledger to show"
                options={[
                  { value: 'all', label: 'Every app' },
                  ...stores
                    .filter((s) => s.onServer)
                    .map((s) => ({ value: s.id, label: s.title })),
                  { value: 'makullveny', label: 'Makullveny' },
                ]}
              />
              {/* Real money, Stripe's test mode, and grants nobody paid for,
                  as four buttons that partition the whole ledger: every entry
                  is in exactly one of the three, so this can hide a row from
                  you but never from itself. The counts are of what is in scope
                  RIGHT NOW — after the app filter and the page search — so a
                  button never promises rows the next click cannot show. */}
              <div className="dev__kinds" role="group" aria-label="Which kind of entry to show">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    className="dev__kind"
                    data-active={kind === k.id || undefined}
                    data-empty={kindTally[k.id] === 0 || undefined}
                    aria-pressed={kind === k.id}
                    title={k.what}
                    onClick={() => setKind(k.id)}
                  >
                    {k.label}
                    <span className="dev__kind-n">{kindTally[k.id]}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="dev__roster-count">
              {ledgerState === 'loading' && allEvents.length === 0
                ? 'Reading the ledger…'
                : ledgerState === 'error'
                  ? "Couldn't read the ledger."
                  : `${shownEvents.length}${shownEvents.length === allEvents.length ? '' : ` of ${allEvents.length}`} entr${shownEvents.length === 1 ? 'y' : 'ies'} · ${fmtUsd(kindTally.realCents)} real${kindTally.test ? ` · ${kindTally.test} test entr${kindTally.test === 1 ? 'y' : 'ies'} counted in no total` : ''}${allEvents.length >= LEDGER_CAP ? ` · newest ${LEDGER_CAP} loaded` : ''}`}
            </p>
            <Panel
              title="Every Payment And Grant"
              what="All three Stripe ledgers merged, newest first. PAID is real money, TEST is Stripe test mode and nobody was charged, GRANTED is somebody switching a pack on from this console. The two filters above narrow by app and by kind; the page search filters this list as you type — try a pack id, an amount, or who bought it."
              writes="veditor_purchase_events + devfleet_purchase_events + mak_subscription_events"
              matchCount={shownEvents.length}
              right={<LedgerTag state={ledgerState} n={shownEvents.length} noun="ENTRIES" />}
            >
            <ul className="dev__log dev__log--wide">
              {shownEvents.map((e) => {
                /* The row says which of the three it is in words, so a test
                   sale is never a PAID row you have to read an event id to
                   doubt. Filtering to one kind does not make the tag redundant:
                   the default view is all three at once. */
                const k = eventKind(e)
                return (
                <li key={e.event_id} className="dev__log-row">
                  <span className="dev__log-when" title={fmtDate(e.at)}>
                    {fmtRelative(e.at)}
                  </span>
                  <Tag
                    tone={k === 'grant' ? 'warn' : k === 'test' ? 'plain' : 'ok'}
                    title={KINDS.find((o) => o.id === k)?.what}
                  >
                    {k === 'grant' ? 'GRANTED' : k === 'test' ? 'TEST' : 'PAID'}
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
                  <span
                    className="dev__log-amount"
                    data-quiet={k === 'test' || undefined}
                    title={k === 'test' ? 'Stripe test mode: this money was never taken.' : undefined}
                  >
                    <Highlight text={fmtUsd(e.amount_cents)} />
                  </span>
                </li>
                )
              })}
              {ledgerState !== 'error' && shownEvents.length === 0 && (
                <li className="dev__empty">
                  {searching || source !== 'all' || kind !== 'all'
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

/* ── the numbers ───────────────────────────────────────────────────────── */

/**
 * The numbers across the top.
 *
 * The fixed ones are written out; the per-app ones are not. `store_owners`
 * arrives keyed by app id — one key per app the server found — so a product
 * that ships tomorrow has a tile here the same day, named from the shop if the
 * shop knows it and from its own id if not.
 */
/**
 * Which build you are actually looking at.
 *
 * Push to main deploys, GitHub Pages caches index.html, and a tab left open
 * never asks again — so this page can be running a bundle that disagrees with
 * the database it is talking to and look entirely normal doing it. That
 * happened, and it cost most of a day, because there was no way to ask the page
 * which build it was: loading the same URL in another browser proved nothing
 * about what THIS one had loaded.
 *
 * The time is here as well as the version because the version only answers if
 * somebody remembered to bump it (AGENTS.md §6), and the case worth catching is
 * the one where a rule got skipped. It reads both ways on purpose: the stamp to
 * compare against package.json and the deploy log, the age to notice at a
 * glance that a page has been open since yesterday.
 *
 * Deliberately quiet. The live-project warning below is the loud thing on this
 * page and has to stay the loudest, so this is mono at the size the roster
 * counts use, and it is a fact rather than a notice.
 */
function BuildStamp() {
  /*
   * The age has to keep up on its own, and this is the whole reason there is a
   * component here rather than a paragraph in the header.
   *
   * `fmtRelative` reads the clock when it is CALLED, and React does not
   * re-render a page nobody is touching — so the line was frozen at whatever it
   * said when the console last happened to render. A tab left open since
   * yesterday went on reading "just now", which is exactly the tab this line
   * exists to make somebody reload.
   *
   * One minute, because that is the resolution of the wording: `fmtRelative`
   * rounds to whole minutes below an hour, so a faster tick repaints an
   * identical string. Rule 9 sends animation through the shared frame loop —
   * this is a clock, not animation, and holding that loop awake at 60 Hz to
   * change a number once a minute is the waste the rule is there to prevent.
   * Same call as the feedback form's countdown; see FeedbackDialog.
   */
  const [, retick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => retick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <p className="dev__build">
      <span className="dev__build-label">Build</span>
      <code className="dev__code">{__TDG_SITE_VERSION__}</code>
      <span className="dev__build-when">
        {fmtDate(__TDG_SITE_BUILT_AT__)} · {fmtRelative(__TDG_SITE_BUILT_AT__)}
      </span>
    </p>
  )
}

function Overview({ overview: o, stores }: { overview: DevOverview | null; stores: DevStoreApp[] }) {
  // Its title if the site sells it, its id made readable if this is the first
  // the shop has heard of it. An app is never shown as a bare key.
  const titleOf = appTitles(stores)

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
        {
          label: 'Feedback',
          value: String(o.feedback_new),
          what: 'new reports waiting',
          tone: o.feedback_new ? 'warn' : undefined,
        },
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
            // reflow when the real numbers land: ten fixed, plus one per app.
            // Every app, not only the ones confirmed on the server — this
            // branch runs while the catalog is still in flight, when the shop's
            // list is the only count available and is the right guess.
            Array.from({ length: 10 + stores.length }, (_, i) => (
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
