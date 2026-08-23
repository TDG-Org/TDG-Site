import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import type { DevCatalog, DevFeedback } from './api'
import type { DevStoreApp } from './apps'
import {
  Button,
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

const FEEDBACK_CAP = 1000

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

/** Everything a report is about, for the page search. Shared with DevConsole's
 *  match counter so the hint and the tab can never disagree about a hit. */
export function feedbackHay(f: DevFeedback, appTitle: string): string {
  return hay(
    `#${f.id}`, String(f.id),
    f.who, f.username, f.email, f.user_id,
    f.app, appTitle, f.app_version, f.os,
    f.kind, f.message, f.contact, f.status,
    f.replies.map((r) => r.body),
    f.replies.map((r) => r.by),
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

type Props = {
  rows: DevFeedback[]
  state: 'loading' | 'ready' | 'error'
  catalog: DevCatalog | null
  stores: DevStoreApp[]
  push: (tone: 'ok' | 'bad', text: string) => void
  /** Re-read the feedback and the overview after a write, so the list, the
   *  tab badge and the tile all say what actually landed. */
  reload: () => Promise<void>
  onOpenAccount: (userId: string) => void
}

export function FeedbackTab({ rows, state, catalog, stores, push, reload, onOpenAccount }: Props) {
  const { terms } = useSearch()
  const searching = terms.length > 0

  const [kindF, setKindF] = useState('all')
  const [appF, setAppF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [sort, setSort] = useState<Sort>({ key: 'at', dir: 'desc' })
  const [openId, setOpenId] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const titleOf = useCallback(
    (id: string) => stores.find((s) => s.id === id)?.title ?? prettyId(id),
    [stores],
  )

  /*
   * The dropdowns offer the server's vocabulary UNIONED with whatever the rows
   * actually hold, so a kind added on the server tomorrow — or a status this
   * build has never heard of — is still filterable rather than invisible. A
   * filter that omits a value silently hides those reports; see rule 17.
   */
  const kinds = useMemo(
    () => [...new Set([...(catalog?.feedback_kinds ?? []), ...rows.map((r) => r.kind)])],
    [catalog, rows],
  )
  const statuses = useMemo(
    () => [...new Set([...(catalog?.feedback_statuses ?? []), ...rows.map((r) => r.status)])],
    [catalog, rows],
  )
  /** Only apps that have actually sent something: this is a filter over the
   *  list, not a catalogue of what exists. */
  const appsSeen = useMemo(() => [...new Set(rows.map((r) => r.app))].sort(), [rows])

  const shown = useMemo(
    () =>
      rows
        .filter((f) => matchesTerms(feedbackHay(f, titleOf(f.app)), terms))
        .filter((f) => kindF === 'all' || f.kind === kindF)
        .filter((f) => appF === 'all' || f.app === appF)
        .filter((f) => statusF === 'all' || f.status === statusF),
    [rows, terms, kindF, appF, statusF, titleOf],
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

  /* ── opening a report, and giving the focus back ──────────────────────── */

  const lastFocus = useRef<HTMLElement | null>(null)
  const openReport = (id: number) => {
    lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpenId(id)
  }
  const closeReport = useCallback(() => {
    setOpenId(null)
    const back = lastFocus.current
    if (back && back.isConnected) back.focus()
  }, [])

  const open = openId == null ? null : (rows.find((f) => f.id === openId) ?? null)
  // A refresh can take the open report away — somebody else deleted it. The
  // dialog must not linger over a list that no longer holds its subject.
  useEffect(() => {
    if (openId != null && !rows.some((f) => f.id === openId)) setOpenId(null)
  }, [openId, rows])

  /* ── copying the whole filtered list ──────────────────────────────────── */

  const copyAll = (asJson: boolean) => {
    const text = asJson
      ? JSON.stringify(sorted, null, 2)
      : sorted.map((f) => reportText(f, titleOf(f.app))).join('\n\n———\n\n')
    void navigator.clipboard?.writeText(text).then(
      () => push('ok', `Copied ${sorted.length} report${sorted.length === 1 ? '' : 's'}${asJson ? ' as JSON' : ''}.`),
      () => push('bad', "Couldn't reach the clipboard."),
    )
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
        <span className="dev__fb-copyall">
          <Button onClick={() => copyAll(false)} disabled={sorted.length === 0}>
            Copy All
          </Button>
          <Button onClick={() => copyAll(true)} disabled={sorted.length === 0}>
            Copy JSON
          </Button>
        </span>
      </div>

      <p className="dev__roster-count">
        {state === 'loading' && rows.length === 0
          ? 'Reading the feedback…'
          : state === 'error'
            ? "Couldn't read the feedback."
            : `${sorted.length}${filtered ? ` of ${rows.length}` : ''} report${(filtered ? rows.length : sorted.length) === 1 ? '' : 's'} · click one to read, reply and copy${rows.length >= FEEDBACK_CAP ? ` · newest ${FEEDBACK_CAP} loaded` : ''}`}
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
                onOpen={() => openReport(f.id)}
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
  onOpen,
}: {
  report: DevFeedback
  appTitle: string
  onOpen: () => void
}) {
  return (
    // Anchored on the report, so Refresh and a re-sort hold the row you were
    // reading still rather than whatever lands at its old offset.
    <li className="dev__fb-row" data-dev-anchor={`fb-${f.id}`}>
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

  // A different report through the same dialog is a fresh conversation.
  useEffect(() => {
    setDraft('')
    setConfirmDelete(false)
  }, [f.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

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
    <div className="dev__fbd-backdrop" onClick={onClose}>
      <div
        className="dev__fbd"
        role="dialog"
        aria-modal="true"
        aria-label={`Feedback report #${f.id}`}
        onClick={(e) => e.stopPropagation()}
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
