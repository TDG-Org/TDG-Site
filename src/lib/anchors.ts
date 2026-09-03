/**
 * Where a section anchor actually lands.
 *
 * `#apps` is a link somebody sends somebody else, and the thing they meant to
 * point at is the Apps HEADING. The browser's own answer is the section's box
 * top, and on this page those are nowhere near each other: the three sections
 * of the cabin walk carry the padding that holds the camera's beats, so at
 * 1440×900 the heading sits 308px inside `#apps` and 452px inside `#tools`.
 * Followed natively, `#apps` put the reader on a third of a screen of empty
 * band with the heading below the fold on a laptop, and off it entirely on a
 * phone — and the first 70px of whatever did land was under the fixed nav.
 *
 * ## Why not `scroll-margin-top`, which is the CSS answer to this
 *
 * Because the number it would need is NEGATIVE and it is not ours to write.
 * Landing the heading means scrolling PAST the box top by the section's own
 * padding, and that padding is a viewport-based clamp declared in three other
 * stylesheets and tuned against a 3D camera — `Apps.css` and `Tools.css` own
 * those numbers and §4 of AGENTS.md puts them out of reach. A negative
 * `scroll-margin-top` here would be a fourth copy of a number that moves, and
 * it would go wrong silently at every width but the one it was measured at.
 *
 * ## What is derived instead
 *
 * Every section on this site opens with a `.kicker` — that is `base.css`'s
 * primitive and rule 4 of AGENTS.md, not a coincidence — so the landing
 * element is FOUND rather than tabulated. Add a section tomorrow and it lands
 * correctly without this file being opened. The hero has no kicker and wants
 * the top of the page, which is what it gets by falling back to the section
 * itself and clamping at zero.
 *
 * The nav's height comes from `--nav-h` in `base.css`, which is the one place
 * that number is written down. Reading it here rather than repeating `70`
 * is what stops a taller bar from quietly hiding every heading again.
 */

/**
 * The gap between the bottom of the nav and the top of the heading.
 *
 * A constant rather than a clamp because the bar it clears is a constant: the
 * comment on `--nav-h` records it as measured at 70px at every width the site
 * is drawn at, so a heading 18px under it is equally clear on a phone and on a
 * display. If the bar ever stops being one height, this becomes a clamp and
 * `--nav-h` becomes the thing that varies — not this.
 */
const GAP = 18

/** The nav's own height, from the one place it is written down. */
function navHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--nav-h')
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

/**
 * The element a section anchor should put on screen.
 *
 * Its heading, when it has one. The hero does not, and it is also the one
 * section whose correct landing is the very top of the document, so returning
 * the section itself is right rather than a special case.
 */
function landingFor(section: HTMLElement): HTMLElement {
  return section.querySelector<HTMLElement>('.kicker') ?? section
}

/**
 * Scroll so that `id`'s heading sits just below the nav. Answers whether there
 * was such a section, so a caller can fall through to whatever it does for a
 * fragment this page does not have.
 *
 * `behavior` is the caller's, and the two callers want different things: a
 * link clicked on the page you are already reading should travel, and a page
 * opened AT a section should simply be there. Never `auto` — the document's
 * own `scroll-behavior: smooth` makes that resolve to smooth, which is how
 * arriving at a page once looked like the page sliding up under you.
 */
export function scrollToAnchor(id: string, behavior: 'smooth' | 'instant'): boolean {
  const section = document.getElementById(id)
  if (!section) return false

  const target = landingFor(section)
  const top = target.getBoundingClientRect().top + window.scrollY - navHeight() - GAP
  // Clamped, because the hero's heading is above the top of the document and a
  // negative offset is not a place.
  window.scrollTo({ top: Math.max(0, top), behavior: motionSafe(behavior) })
  return true
}

/**
 * The behaviour to actually use, which is never `smooth` for a reader who has
 * asked for less motion.
 *
 * `base.css` already answers this for the browser's own anchor scrolling —
 * `html { scroll-behavior: auto }` inside its reduced-motion block — but an
 * explicit `behavior` on `scrollTo` **overrides that declaration rather than
 * inheriting it**. So a JS scroll that hardcodes `smooth` quietly puts the
 * motion back for exactly the people the CSS rule was written for, and does it
 * where nobody grepping for `scroll-behavior` would find it.
 */
function motionSafe(behavior: 'smooth' | 'instant'): 'smooth' | 'instant' {
  if (behavior === 'instant') return 'instant'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
}

/**
 * Land on `id` and STAY landed while the page finishes becoming its real
 * height. Answers a cleanup, or null when there is no such section.
 *
 * ## Why one scroll is not enough on arrival
 *
 * A React effect runs after the first commit and long before the page is
 * finished: the hero's two canvases have not sized themselves, the fonts have
 * not swapped, and `.walk`'s `-100svh` pull is measured against a document
 * that is still growing. Measured on a cold load of `/#apps`, the heading was
 * near the top of the document at that moment, so the landing computed to a
 * negative offset, clamped to zero, and the reader arrived at the hero — the
 * exact failure this whole file exists to fix, only arriving by the front door
 * instead of the nav.
 *
 * So the landing is made again when the two things that change the answer are
 * done: the fonts, and everything else the document was still loading. Both
 * are events rather than a timer or a frame loop, which is what keeps this
 * clear of rule 9 without needing its exemption.
 *
 * ## And why it stops the moment the reader takes over
 *
 * Each attempt remembers where it left the page. A later one that finds the
 * page somewhere else does nothing at all: the reader has scrolled, the page
 * is theirs, and yanking it back to a heading they have already read past is
 * worse than landing slightly wrong in the first place.
 */
export function landOnAnchor(id: string): (() => void) | null {
  if (!document.getElementById(id)) return null

  let cancelled = false
  /** Where the last attempt left the page, or -1 before the first one. */
  let placed = -1

  const land = () => {
    if (cancelled) return
    if (placed >= 0 && Math.abs(window.scrollY - placed) > 2) return
    if (!scrollToAnchor(id, 'instant')) return
    placed = Math.round(window.scrollY)
  }

  land()
  // `fonts` is optional in the DOM lib rather than in any browser this site
  // supports; the `?.` is the type's, not a real doubt.
  void document.fonts?.ready.then(land)
  if (document.readyState === 'complete') land()
  else window.addEventListener('load', land, { once: true })

  return () => {
    cancelled = true
    window.removeEventListener('load', land)
  }
}

/**
 * The two aliases this site has.
 *
 * The Origin section was `#story` until the rename in 1.5.0 (August 2026), and
 * the Games section was `#building` until 2.51.0 (September 2026). Bookmarks
 * and shared links still carry both, and each is resolved here so that every
 * way of arriving at it agrees. The hash itself is deliberately NOT rewritten
 * — see `App.tsx`, which says why at the effect that used to own the first of
 * these on its own.
 *
 * Still not a table. Two renames written out are two decisions a reader can
 * check; a map is an invitation to add a third without asking whether the old
 * link was ever real. Both of these were: `#story` was the Origin section's id
 * for the site's whole first year, and `#building` was in the nav, in the
 * footer and on MARANATHA's own Back control right up to the rename. If a
 * third is ever renamed, write it beside these and say when.
 */
const resolveAlias = (id: string): string =>
  id === 'story' ? 'origin' : id === 'building' ? 'games' : id

/**
 * The query key a ROUTE uses to name a place on the page it opens.
 *
 * `#/store?to=cloud-plans` opens the Store standing at its TDG Cloud panel.
 * Why a query rather than a second segment or a second `#` is written down
 * once, at `anchoredHash` in lib/route.ts, which is the only thing that builds
 * one of these.
 */
export const ANCHOR_PARAM = 'to'

/**
 * The section id a hash is asking for, or null when it is asking for something
 * else — a bare route (`#/store`), or nothing at all.
 *
 * Two shapes answer here, and they are the same question one level apart:
 *
 * - `#apps` — a section of the page already on screen.
 * - `#/store?to=cloud-plans` — a ROUTE, plus a place on the page it opens.
 *   The route decides WHICH page; this decides where on it the reader lands.
 *   That is what lets another TDG app link straight at the Cloud plans instead
 *   of dropping a reader at the top of the shop with 900px to scroll.
 *
 * A `to` that names nothing on the page is the same as no `to` at all: both
 * callers fall through to whatever they do for a fragment this page does not
 * have, which is the top of it. Nothing here refuses, and nothing rewrites the
 * address — rule 8's instinct one level down.
 */
export function sectionIdFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, '')
  const q = raw.indexOf('?')
  if (q >= 0) {
    // A route carrying a place on its own page. `URLSearchParams` decodes, so
    // `anchoredHash`'s encoding round-trips; an empty or absent `to` is not a
    // request for anywhere.
    const asked = new URLSearchParams(raw.slice(q + 1)).get(ANCHOR_PARAM)?.trim()
    return asked ? resolveAlias(asked) : null
  }
  if (!raw || raw.startsWith('/')) return null
  return resolveAlias(raw)
}
