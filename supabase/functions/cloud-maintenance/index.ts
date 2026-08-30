/** `cloud-maintenance` — the deliberate arm of TDG Cloud retention.
 *
 *  ── Why deletion lives here and nowhere else ──
 *  Nothing in Postgres deletes hosted bytes. A `storage.objects` row deleted
 *  by SQL strands the blob it points at — the platform enforces this now
 *  (`storage.protect_delete` refuses direct deletes) — so the ONLY correct
 *  route is the Storage API, which removes the blob and the row together and
 *  fires the accounting triggers on the way. This function is that route,
 *  and it is an Edge Function because the Storage API needs the service key.
 *
 *  ── What it will and will not do ──
 *  `report` is always available: who is past the retention deadline, holding
 *  how much. `purge` acts on that report, and it is DOUBLE-gated: the caller
 *  must be a TDG developer, AND `availability.auto_purge` in
 *  `tdg_cloud_config` must be true — a flag that ships FALSE, so even a
 *  developer pressing the button today deletes nothing. `dry_run` (the
 *  default) lists what WOULD go. Purging deletes the account's hosted
 *  objects and its sync rows, writes one audit line per account, and never
 *  touches the grants: what somebody paid for stays recorded even after the
 *  bytes it bought are gone.
 *
 *  `reap` clears expired upload reservations project-wide. Reservations also
 *  reap themselves opportunistically inside `tdg_cloud_begin_upload`; this
 *  is the belt for accounts that stopped uploading entirely.
 *
 *  ── Who may call it ──
 *  verify_jwt is ON at the gateway, but a publishable key passes that, so the
 *  real check is here: the caller's token is resolved through /auth/v1/user
 *  and the account must have `profiles.is_admin`. At launch, a pg_cron +
 *  pg_net schedule can call it with the service key instead; a caller
 *  presenting the service key IS the project and skips the profile check.
 *
 *  ── The retention rule it applies ──
 *  The same one `tdg_cloud_status()` derives for the person themselves: no
 *  plan in force + hosted bytes ⇒ read-only from the last period end, purge
 *  eligible `retention.read_only_days` later. Deadlines are computed from
 *  the grants and config at call time, so a resubscription any moment before
 *  the purge simply removes the account from the report.
 */

const SOURCE_STAMP = 'cloud-maintenance@1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/** The caller: a developer's user token, or the project's own service key. */
async function callerAllowed(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token === '') return false;
  if (token === SERVICE_KEY) return true;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const user = await res.json();
  const id = String(user?.id ?? '');
  if (id === '') return false;

  const prof = await rest(`/rest/v1/profiles?user_id=eq.${id}&select=is_admin`);
  if (!prof.ok) return false;
  const rows = await prof.json();
  return rows?.[0]?.is_admin === true;
}

type Grant = {
  kind?: string;
  status?: string;
  currentPeriodEnd?: string | null;
};

/** Mirrors `cloud_packs_in_force` (14-day dunning grace included). */
function inForce(grants: Record<string, Grant>): boolean {
  const now = Date.now();
  for (const g of Object.values(grants ?? {})) {
    if (g?.kind === 'perpetual') return true;
    if (g?.kind !== 'subscription' || !g.currentPeriodEnd) continue;
    const end = Date.parse(g.currentPeriodEnd);
    if (!Number.isFinite(end)) continue;
    const status = String(g.status ?? '');
    if ((status === 'active' || status === 'trialing') && end > now) return true;
    if ((status === 'past_due' || status === 'unpaid') && end + 14 * 86400000 > now) return true;
  }
  return false;
}

function lapsedAt(grants: Record<string, Grant>): number | null {
  let latest: number | null = null;
  for (const g of Object.values(grants ?? {})) {
    if (g?.kind !== 'subscription' || !g.currentPeriodEnd) continue;
    const end = Date.parse(g.currentPeriodEnd);
    if (Number.isFinite(end) && (latest === null || end > latest)) latest = end;
  }
  return latest;
}

type Candidate = {
  user_id: string;
  bytes: number;
  files: number;
  deadline: string;
  purge_ready: boolean;
};

async function retentionCandidates(): Promise<Candidate[]> {
  const cfgRes = await rest('/rest/v1/tdg_cloud_config?select=doc');
  const cfg = (await cfgRes.json())?.[0]?.doc ?? {};
  const days = Number(cfg?.retention?.read_only_days ?? 90) || 90;

  const usageRes = await rest('/rest/v1/tdg_cloud_usage?select=user_id,bytes,files');
  const usage = (await usageRes.json()) as { user_id: string; bytes: number; files: number }[];
  const totals = new Map<string, { bytes: number; files: number }>();
  for (const row of usage ?? []) {
    const t = totals.get(row.user_id) ?? { bytes: 0, files: 0 };
    t.bytes += Number(row.bytes) || 0;
    t.files += Number(row.files) || 0;
    totals.set(row.user_id, t);
  }

  const entRes = await rest('/rest/v1/cloud_entitlements?select=user_id,grants');
  const ents = (await entRes.json()) as { user_id: string; grants: Record<string, Grant> }[];
  const grantsOf = new Map((ents ?? []).map((e) => [e.user_id, e.grants ?? {}]));

  const out: Candidate[] = [];
  for (const [userId, t] of totals) {
    if (t.bytes <= 0) continue;
    const grants = grantsOf.get(userId) ?? {};
    if (inForce(grants)) continue;
    const anchor = lapsedAt(grants) ?? Date.now();
    const deadline = anchor + days * 86400000;
    out.push({
      user_id: userId,
      bytes: t.bytes,
      files: t.files,
      deadline: new Date(deadline).toISOString(),
      purge_ready: deadline <= Date.now(),
    });
  }
  out.sort((a, b) => a.deadline.localeCompare(b.deadline));
  return out;
}

async function listObjects(prefix: string): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/tdg-cloud`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      // Storage's list is per-folder; asking for everything under the account
      // means walking, so the search shortcut is used instead: an empty
      // prefix with search on the account id would over-match. The account id
      // IS the top folder, so one level of recursion per app folder suffices.
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    if (!res.ok) throw new Error(`storage list failed: ${res.status}`);
    const rows = (await res.json()) as { name: string; id: string | null }[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      if (row.id === null) {
        // A folder. Walk into it.
        names.push(...(await listObjects(`${prefix}${prefix.endsWith('/') ? '' : '/'}${row.name}`)));
      } else {
        names.push(`${prefix}${prefix.endsWith('/') ? '' : '/'}${row.name}`);
      }
    }
    if (rows.length < 1000) break;
  }
  return names;
}

async function deleteObjects(paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/tdg-cloud`, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok) throw new Error(`storage delete failed: ${res.status} ${await res.text()}`);
    removed += batch.length;
  }
  return removed;
}

async function audit(targetId: string, action: string, detail: string): Promise<void> {
  await rest('/rest/v1/tdg_moderation_audit', {
    method: 'POST',
    body: JSON.stringify([{ app: 'tdg-core', actor_id: null, target_id: targetId, action, detail }]),
  }).catch((err) => console.error('cloud-maintenance audit write failed', err));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'GET') {
    return json({
      function: 'cloud-maintenance',
      stamp: SOURCE_STAMP,
      configured: { supabase: SUPABASE_URL !== '' && SERVICE_KEY !== '' },
    });
  }
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'server_error' }, 500);

  if (!(await callerAllowed(req))) return json({ error: 'unauthorized' }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const action = String(body.action ?? '');

  try {
    if (action === 'report') {
      return json({ candidates: await retentionCandidates() });
    }

    if (action === 'reap') {
      const res = await rest(
        `/rest/v1/tdg_cloud_reservations?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`,
        { method: 'DELETE', headers: { Prefer: 'count=exact' } },
      );
      const reaped = Number(res.headers.get('content-range')?.split('/')?.[1] ?? 0) || 0;
      return json({ reaped });
    }

    if (action === 'purge') {
      const dryRun = body.dry_run !== false;

      const cfgRes = await rest('/rest/v1/tdg_cloud_config?select=doc');
      const cfg = (await cfgRes.json())?.[0]?.doc ?? {};
      if (cfg?.availability?.auto_purge !== true) {
        // The flag ships false. This refusal is the point: purging is a
        // decision recorded in config, never a side effect of calling this.
        return json({ error: 'auto_purge_disabled', purged: [] }, 409);
      }

      const ready = (await retentionCandidates()).filter((c) => c.purge_ready);
      if (dryRun) return json({ dry_run: true, would_purge: ready });

      const purged: { user_id: string; objects: number }[] = [];
      for (const candidate of ready) {
        const paths = await listObjects(candidate.user_id);
        const removed = paths.length === 0 ? 0 : await deleteObjects(paths);
        await rest(`/rest/v1/tdg_cloud_sync_state?user_id=eq.${candidate.user_id}`, { method: 'DELETE' });
        await audit(
          candidate.user_id,
          'cloud-purge',
          `retention expired ${candidate.deadline}; removed ${removed} hosted objects (${candidate.bytes} bytes)`,
        );
        purged.push({ user_id: candidate.user_id, objects: removed });
      }
      return json({ dry_run: false, purged });
    }

    return json({ error: 'bad_request' }, 400);
  } catch (err) {
    console.error('cloud-maintenance failed', action, err);
    return json({ error: 'server_error' }, 500);
  }
});
