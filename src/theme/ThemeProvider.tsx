import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { motionIntensity } from '../lib/motion'
import { prefetchInactiveArt } from './artPrefetch'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'tdg-theme'

/** Elements that carry themed colour. Everything else inherits. */
const THEMED =
  'section,article,nav,footer,div,span,p,h1,h2,h3,a,button,blockquote,img,canvas,svg'

/** Longest per-element delay in the wave, in ms. */
const WAVE_SPREAD = 640
const WAVE_RESTORE = 1700

/**
 * How far outside the viewport a slot still earns a cross-fade, in px.
 *
 * A layer nobody can see has nothing to cross: it can swap its `src` in one
 * frame and no reader is any the wiser. Skipping those is most of the saving
 * — twelve of the page's twenty-seven art slots are on screen at 1440x900 —
 * and it also keeps this away from the lazy art below the fold, which has no
 * image loaded to clone in the first place. The margin is deliberately small
 * next to `useParallax`'s 400px, because that one is protecting a lerp that
 * needs seventeen frames to settle and this one is protecting a fade that has
 * either started or not.
 */
const CROSS_MARGIN = 200

type ThemeContextValue = {
  theme: Theme
  /** Flip the theme. Pass the click event so the wave can start at the toggle. */
  toggle: (event?: { currentTarget: Element | null }) => void
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', toggle: () => {} })

export const useTheme = () => useContext(ThemeContext)

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* private mode */
  }
  return 'dark'
}

/**
 * Give every themed element its own transition delay, based on how far it sits
 * from the origin point as a fraction of the farthest corner. Returns a
 * cleanup that puts the delays back to zero.
 */
function stageWave(origin: { x: number; y: number }): () => void {
  const w = window.innerWidth || 1200
  const h = window.innerHeight || 800
  const far =
    Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y)) || 1

  const elements = Array.from(document.querySelectorAll<HTMLElement>(THEMED))

  // Measure everything first, then write. --wave-delay is inherited, so a write
  // dirties the whole subtree; interleaving the two forced a style recalc per
  // element and blocked the main thread through the start of the wave.
  const delays: number[] = []
  for (const el of elements) {
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) {
      delays.push(-1)
      continue
    }
    const cx = r.left + r.width / 2
    // clamp tall elements so a full-page section does not measure from its middle
    const cy = Math.max(-h, Math.min(h * 2, r.top + Math.min(r.height / 2, h * 0.6)))
    delays.push(
      Math.round(
        Math.min(WAVE_SPREAD, (Math.hypot(cx - origin.x, cy - origin.y) / far) * WAVE_SPREAD),
      ),
    )
  }
  for (let i = 0; i < elements.length; i++) {
    if (delays[i] >= 0) elements[i].style.setProperty('--wave-delay', `${delays[i]}ms`)
  }

  return () => {
    for (const el of elements) el.style.removeProperty('--wave-delay')
  }
}

/**
 * The cross-fade still to be taken down, if a press arrives before the last
 * one finished. Module scope because there is exactly one `ThemeProvider` and
 * because `crossArt` has to be able to clean up after a call it did not make:
 * a second press is accepted at 1050 ms and the fade is not down until 1700.
 */
let clearCrossFade: (() => void) | null = null

/**
 * Cross-fade every piece of parallax art that is on screen, so the scenery
 * dissolves across the wave instead of cutting.
 *
 * ## Why this is here and not in `ThemedArt`
 *
 * The art is an `<img>` whose `src` is rebuilt from the theme, and a resource
 * swap has no interpolable value: CSS can cross-fade a colour and cannot
 * cross-fade a file. So the outgoing picture has to keep existing for the
 * length of the fade, which means a second element per slot.
 *
 * Doing that in React would mean re-rendering twenty-seven components and
 * re-keying their `<img>`s — and re-keying is the one thing that must not
 * happen here, because `useParallax` captures `ref.current` in an effect keyed
 * on `factor` alone. Replace the element under it and the hook goes on writing
 * `translate` to a node that is no longer in the document, and that slot's
 * drift is dead for the rest of the session. Cloning leaves every original
 * element, every ref and every subscriber exactly where it was.
 *
 * ## What a clone costs, and for how long
 *
 * `cloneNode(false)` copies the `src` of an image this document has already
 * decoded, so the clone paints on the same frame from the renderer's list of
 * available images: no request, no decode, no blank. It also copies the inline
 * `translate` the parallax hook last wrote and the `--wave-delay` `stageWave`
 * just wrote, so the ghost sits exactly where its original sits and crosses in
 * the same phase of the wave. It does not move again — a ghost is frozen for
 * the 600 ms it is visible, which is only observable if you flick-scroll
 * through the wave, and a decorative layer smearing past at that speed is
 * already the wrong thing to spend a per-frame subscriber on.
 *
 * Two decoded images per on-screen slot, for the length of the wave, and then
 * none: `clear()` removes every ghost and takes the inline properties back off
 * every original. Nothing this adds is alive at rest.
 *
 * ## Why `filter: opacity()` and not `opacity`
 *
 * Each caller's own class owns `opacity` — `--art-far` / `--art-mid` /
 * `--art-near`, and in the hero a product with `--hero-sink` that is rewritten
 * every frame. An inline `opacity` would have to know and restate that number;
 * `filter: opacity()` multiplies whatever is already there and leaves it
 * alone. The ghost freezes its own computed `opacity` because the token under
 * it changes with the theme (0.5 dark, 0.36 light for `--art-far`), and a
 * ghost that took the NEW theme's alpha would dim by a third on the first
 * frame of a fade whose whole job is to be unnoticeable.
 */
function crossArt(): { arm: () => void; clear: () => void } {
  // A press queued mid-wave re-enters at 1050 ms, before the last fade has
  // been taken down. Take it down now, or the clones below are clones of
  // clones and the originals never get their filter back.
  clearCrossFade?.()

  const w = window.innerWidth || 1200
  const h = window.innerHeight || 800
  const arts = Array.from(
    document.querySelectorAll<HTMLImageElement>('img.scene__art:not([data-theme-ghost])'),
  )

  // Measure everything first, then write. Same rule as stageWave above and the
  // same reason: these writes dirty style for the whole subtree, and reading a
  // rect back in between forces a recalc per element at the one moment the
  // main thread is least free.
  const boxes = arts.map((el) => el.getBoundingClientRect())
  /*
   * ── the six lengths that make the skyline stop JUMPING ────────────────────
   *
   * The ghost is a clone in the same document, so the instant `data-theme`
   * flips it is laid out by the NEW theme's rules — and in the Cebu pair the
   * two themes are not the same GEOMETRY. `.hero__rear`, `.hero__mid` and
   * `.hero__ridge` are placed from `--terrain-w`, `--art-rise` and
   * `--art-head`, and all three differ per theme because a sea horizon and a
   * mountain skyline stand at different heights. So the outgoing picture
   * snapped to the incoming picture's position on frame one and then
   * cross-faded there: the site owner's report is a "weird visual where the
   * mountains jump up", with a screenshot of the mid-wave frame showing it.
   *
   * The fade was never the problem. The fix is that the outgoing art must
   * stay WHERE IT WAS and fade out there, while the incoming art fades in
   * where it belongs — which is a cross-dissolve between two compositions
   * rather than one composition being yanked. Freezing these six resolved
   * lengths on the ghost does exactly that: custom properties can change
   * underneath it and none of them is read any more.
   *
   * `bottom` alone is not enough. `left` and `width` are built from
   * `--terrain-w` too, so a ghost pinned only vertically slides sideways and
   * changes size instead.
   *
   * It costs nothing extra to measure: this is the same `getComputedStyle`
   * call that was already being made for `opacity`, read six more times, and
   * it is inside the read pass that is deliberately separated from the writes
   * below.
   */
  const frozen = arts.map((el) => {
    const cs = getComputedStyle(el)
    return {
      opacity: cs.opacity,
      left: cs.left,
      top: cs.top,
      right: cs.right,
      bottom: cs.bottom,
      width: cs.width,
      height: cs.height,
    }
  })

  const pairs: { art: HTMLImageElement; ghost: HTMLImageElement }[] = []
  for (let i = 0; i < arts.length; i++) {
    const box = boxes[i]
    if (!box.width && !box.height) continue
    if (box.bottom < -CROSS_MARGIN || box.top > h + CROSS_MARGIN) continue
    if (box.right < -CROSS_MARGIN || box.left > w + CROSS_MARGIN) continue

    const art = arts[i]
    const ghost = art.cloneNode(false) as HTMLImageElement
    ghost.setAttribute('data-theme-ghost', '')
    const f = frozen[i]
    ghost.style.opacity = f.opacity
    /* Pinned in place, in the DOM position it was cloned into — NOT
       `position: fixed`. Several of these live inside a wrapper with its own
       `overflow: clip` (`.origin__tops`, `.origin__mist`, `.origin__ground`,
       `.outro__stair-clip`), and a ghost taken out of the flow would paint the
       part of itself those boxes exist to cut off. */
    ghost.style.left = f.left
    ghost.style.top = f.top
    ghost.style.right = f.right
    ghost.style.bottom = f.bottom
    ghost.style.width = f.width
    ghost.style.height = f.height
    ghost.classList.add('scene__art--crossing')
    ghost.style.setProperty('--cross', '1')
    art.classList.add('scene__art--crossing')
    art.style.setProperty('--cross', '0')
    // After, never before: the ghost is the outgoing picture and has to paint
    // ON TOP of the incoming one, and neither carries a z-index.
    art.after(ghost)
    pairs.push({ art, ghost })
  }

  /*
   * Once, and only once.
   *
   * A press queued mid-wave re-enters at 1050 ms and `crossArt` clears this
   * fade there — but the timer that was going to clear it at 1700 ms is still
   * armed, and the elements it holds are the SAME originals the new fade is
   * now running on. Without this flag that timer strips the new fade's class
   * and `--cross` off every original at the 650 ms mark of a 600 ms fade: the
   * pictures jump to full while their ghosts are still fading out on top of
   * them, which reads as the double-press flashing. Measured as 12 ghosts
   * against 12 crossing elements where there should have been 24.
   */
  let done = false
  const clear = () => {
    if (done) return
    done = true
    if (clearCrossFade === clear) clearCrossFade = null
    for (const { art, ghost } of pairs) {
      ghost.remove()
      art.classList.remove('scene__art--crossing')
      art.removeAttribute('data-cross')
      art.style.removeProperty('--cross')
    }
  }
  clearCrossFade = clear

  return {
    /*
     * Called one forced layout later, so the values above are something to
     * interpolate FROM, and `data-cross` is what brings the transition with it.
     *
     * The transition CANNOT be declared alongside the filter with a duration
     * of 0s for the first write: `transition: filter 0s ease 400ms` is still a
     * transition and holds the property at its old value for the whole delay.
     * Written that way, phase one never landed, phase two found nothing to
     * change, and every on-screen slot sat at `opacity(1)` 300 ms into a wave
     * with exactly one ghost moving. Scene.css carries the same note beside
     * the rule.
     */
    arm: () => {
      for (const { art, ghost } of pairs) {
        art.dataset.cross = 'run'
        ghost.dataset.cross = 'run'
        art.style.setProperty('--cross', '1')
        ghost.style.setProperty('--cross', '0')
      }
    },
    clear,
  }
}

/** The translucent bloom + expanding ring that the recolouring rides on. */
function paintBloom(cx: number, cy: number, toLight: boolean): () => void {
  const far = Math.hypot(
    Math.max(cx, window.innerWidth - cx),
    Math.max(cy, window.innerHeight - cy),
  )

  const wash = document.createElement('div')
  wash.setAttribute('aria-hidden', 'true')
  wash.style.cssText =
    'position:fixed;inset:0;z-index:9998;pointer-events:none;opacity:0;will-change:opacity;' +
    'transition:opacity 300ms ease;background:radial-gradient(circle at ' +
    cx +
    'px ' +
    cy +
    'px,' +
    (toLight
      ? 'rgba(255,255,255,.40),rgba(255,255,255,.16) 46%,rgba(255,255,255,0) 76%'
      : 'rgba(158,158,184,.26),rgba(18,18,26,.14) 46%,rgba(0,0,0,0) 76%') +
    ')'

  const ring = document.createElement('div')
  ring.setAttribute('aria-hidden', 'true')
  ring.style.cssText =
    'position:fixed;left:' +
    cx +
    'px;top:' +
    cy +
    'px;width:10px;height:10px;margin:-5px 0 0 -5px;z-index:9999;pointer-events:none;' +
    'border-radius:50%;border:1.5px solid ' +
    (toLight ? 'rgba(20,20,26,.5)' : 'rgba(255,255,255,.75)') +
    ';box-shadow:0 0 34px ' +
    (toLight ? 'rgba(20,20,26,.28)' : 'rgba(255,255,255,.55)') +
    ';will-change:transform,opacity;transition:transform 1000ms cubic-bezier(.5,0,.15,1),opacity 1000ms ease'

  document.body.append(wash, ring)
  void wash.offsetWidth
  wash.style.opacity = '1'
  ring.style.transform = `scale(${(far + 60) / 5})`
  ring.style.opacity = '0'

  // Rule 9's exemption, taken: a one-shot timer that sequences a CSS
  // transition. Nothing repaints on a tick — the browser runs the fade
  // itself — and putting a 300 ms delay on the frame loop would hold it awake
  // for eighteen frames to fire once. It dies with the wipe: the cleanup
  // below clears it and removes both elements.
  const fade = window.setTimeout(() => {
    wash.style.transition = 'opacity 640ms ease'
    wash.style.opacity = '0'
  }, 300)

  return () => {
    window.clearTimeout(fade)
    wash.remove()
    ring.remove()
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === 'undefined' ? 'dark' : readStoredTheme(),
  )
  const wiping = useRef(false)
  /** First run of the effect below is the mount, not a toggle: nothing to
   *  wait out, and the art prefetch should start as soon as `load` allows. */
  const first = useRef(true)
  /** A toggle pressed mid-wave is remembered, not dropped on the floor. */
  const queued = useRef(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    /*
     * The browser's own chrome follows the toggle too. `theme-color` used to
     * be two metas keyed on `prefers-color-scheme`, which follow the OS and
     * not this switch — so a visitor who chose light here on a dark phone read
     * a pale page under a black address bar. One meta, rewritten from the
     * page's live `--bg` the moment the attribute lands: the computed value is
     * already the new theme's on this line (custom properties do not transition
     * — `--t-theme` eases the properties that read them), and reading it here
     * rather than typing a hex is rule 2. index.html seeds the same meta before
     * first paint from the stored choice.
     */
    const meta = document.querySelector('meta[name="theme-color"]')
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (meta && bg) meta.setAttribute('content', bg)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* private mode */
    }
    /*
     * Queue the other theme's scenery behind `load` and the first idle moment,
     * so a toggle costs no requests. Called on every theme change rather than
     * once, because the first pass can only warm the twins of slots the page
     * has actually loaded its own file for, and everything below the fold is
     * `loading="lazy"`. After a toggle it runs again, held until the wave has
     * finished so its low-priority requests do not land inside one.
     * `artPrefetch.ts` carries the reasoning and the refusals.
     */
    prefetchInactiveArt(theme, first.current ? 0 : WAVE_RESTORE)
    first.current = false
  }, [theme])

  const toggle = useCallback((event?: { currentTarget: Element | null }) => {
    // A second press during the 1.05s wave used to be dropped silently. Hold it
    // and run it when the wave lands instead.
    if (wiping.current) {
      queued.current = true
      return
    }
    const next: Theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'

    if (motionIntensity() === 0) {
      setTheme(next)
      return
    }

    const rect = event?.currentTarget?.getBoundingClientRect()
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth - 90
    const cy = rect ? rect.top + rect.height / 2 : 40

    wiping.current = true
    const clearBloom = paintBloom(cx, cy, next === 'light')
    const clearDelays = stageWave({ x: cx, y: cy })
    // After stageWave, so each ghost is cloned with its original's --wave-delay
    // already on it and crosses in the same phase of the wave.
    const cross = crossArt()

    // The step that makes this animate instead of snap: land the new delays and
    // the cross-fade's starting values in the layout before the colours change,
    // so the browser has a "from" value for both.
    void document.body.offsetWidth

    cross.arm()
    setTheme(next)

    // Rule 9's exemption, taken twice: two one-shot timers that end the wave
    // — one clears the bloom and lets a press queued mid-wave go, the other
    // takes the stagger delays back off the sections. Neither repaints
    // anything; the CSS transitions are the animation, and a loop subscriber
    // would have held the loop awake for a second to fire two events. Both
    // end by themselves, and a second press cannot stack them: `wiping`
    // refuses it until the first has cleared.
    window.setTimeout(() => {
      clearBloom()
      wiping.current = false
      if (queued.current) {
        queued.current = false
        toggleRef.current?.(event)
      }
    }, 1050)
    window.setTimeout(clearDelays, WAVE_RESTORE)
    // The same restore point, and for the same reason: by 1700 ms the longest
    // delayed slot (WAVE_SPREAD) has finished --t-art's 0.6s fade with room to
    // spare, so every ghost comes out of the document and every original gets
    // its filter back. Nothing the toggle added is alive after this.
    window.setTimeout(cross.clear, WAVE_RESTORE)
  }, [])

  // so the queued press can re-enter without making `toggle` depend on itself
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
