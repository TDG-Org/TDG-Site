/**
 * Encode the `.webp` beside every parallax PNG at the size it is actually
 * PAINTED at, on a retina screen, and at a quality that does not soften it.
 *
 * ── why this exists, and what it replaces ──────────────────────────────────
 *
 * The kit's README carried one ffmpeg line and two caps: 1000px for `props/`,
 * 1600px for `landscapes/` and `atmosphere/`, at `-q:v 84`. Both numbers were
 * written for the winter kit, whose source art is 1024px, and both are far
 * under what this page draws. Measured in Chrome at 1920x1080 by walking the
 * whole document and taking each file's widest rendered box:
 *
 *     props/palm-row          painted 2458 CSS px   encoded at 1000
 *     landscapes/sand-bank    painted 3053          encoded at 1600
 *     landscapes/sea-band     painted 2803          encoded at 1600
 *     props/capiz-window      painted 1910          encoded at 1000
 *
 * On a 2x screen those want 4916, 6106, 5606 and 3820 device pixels. The site
 * owner's report — "all of these images are low quality, they are NOT the same
 * image quality I sent you them as" — is that, and it was self-inflicted: the
 * source cut-outs are 3072px wide.
 *
 * So the cap is per FILE and comes from a measurement rather than from a
 * folder name: `2 x the widest box the file is ever painted in`, clamped to
 * what the PNG actually holds. A file that paints 126px wide (the Outro's
 * lantern, seen through an arch) does not need 2048, and one that spans the
 * page does not fit in 1000.
 *
 * `-q:v 92` where it was 84. The four extra points are worth about 15% of the
 * bytes on this art and they are the difference on a large flat facet, which
 * is what almost every piece in this kit is made of.
 *
 * Run from the repo root after `scripts/cebu-art.py`:
 *
 *     node scripts/parallax-webp.mjs            # everything that needs it
 *     node scripts/parallax-webp.mjs --all      # force a re-encode
 *
 * Needs ffmpeg on PATH. `-c:v libwebp` is what keeps the alpha channel; the
 * files are `yuva420p` and a flattening encoder destroys this art outright.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'public/assets/parallax'

/**
 * The widest box each file is painted in, in CSS px, measured at 1920x1080.
 * Anything not listed falls back to DEFAULT — which is deliberately generous,
 * because an unmeasured file is one nobody has checked rather than one that is
 * known to be small.
 */
const PAINTED = {
  'props/capiz-lantern': 126,
  'props/lantern-post': 126,
  'props/beach-signpost': 270,
  'props/wayfinding-post': 270,
  'props/pandan-clump': 380,
  'props/bushes-reeds': 380,
  'props/coral-arch': 420,
  'props/garden-arch': 420,
  'props/coral-rocks': 480,
  'props/boulder-cluster': 480,
  'transitions/sand-stones': 580,
  'transitions/stepping-stones': 580,
  'props/coconut-palm-tall': 620,
  'props/tall-pine': 620,
  'props/palm-frond': 648,
  'props/near-branch': 648,
  'transitions/beach-steps': 703,
  'transitions/stone-stair': 703,
  'props/bamboo-rail': 740,
  'props/fence-rail': 740,
  'props/coconut-pair': 978,
  'props/pine-faceted-pair': 978,
  'landscapes/beach-pier': 1240,
  'landscapes/stone-footbridge': 1240,
  'props/cumulus-far': 1598,
  'props/cumulus-near': 1598,
  'props/moon-cloud': 1598,
  'props/bangka': 1843,
  'props/capiz-window': 1910,
  'props/window-frost': 1910,
  'landscapes/shallow-water': 2150,
  'landscapes/headland': 2266,
  'landscapes/far-palms': 2266,
  'landscapes/far-treeline': 2266,
  'landscapes/far-island': 2381,
  'landscapes/mountain-ridge-rear': 2381,
  'props/palm-row': 2458,
  'props/pine-row': 2458,
  'landscapes/beach-terrace': 2458,
  'landscapes/beach-terrace-plain': 2458,
  'landscapes/island-mid': 2573,
  'landscapes/mountain-ridge-mid': 2573,
  'landscapes/sea-band': 2803,
  'landscapes/mountain-ridge': 2803,
  'landscapes/sand-bank': 3053,
  'landscapes/snow-bank': 3053,
  'landscapes/shore-foam': 3053,
  'landscapes/valley-fog': 2803,
  'landscapes/far-range-soft': 2381,
  'atmosphere/fog-veil': 2803,
  'atmosphere/mist-bank': 2803,
  'atmosphere/sea-haze': 2803,
  'faith/hillside-cross': 1200,
  'hero/lamppost-left': 720,
  'scene/lagoon-matte': 1400,
}
const DEFAULT = 1600
const DPR = 2
const QUALITY = 92

const force = process.argv.includes('--all')
const pngs = []
;(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.png')) pngs.push(p)
  }
})(ROOT)

let total = 0
let done = 0
for (const png of pngs) {
  const webp = png.replace(/\.png$/, '.webp')
  const key = relative(ROOT, png).replace(/\\/g, '/').replace(/\.png$/, '').replace(/-(light|dark)$/, '')
  const want = Math.round((PAINTED[key] ?? DEFAULT) * DPR)
  if (!force && existsSync(webp) && statSync(webp).mtimeMs > statSync(png).mtimeMs) {
    total += statSync(webp).size
    continue
  }
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', png,
    '-vf', `scale='if(gt(iw,${want}),${want},iw)':-1:flags=lanczos`,
    '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(QUALITY),
    '-compression_level', '6', webp,
  ])
  const size = statSync(webp).size
  total += size
  done++
  console.log(`${relative(ROOT, webp).replace(/\\/g, '/').padEnd(44)} cap ${String(want).padStart(4)}  ${String(Math.round(size / 1024)).padStart(5)} KB`)
}
console.log(`\n${done} re-encoded, ${pngs.length} files, ${Math.round(total / 1024)} KB total`)
