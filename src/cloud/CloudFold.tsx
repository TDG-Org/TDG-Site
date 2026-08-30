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
    try {
      // The metered door first — it logs the bytes and answers the object
      // path — then the bytes themselves over the owner-only policy.
      const { data: auth, error } = await supabase.rpc('tdg_cloud_begin_download', {
        p_app: file.app,
        p_path: file.path,
      })
      if (error) throw error
      const objectPath = String((auth as Record<string, unknown>)?.object_path ?? '')
      const { data, error: dlError } = await supabase.storage.from('tdg-cloud').download(objectPath)
      if (dlError || !data) throw dlError ?? new Error('empty')
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = file.path.split('/').pop() ?? 'file'
      a.click()
      URL.revokeObjectURL(url)
      setState('idle')
    } catch {
      setState('error')
    }
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

/** One app's hosted files, loaded when opened — an account can hold a lot. */
function AppFiles({ app, appTitle }: { app: string; appTitle: string }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<FileRow[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

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
    <div className="cloud__appfiles">
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
    try {
      // Page through the catalogue, then delete through the Storage API so
      // the blobs go with the rows and the accounting triggers stay true. The
      // round cap is a stall guard: a catalogue row whose object is already
      // gone would come back every page, and forty rounds of 500 is far past
      // any real account.
      for (let round = 0; round < 40; round++) {
        const { data, error } = await supabase
          .from('tdg_cloud_files')
          .select('user_id, app, path')
          .limit(500)
        if (error) throw error
        const rows = (data ?? []) as { user_id: string; app: string; path: string }[]
        if (rows.length === 0) break
        const paths = rows.map((r) => `${r.user_id}/${r.app}/${r.path}`)
        for (let i = 0; i < paths.length; i += 100) {
          const { error: rmError } = await supabase.storage
            .from('tdg-cloud')
            .remove(paths.slice(i, i + 100))
          if (rmError) throw rmError
        }
        if (rows.length < 500) break
      }
      setOpen(false)
      setTyped('')
      setState('idle')
      onDone()
    } catch {
      setState('error')
    }
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
  const usedShare = status.quotaBytes > 0 ? Math.min(status.usedBytes / status.quotaBytes, 1) : 0
  const barTone = usedShare >= 0.8 || status.retention.state !== 'none' ? 'warn' : undefined
  const syncOf = new Map((sync ?? []).map((s) => [s.app, s.updated_at]))

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
        what="One pooled allowance, shared by every compatible TDG app."
      >
        <div
          className="cloud__bar"
          data-tone={barTone}
          role="img"
          aria-label={`${formatBytes(status.usedBytes)} of ${formatBytes(status.quotaBytes)} used`}
        >
          <span className="cloud__bar-fill" style={{ width: `${usedShare * 100}%` }} />
        </div>
        <div className="cloud__acct-figures">
          <span>
            <strong>{formatBytes(status.usedBytes)}</strong> used
            {status.reservedBytes > 0 ? ` · ${formatBytes(status.reservedBytes)} uploading` : ''}
          </span>
          <span>
            <strong>{formatBytes(status.freeBytes)}</strong> free of{' '}
            {status.quotaBytes > 0
              ? formatQuota(Math.round(status.quotaBytes / 1073741824))
              : formatBytes(0)}
          </span>
        </div>

        {status.perApp.length === 0 ? (
          <p className="acct__note">
            Nothing hosted yet. The first app that syncs to your Cloud appears here, with what it
            is using.
          </p>
        ) : (
          <ul className="cloud__apps">
            {status.perApp.map((row) => (
              <li key={row.app}>
                <span>
                  {nameOf(row.app)}
                  <span className="cloud__app-meta">
                    {' · '}
                    {row.files} file{row.files === 1 ? '' : 's'}
                    {syncOf.has(row.app)
                      ? ` · synced ${formatDay(syncOf.get(row.app)!) ?? 'recently'}`
                      : ''}
                  </span>
                </span>
                <span className="cloud__app-bytes">{formatBytes(row.bytes)}</span>
              </li>
            ))}
          </ul>
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
            <AppFiles key={row.app} app={row.app} appTitle={nameOf(row.app)} />
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
          <a className="cloud__mine-link" href={STORE_HASH}>
            See The Plans In The Store
            <span aria-hidden="true"> →</span>
          </a>
        </div>
      )}
    </AccountFold>
  )
}
