/** `cloud-b2-install` — one-shot installer for the B2 credential, then retired.
 *
 *  TDG Cloud's bytes live in the Backblaze B2 bucket `TDG-Cloud-Backblaze`,
 *  and the `cloud-storage` broker signs its S3 requests with an application
 *  key held in Supabase Vault (`tdg_cloud_b2_store` / `tdg_cloud_b2_credentials`,
 *  both service_role-only). This function exists so that key can travel from
 *  the machine that holds it INTO Vault over one TLS hop, without being
 *  written into any file, config, chat, or migration on the way — the same
 *  reason `cloud-provision` runs server-side where the Stripe key lives.
 *
 *  It is a ONE-RUN tool, deployed with a fresh random nonce baked into
 *  `INSTALL_KEY` (this repo copy carries a placeholder and refuses
 *  everything), called once from a local script that reads the key from the
 *  machine's own environment, and then replaced with a retired stub. Rotating
 *  the credential later = deploy again with a new nonce, run again, retire
 *  again.
 */

const SOURCE_STAMP = 'cloud-b2-install@1';

/** Replaced with a fresh random value at deploy time; '' refuses everything. */
const INSTALL_KEY = 'SET-AT-DEPLOY';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'GET') {
    return json({
      function: 'cloud-b2-install',
      stamp: SOURCE_STAMP,
      armed: INSTALL_KEY !== 'SET-AT-DEPLOY' && INSTALL_KEY !== '',
    });
  }
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'server_error' }, 500);
  if (
    INSTALL_KEY === 'SET-AT-DEPLOY' ||
    INSTALL_KEY === '' ||
    req.headers.get('x-install-key') !== INSTALL_KEY
  ) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const keyId = String(body.key_id ?? '');
  const appKey = String(body.app_key ?? '');
  if (keyId === '' || appKey === '') return json({ error: 'bad_request' }, 400);

  const store = await rpc('tdg_cloud_b2_store', { p_key_id: keyId, p_app_key: appKey });
  if (!store.ok) return json({ error: 'store_failed', status: store.status }, 500);

  // Prove the write by reading it back the way the broker will — presence
  // only, never the values.
  const read = await rpc('tdg_cloud_b2_credentials', {});
  const creds = read.ok ? ((await read.json()) as Record<string, unknown>) : {};
  const present =
    typeof creds.key_id === 'string' && creds.key_id !== '' &&
    typeof creds.app_key === 'string' && creds.app_key !== '';
  return json({ ok: present, stored: present });
});
