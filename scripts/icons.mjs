/**
 * Draws the TDG install-icon family into `public/icons/`, and writes them once
 * so the site itself never carries an image dependency.
 *
 * ── why this exists at all ────────────────────────────────────────────────
 * `public/favicon.svg` is a theme-aware vector and it is the right answer for
 * a browser tab. It is the wrong answer for every INSTALL surface, and iOS is
 * the one that shows why: Safari will not read an SVG for `apple-touch-icon`,
 * so a page with only a vector icon gets a Home Screen tile made from a
 * SCREENSHOT of the page. That is what "Add to Home Screen" was doing here.
 *
 * ── why the tile is opaque and full-bleed ─────────────────────────────────
 * iOS applies its OWN squircle mask to the touch icon. An icon that already
 * carries rounded corners gets masked twice and shows dark wedges; an icon
 * with an alpha channel is composited on BLACK before masking, so a mark drawn
 * for a light background arrives on a black tile. Both read as "the icon does
 * not fit". So: no baked radius, no transparency, background painted edge to
 * edge, and the mark kept inside the central 80% that every mask on every
 * platform agrees is safe (Android's maskable spec is the strictest, and it is
 * the one the geometry below is sized against).
 *
 * ── why the artwork is written here rather than committed as a master ─────
 * The mark is `CrossGlyph.tsx`'s path and `tokens.css`'s dark-theme
 * `--cross-stop-*` ramp, and a committed master PNG or SVG would be a second
 * copy of both, free to drift from the ones the page actually draws. It is
 * generated from the same numbers instead, and they are named below so the
 * next reader knows where to check them.
 *
 * ── running it ────────────────────────────────────────────────────────────
 *   npm i -D sharp && node scripts/icons.mjs
 *
 * `sharp` is deliberately NOT in package.json. It is a large native dependency
 * and this repo's CI installs with `npm ci` on every deploy; the icons change
 * about once a year, so the cost belongs on whoever regenerates them, not on
 * every build. AGENTS.md §5's "do not add a dependency" is the same rule from
 * the other side — the OUTPUT is committed, the tool is not.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('sharp not found — run: npm i -D sharp && node scripts/icons.mjs')
  process.exit(1)
}

/** `CrossGlyph.tsx`'s PATH, in its own 42×100 viewBox. Keep the two identical. */
const CROSS = 'M16.6 0H25.4V26.5H42V35.3H25.4V100H16.6V35.3H0V26.5H16.6Z'
const CROSS_W = 42
const CROSS_H = 100

/** tokens.css: `--cross-stop-0..3` (dark), and the `--bg` / `--bg2` pair. */
const STOPS = ['#ffffff', '#f2f2f5', '#9a9aa6', '#6e6e79']
const BG = '#07070a'
const BG2 = '#12121a'

/**
 * The mark's height as a fraction of the tile.
 *
 * Android's maskable safe zone is the centred circle of 80% diameter, which is
 * the tightest of the platform masks — so the whole glyph has to sit inside a
 * radius of 0.4. At 0.62 the cross is 0.62 tall and 0.26 wide, putting its
 * furthest corner 0.336 from the centre: inside 0.4 with room, and still big
 * enough to read at the 60pt an iPhone actually draws it at. Raising it past
 * about 0.68 pushes those corners out through the circle.
 */
const MARK = 0.62

/** One square tile at any size, as SVG. Opaque, no radius — see the header. */
function tile(size) {
  const h = size * MARK
  const w = (h * CROSS_W) / CROSS_H
  const x = (size - w) / 2
  const y = (size - h) / 2
  const s = h / CROSS_H
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<defs>` +
      // The scene's own fall of light: brighter at the top left, the way every
      // card on the site is lit. Painted, not a flat fill, so the tile does not
      // read as a black square with something on it.
      `<radialGradient id="sky" cx="26%" cy="16%" r="92%">` +
      `<stop offset="0" stop-color="${BG2}"/><stop offset="1" stop-color="${BG}"/>` +
      `</radialGradient>` +
      `<linearGradient id="ramp" x1="6%" y1="0%" x2="94%" y2="100%">` +
      STOPS.map((c, i) => `<stop offset="${[0, 0.34, 0.78, 1][i]}" stop-color="${c}"/>`).join('') +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="${size}" height="${size}" fill="url(#sky)"/>` +
      `<g transform="translate(${x} ${y}) scale(${s})"><path d="${CROSS}" fill="url(#ramp)"/></g>` +
      `</svg>`,
  )
}

const out = path.join(root, 'public', 'icons')
fs.mkdirSync(out, { recursive: true })

const png = { compressionLevel: 9, adaptiveFiltering: true }
/* `flatten` is what actually DROPS the alpha channel, and it is the point of
   the whole file: the tile is already opaque, but a PNG that still carries an
   alpha plane is one an OS may composite before masking, which is the exact
   failure this set exists to remove. It also makes every file smaller. */
const bake = (size) => sharp(tile(size)).flatten({ background: BG }).png(png)
const write = async (size, name) => {
  await bake(size).toFile(path.join(out, name))
  console.log('icons/', name)
}

/* 180 is the only size iOS reads. 192/512 are the manifest's two required
   sizes. 32/16 are the PNG favicons for anything that will not take the SVG.
   Nothing else is generated, because an unused icon is a file nobody notices
   has gone stale. */
for (const size of [16, 32, 180, 192, 512]) {
  await write(size, size <= 32 ? `favicon-${size}.png` : `icon-${size}.png`)
}

/* The maskable pair is the SAME artwork: the tile is already opaque, already
   square, and already keeps the mark inside the 80% circle, so there is no
   second composition to get wrong. They are separate files only because the
   manifest has to declare `purpose` per entry.

   There is deliberately no `favicon.ico`. The usual argument for one is that
   browsers probe `/favicon.ico` even when links are present — but this site is
   served from `/TDG-Site/`, so that probe lands on the ORG's root and never on
   anything this repo could put there. A file that answers a request nobody
   makes is one more thing to keep in step with the mark. */
for (const size of [192, 512]) await write(size, `icon-maskable-${size}.png`)
