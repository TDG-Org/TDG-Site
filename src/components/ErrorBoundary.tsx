import { Component, type ErrorInfo, type ReactNode } from 'react'
import './ErrorBoundary.css'

/**
 * A face for the one failure a static site cannot avoid: a chunk that is no
 * longer there.
 *
 * Every lazy page on this site — About, an app page, the account, a profile,
 * the console — is a hashed file under `dist/assets/`, and a deploy replaces
 * the whole set. A tab opened before the deploy and still showing home is
 * fine until its reader clicks a card: the `import()` 404s, `lazy()` rejects,
 * and with nothing to catch it React 19 unmounts the ROOT. Nav, footer,
 * everything — a white page with no words on it, and `lazy()` never retries,
 * so Back does not bring it back either. `vite.config.ts` already names the
 * stale-tab problem for the version stamp; this is its runtime consequence.
 *
 * So each routed page renders inside one of these. A chunk that fails gets
 * the page's own kicker, heading and lede saying what happened and a button
 * that reloads — which is the whole fix, since the reload fetches the new
 * `index.html` and the new chunks with it. Any other render error lands in
 * the same face with different words, because a page that throws while
 * drawing is better said out loud than shown as nothing.
 *
 * **Not an automatic reload.** Vite's `vite:preloadError` pattern reloads at
 * once, and on GitHub Pages that can loop: a cached `index.html` still names
 * the old chunks, the reload fetches them again, and the page reloads for
 * ever with nothing on screen to say why. A button the reader presses cannot
 * loop, and it says why before they press it.
 *
 * `silent` is for a decorative chunk — the hero's point cloud, the walk's
 * cabin — whose absence is a scene with less in it, not a page with nothing
 * on it. Those render nothing on failure and the section around them stands.
 *
 * Keyed by the caller on the route, so leaving the page and coming back is a
 * fresh boundary rather than a face that outlives its error.
 */
type Props = { children: ReactNode; silent?: boolean }
type State = { error: Error | null }

/**
 * What a missing chunk looks like across browsers. Chromium says "Failed to
 * fetch dynamically imported module", Firefox "error loading dynamically
 * imported module", Safari "Importing a module script failed". A match picks
 * the wording that names the cause; a miss gets the general one.
 */
const STALE_CHUNK = /dynamically imported module|Importing a module script failed|Loading chunk|Loading CSS chunk/i

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console keeps the stack; the page keeps the words.
    console.error('[boundary]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.silent) return null

    const stale = STALE_CHUNK.test(String(error?.message ?? error))
    return (
      <section className="fail" role="alert">
        <div className="fail__shell">
          <div className="kicker">
            <span className="kicker__num">00</span>
            <span className="kicker__rule" />
            <span className="kicker__label">{stale ? 'Site updated' : 'Something broke'}</span>
          </div>
          <h2 className="h2 fail__h2">
            {stale ? 'This page was updated while your tab was open.' : 'This page ran into a problem.'}
          </h2>
          <p className="lede">
            {stale
              ? 'A newer version of the site went live, so the part you asked for is no longer where this tab expects it. Reloading picks up the new version. Nothing about your account changes.'
              : 'Reloading usually clears it. If it keeps happening, send us feedback from the account menu and say which page it was.'}
          </p>
          <button type="button" className="fail__reload" onClick={() => window.location.reload()}>
            Reload The Page
          </button>
        </div>
      </section>
    )
  }
}
