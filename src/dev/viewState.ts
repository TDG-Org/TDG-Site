import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Keeping your place on the Developer console.
 *
 * ## The problem this exists for
 *
 * The console is one very long page, and the thing you are looking at is
 * usually eight hundred pixels down it: somebody's DevFleet Store packs, a row
 * in the audit log, the account you are halfway through editing. Re-reading the
 * data is a normal thing to want — a payment landed, a colleague changed
 * something, you are watching a grant take — and every naive way of doing it
 * throws that place away. `location.reload()` obviously does. So does a
 * re-render that shortens a list ABOVE where you are standing, because the
 * browser holds the scroll OFFSET, not the content.
 *
 * ## Anchors, not offsets
 *
 * So nothing here remembers a number of pixels if it can help it. It remembers
 * WHICH element was at the top of your screen and how far above or below the
 * top edge it was, and puts that element back at that offset afterwards. If a
 * search returns four fewer accounts, or a panel above you grows a warning, the
 * DevFleet Store section is still exactly where it was, because it is the thing
 * being held still rather than a scroll position that happens to have pointed
 * at it.
 *
 * Any element can be an anchor: it carries `data-dev-anchor="<a stable key>"`.
 * Every Panel does it automatically, and so does every roster row, so the
 * granularity is roughly "the thing you would name if asked what you were
 * looking at". Nesting is fine and is the point — the innermost anchor
 * straddling the top edge wins, so a panel inside an account detail beats the
 * detail, which beats the page.
 *
 * ## And when they really do reload the page
 *
 * F5 is not something a page gets to intercept, and a developer pressing it
 * deserves the same answer as the Refresh button. So the arrangement that
 * produced the view — which tab, which account, what was typed in the search,
 * which sections were open — is written to `sessionStorage` alongside the
 * anchor, and read back on the next boot. Restoring the anchor without the
 * arrangement would be pointless: the element you were looking at only exists
 * once the right account is selected and the right section is open.
 *
 * `sessionStorage`, deliberately: it dies with the browser tab. Coming back
 * tomorrow starts clean, which is the behaviour the console has always had.
 * A reload is the case being fixed here, not a habit being installed.
 */

/** An element to hold still, and where on the screen it was. */
export type Anchor = {
  /** Its `data-dev-anchor`, or null for "no anchor, this is a raw scrollY". */
  key: string | null
  /** Its distance from the top of the viewport. Negative when you are inside it. */
  top: number
}

const ATTR = 'data-dev-anchor'

/** The line an anchor is measured against: the very top of the viewport. */
const EDGE = 1

function anchorEls(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${ATTR}]`))
}

/**
 * What is at the top of the screen right now.
 *
 * The LAST anchor that straddles the top edge, so nesting resolves to the most
 * specific thing: an account's DevFleet Store panel rather than the pane that
 * holds it. Failing that the first anchor below the edge, which is what you get
 * at the top of the page. Failing that a plain scroll offset, so this can never
 * return nothing.
 */
export function captureAnchor(): Anchor {
  let straddling: Anchor | null = null
  let firstBelow: Anchor | null = null

  for (const el of anchorEls()) {
    const key = el.getAttribute(ATTR)
    if (!key) continue
    const r = el.getBoundingClientRect()
    // A section that is shut has no box. It is not what anybody is looking at.
    if (r.height === 0 && r.width === 0) continue
    if (r.top <= EDGE && r.bottom > EDGE) straddling = { key, top: Math.round(r.top) }
    else if (r.top > EDGE && !firstBelow) firstBelow = { key, top: Math.round(r.top) }
  }

  return straddling ?? firstBelow ?? { key: null, top: Math.round(window.scrollY) }
}

/** Put an anchor back. False when the element is not on the page (yet). */
export function applyAnchor(a: Anchor | null): boolean {
  if (!a) return false
  if (a.key === null) {
    window.scrollTo({ top: a.top, behavior: 'instant' })
    return true
  }
  const el = document.querySelector<HTMLElement>(`[${ATTR}="${CSS.escape(a.key)}"]`)
  if (!el) return false
  const delta = el.getBoundingClientRect().top - a.top
  // INSTANT, against the document's own `scroll-behavior: smooth`. This is not
  // a journey to somewhere, it is a correction for content that moved under
  // the reader, and it should be invisible rather than animated.
  if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: 'instant' })
  return true
}

type HoldOptions = {
  /** Give up after this long, whether or not it ever worked. */
  ms?: number
  /** Earliest it may stop early for having gone quiet. 0 means "never early". */
  settleAfterMs?: number
  /** Called exactly once, however it ended. */
  onEnd?: () => void
}

/**
 * Hold an anchor in place while the page keeps moving.
 *
 * One correction is not enough for either case this serves. A refresh lands
 * five reads that each re-render something, and a boot has to wait for the
 * element to exist at all. So it re-applies every frame until the position
 * stops changing or the deadline passes.
 *
 * **It surrenders the instant the reader touches anything.** A wheel, a drag,
 * a finger or a key means they are steering now, and a page that scrolls itself
 * back under somebody who is scrolling away from it is worse than one that
 * never tried. Only real input events count, never the `scroll` event, because
 * every scroll event here is one we caused ourselves.
 *
 * Returns its own stopper, for an unmount.
 */
export function holdAnchor(a: Anchor | null, opts: HoldOptions = {}): () => void {
  const { ms = 900, settleAfterMs = 0, onEnd } = opts
  if (!a || typeof window === 'undefined') {
    onEnd?.()
    return () => {}
  }

  const surrenders = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const
  let running = true
  let calm = 0
  /*
   * The clock starts on the FIRST DELIVERED FRAME, not on the call. A hidden
   * tab does not run `requestAnimationFrame` at all, so a page reloaded in a
   * background tab would come back to the front having spent its whole deadline
   * asleep and give up before it had ever tried once. Starting at the first
   * frame means the wait simply happens when the reader is looking.
   */
  let started: number | null = null

  const end = () => {
    if (!running) return
    running = false
    for (const e of surrenders) window.removeEventListener(e, end)
    onEnd?.()
  }

  for (const e of surrenders) window.addEventListener(e, end, { passive: true })

  const tick = () => {
    if (!running) return
    if (started === null) started = performance.now()
    const before = window.scrollY
    const found = applyAnchor(a)
    calm = found && Math.abs(window.scrollY - before) < 1 ? calm + 1 : 0
    const elapsed = performance.now() - started
    // Six quiet frames is "the page has stopped moving", not "one frame looked
    // fine": a list that re-renders twice would pass a single-frame test.
    if (elapsed >= ms || (settleAfterMs > 0 && elapsed >= settleAfterMs && calm >= 6)) {
      end()
      return
    }
    requestAnimationFrame(tick)
  }
  /*
   * Rule 9 sends animation through the shared frame loop. This is not
   * animation: it is a correction applied AFTER somebody else's layout, for
   * at most 900ms, and it scrolls INSTANTLY on purpose (see applyAnchor). It
   * wants a frame for the same reason a measurement does — the rect it reads
   * has to be the one React just committed.
   *
   * The alternative was tried on paper and loses on cost. `onFrame` calls
   * `wireWakeSources()` the first time anything subscribes, and that attaches
   * eight capture-phase listeners to the window — scroll, wheel, pointermove,
   * the lot — permanently, with no way to take them off again. The console
   * subscribes to nothing else: it has no parallax, no reveal and no tilt, so
   * on `#/dev` that loop is parked with an empty subscriber set and those
   * listeners do not exist. Waking all of it, for good, to run six hundred
   * milliseconds of scroll arithmetic would install exactly the always-on
   * scroll cost rule 9 was written to remove, on the one page that had none.
   *
   * There is a second reason it does not fit even if the cost were free: this
   * loop must SURRENDER on wheel, touchmove, keydown and pointerdown, which
   * are four of the events that wake the shared loop. Handing it a subscriber
   * that dies on the loop's own wake sources is a strange thing to own.
   */
  requestAnimationFrame(tick)

  return end
}

/* ── surviving a real reload ───────────────────────────────────────────── */

const KEY = 'tdg.dev.view'
/** Older than this and the arrangement is somebody else's afternoon. */
const MAX_AGE = 12 * 60 * 60 * 1000

/** Everything it takes to put the page back the way it was. */
export type DevView = {
  v: 1
  at: number
  /** Which of the three tabs. Kept loose: this file does not own that list. */
  tab: string
  selectedId: string | null
  query: string
  /** Section ids that were open, from `useSections().openIds`. */
  open: string[]
  anchor: Anchor | null
}

/**
 * Only the FIRST console mount of a document is a reload.
 *
 * This module is imported lazily, the first time the console mounts, so the
 * flag being true means "this browser has just loaded the page". Every later
 * mount is somebody clicking Developer in the nav, and that should do what
 * opening a page has always done: land at the top of it, with nothing selected
 * and an empty search box. Putting them halfway down somebody else's account
 * because that is where they were twenty minutes ago is a page that feels
 * broken, not a page that remembers.
 */
let firstMount = true

/** What this page looked like before it was reloaded, or null for a fresh visit. */
export function readView(): DevView | null {
  const reload = firstMount
  firstMount = false
  if (!reload) return null
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<DevView>
    if (v.v !== 1 || typeof v.at !== 'number' || Date.now() - v.at > MAX_AGE) return null
    return {
      v: 1,
      at: v.at,
      tab: typeof v.tab === 'string' ? v.tab : 'accounts',
      selectedId: typeof v.selectedId === 'string' ? v.selectedId : null,
      query: typeof v.query === 'string' ? v.query : '',
      open: Array.isArray(v.open) ? v.open.filter((x): x is string => typeof x === 'string') : [],
      anchor:
        v.anchor && typeof v.anchor.top === 'number'
          ? { key: typeof v.anchor.key === 'string' ? v.anchor.key : null, top: v.anchor.top }
          : null,
    }
  } catch {
    // A blocked or full sessionStorage is not a reason for the console to fail
    // to render. The page simply opens at the top, the way it always did.
    return null
  }
}

function writeView(view: Omit<DevView, 'v' | 'at' | 'anchor'>) {
  try {
    const payload: DevView = { ...view, v: 1, at: Date.now(), anchor: captureAnchor() }
    window.sessionStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* Private mode, a quota, a locked-down browser. None of it is worth an error. */
  }
}

/**
 * Restore the remembered place, once, on boot.
 *
 * Slow on purpose. The element being aimed at usually does not exist yet: the
 * roster has to arrive, the account has to be selected from it, its ten panels
 * have to mount and the right one has to be open. So this keeps trying for a
 * few seconds and stops as soon as it has landed and the page has gone quiet.
 *
 * Returns whether it has finished — which is also permission to start SAVING,
 * because saving before the restore lands would overwrite the remembered place
 * with the top of the page it is halfway through leaving.
 */
export function useRestoreView(anchor: Anchor | null): boolean {
  const [done, setDone] = useState(anchor === null)

  useEffect(() => {
    if (!anchor) return
    // The browser's own restoration aims at a scroll offset on a page whose
    // content arrives later, so it lands somewhere arbitrary and then fights
    // this. Ours is the one that knows what it is looking for.
    const previous = history.scrollRestoration
    try {
      history.scrollRestoration = 'manual'
    } catch {
      /* Not supported; ours still runs and still wins, it just runs second. */
    }

    let live = true
    const stop = holdAnchor(anchor, {
      ms: 6000,
      settleAfterMs: 1200,
      onEnd: () => {
        if (live) setDone(true)
      },
    })

    return () => {
      live = false
      stop()
      try {
        history.scrollRestoration = previous
      } catch {
        /* As above. */
      }
    }
  }, [anchor])

  return done
}

/**
 * Keep the remembered place up to date.
 *
 * Written on every arrangement change and on a quiet moment after scrolling,
 * rather than on every scroll event: this is a `JSON.stringify` and a
 * `sessionStorage` write, and doing one of those per frame of a flick scroll is
 * the kind of always-on cost this site does not pay. `pagehide` covers the
 * reload itself, which is the whole reason any of it is written down.
 */
export function useRememberView(
  view: { tab: string; selectedId: string | null; query: string; open: readonly string[] },
  ready: boolean,
) {
  const latest = useRef(view)
  latest.current = view

  const save = useCallback(() => {
    const v = latest.current
    writeView({ tab: v.tab, selectedId: v.selectedId, query: v.query, open: [...v.open] })
  }, [])

  useEffect(() => {
    if (!ready) return
    save()
  }, [ready, save, view.tab, view.selectedId, view.query, view.open])

  useEffect(() => {
    if (!ready) return
    let timer = 0
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(save, 250)
    }
    /*
     * Rule 9 says never add a scroll listener, and means it about MOTION:
     * anything that moves reads element rects on the shared frame loop, so the
     * page's choreography never depends on who owns the scroll. Nothing moves
     * here. This listener drives one `JSON.stringify` into `sessionStorage`,
     * 250ms after the page has stopped, and paints nothing at all.
     *
     * Routing it through `onFrame` would invert the cost rather than pay it.
     * The shared loop only notices a scroll because `wireWakeSources()`
     * attaches its own capture-phase scroll listener — so the rule-abiding
     * version is this listener, plus a second one underneath it, plus a frame
     * loop held awake to poll a number that changes about four times a minute.
     * `passive: true` and a debounce is the cheap end of that trade.
     *
     * It is also not the only saver, and deliberately: `pagehide` below is
     * what catches the reload this whole file exists for. This one is the belt
     * to that brace — a tab discarded or crashed never fires `pagehide`, and
     * then the remembered place is at most a quarter of a second stale instead
     * of as old as the last time a section was opened.
     */
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', save)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', save)
      // Leaving the console is also a moment worth recording: coming back to
      // #/dev in this tab should land where you left it.
      save()
    }
  }, [ready, save])
}
