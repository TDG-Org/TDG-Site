import type { Theme } from './ThemeProvider'

/**
 * Fetch the OTHER theme's parallax art while the page is idle, so pressing the
 * toggle costs no requests at all.
 *
 * ## Why this exists
 *
 * Every piece of scenery is an `<img>` whose `src` is rebuilt from the theme
 * (`components/scene/ThemedArt.tsx`). A resource swap has no interpolable
 * value and nothing else on the page preloads the inactive set, so the FIRST
 * toggle used to send about two dozen WebP requests and then repaint the
 * scenery as they landed — measured in headless Chrome on the home page at
 * 1440x900: thirteen requests during the wave for the twelve slots on screen.
 * The cross-fade in `ThemeProvider.tsx` cannot help with that, because there
 * is nothing to fade to until the bytes arrive.
 *
 * ## Why the list is read off the DOM rather than written down
 *
 * The art kit has 32 pieces and the page draws a moving subset of them; the
 * count in `public/assets/parallax/README.md` has been wrong twice already,
 * both times because it was typed rather than derived. So this asks the page
 * what it is actually showing — `img.scene__art` — and swaps the theme suffix
 * on each `src`. A slot added, removed or repointed tomorrow is covered with
 * no edit here, and a piece nobody draws is never fetched.
 *
 * ## Why the `Image` objects are kept
 *
 * Dropping them would leave the bytes to the HTTP cache alone, and a
 * disk-cache hit is still a request in the network panel and still a stall on
 * a slow disk. Held, they stay in the renderer's list of available images, so
 * the swap is synchronous and the network panel stays empty during a toggle —
 * which is the thing this was asked to make true. What is held is the ENCODED
 * file (the kit's whole WebP set is 4.27 MB across 64 files, and this is at
 * most one theme's half of the subset the page draws); nothing is decoded
 * until something paints it.
 *
 * ## What it will not do
 *
 * - **Not before `load`.** A decorative preload that delays first paint or
 *   the visible theme's own art has the sign wrong.
 * - **Not off idle.** Every batch is scheduled from `requestIdleCallback` and
 *   the next is only queued once the last has settled, so a reader who starts
 *   scrolling gets the lazy loads they can see, at full priority, first.
 * - **Not on a metered or slow connection.** `saveData` or a 2G
 *   `effectiveType` and this does nothing at all.
 */

type SaverConnection = {
  saveData?: boolean
  effectiveType?: string
}

const OTHER: Record<Theme, Theme> = { dark: 'light', light: 'dark' }

/** Every URL already asked for, so a second pass over the same page is free. */
const asked = new Set<string>()

/** See "Why the `Image` objects are kept" above. Never emptied on purpose. */
const held: HTMLImageElement[] = []

const queue: string[] = []
let running = false

/** True when the visitor has told the browser not to spend bytes on this. */
function metered(): boolean {
  const connection = (navigator as Navigator & { connection?: SaverConnection }).connection
  if (!connection) return false
  return (
    connection.saveData === true ||
    connection.effectiveType === '2g' ||
    connection.effectiveType === 'slow-2g'
  )
}

/**
 * Rule 9's exemption, taken: this is not animation, no tick of it repaints
 * anything that is moving, the shared frame loop would be strictly worse
 * (it would be held awake at 60 Hz to fire a fetch once every few hundred ms,
 * and it is asleep on a parked page — which is exactly when this should run),
 * and it ends by itself the moment the queue is empty. `requestIdleCallback`
 * is also the only scheduler that answers the question being asked here:
 * "is the main thread free right now?"
 */
function idle(run: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 6000 })
  else window.setTimeout(run, 1500)
}

/**
 * How many files one idle slot starts.
 *
 * It was ONE, and one was measured too slow: a cold load in dark, four seconds
 * of idle, then a toggle still sent nine requests, because thirteen files at
 * one round trip plus one idle callback each does not finish inside the time a
 * visitor takes to reach for the switch. Four drains the same thirteen in
 * three or four slots, leaves most of the connection pool free, and still
 * hands the whole queue back to `requestIdleCallback` between batches — so a
 * reader who starts scrolling mid-prefetch interrupts it after at most four
 * files rather than after none.
 */
const BATCH = 4

/** A batch, then back to the idle queue for the next. */
function pump(): void {
  const batch = queue.splice(0, BATCH)
  if (batch.length === 0) {
    running = false
    return
  }
  let outstanding = batch.length
  const settled = () => {
    outstanding--
    if (outstanding === 0) idle(pump)
  }
  for (const url of batch) {
    const image = new Image()
    image.decoding = 'async'
    /* Low, and it matters: a visitor who scrolls while this is running has
       lazy art of their own to load, and that art is the one they can see.
       This is the mechanism that lets a batch be more than one. */
    image.fetchPriority = 'low'
    image.addEventListener('load', settled, { once: true })
    /* A 404 here is a missing `-light.webp` beside a `-dark.png`, which the
       kit's README warns about and which fails silently on the page too. Move
       on: a decorative preload is not the place to report it. */
    image.addEventListener('error', settled, { once: true })
    image.src = url
    held.push(image)
  }
}

function scan(theme: Theme): void {
  const other = OTHER[theme]
  let queued = 0
  for (const art of document.querySelectorAll<HTMLImageElement>('img.scene__art')) {
    /* The ATTRIBUTE, not the property: `src` resolved to an absolute URL still
       works, but the attribute is the string `asset()` built and is the one
       the twin has to be derived from. */
    const src = art.getAttribute('src')
    if (src === null) continue
    const twin = src.replace(`-${theme}.webp`, `-${other}.webp`)
    if (twin === src || asked.has(twin)) continue
    asked.add(twin)
    queue.push(twin)
    queued++
  }
  if (queued === 0 || running) return
  running = true
  idle(pump)
}

/**
 * Queue the inactive theme's art behind `load` and the first idle moment.
 *
 * Safe to call on every theme change, and it has to be called on every theme
 * change: the first pass warms the twins of every slot the page references,
 * but only the slots on screen have their OWN file loaded — the rest are
 * `loading="lazy"` and have never been asked for. So a reader who scrolls to
 * the bridge in light and then toggles would find the bridge's dark file
 * missing, which is the mid-page half of the defect this exists to fix. The
 * pass after a toggle is what fills that in. URLs already asked for are
 * skipped, so the repeat costs one `querySelectorAll`.
 *
 * `notBefore` holds that second pass until the wave is over. Without it the
 * first idle moment arrives DURING the wave — the wave runs on the compositor,
 * so the main thread is free exactly when this is looking for a gap — and ten
 * low-priority requests for off-screen art land in the middle of a toggle that
 * is supposed to need none. They were never what the scenery was waiting on,
 * but "no requests during the toggle" is the thing being claimed, and a claim
 * you have to explain away is not the claim.
 */
export function prefetchInactiveArt(theme: Theme, notBefore = 0): void {
  if (typeof document === 'undefined' || metered()) return
  const start = () => idle(() => scan(theme))
  const begin =
    notBefore > 0
      ? /* Rule 9's exemption again, and the same three answers: not animation,
           worse on the frame loop (which is parked on a settled page, which is
           when this wants to run), and over by itself the moment it fires. */
        () => window.setTimeout(start, notBefore)
      : start
  if (document.readyState === 'complete') begin()
  else window.addEventListener('load', begin, { once: true })
}
