import { useEffect, useMemo, useState } from 'react'
import { APPS, MARANATHA, TOOLS } from '../data/content'
import { resolvedApps, resolvedGame, resolvedTools } from '../content/resolve'
import type { SiteContentDoc } from '../content/types'
import { prettyId } from '../dev/format'
import { orgRepos, pagesDeployed, PAGES_ORIGIN } from './api'
import type { DiscoveredApp, LiveAccess, OrgRepo, OrgReposState } from './types'

/**
 * The hooks a card or a page calls, and the derivations under them.
 *
 * Neither hook can throw during a render, and neither ever DOWNGRADES: the
 * hand-written catalogue in `src/data/` is the complete fallback, correct on
 * its own with GitHub unreachable, rate-limited, or slow. Everything here is
 * an upgrade that arrives when the network answers — a status caption
 * becoming a real link, a repo the catalogue has not met becoming a card —
 * and until it arrives the page is exactly what it was.
 */

/** The org's public repositories, as a state a component can draw. */
export function useOrgRepos(): OrgReposState {
  const [state, setState] = useState<OrgReposState>({ kind: 'checking' })

  useEffect(() => {
    let cancelled = false
    void orgRepos().then((repos) => {
      if (!cancelled) setState(repos ? { kind: 'ok', repos } : { kind: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

/**
 * What the button should say. Title Case, per rule 7: it is a button.
 *
 * The `#download` test is the Makullveny convention made mechanical: a repo
 * whose Website field points at a download anchor gets a Download button, so
 * "where the button goes" and "what the button says" are one decision, made
 * on GitHub, in the Website field. An explicit verb wins over the test —
 * the Building panel says `Play MARANATHA`, because it is a game.
 */
function accessLabel(href: string, title: string, verb?: string): string {
  const word = verb ?? (href.includes('#download') ? 'Download' : 'Open')
  return `${word} ${title}`
}

/**
 * The href a repo name resolves to, or null for "nothing is live".
 *
 * The public list is asked first, because for a public repo it is the whole
 * answer: the Website field when somebody set one (it is the explicit,
 * human-pointed door, so it beats the derived URL), else the Pages URL when
 * a deploy exists, else honestly nothing — no probe, the API already said no.
 *
 * A repo NOT in the list is private, or the list itself failed; either way
 * GitHub Pages may still be serving a public deploy, so Pages itself is
 * asked. That second question is what turns Bible Educator's card — private
 * repo, public deploy — from a status caption into a button.
 */
async function resolveAccessHref(repo: string): Promise<string | null> {
  const repos = await orgRepos()
  const wanted = repo.toLowerCase()
  const found = repos?.find((r) => r.name.toLowerCase() === wanted)
  if (found) {
    if (found.homepage) return found.homepage
    if (found.hasPages) return `${PAGES_ORIGIN}/${found.name}/`
    return null
  }
  const deployed = await pagesDeployed(repo)
  return deployed ? `${PAGES_ORIGIN}/${encodeURIComponent(repo)}/` : null
}

/**
 * A live way in to the app behind `repo`, or null while there is none (or
 * none KNOWN — the two render the same, as the hand-written status quo).
 *
 * Pass `undefined` for a card that already carries a hand-written access —
 * Makullveny's download, Volume Controller's store link. That is the caller
 * saying a human already decided this, so nothing is fetched, nothing is
 * probed, and the answer is a permanent null. The runtime never argues with
 * a decision somebody wrote down.
 */
export function useLiveAccess(
  repo: string | undefined,
  title: string,
  verb?: string,
): LiveAccess | null {
  const [href, setHref] = useState<string | null>(null)

  useEffect(() => {
    if (!repo) {
      setHref(null)
      return
    }
    let cancelled = false
    void resolveAccessHref(repo).then((answer) => {
      if (!cancelled) setHref(answer)
    })
    return () => {
      cancelled = true
    }
  }, [repo])

  return href ? { href, label: accessLabel(href, title, verb) } : null
}

/**
 * What `useLiveAccess` should be asked for a product PAGE: the repo behind
 * the page's own card, read from the RESOLVED card so the Content tab's
 * overrides count — or `undefined` when a human already gave that card a way
 * in (a `download`, an `href`, a Content-tab link on the game panel), which
 * is the same hand-written-wins rule the cards themselves apply. One
 * function, so a page and its card can never disagree about whether to ask.
 */
export function liveRepoForPage(
  doc: SiteContentDoc,
  slug: string,
): { repo?: string; verb?: string } {
  if (slug === MARANATHA.page) {
    return resolvedGame(doc).href ? {} : { repo: MARANATHA.repo, verb: 'Play' }
  }
  const app = resolvedApps(doc).find((card) => card.page === slug)
  if (app) return app.download ? {} : { repo: app.repo }
  const tool = resolvedTools(doc).find((card) => card.page === slug)
  if (tool) return tool.href ? {} : { repo: tool.repo }
  return {}
}

/** The topic a repo carries to ask for a card. Lowercase; GitHub enforces it. */
export const CARD_TOPIC = 'tdg-app'

/**
 * Every repo name a hand-written card already answers for, lowercased.
 *
 * A repo in this set never becomes a discovered card, however it is tagged —
 * the hand-written card IS its card. Which is also the retirement path: when
 * a discovered app earns a real entry in `content.ts`, that entry's `repo:`
 * claims the repository and the auto-card disappears on its own.
 */
function claimedRepoNames(): Set<string> {
  const names = new Set<string>()
  for (const app of APPS) if (app.repo) names.add(app.repo.toLowerCase())
  for (const tool of TOOLS) if (tool.repo) names.add(tool.repo.toLowerCase())
  if (MARANATHA.repo) names.add(MARANATHA.repo.toLowerCase())
  /* This site itself, so a stray topic on it can never draw a card for the
     page the reader is already on. */
  names.add('tdg-site')
  return names
}

/**
 * Cards for public repos the catalogue has not been taught — rule 17's
 * "an unknown entry gets a face", applied to the org itself.
 *
 * Opt-in by topic rather than "every public repo", because the org's public
 * list also holds retired experiments and companion repos (`makullveny-site`,
 * `makullveny-releases`) that are not products; a shelf that grew a card per
 * repository would bury the real work under housekeeping. Tagging a repo
 * `tdg-app` is the one deliberate act that says "show this".
 *
 * Forks and archived repos are out even when tagged: neither is a product
 * we are offering, and an archive's topic outlives the intent it recorded.
 */
export function discoveredApps(repos: OrgRepo[]): DiscoveredApp[] {
  const claimed = claimedRepoNames()
  /* The badge numbers continue the site's one running sequence, which the
     static cards end at Tools' `09` today. Computed, never typed, so a tenth
     hand-written card renumbers every discovery without an edit here. */
  const after = Math.max(
    ...APPS.map((a) => Number(a.index)),
    ...TOOLS.map((t) => Number(t.index)),
  )
  return repos
    .filter((r) => r.topics.includes(CARD_TOPIC) && !r.fork && !r.archived)
    .filter((r) => !claimed.has(r.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r, i) => {
      const liveHref = r.homepage ?? (r.hasPages ? `${PAGES_ORIGIN}/${r.name}/` : null)
      const title = prettyId(r.name)
      return {
        name: r.name,
        index: String(after + 1 + i).padStart(2, '0'),
        title,
        /* The awkward state gets a face rather than a blank: a card with no
           copy reads as a page still loading, and the honest sentence also
           tells us which repo is missing its description. */
        copy:
          r.description ??
          'This one is so new its repository has not written a description yet. The card will say more as soon as it does.',
        chips: [
          { label: 'FROM GITHUB' },
          liveHref ? { label: 'LIVE', hot: true } : { label: 'IN DEV', hot: true },
          ...(r.language ? [{ label: r.language.toUpperCase() }] : []),
        ],
        href: liveHref ?? r.htmlUrl,
        access: liveHref ? { href: liveHref, label: accessLabel(liveHref, title) } : null,
        repoUrl: r.htmlUrl,
      }
    })
}

/**
 * The discovered cards, ready to render. Empty while checking and on a failed
 * read — the hand-written grid is the honest fallback either way, and a card
 * that pops in when the network answers is an addition, not a reflow of
 * anything a reader was already looking at.
 */
export function useDiscoveredApps(): DiscoveredApp[] {
  const state = useOrgRepos()
  return useMemo(() => (state.kind === 'ok' ? discoveredApps(state.repos) : []), [state])
}
