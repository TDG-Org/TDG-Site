/**
 * TDG-Site's sign-in endpoint: "username OR email + password" → a session.
 *
 * ── Why this exists at all ───────────────────────────────────────────────
 * GoTrue only knows email and password. Signing in with a USERNAME therefore
 * needs something to turn a handle into an address first, and that something
 * may not be callable by a browser, because a function that turns a public
 * username into somebody's email address is an email-harvesting endpoint.
 *
 * `bea_login_identity` is `SECURITY DEFINER` and granted to `service_role` and
 * nothing else. This function is the only thing on this site that reaches it,
 * and it never returns the address it resolved: only a session, or a refusal.
 *
 * ── Why it is a copy of the pattern rather than a shared endpoint ────────
 * `bea-account`, `mak-account` and `veditor-account` do the same job for the
 * other TDG apps. Each app owns its own endpoint precisely so that no app's
 * login can break another's. A shared one would be a single point of failure
 * across four products. The genuinely shared piece is the SQL resolver, which
 * lives in tdg-core and is app-neutral despite its prefix.
 *
 * ── Why `verify_jwt` is off ──────────────────────────────────────────────
 * Every caller is signed out by definition: this IS the sign-in path. Deploy
 * with `--no-verify-jwt`, or every sign-in answers 401 while the source still
 * looks perfect.
 *
 * ── The error vocabulary is deliberately small ───────────────────────────
 * A wrong password and an identifier that matches nothing answer the SAME
 * thing. Anything else would make this an account-existence oracle: type a
 * username, learn whether it belongs to somebody. `email_not_confirmed` is the
 * one exception and it is not a leak, because the ordinary email path returns it too,
 * and the reader needs it to know what to do next.
 */

// Set by hand when this file changes, and answered by `action: 'version'` so
// you can tell which source is deployed without guessing. (The Veditor's copy
// has a script that digests the file; this one does not, so the stamp is only
// as honest as whoever last edited it. See supabase/README.md.)
const SOURCE_STAMP = '2026-09-01-a';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
/** The key that may talk to `bea_login_identity`. Never reaches the caller. */
const SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
/** The public key GoTrue expects in `apikey` on its own endpoints. */
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

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
 * Any identifier (username, primary email, or recovery email) to the
 * account's primary address. Null when nothing matches, and ALWAYS null on an
 * internal failure: a lookup that broke must not be distinguishable from a
 * name that does not exist.
 */
async function primaryEmailFor(identifier: string): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bea_login_identity`, {
      method: 'POST',
      headers: {
        apikey: SECRET_KEY,
        Authorization: `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ident: identifier }),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const email = Array.isArray(rows) ? rows[0]?.email : null;
    return typeof email === 'string' && email ? email : null;
  } catch {
    return null;
  }
}

/** Email + password for a session, straight from GoTrue. */
async function passwordGrant(email: string, password: string): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body?.access_token) return json({ session: body });

  const code = String(body?.error_code ?? body?.error ?? '');
  if (res.status === 429) return json({ error: 'rate_limited' }, 429);
  // GoTrue itself broke — a cold start, an incident, a 502 from the edge.
  // That is not a wrong password, and saying it was sent people off to reset
  // a password that was right. `server_error` reveals nothing about the
  // account (the same answer a thrown fetch already gives below), so the
  // small-vocabulary rule in the header is kept: a name that matches nothing
  // and a wrong password still answer identically.
  if (res.status >= 500) return json({ error: 'server_error' }, 502);
  if (code === 'email_not_confirmed') return json({ error: 'email_not_confirmed' }, 400);
  return json({ error: 'invalid_credentials' }, 400);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  if (!SUPABASE_URL || !SECRET_KEY || !PUBLIC_KEY) return json({ error: 'server_error' }, 500);

  let payload: { action?: string; identifier?: string; password?: string; redirectTo?: string };
  try {
    // A sign-in body is a few hundred bytes. Anything larger is not one.
    const raw = await req.text();
    if (raw.length > 2048) return json({ error: 'bad_request' }, 400);
    payload = JSON.parse(raw || '{}');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const action = String(payload.action ?? 'login');

  // Answered before anything needs a payload, so asking costs no identifier
  // and touches no account.
  if (action === 'version') return json({ stamp: SOURCE_STAMP });

  const identifier = String(payload.identifier ?? '').trim();
  if (!identifier || identifier.length > 320) return json({ error: 'bad_request' }, 400);

  if (action === 'login') {
    const password = String(payload.password ?? '');
    if (!password) return json({ error: 'bad_request' }, 400);
    const email = await primaryEmailFor(identifier);
    // No match answers exactly as a wrong password does. The reader learns
    // "those details are wrong", never "that account exists".
    if (!email) return json({ error: 'invalid_credentials' }, 400);
    try {
      return await passwordGrant(email, password);
    } catch {
      return json({ error: 'server_error' }, 500);
    }
  }

  if (action === 'reset') {
    const email = await primaryEmailFor(identifier);
    if (email) {
      // `redirect_to` is a QUERY parameter on /recover, and GoTrue checks it
      // against the project's own allow-list, so passing the caller's value
      // through can only send the reader somewhere this project already trusts.
      const redirectTo = String(payload.redirectTo ?? '');
      const url = `${SUPABASE_URL}/auth/v1/recover`
        + (redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '');
      try {
        await fetch(url, {
          method: 'POST',
          headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
      } catch { /* fall through: the answer below is the same either way */ }
    }
    // Always the same answer. Saying whether the link went out would turn this
    // into the account-existence oracle the login path refuses to be.
    return json({ ok: true });
  }

  return json({ error: 'bad_request' }, 400);
});
