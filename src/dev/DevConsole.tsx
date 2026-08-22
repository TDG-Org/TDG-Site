import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { AccountDetail, type Run } from './AccountDetail'
import * as api from './api'
import type { DevAccount, DevAuditRow, DevCatalog, DevEvent, DevOverview } from './api'
import {
  Button,
  Panel,
  SectionControls,
  Select,
  Switch,
  Tag,
  TextInput,
  Toasts,
  useToasts,
} from './controls'
import { SectionsProvider } from '../lib/sections'
import { setDevMode, useDevMode } from './devMode'
import { fmtDate, fmtRelative, fmtUsd, nameOf, standingOf } from './format'
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
 */
export default function DevConsole() {
  return (
    <SectionsProvider>
      <DevConsoleBody />
    </SectionsProvider>
  )
}

function DevConsoleBody() {
  const { user, profile } = useAuth()
  const devMode = useDevMode()
  const { toasts, push, dismiss } = useToasts()

  const [tab, setTab] = useState<Tab>('accounts')
  const [overview, setOverview] = useState<DevOverview | null>(null)
  const [catalog, setCatalog] = useState<DevCatalog | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<DevAccount[]>([])
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [events, setEvents] = useState<DevEvent[]>([])
  const [audit, setAudit] = useState<DevAuditRow[]>([])
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading')

  const [allEvents, setAllEvents] = useState<DevEvent[]>([])
  const [allAudit, setAllAudit] = useState<DevAuditRow[]>([])
  const [ledgerState, setLedgerState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [auditQuery, setAuditQuery] = useState('')
  const [source, setSource] = useState<'all' | DevEvent['source']>('all')

  const [busy, setBusy] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)

  const meId = user?.id ?? ''
  const selected = useMemo(
    () => rows.find((r) => r.user_id === selectedId) ?? null,
    [rows, selectedId],
  )

  const message = (e: unknown) =>
    e instanceof Error ? e.message : "Something went wrong, and it didn't say what."

  /* ── boot: the numbers and the dropdown lists ─────────────────────────── */

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api.getOverview())
    } catch (e) {
      setBootError(message(e))
    }
  }, [])

  useEffect(() => {
    void loadOverview()
    api.getCatalog().then(setCatalog, (e) => setBootError(message(e)))
  }, [loadOverview])

  /* ── the roster, debounced ────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false
    setListState('loading')
    // 250ms: long enough that typing a username is one query rather than eight,
    // short enough that it still feels like the list is following you.
    const timer = window.setTimeout(() => {
      api.searchAccounts(query.trim()).then(
        (list) => {
          if (cancelled) return
          setRows(list)
          setListState('ready')
        },
        () => {
          if (!cancelled) setListState('error')
        },
      )
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  /* ── the selected account's own history ───────────────────────────────── */

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setHistoryState('loading')
    Promise.all([api.getEvents(selectedId, 100), api.getAudit(selectedId, '', 100)]).then(
      ([e, a]) => {
        if (cancelled) return
        setEvents(e)
        setAudit(a)
        setHistoryState('ready')
      },
      () => {
        if (!cancelled) setHistoryState('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [selectedId])

  /* ── the whole-project ledger, for the other two tabs ─────────────────── */

  const loadLedger = useCallback((q: string) => {
    setLedgerState('loading')
    Promise.all([api.getEvents(null, 300), api.getAudit(null, q, 300)]).then(
      ([e, a]) => {
        setAllEvents(e)
        setAllAudit(a)
        setLedgerState('ready')
      },
      () => setLedgerState('error'),
    )
  }, [])

  useEffect(() => {
    if (tab === 'accounts') return
    const timer = window.setTimeout(() => loadLedger(auditQuery.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [tab, auditQuery, loadLedger])

  /* ── one write, then re-read what actually landed ─────────────────────── */

  const run: Run = useCallback(
    (key, okMessage, fn) => {
      const id = selectedId
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
            const [e, a] = await Promise.all([
              api.getEvents(id, 100),
              api.getAudit(id, '', 100),
            ])
            setEvents(e)
            setAudit(a)
          }
          void loadOverview()
        } catch (e) {
          push('bad', message(e))
        } finally {
          setBusy(null)
        }
      })()
    },
    [selectedId, push, loadOverview],
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

  const shownEvents = allEvents.filter((e) => source === 'all' || e.source === source)

  return (
    <section id="top" className="section section--flat dev">
      <div className="texture dev__grid" aria-hidden="true" />

      <div className="shell dev__shell">
        <header className="dev__head">
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

        <SectionControls />

        <Overview overview={overview} />

        <nav className="dev__tabs" aria-label="Developer sections">
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
              <div className="dev__search">
                <TextInput
                  type="search"
                  value={query}
                  onChange={setQuery}
                  placeholder="Name, @username, email or user id"
                />
                <Button onClick={() => setQuery((q) => q)} title="Re-read the list">
                  Refresh
                </Button>
              </div>
              <p className="dev__roster-count">
                {listState === 'loading'
                  ? 'Looking…'
                  : listState === 'error'
                    ? "Couldn't read the accounts."
                    : `${rows.length} account${rows.length === 1 ? '' : 's'}${query.trim() ? ' matching' : ''}`}
              </p>

              <ul className="dev__list">
                {rows.map((r) => (
                  <RosterRow
                    key={r.user_id}
                    account={r}
                    active={r.user_id === selectedId}
                    isSelf={r.user_id === meId}
                    onSelect={() => select(r.user_id)}
                  />
                ))}
                {listState === 'ready' && rows.length === 0 && (
                  <li className="dev__empty">Nothing matches that.</li>
                )}
              </ul>
            </div>

            <div className="dev__pane" ref={detailRef}>
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
              <Select
                value={source}
                onChange={(v) => setSource(v as typeof source)}
                options={[
                  { value: 'all', label: 'Every app' },
                  { value: 'veditor', label: 'TDG Veditor' },
                  { value: 'devfleet', label: 'DevFleet' },
                  { value: 'makullveny', label: 'Makullveny' },
                ]}
              />
              <Button onClick={() => loadLedger(auditQuery.trim())}>Refresh</Button>
            </div>
            <p className="dev__roster-count">
              {ledgerState === 'loading'
                ? 'Reading the ledger…'
                : ledgerState === 'error'
                  ? "Couldn't read the ledger."
                  : `${shownEvents.length} entr${shownEvents.length === 1 ? 'y' : 'ies'} · PAID came from Stripe, GRANTED came from this console`}
            </p>
            <Panel
              title="Every Payment And Grant"
              what="All three Stripe ledgers merged, newest first. PAID is a real payment; GRANTED is somebody switching a pack on from this console."
              writes="veditor_purchase_events + devfleet_purchase_events + mak_subscription_events"
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
                        onClick={() => {
                          setTab('accounts')
                          setQuery(e.user_id ?? '')
                          setSelectedId(e.user_id)
                        }}
                      >
                        {e.who}
                      </button>
                    ) : (
                      <span className="dev__panel-quiet">nobody (account deleted)</span>
                    )}
                  </span>
                  <span className="dev__log-what">
                    <code className="dev__code">{e.event_type}</code>
                    {e.item ? ` · ${e.item}` : ''}
                  </span>
                  <span className="dev__log-amount">{fmtUsd(e.amount_cents)}</span>
                </li>
              ))}
              {ledgerState === 'ready' && shownEvents.length === 0 && (
                <li className="dev__empty">Nothing recorded yet.</li>
              )}
            </ul>
            </Panel>
          </div>
        )}

        {tab === 'audit' && (
          <div className="dev__wide">
            <div className="dev__search">
              <TextInput
                type="search"
                value={auditQuery}
                onChange={setAuditQuery}
                placeholder="Action, reason, app or a person's name"
              />
              <Button onClick={() => loadLedger(auditQuery.trim())}>Refresh</Button>
            </div>
            <p className="dev__roster-count">
              {ledgerState === 'loading'
                ? 'Reading the log…'
                : ledgerState === 'error'
                  ? "Couldn't read the log."
                  : `${allAudit.length} action${allAudit.length === 1 ? '' : 's'} · tdg-core is this console, the rest are each app's own tools`}
            </p>
            <Panel
              title="Every Developer Action"
              what="Moderation and permission changes from every TDG app, newest first. Rows tagged tdg-core came from this console; the rest came from an app's own tools."
              writes="bea_moderation_audit"
              right={<LedgerTag state={ledgerState} n={allAudit.length} noun="ACTIONS" />}
            >
            <ul className="dev__log dev__log--wide">
              {allAudit.map((r) => (
                <li key={r.id} className="dev__log-row">
                  <span className="dev__log-when" title={fmtDate(r.at)}>
                    {fmtRelative(r.at)}
                  </span>
                  <Tag tone={r.app === 'tdg-core' ? 'hot' : 'plain'}>{r.app}</Tag>
                  <span className="dev__log-who">{r.target_name}</span>
                  <span className="dev__log-what">
                    <strong>{r.action}</strong>
                    {r.detail ? ` · ${r.detail}` : ''}
                  </span>
                  <span className="dev__log-amount">by {r.actor_name}</span>
                </li>
              ))}
              {ledgerState === 'ready' && allAudit.length === 0 && (
                <li className="dev__empty">No developer has done anything yet.</li>
              )}
            </ul>
            </Panel>
          </div>
        )}
      </div>

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

function Overview({ overview: o }: { overview: DevOverview | null }) {
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
        { label: 'Veditor', value: String(o.veditor_owners), what: 'own a Veditor pack' },
        { label: 'DevFleet', value: String(o.devfleet_owners), what: 'own a DevFleet pack' },
        { label: 'Taken', value: fmtUsd(o.gross_cents), what: 'across every ledger' },
      ]
    : []

  return (
    <Panel
      title="Overview"
      what="The whole project in numbers, re-read after every change you make below."
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
          : Array.from({ length: 11 }, (_, i) => (
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
  const owns =
    a.veditor_packs.length + a.devfleet_packs.length + a.mak_themes.length +
    (a.mak_candle_purchased_at ? 1 : 0)

  return (
    <li>
      <button
        type="button"
        className="dev__row-btn"
        data-active={active || undefined}
        aria-current={active ? 'true' : undefined}
        onClick={onSelect}
      >
        <span className="dev__row-top">
          <span className="dev__row-name">{nameOf(a)}</span>
          <span className="dev__row-tags">
            {a.is_admin && <Tag tone="hot">DEV</Tag>}
            {isSelf && <Tag tone="hot">YOU</Tag>}
            {standing.tone !== 'ok' && <Tag tone={standing.tone}>{standing.label.toUpperCase()}</Tag>}
          </span>
        </span>
        <span className="dev__row-mid">
          {a.username ? `@${a.username}` : 'no username'} · {a.email ?? 'no email'}
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
