#!/usr/bin/env node
/**
 * `npm run verify:store` — prove Stripe still charges what the Store advertises.
 *
 * ## What this is for
 *
 * `src/data/store.ts` states every price as a literal beside its live Payment
 * Link, because a static page cannot ask Stripe — and its header lists the
 * other places each number lives. That design's one weakness is that nothing
 * PROVED the copies agree until a customer met the difference. This script is
 * that proof: it reads the catalogue out of `store.ts`, sends it to the
 * `tdg-store-verify` Edge Function (which holds the Stripe key where it
 * already lives and answers only verdicts), and fails loudly on any drift —
 * a deactivated link, a link selling a different amount, a wrong cadence, a
 * missing webhook endpoint, or a Cloud config/Stripe mismatch in either
 * direction.
 *
 * Run it before a release, and any time a price moves anywhere. It needs no
 * key and no login; everything it prints is already public on the Store.
 *
 * ## How the catalogue is read
 *
 * `store.ts` is TypeScript, and this repo deliberately adds no dependency to
 * execute it — so the script extracts `priceCents` / `paymentLink` pairs (and
 * each plan's cadence) with a parser that leans on the file's stable, typed
 * shape. It is defensive about its own blind spots: if it parses fewer links
 * than the file mentions, or zero, it FAILS rather than green-lighting a
 * catalogue it did not actually read. The Cloud plans are deliberately not
 * read from here — `tdg_cloud_config` owns those, and the function verifies
 * that half server-side on every call, catalogue or not.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERIFY_URL = 'https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/tdg-store-verify'

/** Every `{ ... priceCents: N ... paymentLink: 'url' ... }` object literal,
 *  paired by proximity: within one object, the link belongs to the cents. */
function extractCatalog(source) {
  const entries = []
  // One-time packs and plans alike are object literals holding both fields.
  // Walk `paymentLink` occurrences and, for each, find the nearest preceding
  // `priceCents` and (for plans) `id: '...'` within the same object literal.
  const linkRe = /paymentLink:\s*'(https:\/\/buy\.stripe\.com\/[^']+)'/g
  // Which app and pack a link sits under, read from the catalogue's own
  // indentation: an app's `id` sits at four spaces, a pack's at eight. Sent
  // so the server can hold Stripe's `metadata.app`/`pack` against them — two
  // links at one price used to pass as each other on amount alone.
  const idsAt = (indent) =>
    [...source.matchAll(new RegExp(`^${' '.repeat(indent)}id: '([a-z0-9-]+)',\\r?$`, 'gm'))].map(
      (m) => ({ at: m.index, id: m[1] }),
    )
  const appIds = idsAt(4)
  const packIds = idsAt(8)
  const lastBefore = (list, at) => {
    let hit = null
    for (const e of list) {
      if (e.at < at) hit = e.id
      else break
    }
    return hit
  }
  for (const match of source.matchAll(linkRe)) {
    const url = match[1]
    const before = source.slice(0, match.index)
    const objStart = before.lastIndexOf('{')
    const scope = source.slice(objStart, match.index)
    const cents = scope.match(/priceCents:\s*(\d+)/)?.[1]
    const planId = scope.match(/id:\s*'(monthly|annual|lifetime|one-time)'/)?.[1] ?? null
    if (cents === undefined) continue
    const recurring = planId === 'monthly' ? 'month' : planId === 'annual' ? 'year' : null
    entries.push({
      url,
      cents: Number(cents),
      recurring,
      app: lastBefore(appIds, match.index),
      pack: lastBefore(packIds, match.index),
    })
  }
  // A pack with plans states its primary price twice (pack + plans[0]) on the
  // same link by design; dedupe on url, keeping the PLAN row when both exist
  // because it carries the cadence.
  const byUrl = new Map()
  for (const e of entries) {
    const held = byUrl.get(e.url)
    if (!held || (held.recurring === null && e.recurring !== null)) byUrl.set(e.url, e)
  }
  return { entries: [...byUrl.values()], rawMentions: [...source.matchAll(linkRe)].length }
}

const source = await readFile(join(root, 'src', 'data', 'store.ts'), 'utf8')
const { entries, rawMentions } = extractCatalog(source)

// The parser green-lighting a catalogue it failed to read would be worse than
// no check at all, so its own blind spots fail the run.
if (entries.length === 0) {
  console.error('verify:store: parsed ZERO links out of store.ts — the parser is broken, not the shop.')
  process.exitCode = 1
  throw new Error('parser read nothing')
}
const urlMentions = new Set(
  [...source.matchAll(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+/g)].map((m) => m[0]),
)
if (urlMentions.size !== entries.length) {
  console.error(
    `verify:store: store.ts mentions ${urlMentions.size} distinct links but only ${entries.length} parsed with a price — the parser missed some. Failing rather than half-checking.`,
  )
  process.exitCode = 1
  throw new Error('parser under-read the catalogue')
}

console.log(`verify:store — holding ${entries.length} advertised links against Stripe (${rawMentions} mentions read)…`)

let res
try {
  res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalog: entries }),
  })
} catch (err) {
  console.error('verify:store: could not reach tdg-store-verify:', err.message)
  process.exitCode = 1
  throw err
}
const report = await res.json()
if (!res.ok) {
  console.error('verify:store: the function refused:', JSON.stringify(report))
  process.exitCode = 1
  throw new Error('refused')
}

for (const row of report.catalog ?? []) {
  const cadence = row.verdict === 'ok' ? '' : ''
  console.log(
    `  ${row.verdict === 'ok' ? '✓' : '✗'} ${String(row.app ?? '?').padEnd(9)} ${String(row.pack ?? '?').padEnd(12)} ${String(row.cents ?? '?').padStart(6)}¢  active=${row.active}${cadence}`,
  )
}
console.log(`  cloud: available=${report.cloud?.available} · ${Object.keys(report.cloud ?? {}).length - 1} configured links checked server-side`)
console.log(`  webhooks: ${Object.entries(report.webhooks ?? {}).map(([k, v]) => `${k.replace('-stripe-webhook', '')}=${typeof v === 'string' ? v : v.status}`).join(' · ')}`)

// `process.exitCode` rather than `process.exit()`: an immediate exit while
// undici's sockets are still closing trips a libuv assertion on Windows
// (uv_async close race) and turns a green run into exit 127 — measured on
// the very first run of this script.
if (report.ok) {
  console.log('verify:store: OK — every advertised amount is the amount Stripe charges, every link is live, the Cloud config matches Stripe, and the webhooks are listening.')
  process.exitCode = 0
} else {
  console.error(`verify:store: ${report.problems.length} PROBLEM(S):`)
  for (const p of report.problems) console.error(`  ✗ ${p.where}: ${p.what}`)
  process.exitCode = 1
}
