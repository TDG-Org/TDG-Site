import { useEffect, useRef, useState } from 'react'
import { onFrame } from '../lib/motion'
import { useTheme } from '../theme/ThemeProvider'
import { useAuth } from '../auth/AuthProvider'
import { NAV_LINKS } from '../data/content'
import { useRoute, STORE_HASH, DEV_HASH, type Route } from '../lib/route'
import { setDevMode, useDevMode } from '../dev/devMode'
import './Nav.css'

/**
 * The Developer tab, appended to the nav for a signed-in TDG developer with
 * Developer Mode on, and for nobody else, ever.
 *
 * It is not in NAV_LINKS because that array is the site's public navigation and
 * is read by everything; this is one link with two conditions on it. Hiding it
 * is tidiness rather than security: `#/dev` renders the home page for anybody
 * who is not a developer, and the console's data all comes from Postgres
 * functions that refuse them. See src/dev/README.md.
 */
const DEV_LINK = { href: DEV_HASH, label: 'Developer' } as const

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

function AccountMenu() {
  const { user, profile, signOut, isAdmin } = useAuth()
  const devMode = useDevMode()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="nav__account" ref={ref}>
      <button
        type="button"
        className="nav__auth-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Account
      </button>
      <div className="nav__account-panel" data-open={open}>
        <div className="nav__account-name">{profile?.display_name || profile?.username || 'Signed in'}</div>
        {profile?.username && <div className="nav__account-handle">@{profile.username}</div>}
        {user?.email && <div className="nav__account-email">{user.email}</div>}
        {/* The only way back once the tab is hidden, so it lives here rather
            than on the console page itself. A switch you can only reach
            through the thing it hides is a switch you cannot un-flip. */}
        {isAdmin && (
          <button
            type="button"
            role="switch"
            aria-checked={devMode}
            className="nav__devmode"
            onClick={() => setDevMode(!devMode)}
          >
            <span className="nav__devmode-label">Developer Tab</span>
            <span className="nav__devmode-track" aria-hidden="true">
              <span className="nav__devmode-knob" />
            </span>
          </button>
        )}
        <button
          type="button"
          className="nav__account-signout"
          onClick={() => {
            setOpen(false)
            signOut()
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

/** Only a ROUTE can be the current page; the rest are anchors on this one. */
function isCurrent(href: string, route: Route): boolean {
  if (href === STORE_HASH) return route === 'store'
  if (href === DEV_HASH) return route === 'dev'
  return false
}

export function Nav({ onOpenAuth }: { onOpenAuth: () => void }) {
  const { theme } = useTheme()
  const { status, profile, signOut, isAdmin } = useAuth()
  const devMode = useDevMode()
  const route = useRoute()
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
    let painted = ''
    return onFrame(({ vh }) => {
      // Re-resolved when the cached node has left the document: switching to
      // the Store replaces the page, and a detached element reports a rect of
      // zeros for ever, which pins the bar at 0% with nothing to see.
      if (!top || !top.isConnected) top = document.getElementById('top')
      const max = document.documentElement.scrollHeight - vh || 1
      const travelled = top ? Math.max(0, -top.getBoundingClientRect().top) : 0
      const next = `${Math.max(0, Math.min(100, (travelled / max) * 100)).toFixed(2)}%`
      if (next === painted) return
      painted = next
      return () => {
        bar.style.width = next
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

  // One list, so the desktop bar and the mobile panel can never disagree about
  // whether the Developer tab is there.
  const links = isAdmin && devMode ? [...NAV_LINKS, DEV_LINK] : NAV_LINKS

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

        <a href="#top" className="nav__mark" aria-label="TDG home">
          <span className="nav__mark-bar" />
          <span className="nav__mark-bar" />
        </a>

        <div className="nav__links" onPointerLeave={() => indicator.current?.style.setProperty('opacity', '0')}>
          <span ref={indicator} className="nav__indicator" aria-hidden="true" />
          {links.map((link) => (
            <a
              key={link.href}
              className="nav__link"
              data-dev={link.href === DEV_HASH || undefined}
              href={link.href}
              aria-current={isCurrent(link.href, route) ? 'page' : undefined}
              onPointerEnter={lightIndicator}
            >
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

          {status === 'signedIn' ? (
            <AccountMenu />
          ) : (
            <button type="button" className="nav__auth-btn" onClick={onOpenAuth}>
              Sign in
            </button>
          )}
        </div>

        {/* max-height:0 + opacity:0 + pointer-events:none hide the panel from
            sight but not from the tab order, and a closed menu left six invisible
            links between the toggle and the page. `inert` removes the subtree
            from focus and the a11y tree without touching the height animation. */}
        <div
          id="nav-panel"
          ref={panel}
          className="nav__panel"
          data-open={menuOpen}
          inert={!menuOpen}
        >
          <div className="nav__panel-inner">
            {links.map((link) => (
              <a
                key={link.href}
                className="nav__panel-link"
                data-dev={link.href === DEV_HASH || undefined}
                href={link.href}
                aria-current={isCurrent(link.href, route) ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            {status === 'signedIn' ? (
              <div className="nav__panel-account">
                <div className="nav__panel-account-name">
                  {profile?.display_name || profile?.username || 'Signed in'}
                </div>
                <button
                  type="button"
                  className="nav__panel-cta"
                  onClick={() => {
                    setMenuOpen(false)
                    signOut()
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="nav__panel-cta"
                onClick={() => {
                  setMenuOpen(false)
                  onOpenAuth()
                }}
              >
                Sign in
              </button>
            )}
          </div>
        </div>

        <div ref={progress} className="nav__progress" aria-hidden="true" />
      </nav>
    </>
  )
}
