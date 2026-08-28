import type { DeployAnswer, OrgRepo } from './types'

/**
 * The two questions this folder asks, and everything about how they are asked.
 *
 * 1. `orgRepos()` — "what repositories does the org show the public?" One
 *    unauthenticated GET to the GitHub REST API. It answers name, description,
 *    website, topics and whether GitHub Pages serves a site, for every PUBLIC
 *    repo. Private repos are simply absent — not an error, just not told.
 *
 * 2. `pagesDeployed(name)` — "does https://tdg-org.github.io/<name>/ exist?"
 *    Asked because a PRIVATE repo can still have a public deploy (Bible
 *    Educator is exactly that, on the org's Team plan), and the API above
 *    cannot see it without a token this site must never carry. It is NOT
 *    asked of GitHub Pages directly, although the browser could: a hit works,
 *    but every miss is a 404 the browser prints in the console as a resource
 *    error — one red line per not-yet-deployed app, on a site whose console
 *    is supposed to stay silent (AGENTS.md §7), and no fetch option
 *    suppresses it. So the question goes to `tdg-site-deploys`, the edge
 *    function beside the site's other two, which probes the fixed origin
 *    server-side and hands back every answer in one response — same answer,
 *    no noise, and the same behaviour in dev, `vite preview` and production
 *    alike. Calls made in the same breath share one request: the grid mounts
 *    eight cards at once, and eight cards are one question.
 *
 *    The function answers three ways per name, not two — see `DeployAnswer`
 *    in `types.ts`: its server-side memory is what tells a site that was
 *    taken DOWN from one that never shipped, so a disabled app can say
 *    "temporarily unavailable" instead of pretending it never existed.
 *
 * ## Caching, and which answers are allowed to be remembered
 *
 * The GitHub API allows 60 unauthenticated requests an hour per address, and
 * a visitor walking the hash routes remounts these callers many times a
 * minute — so the REPOS LIST is kept at module scope for the life of the tab
 * and in sessionStorage for five minutes across reloads. Requests in flight
 * are shared rather than duplicated.
 *
 * PROBE answers are remembered at module scope only — never in storage — so
 * hash-route remounts inside one page load share one answer, and a REFRESH
 * always asks again. That is deliberate and it was learned the hard way: a
 * ten-minute stored answer meant a site taken down went on saying "Open" to
 * anyone who refreshed, which is exactly the moment a person checks whether
 * the takedown worked. The probe is one batched call to our own function;
 * freshness is worth it.
 *
 * **A failed read is never remembered**, the same rule `badges/useBadges.ts`
 * keeps and for the same reason: caching a hiccup would pin "we do not know"
 * for the whole visit because one request at boot lost the network. A 404
 * from the probe is not a failure — `down` and `absent` are real answers —
 * so those are kept like any success, for the tab's life only.
 */

export const ORG = 'TDG-Org'
export const PAGES_ORIGIN = 'https://tdg-org.github.io'

const REPOS_URL = `https://api.github.com/orgs/${ORG}/repos?per_page=100`

/** How long the stored repos list stays good across reloads. Long enough
 *  that one visit costs one API call, short enough that a public repo's
 *  Pages being switched on or off shows within a few minutes. The probe has
 *  no such window — see the header. */
const TTL_MS = 5 * 60_000

const REPOS_KEY = 'tdg:live:repos:v1'

/* sessionStorage can throw on read AND write (private windows, storage shut
   off) — a visitor in that state just pays the network call each time. */
function stored<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; value: T }
    if (Date.now() - parsed.at > TTL_MS) return null
    return parsed.value
  } catch {
    return null
  }
}

function store<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }))
  } catch {
    /* fine — the module-scope copy still serves this tab */
  }
}

function toRepo(raw: unknown): OrgRepo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string' || typeof r.html_url !== 'string') return null
  return {
    name: r.name,
    description: typeof r.description === 'string' && r.description ? r.description : null,
    homepage: typeof r.homepage === 'string' && r.homepage ? r.homepage : null,
    hasPages: r.has_pages === true,
    topics: Array.isArray(r.topics) ? r.topics.filter((t): t is string => typeof t === 'string') : [],
    archived: r.archived === true,
    fork: r.fork === true,
    language: typeof r.language === 'string' && r.language ? r.language : null,
    htmlUrl: r.html_url,
  }
}

let knownRepos: OrgRepo[] | null = null
let reposInFlight: Promise<OrgRepo[] | null> | null = null

/** The org's public repositories. Null on ANY failed read — a dropped
 *  connection, a rate limit, a shape this client does not recognise — and a
 *  caller must treat null as "not told", never as "the org is empty". */
export function orgRepos(): Promise<OrgRepo[] | null> {
  if (knownRepos) return Promise.resolve(knownRepos)
  const remembered = stored<OrgRepo[]>(REPOS_KEY)
  if (remembered) {
    knownRepos = remembered
    return Promise.resolve(remembered)
  }
  if (!reposInFlight) {
    reposInFlight = fetch(REPOS_URL, { headers: { Accept: 'application/vnd.github+json' } })
      .then(async (res) => {
        if (!res.ok) return null
        const body: unknown = await res.json()
        if (!Array.isArray(body)) return null
        return body.map(toRepo).filter((r): r is OrgRepo => r !== null)
      })
      .catch(() => null)
      .then((repos) => {
        reposInFlight = null
        if (repos) {
          knownRepos = repos
          store(REPOS_KEY, repos)
        }
        return repos
      })
  }
  return reposInFlight
}

const DEPLOYS_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tdg-site-deploys`

/* Tab-lifetime only, on purpose — the header says why a probe answer must
   not outlive a refresh. */
const pagesAnswers = new Map<string, DeployAnswer>()
const pagesInFlight = new Map<string, Promise<DeployAnswer | null>>()

/** Names waiting for the next batch, with every caller's resolver. */
let pendingProbes = new Map<string, ((answer: DeployAnswer | null) => void)[]>()
let probeFlushTimer: ReturnType<typeof setTimeout> | null = null

function isDeployAnswer(raw: unknown): raw is DeployAnswer {
  return raw === 'live' || raw === 'down' || raw === 'absent'
}

async function flushProbes(): Promise<void> {
  const batch = pendingProbes
  pendingProbes = new Map()
  probeFlushTimer = null
  const names = [...batch.keys()]

  let status: Record<string, unknown> | null = null
  try {
    const res = await fetch(DEPLOYS_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    })
    if (res.ok) {
      const body: unknown = await res.json()
      const found = (body as { status?: unknown })?.status
      if (typeof found === 'object' && found !== null) status = found as Record<string, unknown>
    }
  } catch {
    /* answered below as "not told", never cached */
  }

  for (const [name, resolvers] of batch) {
    const raw = status?.[name]
    const answer = isDeployAnswer(raw) ? raw : null
    const cacheKey = name.toLowerCase()
    pagesInFlight.delete(cacheKey)
    if (answer !== null) pagesAnswers.set(cacheKey, answer)
    for (const resolve of resolvers) resolve(answer)
  }
}

/**
 * What GitHub Pages says about this repo name — `live`, `down`, or `absent`
 * (see `DeployAnswer` in `types.ts`); null means "could not ask" — the
 * function unreachable, or GitHub not answering it — and is never cached.
 *
 * Every call landing inside one short window joins one request to
 * `tdg-site-deploys`. The window is a one-shot `setTimeout`, which is the
 * rule-9 exemption taken deliberately: it is not animation, the shared frame
 * loop would be strictly worse (held awake to run something that happens
 * once), and it ends by itself the moment it fires. Ten milliseconds is a
 * breath — the eight cards of one render all arrive well inside it, and a
 * straggler simply starts the next batch.
 */
export function pagesDeployed(name: string): Promise<DeployAnswer | null> {
  const cacheKey = name.toLowerCase()
  const known = pagesAnswers.get(cacheKey)
  if (known !== undefined) return Promise.resolve(known)

  const inFlight = pagesInFlight.get(cacheKey)
  if (inFlight) return inFlight

  const ask = new Promise<DeployAnswer | null>((resolve) => {
    const waiting = pendingProbes.get(name)
    if (waiting) waiting.push(resolve)
    else pendingProbes.set(name, [resolve])
    if (probeFlushTimer === null) probeFlushTimer = setTimeout(() => void flushProbes(), 10)
  })
  pagesInFlight.set(cacheKey, ask)
  return ask
}
