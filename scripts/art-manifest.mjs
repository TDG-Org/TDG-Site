/**
 * Writes `public/assets/parallax/manifest.json` — the index the Scene Editor's
 * asset library reads.
 *
 * ── why a generated file rather than a glob ───────────────────────────────
 * The kit lives in `public/`, which Vite copies verbatim and never scans, so
 * `import.meta.glob` cannot see a single one of these files. The alternatives
 * were a hand-maintained list in TypeScript — a second place to forget a new
 * piece, which is the failure `AGENTS.md` §6 spends a page on for the version
 * number — or this: one script, run when the kit changes, writing a file that
 * is fetched only by a chunk only a developer downloads.
 *
 * It is deliberately NOT imported by the app. The editor `fetch()`es it, so
 * the manifest costs the main bundle nothing and a stale one degrades to "a
 * new piece is missing from the library", never to a broken page.
 *
 * ── what a "slot" is here ─────────────────────────────────────────────────
 * The kit ships each piece twice, `<name>-dark.webp` and `<name>-light.webp`,
 * and `scene/ThemedArt.tsx` swaps the src on the theme. A few pieces exist in
 * one theme only (the Cebu set replaces some light pictures outright, so their
 * dark twin is a different NAME rather than a missing file). So a row is the
 * base name plus which themes actually have a file, and the editor greys out
 * the half that does not exist rather than requesting a 404.
 *
 * No dimensions: an `<img>` reports `naturalWidth` the moment it decodes, and
 * a number measured from the real file at runtime cannot go stale the way a
 * number copied into JSON can.
 *
 * Usage: `npm run art:manifest`. Re-run it after adding art; the manifest is
 * committed so a fresh clone has one without running anything.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const KIT = join(HERE, '..', 'public', 'assets', 'parallax')
const OUT = join(KIT, 'manifest.json')

/** Every `.webp` under the kit, as paths relative to the kit root. */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.webp')) out.push(relative(KIT, full).split('\\').join('/'))
  }
  return out
}

const slots = new Map()
for (const file of walk(KIT)) {
  const m = /^(.*)-(dark|light)\.webp$/.exec(file)
  if (!m) continue
  const [, name, theme] = m
  const row = slots.get(name) ?? { name, group: name.split('/')[0], dark: false, light: false }
  row[theme] = true
  slots.set(name, row)
}

const rows = [...slots.values()].sort((a, b) => a.name.localeCompare(b.name))
writeFileSync(
  OUT,
  JSON.stringify({ generated: 'scripts/art-manifest.mjs', count: rows.length, slots: rows }, null, 2) + '\n',
  'utf8',
)
console.log(`art-manifest: ${rows.length} pieces -> ${relative(join(HERE, '..'), OUT).split('\\').join('/')}`)
