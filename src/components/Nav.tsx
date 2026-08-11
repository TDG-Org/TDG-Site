import { useEffect, useRef, useState } from 'react'
import { onFrame } from '../lib/motion'
import { useTheme } from '../theme/ThemeProvider'
import { GITHUB_ORG, NAV_LINKS } from '../data/content'
import './Nav.css'

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      className="nav__toggle"
      aria-label="Toggle light and dark"
      aria-pressed={theme === 'light'}
      onClick={toggle}
    >
      <span className="nav__knob">
        <span className="nav__moon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
          </svg>
        </span>
        <span className="nav__sun">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4.1" />
            <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M18.8 5.2l-1.5 1.5M6.7 17.3l-1.5 1.5" />
          </svg>
        </span>
      </span>
    </button>
  )
}

export function Nav() {
  const { theme } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const indicator = useRef<HTMLSpanElement | null>(null)
  const progress = useRef<HTMLDivElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)

  // Nav state is driven by a sentinel at the very top of the page, not by a
  // scroll listener, so it stays correct whichever element owns the scroll.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      threshold: 0,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const bar = progress.current
    if (!bar) return
    let top: HTMLElement | null = null
    return onFrame(({ vh }) => {
      top ??= document.getElementById('top')
      const max = document.documentElement.scrollHeight - vh || 1
      const travelled = top ? Math.max(0, -top.getBoundingClientRect().top) : 0
      const pct = Math.max(0, Math.min(100, (travelled / max) * 100)).toFixed(2)
      return () => {
        bar.style.width = `${pct}%`
      }
    })
  }, [])

  // Height has to be measured to animate it; max-height:none will not tween.
  useEffect(() => {
    const el = panel.current
    if (!el) return
    el.style.maxHeight = menuOpen ? `${el.scrollHeight + 40}px` : '0px'
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const onResize = () => {
      if (window.innerWidth > 820) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [menuOpen])

  // The hero is a dark scene in dark mode; chrome sitting over it stays light.
  const overDark = !scrolled && theme === 'dark'

  const lightIndicator = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const bar = indicator.current
    if (!bar) return
    const link = event.currentTarget
    bar.style.left = `${link.offsetLeft}px`
    bar.style.width = `${link.offsetWidth}px`
    bar.style.opacity = '1'
  }

  return (
    <>
      <div ref={sentinel} className="nav__sentinel" aria-hidden="true" />
      <nav className="nav" data-scrolled={scrolled} data-over-dark={overDark}>
        <div className="nav__veil" aria-hidden="true" />

        <a href="#top" className="nav__mark" aria-label="TDG — home">
          <span className="nav__mark-bar" />
          <span className="nav__mark-bar" />
        </a>

        <div className="nav__links" onPointerLeave={() => indicator.current?.style.setProperty('opacity', '0')}>
          <span ref={indicator} className="nav__indicator" aria-hidden="true" />
          {NAV_LINKS.map((link) => (
            <a key={link.href} className="nav__link" href={link.href} onPointerEnter={lightIndicator}>
              {link.label}
            </a>
          ))}
        </div>

        <div className="nav__actions">
          <button
            type="button"
            className="nav__burger"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="nav-panel"
            data-open={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="nav__burger-line" />
            <span className="nav__burger-line" />
            <span className="nav__burger-line" />
          </button>

          <ThemeToggle />

          <a className="nav__github" href={GITHUB_ORG} target="_blank" rel="noopener">
            GitHub ↗
          </a>
        </div>

        <div
          id="nav-panel"
          ref={panel}
          className="nav__panel"
          data-open={menuOpen}
        >
          <div className="nav__panel-inner">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                className="nav__panel-link"
                href={link.href}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              className="nav__panel-cta"
              href={GITHUB_ORG}
              target="_blank"
              rel="noopener"
              onClick={() => setMenuOpen(false)}
            >
              GitHub ↗
            </a>
          </div>
        </div>

        <div ref={progress} className="nav__progress" aria-hidden="true" />
      </nav>
    </>
  )
}
