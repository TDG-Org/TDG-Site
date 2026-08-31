import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { STORE_HASH } from '../lib/route'
import { AccountFold, AccountSub } from '../account/AccountFold'
import { useAppNames } from '../account/appNames'
import { formatDay, standingOfGrant } from '../store/grant'
import { formatUsd } from '../data/store'
import { formatBytes, formatQuota } from '../data/cloud'
import { useCloudConfig } from './config'
import { useCloudStatus, type CloudStatus } from './useCloudStatus'
import { cloudDeleteAll, cloudDownloadUrl } from './transfer'
import { CloudViz } from './CloudViz'
import { CloudManage } from './CloudManage'
import './Cloud.css'

/**
 * TDG Cloud on the Account page: one fold, everything about this account's
 * hosted storage.
 *
 * ## The two faces, and why Coming Soon is one of them
 *
 * While TDG Core says Cloud is not open for this account, the fold does not
 * pretend otherwise — it says Coming Soon, prices nothing, and points at the
 * Store shelf where the plans are described. A page that drew empty usage
 * bars for a service nobody can buy would be dressing a locked door as a
 * room. The moment Core opens the door — the launch flag, or the
 * developer/tester door while the public answer is still Coming Soon — the
 * SAME fold becomes the management surface with nothing redeployed, which is
 * the whole point of building it now.
 *
 * ## What the open face carries
 *
 * The plan and its standing (the same `standingOfGrant` sentence the Store
 * prints), the pooled meter (used, reserved by uploads in flight, free), the
 * per-app breakdown, sync state per app, the server's own warnings (quota
 * high/critical/full, egress past the allowance, retention deadlines), the
 * manage panel (`CloudManage`, the same component the shelf mounts), and the
 * data controls: browse and download hosted files, and delete everything
 * behind a typed confirmation. Downloads go through
 * `tdg_cloud_begin_download` first so the egress meter stays honest, then
 * fetch the bytes over the owner-only storage policy.
 */

type FileRow = { app: string; path: string; bytes: number; updated_at: string }

const FILE_PAGE = 200

function warningFace(kind: string, deadline: string | undefined, retentionDays: number): string | null {
  switch (kind) {
    case 'quota_high':
      return 'You have used over 80% of your storage. Nothing changes yet — this is just so a full Cloud never surprises you.'
    case 'quota_critical':
      return 'You have used over 95% of your storage. New uploads will pause at the limit; everything already hosted stays safe.'
    case 'quota_full':
      return 'Your Cloud is full. New uploads and sync are paused until you free some space or move to a bigger plan. Everything already hosted stays readable and downloadable.'
    case 'egress_over':
      return 'This month’s downloads have passed the fair-use allowance for your plan. Nothing is blocked — this is a heads-up, and it resets next month.'
    case 'retention':
      return deadline
        ? `No plan is active, so your hosted data is read-only. It stays downloadable until ${formatDay(deadline) ?? 'the retention deadline'} — resubscribe before then and everything picks up where it left off.`
        : `No plan is active, so your hosted data is read-only for ${retentionDays} days before it is removed. Resubscribe before then and everything picks up where it left off.`
    case 'retention_expired':
      return 'The retention window has ended, so this data can be removed at any time. Download anything you want to keep now, or resubscribe to keep it hosted.'
    default:
      return null
  }
}

function DownloadRow({ file, appTitle }: { file: FileRow; appTitle: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')

  const download = async () => {
    setState('busy')
    // One call meters the read and answers a short-lived presigned URL; the
    // browser then streams the bytes straight from B2 — no blob in memory,
    // and the filename rides inside the URL's signed content-disposition.
    const answer = await cloudDownloadUrl(file.app, file.path, file.path.split('/').pop() ?? 'file')
    if (!answer.ok) {
      setState('error')
      return
    }
    const a = document.createElement('a')
    a.href = answer.value
    a.click()
    setState('idle')
  }

  return (
    <li>
      <span className="cloud__file-name" title={`${appTitle} · ${file.path}`}>
        {file.path}
      </span>
      <span className="cloud__app-bytes">{formatBytes(file.bytes)}</span>
      <button type="button" className="store__ghost" onClick={() => void download()} disabled={state === 'busy'}>
        {state === 'busy' ? 'Downloading…' : state === 'error' ? 'Try Again' : 'Download'}
      </button>
    </li>
  )
}

/** One app's hosted files, loaded when opened — an account can hold a lot.
 *  `autoOpen` is the visualizer's hand reaching in: pinning that app's
 *  segment opens this browser without a second press. */
function AppFiles({
  app,
  appTitle,
  autoOpen = false,
}: {
  app: string
  appTitle: string
  autoOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<FileRow[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    if (autoOpen) setOpen(true)
  }, [autoOpen])

  const load = useCallback(async () => {
    setState('loading')
    const { data, error } = await supabase
      .from('tdg_cloud_files')
      .select('app, path, bytes, updated_at')
      .eq('app', app)
      .order('updated_at', { ascending: false })
      .limit(FILE_PAGE)
    if (error) {
      setState('error')
      return
    }
    setRows((data ?? []) as FileRow[])
    setState('idle')
  }, [app])

  useEffect(() => {
    if (open && rows === null && state === 'idle') void load()
  }, [open, rows, state, load])

  return (
    <div className="cloud__appfiles" id={`cloud-files-${app}`}>
      <button
        type="button"
        className="store__ghost"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? `Hide ${appTitle} Files` : `Browse ${appTitle} Files`}
      </button>
      {open && (
        <>
          {state === 'loading' && <p className="acct__note">Reading the list…</p>}
          {state === 'error' && (
            <p className="acct__note acct__note--warn">
              We couldn't read the file list just now. Try again in a moment.
            </p>
          )}
          {rows !== null && rows.length === 0 && (
            <p className="acct__note">Nothing hosted for this app yet.</p>
          )}
          {rows !== null && rows.length > 0 && (
            <>
              <ul className="cloud__apps cloud__files">
                {rows.map((f) => (
                  <DownloadRow key={`${f.app}:${f.path}`} file={f} appTitle={appTitle} />
                ))}
              </ul>
              {rows.length === FILE_PAGE && (
                <p className="acct__note">
                  Showing the {FILE_PAGE} most recently changed files. The app itself lists
                  everything.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Delete everything hosted, behind a typed confirmation — the one press on
 *  this page that cannot be taken back, so it asks in the reader's own hand. */
function DeleteAll({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')

  const run = async () => {
    setState('busy')
    // One server-side call: `cloud-storage` walks the catalogue itself,
    // destroys every object VERSION in B2 (delete means gone, not hidden),
    // and settles the books in a single verb. Resumable — a retry after a
    // network drop finishes whatever is left.
    const wiped = await cloudDeleteAll()
    if (!wiped.ok) {
      setState('error')
      return
    }
    setOpen(false)
    setTyped('')
    setState('idle')
    onDone()
  }

  return (
    <div className="cloud__delete">
      {!open ? (
        <button type="button" className="store__ghost cloud__danger" onClick={() => setOpen(true)}>
          Delete All Cloud Data
        </button>
      ) : (
        <div className="cloud__warn">
          <strong>Delete everything TDG Cloud is hosting for this account?</strong>
          <span>
            Every hosted file, in every app, is removed for good. Your local copies on each machine
            are not touched, and your plan is not cancelled — this only empties the Cloud. Type{' '}
            <strong>DELETE</strong> to confirm.
          </span>
          <input
            className="cloud__confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="Type DELETE to confirm"
            placeholder="DELETE"
          />
          <div className="cloud__delete-row">
            <button
              type="button"
              className="store__ghost"
              onClick={() => {
                setOpen(false)
                setTyped('')
                setState('idle')
              }}
            >
              Keep My Data
            </button>
            <button
              type="button"
              className="store__buy store__buy--leave"
              disabled={typed !== 'DELETE' || state === 'busy'}
              onClick={() => void run()}
            >
              {state === 'busy' ? 'Deleting…' : 'Delete It All'}
            </button>
          </div>
          {state === 'error' && (
            <span>
              Something refused partway through. Nothing extra was deleted beyond what already
              finished — press again to continue, or try later.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function OpenFace({ status, refresh }: { status: CloudStatus; refresh: () => void }) {
  const config = useCloudConfig()
  const nameOf = useAppNames()
  const [sync, setSync] = useState<{ app: string; updated_at: string }[] | null>(null)
  /** The visualizer's pinned app, if any — it opens that app's file browser
   *  and walks the page there, so the bar IS the index of "Your Data". */
  const [pickedApp, setPickedApp] = useState<string | null>(null)
  const pick = (app: string | null) => {
    setPickedApp(app)
    if (app !== null) {
      window.setTimeout(() => {
        document
          .getElementById(`cloud-files-${app}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 60)
    }
  }

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('tdg_cloud_sync_state')
      .select('app, updated_at')
      .then(({ data, error }) => {
        if (cancelled || error) return
        setSync((data ?? []) as { app: string; updated_at: string }[])
      })
    return () => {
      cancelled = true
    }
  }, [status.usedBytes])

  const standing = standingOfGrant(status.plan?.grant ?? null)

  return (
    <div className="cloud__acct">
      {status.testing && (
        <p className="acct__note">
          TDG Cloud is not on sale yet — your developer account can use it ahead of launch, and
          this is exactly the page everybody gets on launch day.
        </p>
      )}

      {status.warnings.map((w) => {
        const face = warningFace(w.kind, w.deadline, config.retentionDays)
        return face === null ? null : (
          <p key={w.kind} className="cloud__warn">
            {face}
          </p>
        )
      })}

      <AccountSub
        title="Your Plan"
        what="What you are on, what it is doing next, and the controls for it."
      >
        {status.plan === null ? (
          <p className="acct__note">
            No Cloud plan on this account{status.usedBytes > 0 ? ', and hosted data is read-only' : ''}.
            The plans live in the Store's TDG Cloud section.
          </p>
        ) : (
          <>
            <p className="acct__note">
              <strong>{status.plan.name ?? status.plan.pack}</strong>
              {' · '}
              {standing.kind === 'perpetual'
                ? 'granted to your account — nothing renews, and there is nothing to cancel.'
                : standing.note}
            </p>
            <div className="cloud__managehost">
              <CloudManage
                pack={status.plan.pack}
                planName={status.plan.name ?? status.plan.pack}
                grant={status.plan.grant}
                onChanged={refresh}
              />
            </div>
          </>
        )}
      </AccountSub>

      <AccountSub
        title="Storage"
        what="One pooled allowance, shared by every compatible TDG app — every app its own colour."
      >
        {/* The visualizer replaces the old flat bar and list: hover or focus a
            segment to inspect it, press one to pin it AND open that app's
            files below. Sync recency rides in the legend's own inspector via
            the aria labels; the per-app sentence stays exact. */}
        <CloudViz status={status} nameOf={nameOf} onPick={pick} />

        {status.perApp.length > 0 && sync !== null && sync.length > 0 && (
          <p className="acct__note">
            Last synced:{' '}
            {sync
              .map((s) => `${nameOf(s.app)} ${formatDay(s.updated_at) ?? 'recently'}`)
              .join(' · ')}
          </p>
        )}

        {status.egress.allowanceBytes > 0 && (
          <p className="acct__note">
            Downloads this month: {formatBytes(status.egress.monthBytes)} of a{' '}
            {formatBytes(status.egress.allowanceBytes)} fair-use allowance.
          </p>
        )}
      </AccountSub>

      {status.perApp.length > 0 && (
        <AccountSub
          title="Your Data"
          what="Browse and download anything you host, or take it all out. Your data is yours."
        >
          {status.perApp.map((row) => (
            <AppFiles
              key={row.app}
              app={row.app}
              appTitle={nameOf(row.app)}
              autoOpen={pickedApp === row.app}
            />
          ))}
          <DeleteAll onDone={refresh} />
        </AccountSub>
      )}
    </div>
  )
}

export function CloudFold() {
  const config = useCloudConfig()
  const { state, refresh } = useCloudStatus()

  const status = state.kind === 'ready' ? state.status : null
  const enabled = status?.enabledForYou === true

  const count =
    status?.plan != null
      ? (status.plan.name ?? status.plan.pack).toUpperCase()
      : config.available
        ? undefined
        : 'COMING SOON'

  return (
    <AccountFold
      id="cloud"
      title="TDG Cloud"
      what="Pooled storage for your whole account — your plan, what is using it, and every way to take your data with you."
      count={count}
    >
      {state.kind === 'loading' && <p className="acct__note">Checking your Cloud…</p>}

      {state.kind === 'error' && (
        <p className="acct__note acct__note--warn">
          We couldn't read your Cloud standing just now. Nothing has changed — try again in a
          moment.
        </p>
      )}

      {state.kind === 'ready' && status !== null && enabled && (
        <OpenFace status={status} refresh={refresh} />
      )}

      {state.kind === 'ready' && status !== null && !enabled && (
        <div className="cloud__acct">
          <p className="acct__note">
            <strong>TDG Cloud is coming.</strong> One pooled storage allowance for your whole TDG
            Account — your projects, saves, settings and media, synced across every TDG app and
            machine. It is not on sale yet; the plans and prices are already up in the Store, and
            when it launches this is where your storage, sync and data controls will live.
          </p>
          <p className="acct__note">
            {config.plans
              .map((p) => `${p.name} — ${formatQuota(p.quotaGb)} for ${formatUsd(p.monthlyCents)}/mo`)
              .join(' · ')}
          </p>
          {/* The anchored address, not the bare Store: a link that has already
              said "the plans" must not make the reader find them. Same
              constant the other TDG apps use — see lib/route.ts. */}
          <a className="cloud__mine-link" href={STORE_HASH}>
            See The Plans In The Store
            <span aria-hidden="true"> →</span>
          </a>
        </div>
      )}
    </AccountFold>
  )
}
