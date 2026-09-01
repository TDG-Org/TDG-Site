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

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'tdg-theme'

/** Elements that carry themed colour. Everything else inherits. */
const THEMED =
  'section,article,nav,footer,div,span,p,h1,h2,h3,a,button,blockquote,img,canvas,svg'

/** Longest per-element delay in the wave, in ms. */
const WAVE_SPREAD = 640
const WAVE_RESTORE = 1700

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

    // The step that makes this animate instead of snap: land the new delays in
    // the layout before the colours change, so the browser has a "from" value.
    void document.body.offsetWidth

    setTheme(next)

    window.setTimeout(() => {
      clearBloom()
      wiping.current = false
      if (queued.current) {
        queued.current = false
        toggleRef.current?.(event)
      }
    }, 1050)
    window.setTimeout(clearDelays, WAVE_RESTORE)
  }, [])

  // so the queued press can re-enter without making `toggle` depend on itself
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
