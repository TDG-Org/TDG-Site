import { launch } from './cdp.mjs'
import { open, scrollTo, shot, pixels, evalIn, closePage, closeSampler } from './lib.mjs'
const THEME = process.argv[2] || 'dark'
const W = 1440, H = 900
const JOINS = [['#tools -> #building', '#building'], ['#building -> #faith', '#faith'],
  ['#faith -> .outro', '.outro'], ['.outro -> gh strip', '.outro__gh-section']]
const proc = await launch('-j')
for (const [name, sel] of JOINS) {
  for (const f of [0.33, 0.5, 0.78]) {
    const page = await open({ w: W, h: H, theme: THEME })
    const target = Math.round(H * f)
    const landed = await evalIn(page, `Math.round(window.scrollY + document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().top - ${target})`)
    await scrollTo(page, Math.max(0, landed))
    const y = await evalIn(page, `Math.round(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().top)`)
    const b = await shot(page)
    await closePage(page.target)
    const cols = Array.from({ length: 15 }, (_, i) => Math.round(((i + 0.5) / 15) * W))
    const steps = await pixels(b, `
      const yy = ${y}; const cols = ${JSON.stringify(cols)}
      return cols.map((x) => { const v = Lstar(x, yy) - Lstar(x, yy - 1); return Number.isFinite(v) ? Math.round(v*100)/100 : 0 })`)
    const worst = steps.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0)
    console.log(THEME.padEnd(6), name.padEnd(21), ('y=' + y).padEnd(7), ('worst ' + worst.toFixed(2)).padEnd(13), steps.map((v) => v.toFixed(2)).join(' '))
  }
}
await closeSampler(); proc.kill(); process.exit(0)
