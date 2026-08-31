import { useEffect, useState } from 'react'
import { formatBytes, formatQuota } from '../data/cloud'
import type { CloudStatus } from './useCloudStatus'

/**
 * The storage visualizer: one bar, every app a coloured segment of it.
 *
 * ## What it is for
 *
 * "How full am I, and what is taking the room?" answered in one glance —
 * the Apple/Google storage bar's job, done better on three counts: every
 * segment is a real control (hover OR keyboard focus inspects it, a press
 * pins it and opens that app's file browser below), the numbers are EXACT
 * (the detail strip prints the byte count in full, not just "1.2 GB"), and
 * in-flight uploads are their own striped segment instead of being invisible
 * until they land.
 *
 * ## The shape of the data
 *
 * `status.per_app` arrives from `tdg_cloud_status()` already sorted by bytes
 * descending, and colours are assigned by that rank from the eight `--chart-*`
 * tokens (`src/styles/tokens.css` says why rank, not name-hashing: two big
 * neighbours must never land on sibling hues). Rank is also why a colour can
 * shift when an app overtakes another — the legend beside every segment keeps
 * identity unambiguous, which is the same trade Apple's bar makes.
 *
 * ## Every state has a face
 *
 * Empty account: the track renders at full width with its own sentence — an
 * empty bar with no words reads as broken. Tiny segments: a floor width keeps
 * a 2 MB app visible (and pressable) beside a 40 GB one; the detail strip
 * carries the honest share. Reserved bytes: the striped segment, named
 * "Uploading now". Near-full: the whole frame takes the warn tone at 80%,
 * matching `warningFace`'s thresholds.
 */

type Segment = {
  id: string
  label: string
  bytes: number
  files: number | null
  /** Index into the eight chart tokens, or null for the striped reserved segment. */
  hue: number | null
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '0%'
  const share = (part / whole) * 100
  return share >= 10 ? `${Math.round(share)}%` : share >= 1 ? `${share.toFixed(1)}%` : '<1%'
}

export function CloudViz({
  status,
  nameOf,
  onPick,
}: {
  status: CloudStatus
  nameOf: (app: string) => string
  /** A pinned segment's app id (null on unpin) — CloudFold opens that app's
   *  file browser with it, so the bar and "Your Data" stay one surface. */
  onPick?: (app: string | null) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [hot, setHot] = useState<string | null>(null)

  const quota = status.quotaBytes
  const segments: Segment[] = status.perApp.map((row, i) => ({
    id: row.app,
    label: nameOf(row.app),
    bytes: row.bytes,
    files: row.files,
    hue: (i % 8) + 1,
  }))
  if (status.reservedBytes > 0) {
    segments.push({
      id: '~uploading',
      label: 'Uploading now',
      bytes: status.reservedBytes,
      files: null,
      hue: null,
    })
  }

  // A pinned app that stopped existing (deleted its last file) unpins itself.
  useEffect(() => {
    if (picked !== null && !segments.some((s) => s.id === picked)) {
      setPicked(null)
      onPick?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.perApp, status.reservedBytes])

  const press = (id: string) => {
    const next = picked === id ? null : id
    setPicked(next)
    onPick?.(next !== null && !next.startsWith('~') ? next : null)
  }

  const active = segments.find((s) => s.id === (hot ?? picked)) ?? null
  const warn = quota > 0 && status.usedBytes >= quota * 0.8

  return (
    <div className="cloudviz" data-warn={warn || undefined}>
      <div className="cloudviz__bar" role="group" aria-label="Storage by app">
        {segments.map((seg, i) => (
          <button
            key={seg.id}
            type="button"
            className="cloudviz__seg"
            data-striped={seg.hue === null || undefined}
            data-dim={active !== null && active.id !== seg.id ? true : undefined}
            aria-pressed={picked === seg.id}
            aria-label={`${seg.label}: ${formatBytes(seg.bytes)}${
              seg.files !== null ? `, ${seg.files} file${seg.files === 1 ? '' : 's'}` : ''
            } (${pct(seg.bytes, quota)} of your storage)`}
            style={
              {
                width: `${quota > 0 ? (seg.bytes / quota) * 100 : 0}%`,
                '--seg': seg.hue === null ? 'var(--muted)' : `var(--chart-${seg.hue})`,
                '--i': i,
              } as React.CSSProperties
            }
            onMouseEnter={() => setHot(seg.id)}
            onMouseLeave={() => setHot(null)}
            onFocus={() => setHot(seg.id)}
            onBlur={() => setHot(null)}
            onClick={() => press(seg.id)}
          />
        ))}
      </div>

      {/* The inspector: what the pointer or focus is on, or the whole-pool
          summary when nothing is. aria-live so a keyboard reader hears the
          numbers change as focus walks the segments. */}
      <p className="cloudviz__strip" aria-live="polite">
        {active !== null ? (
          <>
            {active.hue !== null && (
              <span
                className="cloudviz__dot"
                style={{ '--seg': `var(--chart-${active.hue})` } as React.CSSProperties}
                aria-hidden="true"
              />
            )}
            <strong>{active.label}</strong>
            <span className="cloudviz__figures">
              {formatBytes(active.bytes)}
              <span className="cloudviz__exact"> · {active.bytes.toLocaleString()} bytes</span>
              {active.files !== null &&
                ` · ${active.files} file${active.files === 1 ? '' : 's'}`}{' '}
              · {pct(active.bytes, quota)} of your storage
            </span>
          </>
        ) : segments.length === 0 ? (
          <span className="cloudviz__figures">
            Nothing hosted yet — the first app that syncs appears here, in its own colour.
          </span>
        ) : (
          <span className="cloudviz__figures">
            <strong>{formatBytes(status.usedBytes)}</strong> used ·{' '}
            <strong>{formatBytes(status.freeBytes)}</strong> free of{' '}
            {quota > 0 ? formatQuota(Math.round(quota / 1073741824)) : formatBytes(0)}
          </span>
        )}
      </p>

      {segments.length > 0 && (
        <ul className="cloudviz__legend">
          {segments.map((seg) => (
            <li key={seg.id}>
              <button
                type="button"
                className="cloudviz__chip"
                data-striped={seg.hue === null || undefined}
                aria-pressed={picked === seg.id}
                style={
                  { '--seg': seg.hue === null ? 'var(--muted)' : `var(--chart-${seg.hue})` } as React.CSSProperties
                }
                onMouseEnter={() => setHot(seg.id)}
                onMouseLeave={() => setHot(null)}
                onClick={() => press(seg.id)}
              >
                <span className="cloudviz__dot" aria-hidden="true" />
                <span className="cloudviz__chip-name">{seg.label}</span>
                <span className="cloudviz__chip-bytes">{formatBytes(seg.bytes)}</span>
              </button>
            </li>
          ))}
          <li>
            <span className="cloudviz__chip cloudviz__chip--free">
              <span className="cloudviz__dot" aria-hidden="true" />
              <span className="cloudviz__chip-name">Free</span>
              <span className="cloudviz__chip-bytes">{formatBytes(status.freeBytes)}</span>
            </span>
          </li>
        </ul>
      )}
    </div>
  )
}
