import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MODAL_LAYER, useBackdropClose, useModal } from '../lib/modal'
import * as api from './api'
import type { DevCatalog, DevFeedback } from './api'
import {
  Button,
  Check,
  CopyButton,
  Fact,
  Field,
  LedgerTag,
  Panel,
  Select,
  Tag,
  TextArea,
} from './controls'
import {
  feedbackKindTone,
  feedbackStatusTone,
  fmtDate,
  fmtRelative,
  prettyId,
  shortId,
} from './format'
import { Highlight, hay, matchesTerms, useSearch } from './search'
import { captureAnchor, holdAnchor } from './viewState'

/**
 * The Feedback tab: everything users have sent us from inside the apps, and
 * the way we answer them.
 *
 * ## Where the data comes from, and where a reply goes
 *
 * Reports arrive through `tdg_feedback_submit`, which any signed-in TDG
 * account can call from any app; this tab reads them all through
 * `tdg_admin_feedback`. A reply written here is the WHOLE send — it waits in
 * `tdg_feedback_replies` until the person's own app calls
 * `tdg_feedback_inbox()` on its next start and shows it, then acks it. That is
 * why every reply carries a delivery state: "sent" and "seen" are different
 * promises, and the one a developer actually wants to know is the second.
 *
 * ## Sorting, filtering, copying
 *
 * Every column sorts, because "newest first" answers a different question
 * than "which app is loudest" or "what is still new". The three dropdowns
 * narrow by type, app and status; the page search filters the rows like every
 * other tab. And everything copies at every grain — one field (in the report
 * dialog), one report (the button on its row, or as text/JSON from the
 * dialog), or the whole filtered list — because the destination of a bug
 * report is usually a chat with the other developer or a Claude session, and
 * retyping somebody's OS string is how a detail gets lost on the way.
 *
 * ## Why the row opens a dialog rather than a side pane
 *
 * A report is read alone: unlike an account, it has no nine sections to
 * arrange, and what you do with one — read the whole message, copy it,
 * answer it — wants width and focus. So a click opens it over the page,
 * Escape or the scrim puts you back exactly where you were, and the list
 * never reflows underneath.
 *
 * Apps are titled the way the rest of the console titles them: the shop's
 * name where it has one, the id made readable where it does not. Nothing here
 * lists which apps can send feedback — see rule 17 in AGENTS.md.
 */

/**
 * The floor under the two dropdowns and the status control, for when the
 * catalog read has not landed or did not land at all. Copy of the server's
 * order, which is also the ladder the Type and Status sorts rank by:
 * `tdg_feedback_kinds()` and `tdg_feedback_statuses()` in
 * supabase/migrations/20260823170000_user_feedback.sql are the authority, and
 * still refuse anything they do not know — this is a fallback, not a contract.
 */
const KINDS = ['bug', 'suggestion', 'question', 'praise', 'other']
const STATUSES = ['new', 'seen', 'replied', 'resolved']

/** The server's list where there is one, this build's where there is not, plus
 *  anything the rows hold that neither mentions — appended, so a value nobody
 *  has heard of sorts last instead of ahead of everything on `indexOf` → -1. */
function vocabulary(
  fromServer: string[] | undefined,
  fallback: string[],
  rows: DevFeedback[],
  of: (r: DevFeedback) => string,
): string[] {
  return [...new Set([...(fromServer?.length ? fromServer : fallback), ...rows.map(of)])]
}

type SortKey = 'at' | 'kind' | 'app' | 'app_version' | 'os' | 'who' | 'message' | 'status'
type Sort = { key: SortKey; dir: 'asc' | 'desc' }

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'at', label: 'Received' },
  { key: 'kind', label: 'Type' },
  { key: 'app', label: 'App' },
  { key: 'app_version', label: 'Version' },
  { key: 'os', label: 'OS' },
  { key: 'who', label: 'From' },
  { key: 'message', label: 'Message' },
  { key: 'status', label: 'Status' },
]

/**
 * Everything each report is about, keyed by its id, for the page search.
 *
 * Built ONCE per ledger read, in DevConsole, and handed to both the match
 * counter and this tab — so the hint and the list cannot disagree about a hit,
 * and neither of them rebuilds it while somebody is typing. A report's haystack
 * is its whole message plus every reply body, so at a full LEDGER_CAP page this
 * is megabytes of string; doing it per keystroke, twice, put that on the search
 * input's own render path.
 */
export function feedbackHaystacks(
  rows: DevFeedback[],
  appTitle: (id: string) => string,
): Map<number, string> {
  return new Map(
    rows.map((f) => [
      f.id,
      hay(
        `#${f.id}`, String(f.id),
        f.who, f.username, f.email, f.user_id,
        f.app, appTitle(f.app), f.app_version, f.os,
        f.kind, f.message, f.contact, f.status,
        f.replies.map((r) => r.body),
        f.replies.map((r) => r.by),
      ),
    ]),
  )
}

/** One report as a paste-ready block: the shape it travels to the other
 *  developer, a worklog, or a Claude session in. */
function reportText(f: DevFeedback, appTitle: string): string {
  const lines = [
    `TDG feedback #${f.id} · ${f.kind} · ${f.status}`,
    `received: ${fmtDate(f.at)} (${fmtRelative(f.at)})`,
    `from:     ${f.who}${f.username ? ` (@${f.username})` : ''}${f.email ? ` · ${f.email}` : ''}`,
    `user id:  ${f.user_id ?? 'deleted account'}`,
    `app:      ${appTitle} (${f.app})${f.app_version ? ` · v${f.app_version}` : ''}`,
    `os:       ${f.os ?? 'not sent'}`,
    `contact:  ${f.contact ?? 'none given'}`,
    'message:',
    f.message,
  ]
  for (const r of f.replies) {
    lines.push(
      `reply by ${r.by} · ${fmtDate(r.at)} · ${r.seen_at ? `seen ${fmtDate(r.seen_at)}` : 'not seen yet'}:`,
    )
    lines.push(r.body)
  }
  return lines.join('\n')
}

/**
 * Many reports, stripped to what a model can act on.
 *
 * ## What is in it, and what is deliberately not
 *
 * The point of feedback is to fix things, and the fastest route from a report
 * to a fix is pasting it into a Claude session — which is why this exists
 * beside the full text and the JSON rather than instead of them. So it carries
 * exactly what changes a review's answer: what kind of report it is, which app
 * and which version it came from, the OS, the date, and the words the person
 * wrote.
 *
 * It carries NO identity — no name, no username, no email, no user id, no
 * contact line. None of it changes what should be built, all of it is somebody
 * else's personal information, and a paste into a third-party model is exactly
 * the moment not to send it. The `#id` stays, because that is how a finding
 * gets traced back to the report on this page.
 *
 * Replies we have already sent DO go in, marked. A model proposing a fix we
 * have already promised — or contradicting an answer somebody has been given —
 * is the one failure a compact format could cause by leaving something out.
 *
 * The header names the fields, so the shape does not have to be inferred from
 * the first entry.
 */
function reviewText(list: DevFeedback[], appTitle: (id: string) => string): string {
  const head = [
    `# TDG user feedback for review · ${list.length} report${list.length === 1 ? '' : 's'}`,
    '# each entry: [#id] type · app version · os · received, then the message,',
    '# then any reply we have already sent, prefixed with >',
    '# no names, emails or account ids: this is the criticism, not the people',
  ]
  const body = list.map((f) => {
    const line = [
      `[#${f.id}] ${f.kind}`,
      `${appTitle(f.app)}${f.app_version ? ` ${f.app_version}` : ''}`,
      f.os ?? 'os not sent',
      f.at.slice(0, 10),
    ].join(' · ')
    const replies = f.replies.map((r) => `> already replied: ${r.body}`)
    return [line, f.message.trim(), ...replies].join('\n')
  })
  return [...head, '', body.join('\n\n')].join('\n')
}

type Props = {
  rows: DevFeedback[]
  state: 'loading' | 'ready' | 'error'
  catalog: DevCatalog | null
  /** Each report's search haystack, keyed by id. Built once per read by the
   *  console and shared with its match counter. See `feedbackHaystacks`. */
  hays: Map<number, string>
  /** The console's one app-naming lookup, from `appTitles`. */
  titleOf: (id: string) => string
  /** How many rows the read asked for, so "newest N loaded" names the real
   *  number rather than a second copy of it. */
  cap: number
  push: (tone: 'ok' | 'bad', text: string) => void
  /** Re-read the feedback and the overview after a write, so the list, the
   *  tab badge and the tile all say what actually landed. */
  reload: () => Promise<void>
  onOpenAccount: (userId: string) => void
}

export function FeedbackTab({
  rows,
  state,
  catalog,
  hays,
  titleOf,
  cap,
  push,
  reload,
  onOpenAccount,
}: Props) {
  const { terms } = useSearch()
  const searching = terms.length > 0

  const [kindF, setKindF] = useState('all')
  const [appF, setAppF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [sort, setSort] = useState<Sort>({ key: 'at', dir: 'desc' })
  const [openId, setOpenId] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  /**
   * Which reports are ticked.
   *
   * Kept as raw ids and NOT pruned when the filters change. Narrowing to one
   * app, ticking four, then narrowing to another and ticking three more is a
   * real way to build a set, and a selection that quietly emptied itself under
   * a filter change would make that impossible. What it costs is that some
   * ticked reports can be off screen, so every action takes the INTERSECTION
   * with what is shown and the bar says out loud when there is a difference.
   */
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set())

  /*
   * The server's vocabulary, in the server's order, with anything the rows hold
   * that it does not mention appended. Both halves matter and for different
   * reasons: the ORDER is what the Type and Status sorts rank by, so it has to
   * be the ladder ('new' before 'seen' before 'replied') and not the order
   * reports happened to arrive in; the APPENDING is what keeps a kind added
   * tomorrow filterable rather than invisible (rule 17).
   *
   * The fallback is why a fixed list is written down here at all. `catalog` is
   * null while it is in flight and stays null if that read failed, and without
   * a floor the Status control in the report dialog would offer only the
   * statuses the loaded rows happen to hold — one option, on a page of new
   * reports, with nothing on screen saying why nothing can be marked resolved.
   * These mirror `tdg_feedback_kinds()` and `tdg_feedback_statuses()`; the
   * server still refuses anything it does not know.
   */
  const kinds = useMemo(() => vocabulary(catalog?.feedback_kinds, KINDS, rows, (r) => r.kind), [catalog, rows])
  const statuses = useMemo(
    () => vocabulary(catalog?.feedback_statuses, STATUSES, rows, (r) => r.status),
    [catalog, rows],
  )
  /** Only apps that have actually sent something: this is a filter over the
   *  list, not a catalogue of what exists. */
  const appsSeen = useMemo(() => [...new Set(rows.map((r) => r.app))].sort(), [rows])

  const shown = useMemo(
    () =>
      rows
        .filter((f) => matchesTerms(hays.get(f.id) ?? '', terms))
        .filter((f) => kindF === 'all' || f.kind === kindF)
        .filter((f) => appF === 'all' || f.app === appF)
        .filter((f) => statusF === 'all' || f.status === statusF),
    [rows, hays, terms, kindF, appF, statusF],
  )

  const sorted = useMemo(() => {
    const t = (iso: string) => new Date(iso).getTime()
    const list = [...shown]
    list.sort((a, b) => {
      let r = 0
      if (sort.key === 'at') r = t(a.at) - t(b.at)
      // Ladder order, not alphabetical: 'new' before 'seen' before 'replied'
      // is what a person sorting by status is asking for.
      else if (sort.key === 'kind') r = kinds.indexOf(a.kind) - kinds.indexOf(b.kind)
      else if (sort.key === 'status') r = statuses.indexOf(a.status) - statuses.indexOf(b.status)
      else {
        const pick = (f: DevFeedback) =>
          sort.key === 'app' ? titleOf(f.app)
          : sort.key === 'who' ? f.who
          : (f[sort.key] ?? '')
        r = pick(a).localeCompare(pick(b), undefined, { sensitivity: 'base', numeric: true })
      }
      if (r === 0) r = t(b.at) - t(a.at)
      return sort.dir === 'asc' ? r : -r
    })
    return list
  }, [shown, sort, kinds, statuses, titleOf])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'at' ? 'desc' : 'asc' }))

  /* ── one write, then re-read what actually landed ─────────────────────── */

  const mutate = useCallback(
    (key: string, okMessage: string, fn: () => Promise<unknown>, after?: () => void) => {
      // Same treatment as the account writes: the list re-reads under you, and
      // a row that changes status can re-sort everything above where you were.
      const here = captureAnchor()
      setBusy(key)
      void (async () => {
        try {
          await fn()
          push('ok', okMessage)
          await reload()
          after?.()
        } catch (e) {
          push('bad', e instanceof Error ? e.message : "Something went wrong, and it didn't say what.")
        } finally {
          setBusy(null)
          holdAnchor(here, { ms: 600 })
        }
      })()
    },
    [push, reload],
  )

  /* ── opening a report ─────────────────────────────────────────────────── */

  // Which row opened it, and the focus back to that row on close, are both
  // useModal's job now — one mechanism for every dialog on the site.
  const closeReport = useCallback(() => setOpenId(null), [])

  const open = openId == null ? null : (rows.find((f) => f.id === openId) ?? null)
  // A refresh can take the open report away — somebody else deleted it. The
  // dialog must not linger over a list that no longer holds its subject.
  useEffect(() => {
    if (openId != null && !rows.some((f) => f.id === openId)) setOpenId(null)
  }, [openId, rows])

  /* ── what a bulk action acts on ───────────────────────────────────────
   *
   * The ticked reports if any are ticked, otherwise everything the filters and
   * the search have left on screen. One rule, and every button says the number
   * it is about to act on, which is what makes "Mark 37 As Read" safe to press
   * without counting the list first.
   */
  const pickedShown = useMemo(() => sorted.filter((f) => picked.has(f.id)), [sorted, picked])
  const targets = pickedShown.length ? pickedShown : sorted
  const offScreen = picked.size - pickedShown.length
  const unreadShown = useMemo(() => sorted.filter((f) => f.status === 'new'), [sorted])
  const unreadTargets = targets.filter((f) => f.status === 'new')

  const allShownPicked = sorted.length > 0 && pickedShown.length === sorted.length
  const somePicked = pickedShown.length > 0

  const toggleAllShown = () =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (allShownPicked) for (const f of sorted) next.delete(f.id)
      else for (const f of sorted) next.add(f.id)
      return next
    })

  const togglePick = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /* ── copying ──────────────────────────────────────────────────────────── */

  const copy = (kind: 'review' | 'full' | 'json') => {
    const n = targets.length
    if (!n) return
    const text =
      kind === 'json'
        ? JSON.stringify(targets, null, 2)
        : kind === 'review'
          ? reviewText(targets, titleOf)
          : targets.map((f) => reportText(f, titleOf(f.app))).join('\n\n———\n\n')
    const said =
      kind === 'json' ? 'as JSON' : kind === 'review' ? 'for review' : 'in full'
    void navigator.clipboard?.writeText(text).then(
      () => push('ok', `Copied ${n} report${n === 1 ? '' : 's'} ${said}.`),
      () => push('bad', "Couldn't reach the clipboard."),
    )
  }

  /**
   * Mark every unread report in range as read, in one write.
   *
   * `new` → `seen` and only that direction: a report that is already replied or
   * resolved is further along than read, and dragging it back would be this
   * button undoing work. The server skips anything already in the target status
   * and answers how many actually moved, so the toast is a fact rather than the
   * number of ids that were sent.
   */
  const markRead = () => {
    const ids = unreadTargets.map((f) => f.id)
    if (!ids.length) return
    const here = captureAnchor()
    setBusy('mark-read')
    void (async () => {
      try {
        const n = await api.setFeedbackStatusMany(ids, 'seen')
        push('ok', n === 0 ? 'They were already read.' : `${n} report${n === 1 ? '' : 's'} marked read.`)
        await reload()
      } catch (e) {
        push('bad', e instanceof Error ? e.message : "Something went wrong, and it didn't say what.")
      } finally {
        setBusy(null)
        holdAnchor(here, { ms: 600 })
      }
    })()
  }

  const filtered = kindF !== 'all' || appF !== 'all' || statusF !== 'all' || searching

  return (
    <div className="dev__wide">
      <div className="dev__search dev__fb-filters">
        <Select
          value={kindF}
          onChange={setKindF}
          options={[
            { value: 'all', label: 'Every Type' },
            ...kinds.map((k) => ({ value: k, label: prettyId(k) })),
          ]}
        />
        <Select
          value={appF}
          onChange={setAppF}
          options={[
            { value: 'all', label: 'Every App' },
            ...appsSeen.map((a) => ({ value: a, label: titleOf(a) })),
          ]}
        />
        <Select
          value={statusF}
          onChange={setStatusF}
          options={[
            { value: 'all', label: 'Every Status' },
            ...statuses.map((s) => ({ value: s, label: prettyId(s) })),
          ]}
        />
      </div>

      {/* ── what the buttons will act on, and the buttons ──────────────────
          One bar rather than a Copy pair in the filter row, because every one
          of these acts on the same set and the set has to be stated once, in
          front of them, in a number. A button that says `Mark 37 As Read` can
          be pressed without counting the list first; one that says `Mark All`
          cannot. */}
      <div className="dev__fb-bulk" data-picked={somePicked || undefined}>
        <div className="dev__fb-bulk-what">
          <Check
            checked={allShownPicked}
            indeterminate={somePicked && !allShownPicked}
            disabled={sorted.length === 0}
            onChange={toggleAllShown}
            label={allShownPicked ? 'Unselect every report shown' : 'Select every report shown'}
          />
          <span className="dev__fb-bulk-count">
            {somePicked ? (
              <>
                <strong>{pickedShown.length} selected</strong>
                {offScreen > 0 && (
                  // Ticked, but filtered out from under them. Saying so is the
                  // difference between a button that acts on less than you
                  // think and one you can trust.
                  <span className="dev__fb-bulk-note">
                    {' '}
                    · {offScreen} more ticked but not in this filter, and left alone
                  </span>
                )}
              </>
            ) : (
              <>
                Acting on <strong>all {sorted.length}</strong> shown
              </>
            )}
          </span>
          <Button
            onClick={() => setPicked(new Set(unreadShown.map((f) => f.id)))}
            disabled={unreadShown.length === 0}
            title="Tick every report on screen that nobody has read yet"
          >
            Select Unread ({unreadShown.length})
          </Button>
          <Button onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
            Clear
          </Button>
        </div>

        <div className="dev__fb-bulk-acts">
          <Button
            variant="primary"
            onClick={() => copy('review')}
            disabled={targets.length === 0}
            title="The type, app, version, OS, date and message of each — and any reply already sent. No names, emails or account ids. This is the one to paste into a Claude session."
          >
            Copy {targets.length} For Review
          </Button>
          <Button onClick={() => copy('full')} disabled={targets.length === 0}>
            Copy Full
          </Button>
          <Button onClick={() => copy('json')} disabled={targets.length === 0}>
            Copy JSON
          </Button>
          <Button
            onClick={markRead}
            busy={busy === 'mark-read'}
            disabled={unreadTargets.length === 0}
            title={
              unreadTargets.length === 0
                ? 'Nothing in range is still unread'
                : 'Moves them from new to seen. A report already replied or resolved is further along than read and is left alone.'
            }
          >
            Mark {unreadTargets.length} As Read
          </Button>
        </div>
      </div>

      <p className="dev__roster-count">
        {state === 'loading' && rows.length === 0
          ? 'Reading the feedback…'
          : state === 'error'
            ? "Couldn't read the feedback."
            : `${sorted.length}${filtered ? ` of ${rows.length}` : ''} report${(filtered ? rows.length : sorted.length) === 1 ? '' : 's'} · click one to read, reply and copy${rows.length >= cap ? ` · newest ${cap} loaded` : ''}`}
      </p>

      <Panel
        title="Every Feedback Report"
        what="What users sent us from inside the apps, with who they are, what they were running, and our replies. Click a report to read it whole, answer it, or copy it; a reply appears inside their app the next time they open it. The page search filters this list as you type."
        writes="tdg_feedback + tdg_feedback_replies"
        matchCount={sorted.length}
        right={<LedgerTag state={state} n={sorted.length} noun="REPORTS" />}
      >
        <div className="dev__fb-table">
          <div className="dev__fb-head">
            {/* Empty on purpose: the select-all box lives in the bar above,
                where the count it is about is written next to it. A second one
                here would be two controls for one thing. */}
            <span className="dev__fb-pickcell" aria-hidden="true" />
            <div className="dev__fb-head-main">
              {COLUMNS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="dev__fb-sort"
                  data-active={sort.key === c.key || undefined}
                  data-dir={sort.key === c.key ? sort.dir : undefined}
                  aria-label={`Sort by ${c.label}${sort.key === c.key ? (sort.dir === 'asc' ? ', ascending' : ', descending') : ''}`}
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}
                  <svg
                    className="dev__fb-sort-caret"
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              ))}
            </div>
            <span className="dev__fb-head-spacer" aria-hidden="true" />
          </div>

          <ul className="dev__fb-list">
            {sorted.map((f) => (
              <FeedbackRow
                key={f.id}
                report={f}
                appTitle={titleOf(f.app)}
                picked={picked.has(f.id)}
                onPick={() => togglePick(f.id)}
                onOpen={() => setOpenId(f.id)}
              />
            ))}
            {state !== 'error' && sorted.length === 0 && (
              <li className="dev__empty">
                {filtered
                  ? 'No report matches that.'
                  : 'Nothing yet. When somebody sends feedback from inside an app, it lands here.'}
              </li>
            )}
          </ul>
        </div>
      </Panel>

      {open && (
        <ReportDialog
          report={open}
          appTitle={titleOf(open.app)}
          statuses={statuses}
          busy={busy}
          mutate={mutate}
          push={push}
          onClose={closeReport}
          onOpenAccount={onOpenAccount}
        />
      )}
    </div>
  )
}

/* ── one row ───────────────────────────────────────────────────────────── */

function FeedbackRow({
  report: f,
  appTitle,
  picked,
  onPick,
  onOpen,
}: {
  report: DevFeedback
  appTitle: string
  picked: boolean
  onPick: () => void
  onOpen: () => void
}) {
  return (
    // Anchored on the report, so Refresh and a re-sort hold the row you were
    // reading still rather than whatever lands at its old offset.
    <li className="dev__fb-row" data-picked={picked || undefined} data-dev-anchor={`fb-${f.id}`}>
      {/* Outside the row button, not inside it: a button in a button is not
          something a browser will render, and ticking a report must never be a
          near miss on opening it. */}
      <span className="dev__fb-pickcell">
        <Check
          checked={picked}
          onChange={onPick}
          label={`Select report #${f.id} from ${f.who}`}
        />
      </span>
      <button
        type="button"
        className="dev__fb-open"
        onClick={onOpen}
        title={`Open report #${f.id} · received ${fmtDate(f.at)}`}
      >
        <span className="dev__fb-when">
          <Highlight text={fmtRelative(f.at)} />
        </span>
        <span className="dev__fb-cell">
          <Tag tone={feedbackKindTone(f.kind)}>{f.kind.toUpperCase()}</Tag>
        </span>
        <span className="dev__fb-cell dev__fb-clip">
          <Highlight text={appTitle} />
        </span>
        <span className="dev__fb-cell dev__fb-clip">
          <Highlight text={f.app_version ?? '—'} />
        </span>
        <span className="dev__fb-cell dev__fb-clip">
          <Highlight text={f.os ?? '—'} />
        </span>
        <span className="dev__fb-from">
          <span className="dev__fb-from-name">
            <Highlight text={f.who} />
            {f.contact && (
              // The one fact worth a mark at row level: they left a way to
              // reach them. The line itself is one click away.
              <Tag title={f.contact}>@</Tag>
            )}
          </span>
          <span className="dev__fb-from-id">
            {f.username ? <Highlight text={`@${f.username}`} /> : 'no username'} ·{' '}
            <Highlight text={shortId(f.user_id)} />
          </span>
        </span>
        <span className="dev__fb-msg">
          <Highlight text={f.message} />
        </span>
        <span className="dev__fb-cell">
          <Tag tone={feedbackStatusTone(f.status)}>{f.status.toUpperCase()}</Tag>
        </span>
      </button>
      <span className="dev__fb-copycell">
        <CopyButton value={reportText(f, appTitle)} label={`Copy report #${f.id}`} />
      </span>
    </li>
  )
}

/* ── one report, whole ─────────────────────────────────────────────────── */

function ReportDialog({
  report: f,
  appTitle,
  statuses,
  busy,
  mutate,
  push,
  onClose,
  onOpenAccount,
}: {
  report: DevFeedback
  appTitle: string
  statuses: string[]
  busy: string | null
  mutate: (key: string, ok: string, fn: () => Promise<unknown>, after?: () => void) => void
  push: (tone: 'ok' | 'bad', text: string) => void
  onClose: () => void
  onOpenAccount: (userId: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  // What Tab is not allowed to leave. See src/lib/modal.ts.
  const cardRef = useRef<HTMLDivElement | null>(null)

  // A different report through the same dialog is a fresh conversation.
  useEffect(() => {
    setDraft('')
    setConfirmDelete(false)
  }, [f.id])

  // The scroll lock, Escape, Tab and the focus return, counted across every
  // dialog on the page rather than owned by this one. See src/lib/modal.ts.
  // Mounted only while open, so `open` is simply true.
  useModal({
    open: true,
    onClose,
    layer: MODAL_LAYER.devReport,
    dialog: cardRef,
    focusFirst: closeRef,
  })

  // The same scrim contract the send form has: a press that STARTED and ended
  // on the backdrop. This dialog holds a reply draft, and a drag-select that
  // finishes outside the card was closing it and taking the draft with it.
  const backdrop = useBackdropClose(onClose)

  const copy = (text: string, said: string) =>
    void navigator.clipboard?.writeText(text).then(
      () => push('ok', said),
      () => push('bad', "Couldn't reach the clipboard."),
    )

  const sendReply = () =>
    mutate(
      `reply-${f.id}`,
      'Reply sent. It will be waiting the next time they open the app.',
      () => api.replyToFeedback(f.id, draft.trim()),
      () => setDraft(''),
    )

  return (
    <div className="dev__fbd-backdrop" {...backdrop}>
      <div
        ref={cardRef}
        className="dev__fbd"
        role="dialog"
        aria-modal="true"
        aria-label={`Feedback report #${f.id}`}
      >
        <header className="dev__fbd-head">
          <div className="dev__fbd-title-row">
            <h3 className="dev__fbd-title">Report #{f.id}</h3>
            <Tag tone={feedbackKindTone(f.kind)}>{f.kind.toUpperCase()}</Tag>
            <Tag tone={feedbackStatusTone(f.status)}>{f.status.toUpperCase()}</Tag>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="dev__fbd-x"
            aria-label="Close the report"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <p className="dev__fbd-sub">
          Received {fmtDate(f.at)} · {fmtRelative(f.at)}
          {f.updated_at !== f.at ? ` · last change ${fmtRelative(f.updated_at)}` : ''}
        </p>

        <div className="dev__facts">
          <Fact label="From" value={f.who} copy={f.who} />
          <Fact
            label="Username"
            value={f.username ? `@${f.username}` : 'none'}
            copy={f.username ? `@${f.username}` : undefined}
          />
          <Fact label="User id" value={f.user_id ?? 'deleted account'} copy={f.user_id ?? undefined} mono />
          <Fact label="Email" value={f.email ?? 'none'} copy={f.email ?? undefined} />
          <Fact label="App" value={`${appTitle} (${f.app})`} copy={f.app} />
          <Fact label="Version" value={f.app_version ?? 'not sent'} copy={f.app_version ?? undefined} mono />
          <Fact label="OS" value={f.os ?? 'not sent'} copy={f.os ?? undefined} />
          <Fact label="Contact" value={f.contact ?? 'none given'} copy={f.contact ?? undefined} />
        </div>

        <div className="dev__fbd-block">
          <div className="dev__fbd-block-head">
            <span className="dev__label">Message</span>
            <CopyButton value={f.message} label={`Copy the message of report #${f.id}`} />
          </div>
          <p className="dev__fbd-msg">{f.message}</p>
        </div>

        <div className="dev__fbd-block">
          <span className="dev__label">
            {f.replies.length
              ? `Replies (${f.replies.length})`
              : 'No Reply Yet'}
          </span>
          {f.replies.map((r) => (
            <div key={r.id} className="dev__fbd-reply">
              <div className="dev__fbd-reply-top">
                <strong>{r.by}</strong>
                <span className="dev__fbd-reply-when" title={fmtDate(r.at)}>
                  {fmtRelative(r.at)}
                </span>
                {r.seen_at ? (
                  <Tag tone="ok" title={fmtDate(r.seen_at)}>
                    SEEN {fmtRelative(r.seen_at).toUpperCase()}
                  </Tag>
                ) : (
                  // The fact a developer actually checks back for: has the
                  // reply reached them yet, or is it still waiting for their
                  // next launch?
                  <Tag tone="warn">NOT SEEN YET</Tag>
                )}
                <CopyButton value={r.body} label="Copy this reply" />
              </div>
              <p className="dev__fbd-reply-body">{r.body}</p>
            </div>
          ))}
        </div>

        {f.user_id ? (
          <>
            <Field
              label="Reply To Them"
              hint="Opens as a panel inside their app the next time they start it, with your name on it. They can't type back into the panel — sending new feedback is their way to answer."
            >
              <TextArea
                value={draft}
                onChange={setDraft}
                rows={3}
                maxLength={5000}
                placeholder="Thanks — this is fixed in the next update."
              />
            </Field>
            <div className="dev__row">
              <Button
                variant="primary"
                busy={busy === `reply-${f.id}`}
                disabled={!draft.trim()}
                onClick={sendReply}
              >
                Send Reply
              </Button>
            </div>
          </>
        ) : (
          <p className="dev__panel-quiet">
            This account has been deleted, so a reply has nowhere to go.
          </p>
        )}

        <hr className="dev__rule" />

        <div className="dev__fbd-actions">
          <Field label="Status" hint="Replying sets it to replied on its own.">
            <Select
              value={f.status}
              disabled={busy === `status-${f.id}`}
              onChange={(v) =>
                mutate(`status-${f.id}`, `Report #${f.id} marked ${v}.`, () =>
                  api.setFeedbackStatus(f.id, v),
                )
              }
              options={statuses.map((s) => ({ value: s, label: prettyId(s) }))}
            />
          </Field>
          <div className="dev__row dev__fbd-tools">
            <Button onClick={() => copy(reportText(f, appTitle), `Report #${f.id} copied.`)}>
              Copy Report
            </Button>
            <Button onClick={() => copy(JSON.stringify(f, null, 2), `Report #${f.id} copied as JSON.`)}>
              Copy JSON
            </Button>
            {f.user_id && <Button onClick={() => onOpenAccount(f.user_id!)}>Open Account</Button>}
          </div>
        </div>

        {confirmDelete ? (
          <div className="dev__confirm">
            <p className="dev__confirm-copy">
              This removes report #{f.id} and every reply on it, for good. A report that is dealt
              with should be marked resolved instead — deleting is for spam.
            </p>
            <div className="dev__row">
              <Button
                variant="danger"
                busy={busy === `delete-${f.id}`}
                onClick={() =>
                  mutate(`delete-${f.id}`, `Report #${f.id} deleted.`, () =>
                    api.deleteFeedback(f.id), onClose)
                }
              >
                Delete Report
              </Button>
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="dev__row">
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete Report
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
