import { useEffect, useMemo, useState } from 'react'
import { formatBytes } from '../data/cloud'
import type { BucketAudit, CloudConfigMeta, RetentionRow } from '../cloud/api'
import { getBucketAudit, setCloudConfig } from '../cloud/api'
import { loadCloudConfig } from '../cloud/config'
import { Button, Check, Fact, Field, Panel, Switch, Tag, TextInput } from './controls'
import { fmtDate, fmtRelative, fmtUsd } from './format'

/**
 * The Cloud tab: TDG Cloud's launch switches, plans, policies, economics and
 * retention — the one place the service is turned on, tuned and watched.
 *
 * ## Why the whole tab edits ONE document
 *
 * Everything here writes `tdg_cloud_config`, the single jsonb row every Cloud
 * surface reads (the Store shelf's prices, the webhook's price map, the
 * upload gate's quotas, the retention clock). So the tab STAGES its edits and
 * publishes them in one press, the way the Content tab does and for the same
 * reason: the availability flag and a price are one coherent decision, and a
 * config written a keystroke at a time would put half a decision live.
 *
 * ## The launch switch asks twice
 *
 * Flipping `available` on IS the launch — payment links go live on the Store
 * within a minute for every visitor. So when a staged save would turn it on,
 * the save button stays dead until the extra tick is ticked. Everything else
 * about launching (the checklist: activate the Stripe links first) lives in
 * the panel copy where the switch is, because a checklist filed anywhere else
 * is a checklist found the day after.
 *
 * ## Metrics are a read with a side effect
 *
 * `tdg_admin_cloud_metrics()` computes the live numbers AND snapshots today's
 * into `tdg_cloud_metrics_daily`, so growth curves exist simply because a
 * developer looked. It hangs off the console's one Refresh like every other
 * read (README, "Adding a new kind of verb").
 */

type Draft = {
  available: boolean
  devTesting: boolean
  autoPurge: boolean
  retentionDays: string
  egressX: string
  plans: Record<string, { quotaGb: string; monthlyCents: string; annualCents: string }>
}

function draftOf(doc: Record<string, unknown>): Draft {
  const availability = (doc.availability ?? {}) as Record<string, unknown>
  const retention = (doc.retention ?? {}) as Record<string, unknown>
  const egress = (doc.egress ?? {}) as Record<string, unknown>
  const plans = (doc.plans ?? {}) as Record<string, Record<string, unknown>>
  const draftPlans: Draft['plans'] = {}
  for (const [pack, plan] of Object.entries(plans)) {
    draftPlans[pack] = {
      quotaGb: String(plan.quota_gb ?? ''),
      monthlyCents: String(plan.monthly_cents ?? ''),
      annualCents: String(plan.annual_cents ?? ''),
    }
  }
  return {
    available: availability.available === true,
    devTesting: availability.dev_testing === true,
    autoPurge: availability.auto_purge === true,
    retentionDays: String(retention.read_only_days ?? 90),
    egressX: String(egress.monthly_allowance_x_quota ?? 1),
    plans: draftPlans,
  }
}

/** The draft applied back over the stored document — only the knobs this tab
 *  edits move; everything else (links, Stripe ids, economics) rides through
 *  untouched, so a field this build has never heard of survives a save. */
function applyDraft(doc: Record<string, unknown>, draft: Draft): Record<string, unknown> {
  const next = structuredClone(doc)
  const availability = { ...((next.availability ?? {}) as Record<string, unknown>) }
  availability.available = draft.available
  availability.dev_testing = draft.devTesting
  availability.auto_purge = draft.autoPurge
  next.availability = availability

  const retention = { ...((next.retention ?? {}) as Record<string, unknown>) }
  retention.read_only_days = Math.max(1, Math.round(Number(draft.retentionDays) || 90))
  next.retention = retention

  const egress = { ...((next.egress ?? {}) as Record<string, unknown>) }
  egress.monthly_allowance_x_quota = Math.max(0.1, Number(draft.egressX) || 1)
  next.egress = egress

  const plans = { ...((next.plans ?? {}) as Record<string, Record<string, unknown>>) }
  for (const [pack, fields] of Object.entries(draft.plans)) {
    plans[pack] = {
      ...(plans[pack] ?? {}),
      quota_gb: Math.max(1, Math.round(Number(fields.quotaGb) || 0)),
      monthly_cents: Math.max(1, Math.round(Number(fields.monthlyCents) || 0)),
      annual_cents: Math.max(1, Math.round(Number(fields.annualCents) || 0)),
    }
  }
  next.plans = plans
  return next
}

function MetricTile({ label, value, what, tone }: { label: string; value: string; what: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className="dev__stat" data-tone={tone}>
      <span className="dev__stat-value">{value}</span>
      <span className="dev__stat-label">{label}</span>
      <span className="dev__stat-what">{what}</span>
    </div>
  )
}

export function CloudTab({
  config,
  configState,
  metrics,
  metricsState,
  retention,
  push,
  onSaved,
}: {
  config: CloudConfigMeta | null
  configState: 'loading' | 'ready' | 'error'
  metrics: Record<string, unknown> | null
  metricsState: 'loading' | 'ready' | 'error'
  retention: RetentionRow[] | null
  push: (tone: 'ok' | 'bad', message: string) => void
  /** Re-read the config (and everything derived) after a publish lands. */
  onSaved: () => void
}) {
  const stored = useMemo(() => (config ? draftOf(config.doc) : null), [config])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [note, setNote] = useState('')
  const [launchTick, setLaunchTick] = useState(false)
  const [saving, setSaving] = useState(false)

  // A fresh read replaces an untouched draft; an edited one is kept, so a
  // Refresh cannot eat half-entered prices.
  useEffect(() => {
    setDraft((current) => {
      if (current === null || (stored !== null && JSON.stringify(current) === JSON.stringify(stored))) {
        return stored
      }
      return current
    })
  }, [stored])

  const dirty = stored !== null && draft !== null && JSON.stringify(stored) !== JSON.stringify(draft)
  const launching = dirty && draft !== null && stored !== null && draft.available && !stored.available

  const save = async () => {
    if (config === null || draft === null) return
    setSaving(true)
    try {
      await setCloudConfig(applyDraft(config.doc, draft), note)
      push('ok', draft.available && !stored?.available ? 'TDG Cloud is LIVE.' : 'Cloud config saved.')
      setNote('')
      setLaunchTick(false)
      onSaved()
      // The public store the shelf reads, in this same tab, right now.
      void loadCloudConfig(true)
    } catch (e) {
      push('bad', e instanceof Error ? e.message : 'The save was refused.')
    } finally {
      setSaving(false)
    }
  }

  const m = metrics
  const subs = (m?.subscribers ?? {}) as Record<string, unknown>
  const revenue = (m?.revenue ?? {}) as Record<string, unknown>
  const usage = (m?.usage ?? {}) as Record<string, unknown>
  const costs = (m?.costs ?? {}) as Record<string, unknown>
  const margin = (m?.margin ?? {}) as Record<string, unknown>
  const advice = (m?.upgrade_advice ?? {}) as Record<string, unknown>
  const dist = (usage.distribution ?? {}) as Record<string, unknown>
  const byApp = Array.isArray(usage.by_app) ? (usage.by_app as Record<string, unknown>[]) : []
  const heavy = Array.isArray(usage.heavy_users) ? (usage.heavy_users as Record<string, unknown>[]) : []

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

  return (
    <div className="dev__wide">
      <Panel
        title="Launch & Availability"
        what="TDG Cloud's whole standing, in one staged save: whether it is on sale, who may test it, the plans' quotas and prices, and the retention and fair-use policy. Every Cloud surface — the Store shelf, the apps, the upload gate — reads this document."
        writes="tdg_cloud_config"
        right={
          configState === 'loading' ? (
            <Tag>READING</Tag>
          ) : configState === 'error' ? (
            <Tag tone="bad">UNREADABLE</Tag>
          ) : stored?.available ? (
            <Tag tone="warn">LIVE</Tag>
          ) : (
            <Tag>COMING SOON</Tag>
          )
        }
      >
        {configState === 'error' && (
          <p className="dev__warn">Couldn't read the Cloud config. Refresh and try again.</p>
        )}
        {draft !== null && config !== null && (
          <>
            <p className="dev__panel-quiet">
              Before flipping Cloud on: the Stripe payment links must be ACTIVATED first (they were
              created deactivated — Stripe dashboard, Payment Links, the four tagged app=cloud), or
              the shelf will send buyers to dead pages. Turning `available` on makes the Store show
              Buy buttons to everybody within a minute. Last saved{' '}
              {config.updatedAt ? `${fmtRelative(config.updatedAt)} (${fmtDate(config.updatedAt)})` : 'never'}
              {config.updatedByName ? ` by ${config.updatedByName}` : ''}.
            </p>

            <Switch
              checked={draft.available}
              onChange={(v) => setDraft({ ...draft, available: v })}
              label="Available — On Sale For Everybody"
              hint={
                draft.available
                  ? 'Cloud is (or is about to be) LIVE: the Store prices it, sells it, and uploads count.'
                  : 'Coming Soon: the Store shows the plans with a disabled button, nothing can be bought, and no ordinary account can upload.'
              }
            />
            <Switch
              checked={draft.devTesting}
              onChange={(v) => setDraft({ ...draft, devTesting: v })}
              label="Developer Testing"
              hint="While Coming Soon, developer accounts (and any tester uuids in the config) can use Cloud end to end. Has no effect once Available is on."
            />
            <Switch
              checked={draft.autoPurge}
              onChange={(v) => setDraft({ ...draft, autoPurge: v })}
              label="Allow Retention Purges"
              hint="OFF means nothing hosted is ever deleted automatically, whatever the deadline says. ON lets the cloud-maintenance function actually purge accounts past retention when it is run."
            />

            <div className="dev__fields">
              <Field label="Read-Only Retention (Days)" hint="How long a lapsed account's data stays readable and downloadable before it may be purged.">
                <TextInput value={draft.retentionDays} onChange={(v) => setDraft({ ...draft, retentionDays: v })} />
              </Field>
              <Field label="Egress Allowance (× Quota Per Month)" hint="The fair-use download allowance, as a multiple of the plan's storage. Past it the account is warned; nothing is blocked.">
                <TextInput value={draft.egressX} onChange={(v) => setDraft({ ...draft, egressX: v })} />
              </Field>
            </div>

            {Object.entries(draft.plans).map(([pack, fields]) => (
              <div key={pack} className="dev__fields">
                <Field label={`${pack} · Quota (GB)`} hint="Pooled storage the plan sells. 1024 GB = 1 TB.">
                  <TextInput value={fields.quotaGb} onChange={(v) => setDraft({ ...draft, plans: { ...draft.plans, [pack]: { ...fields, quotaGb: v } } })} />
                </Field>
                <Field label={`${pack} · Monthly (¢)`} hint="US cents. Must match the live Stripe price — change both in the same sitting.">
                  <TextInput value={fields.monthlyCents} onChange={(v) => setDraft({ ...draft, plans: { ...draft.plans, [pack]: { ...fields, monthlyCents: v } } })} />
                </Field>
                <Field label={`${pack} · Annual (¢)`} hint="US cents. The saving badge everywhere is computed from these two.">
                  <TextInput value={fields.annualCents} onChange={(v) => setDraft({ ...draft, plans: { ...draft.plans, [pack]: { ...fields, annualCents: v } } })} />
                </Field>
              </div>
            ))}

            <div className="dev__fields">
              <Field label="Audit Note" hint="One line for the audit trail, e.g. why a price moved.">
                <TextInput value={note} onChange={setNote} placeholder="Optional" />
              </Field>
            </div>

            {launching && (
              <Check
                checked={launchTick}
                onChange={setLaunchTick}
                label="I am launching TDG Cloud for everybody, and the Stripe payment links are already activated"
              />
            )}

            <div className="dev__fields">
              <Button
                variant="primary"
                disabled={!dirty || saving || (launching && !launchTick)}
                busy={saving}
                onClick={() => void save()}
              >
                {launching ? 'Save & Launch TDG Cloud' : 'Save Changes'}
              </Button>
              <Button
                variant="ghost"
                disabled={!dirty || saving}
                onClick={() => {
                  setDraft(stored)
                  setLaunchTick(false)
                }}
              >
                Discard Edits
              </Button>
              {dirty && <Tag tone="warn">NOT SAVED</Tag>}
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Metrics & Economics"
        what="Subscribers, revenue, what is stored where, what it costs us, and the margin after Stripe and a tax haircut — computed live from the config's own cost assumptions, and snapshotted daily whenever somebody looks."
        writes="tdg_cloud_metrics_daily (a snapshot per day)"
        right={
          metricsState === 'loading' ? (
            <Tag>READING</Tag>
          ) : metricsState === 'error' ? (
            <Tag tone="bad">UNREADABLE</Tag>
          ) : (
            <Tag tone={num(revenue.mrr_usd) > 0 ? 'ok' : 'plain'}>
              ${num(revenue.mrr_usd).toFixed(2)} MRR
            </Tag>
          )
        }
      >
        {metricsState === 'error' && (
          <p className="dev__warn">Couldn't read the metrics. Refresh and try again.</p>
        )}
        {m !== null && (
          <>
            <div className="dev__stats">
              <MetricTile label="Subscribers" value={String(num(subs.monthly) + num(subs.annual))} what={`${num(subs.monthly)} monthly · ${num(subs.annual)} annual`} />
              <MetricTile label="Granted" value={String(num(subs.granted))} what="free/admin grants" />
              <MetricTile label="MRR" value={fmtUsd(Math.round(num(revenue.mrr_usd) * 100))} what={`${fmtUsd(Math.round(num(revenue.arr_usd) * 100))} a year`} />
              <MetricTile label="Net Of Stripe" value={fmtUsd(Math.round(num(revenue.net_after_stripe_usd) * 100))} what="per month, after fees" />
              <MetricTile label="Stored" value={formatBytes(num(usage.total_bytes))} what={`across ${num(subs.with_data)} accounts`} />
              <MetricTile label="Egress" value={formatBytes(num(usage.egress_month_bytes))} what="metered this month" />
              <MetricTile label="Infra Cost" value={fmtUsd(Math.round(num(costs.marginal_usd_month) * 100))} what={`storage ${fmtUsd(Math.round(num(costs.storage_usd_month) * 100))} + egress ${fmtUsd(Math.round(num(costs.egress_usd_month) * 100))}`} />
              <MetricTile
                label="Margin"
                value={fmtUsd(Math.round(num(margin.gross_usd_month) * 100))}
                what={`${fmtUsd(Math.round(num(margin.after_tax_usd_month) * 100))} after the tax haircut`}
                tone={num(margin.gross_usd_month) < 0 ? 'bad' : undefined}
              />
            </div>

            <div className="dev__facts">
              <Fact label="Average Stored" value={formatBytes(num(dist.avg_bytes))} />
              <Fact label="Median" value={formatBytes(num(dist.median_bytes))} />
              <Fact label="P90" value={formatBytes(num(dist.p90_bytes))} />
              <Fact label="P95" value={formatBytes(num(dist.p95_bytes))} />
              <Fact label="P99" value={formatBytes(num(dist.p99_bytes))} />
              <Fact
                label="Cost / Subscriber"
                value={costs.per_subscriber_usd == null ? '—' : fmtUsd(Math.round(num(costs.per_subscriber_usd) * 100))}
              />
              <Fact label="Base Plan" value={`${fmtUsd(Math.round(num(costs.base_plan_usd_month) * 100))}/mo`} />
              <Fact
                label="Included Storage"
                value={`${formatBytes(num(usage.total_bytes))} of ${num(advice.included_storage_gb)} GB included`}
              />
            </div>

            {byApp.length > 0 && (
              <ul className="dev__log">
                {byApp.map((row) => (
                  <li key={String(row.app)} className="dev__log-row">
                    <Tag>{String(row.app)}</Tag>
                    <span className="dev__log-what">
                      {String(num(row.accounts))} account{num(row.accounts) === 1 ? '' : 's'} ·{' '}
                      {String(num(row.files))} file{num(row.files) === 1 ? '' : 's'}
                    </span>
                    <span className="dev__log-amount">{formatBytes(num(row.bytes))}</span>
                  </li>
                ))}
              </ul>
            )}

            {heavy.length > 0 && (
              <>
                <p className="dev__panel-quiet">
                  The heaviest accounts, and how much of their plan they use — the tail the pooled
                  pricing has to carry.
                </p>
                <ul className="dev__log">
                  {heavy.map((row) => (
                    <li key={String(row.user_id)} className="dev__log-row">
                      <span className="dev__log-who">
                        {typeof row.username === 'string' && row.username !== ''
                          ? `@${String(row.username)}`
                          : String(row.user_id).slice(0, 8)}
                      </span>
                      <span className="dev__log-what">
                        {row.share == null ? 'no plan' : `${Math.round(num(row.share) * 100)}% of their quota`}
                      </span>
                      <span className="dev__log-amount">{formatBytes(num(row.bytes))}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="dev__panel-quiet">
              {String(advice.note ?? '')} Assumptions live in the config document under
              `economics` — the storage and egress rates, the Stripe fees and the tax haircut every
              number above is computed with — so a Supabase price change is one edit there, not a
              deploy.
            </p>
          </>
        )}
      </Panel>

      <Panel
        title="Retention"
        what="Accounts whose plan has ended while they still host data: read-only until the deadline, purgeable after it. Purging is never automatic here — it is the cloud-maintenance Edge Function, run on purpose, and only while Allow Retention Purges is on."
        writes="nothing — a report"
        right={
          retention === null ? (
            <Tag>READING</Tag>
          ) : (
            <Tag tone={retention.some((r) => r.purge_ready) ? 'warn' : 'plain'}>
              {retention.length} LAPSED
            </Tag>
          )
        }
      >
        {retention !== null && retention.length === 0 && (
          <p className="dev__panel-quiet">Nobody is in retention. Every hosted byte belongs to a live plan.</p>
        )}
        {retention !== null && retention.length > 0 && (
          <ul className="dev__log">
            {retention.map((row) => (
              <li key={row.user_id} className="dev__log-row">
                <Tag tone={row.purge_ready ? 'warn' : 'plain'}>
                  {row.purge_ready ? 'PURGE READY' : 'READ-ONLY'}
                </Tag>
                <span className="dev__log-who">{row.username ? `@${row.username}` : row.user_id.slice(0, 8)}</span>
                <span className="dev__log-what">
                  {row.files} file{row.files === 1 ? '' : 's'} · deadline {fmtDate(row.deadline)}
                </span>
                <span className="dev__log-amount">{formatBytes(row.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <BucketPanel />
    </div>
  )
}

/**
 * Backblaze's own answer, held against the catalogue.
 *
 * Every other number on this tab is TDG's account of TDG Cloud: the config
 * says the quota, the catalogue says the bytes, the metrics multiply them by
 * a price. None of it has ever asked Backblaze. That gap is the one place
 * money can go missing quietly — the catalogue is what we BILL from, the
 * bucket is what we PAY for, and an object in the second that is missing from
 * the first bills nobody and costs us every month forever.
 *
 * ## Why it is a button and not part of Refresh
 *
 * The read is a full ListObjectVersions walk of the bucket. That is seconds
 * today and minutes at scale, so hanging it off the console's Refresh would
 * make merely opening this tab slow for everyone. It is a deliberate press,
 * and the panel says what it is about to do before it does it.
 */
function BucketPanel() {
  const [audit, setAudit] = useState<BucketAudit | null>(null)
  const [phase, setPhase] = useState<'idle' | 'reading' | 'ready' | 'error'>('idle')
  const [problem, setProblem] = useState<string>('')

  async function read() {
    setPhase('reading')
    setProblem('')
    try {
      setAudit(await getBucketAudit())
      setPhase('ready')
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Something went wrong.')
      setPhase('error')
    }
  }

  //  Counts come from `counts`, never from the list lengths — the lists stop
  //  at 200 and a tile reading "200 orphans" when there are 4,000 would be
  //  the exact false comfort this panel exists to remove.
  const drift =
    audit === null ? 0 : audit.counts.orphans + audit.counts.ghosts + audit.counts.mismatched
  const wasted = audit === null ? 0 : audit.oldVersions.bytes + audit.counts.orphanBytes

  return (
    <Panel
      title="Backblaze Bucket"
      what="What Backblaze says it is holding, held against what the catalogue claims — the only check that the bytes we pay for and the bytes we bill for are the same bytes. Orphans cost us money nobody is charged for; ghosts charge somebody for a file that is not there."
      writes="nothing — a read of B2 and the catalogue"
      right={
        phase === 'reading' ? (
          <Tag>READING</Tag>
        ) : phase === 'error' ? (
          <Tag tone="bad">UNREADABLE</Tag>
        ) : audit === null ? (
          <Tag tone="plain">NOT READ</Tag>
        ) : (
          <Tag tone={drift > 0 ? 'warn' : 'ok'}>{drift > 0 ? `${drift} TO EXPLAIN` : 'IN AGREEMENT'}</Tag>
        )
      }
    >
      <div className="dev__row">
        <Button onClick={() => void read()} disabled={phase === 'reading'}>
          {phase === 'reading' ? 'Walking The Bucket…' : audit === null ? 'Read The Bucket' : 'Read It Again'}
        </Button>
        <span className="dev__panel-quiet">
          {phase === 'reading'
            ? 'Listing every object version — this is the slow one.'
            : 'A full listing of every object version. Seconds now, longer as the bucket grows.'}
        </span>
      </div>

      {phase === 'error' && <p className="dev__warn">{problem}</p>}

      {audit !== null && phase !== 'error' && (
        <>
          <div className="dev__stats">
            <MetricTile
              label="Stored"
              value={formatBytes(audit.stored.bytes)}
              what={`${audit.stored.objects.toLocaleString()} object${audit.stored.objects === 1 ? '' : 's'} in ${audit.bucket}`}
            />
            <MetricTile
              label="Catalogue"
              value={formatBytes(audit.catalogue.bytes)}
              what={`${audit.catalogue.rows.toLocaleString()} row${audit.catalogue.rows === 1 ? '' : 's'} we bill from`}
            />
            <MetricTile
              label="Old Versions"
              value={formatBytes(audit.oldVersions.bytes)}
              what={`${audit.oldVersions.count.toLocaleString()} superseded — billed, unreachable`}
              tone={audit.oldVersions.count > 0 ? 'warn' : undefined}
            />
            <MetricTile
              label="Hide Markers"
              value={audit.hideMarkers.toLocaleString()}
              what="should be zero — deletes destroy by version"
              tone={audit.hideMarkers > 0 ? 'warn' : undefined}
            />
            <MetricTile
              label="Paid For, Unbilled"
              value={formatBytes(wasted)}
              what="old versions plus orphans"
              tone={wasted > 0 ? 'warn' : undefined}
            />
            <MetricTile
              label="Drift"
              value={String(drift)}
              what={`${audit.counts.orphans} orphan · ${audit.counts.ghosts} ghost · ${audit.counts.mismatched} wrong size`}
              tone={drift > 0 ? 'bad' : undefined}
            />
          </div>

          {audit.truncated && (
            <p className="dev__warn">
              The bucket was too large to list in one pass, so this is a partial read — and the
              ghost check is switched off entirely, because an object that was never listed is not
              a missing one. Orphans and sizes below are real; the counts are a floor, not a total.
            </p>
          )}

          {drift === 0 && !audit.truncated && (
            <p className="dev__panel-quiet">
              Backblaze and the catalogue agree on every object. Every byte we pay for belongs to an
              account, and every byte an account is billed for is really there.
            </p>
          )}

          <BucketDrift
            title="Orphans — in the bucket, claimed by nobody"
            why="We pay Backblaze for these every month and no account is billed for them. Usually an upload whose finish never ran, or a delete that settled the books and then failed on the bytes."
            total={audit.counts.orphans}
            rows={audit.orphans.map((o) => ({ key: o.key, tag: 'ORPHAN' as const, amount: formatBytes(o.bytes) }))}
          />
          <BucketDrift
            title="Ghosts — in the catalogue, not in the bucket"
            why="Somebody is being charged quota for a file that would fail to download. The catalogue row is the thing to remove."
            total={audit.counts.ghosts}
            rows={audit.ghosts.map((g) => ({ key: g.key, tag: 'GHOST' as const, amount: formatBytes(g.bytes) }))}
          />
          <BucketDrift
            title="Wrong size — both sides have it, they disagree"
            why="The quota charged and the bytes stored are different numbers for the same file."
            total={audit.counts.mismatched}
            rows={audit.mismatched.map((m) => ({
              key: m.key,
              tag: 'SIZE' as const,
              amount: `${formatBytes(m.bucketBytes)} stored vs ${formatBytes(m.catalogueBytes)} billed`,
            }))}
          />
        </>
      )}
    </Panel>
  )
}

/** One class of disagreement. Draws nothing at all when there is none —
 *  three permanently-empty headings would bury the one that matters. */
function BucketDrift({
  title,
  why,
  total,
  rows,
}: {
  title: string
  why: string
  /** How many there really are. `rows` is at most the first 200 of them. */
  total: number
  rows: { key: string; tag: 'ORPHAN' | 'GHOST' | 'SIZE'; amount: string }[]
}) {
  if (total === 0) return null
  return (
    <div className="dev__subsection">
      <h4 className="dev__subhead">
        {title} <Tag tone="warn">{total}</Tag>
      </h4>
      <p className="dev__panel-quiet">{why}</p>
      <ul className="dev__log">
        {rows.map((row) => (
          <li key={row.key} className="dev__log-row">
            <Tag tone={row.tag === 'GHOST' ? 'bad' : 'warn'}>{row.tag}</Tag>
            <span className="dev__log-what dev__log-key">{row.key}</span>
            <span className="dev__log-amount">{row.amount}</span>
          </li>
        ))}
      </ul>
      {total > rows.length && (
        <p className="dev__panel-quiet">
          Showing the first {rows.length} of {total}.
        </p>
      )}
    </div>
  )
}
