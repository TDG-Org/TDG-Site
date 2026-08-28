/**
 * `tdg-site-deploys` — which TDG-Org GitHub Pages sites exist, in one answer.
 *
 * ── Why this exists at all ───────────────────────────────────────────────
 * The site upgrades a card's `Coming soon` to a real link when the app behind
 * it turns out to be deployed (`src/live/` in TDG-Site). For a PUBLIC repo
 * the GitHub API answers that from the browser. For a PRIVATE repo with a
 * public deploy — Bible Educator, on the org's Team plan — the only
 * tokenless question is "does `https://tdg-org.github.io/<name>/` answer?",
 * and a browser cannot ask it cleanly: a hit is fine, but every miss is a 404
 * the browser prints in the console as a resource error, one red line per
 * not-yet-deployed app on a site whose console is supposed to stay silent
 * (AGENTS.md §7). Fetched HERE, the misses are answers instead of noise.
 *
 * ── What a caller can and cannot ask ─────────────────────────────────────
 * The request is a list of repo NAMES, and a name is the only thing a caller
 * chooses. Every probe goes to the one fixed origin with the name as its
 * only path segment — there is no URL in the request, so this cannot be bent
 * into an open proxy, and a name that does not match GitHub's own repo-name
 * alphabet is refused rather than encoded. The answer is public information
 * by definition: it is whether a public website exists.
 *
 * ── verify_jwt is OFF ────────────────────────────────────────────────────
 * Deploy with `--no-verify-jwt`, like `tdg-site-account` and unlike
 * `tdg-site-billing`: the caller is an anonymous visitor reading a public
 * page, and the answer holds nothing an account would change. The name cap
 * and the fixed origin are the whole attack surface, and they are enforced
 * before any fetch leaves this function.
 */

// Set by hand when this file changes, and answered by `action: 'version'`.
// See supabase/README.md: there is no script that digests this file, so the
// stamp is only as honest as whoever last edited it.
const SOURCE_STAMP = '2026-08-28-a';

/** The one origin this function will ever probe. */
const PAGES_ORIGIN = 'https://tdg-org.github.io';

/**
 * GitHub's own repository-name alphabet. Anything else is a refusal, not an
 * encode — a name is a path segment here, and the strict gate is what makes
 * that safe to say.
 */
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** More names than the site has cards is a caller this was not written for. */
const MAX_NAMES = 24;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * True, false, or null for "could not ask" — a network failure or a strange
 * status is GitHub having a day, not an answer about the deploy, and the
 * client treats a missing key exactly that way: as not told.
 */
async function probe(name: string): Promise<boolean | null> {
  try {
    // HEAD, not GET: the answer is the status line, and a deployed app's
    // index.html is bytes nobody here reads.
    const res = await fetch(`${PAGES_ORIGIN}/${name}/`, { method: 'HEAD' });
    if (res.ok) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);

  let payload: { action?: string; names?: unknown };
  try {
    // A full ask from the site is a couple hundred bytes. Anything larger is
    // not one.
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: 'bad_request' }, 400);
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (payload.action === 'version') return json({ stamp: SOURCE_STAMP });

  if (!Array.isArray(payload.names)) return json({ error: 'bad_request' }, 400);
  const names = [...new Set(payload.names)];
  if (names.length === 0 || names.length > MAX_NAMES) return json({ error: 'bad_request' }, 400);
  if (!names.every((n): n is string => typeof n === 'string' && NAME_RE.test(n))) {
    return json({ error: 'bad_request' }, 400);
  }

  /* All probes in parallel: the slow case is GitHub, not this function, and
     a card should not wait for its neighbours' answers to arrive one by one. */
  const answers = await Promise.all(names.map(probe));

  /* Only real answers are keys. A name the probe could not settle is simply
     absent, so the client's "not told" and "not deployed" stay two states. */
  const live: Record<string, boolean> = {};
  names.forEach((name, i) => {
    const answer = answers[i];
    if (answer !== null) live[name] = answer;
  });

  return json({ live });
});
