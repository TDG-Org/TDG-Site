/** `cloud-maintenance` — the deliberate arm of TDG Cloud retention.
 *
 *  ── Why deletion lives here and nowhere else ──
 *  Nothing in Postgres deletes hosted bytes: they live in the Backblaze B2
 *  bucket, and SQL can only ever touch the catalogue that DESCRIBES them. A
 *  purge therefore goes through B2 itself — every version under the
 *  account's prefix destroyed by versionId (a plain S3 delete only hides,
 *  and hidden is not purged) — and then settles the catalogue in one call.
 *  This is an Edge Function because the B2 credential lives server-side
 *  (Vault, via the service-only `tdg_cloud_b2_credentials()`), exactly like
 *  the Stripe key.
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
 *  `bucket` is the one read that holds Backblaze's own answer against the
 *  catalogue — what is stored, what old versions and hide markers are
 *  costing, and the three ways the two sides can disagree: orphans B2 bills
 *  us for that no account claims, ghosts the catalogue promises that are not
 *  there, and size mismatches. Nothing else in the system would ever notice
 *  that drift, because the catalogue is what we bill from and the bucket is
 *  what we pay for. It reports; it never sweeps.
 *
 *  `reap` clears expired upload reservations project-wide. Reservations also
 *  reap themselves opportunistically inside `tdg_cloud_begin_upload`; this
 *  is the belt for accounts that stopped uploading entirely.
 *
 *  ── Who may call it ──
 *  verify_jwt is ON at the gateway, but a publishable key passes that, so the
 *  real check is here: the caller's token is resolved through /auth/v1/user
 *  and the uuid is put to `tdg_cloud_is_developer()`. That RPC exists because
 *  the obvious thing — reading `profiles.is_admin` as the service — does not
 *  work and never did: `service_role` has no SELECT on `profiles`, so this
 *  gate refused every human until 20260831234500. At launch, a pg_cron +
 *  pg_net schedule can call it with the service key instead; a caller
 *  presenting the service key IS the project and skips the check.
 *
 *  ── The retention rule it applies ──
 *  The same one `tdg_cloud_status()` derives for the person themselves: no
 *  plan in force + hosted bytes ⇒ read-only from the last period end, purge
 *  eligible `retention.read_only_days` later. Deadlines are computed from
 *  the grants and config at call time, so a resubscription any moment before
 *  the purge simply removes the account from the report.
 */

const SOURCE_STAMP = 'cloud-maintenance@4';

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

  //  NOT a read of `profiles`: service_role has no SELECT on that table and
  //  is not meant to (a table of names, emails and recovery addresses is not
  //  something the project's key reads wholesale). This asked for it anyway
  //  and so refused every human alive — see
  //  20260831234500_the_maintenance_arm_can_recognise_a_developer. The RPC
  //  answers the one question this gate has: is THIS uuid a developer?
  const prof = await rest('/rest/v1/rpc/tdg_cloud_is_developer', {
    method: 'POST',
    body: JSON.stringify({ p_user: id }),
  });
  if (!prof.ok) {
    console.error('cloud-maintenance: developer check failed', prof.status, await prof.text());
    return false;
  }
  return (await prof.json()) === true;
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

// ── B2, via its S3 face (the same signing core as `cloud-storage`) ──────────

type B2 = { keyId: string; appKey: string; bucket: string; region: string; host: string };
let b2Cache: B2 | null = null;

async function b2(): Promise<B2> {
  if (b2Cache !== null) return b2Cache;
  const credsRes = await rest('/rest/v1/rpc/tdg_cloud_b2_credentials', { method: 'POST', body: '{}' });
  if (!credsRes.ok) throw new Error(`credentials read failed: ${credsRes.status}`);
  const creds = (await credsRes.json()) as Record<string, unknown>;
  const cfgRes = await rest('/rest/v1/tdg_cloud_config?select=doc');
  const doc = ((await cfgRes.json())?.[0]?.doc ?? {}) as Record<string, unknown>;
  const storage = (doc.storage ?? {}) as Record<string, unknown>;
  const value: B2 = {
    keyId: String(creds.key_id ?? ''),
    appKey: String(creds.app_key ?? ''),
    bucket: String(storage.bucket ?? ''),
    region: String(storage.region ?? ''),
    host: String(storage.s3_endpoint ?? '').replace(/^https?:\/\//, ''),
  };
  if (!value.keyId || !value.appKey || !value.bucket || !value.region || !value.host) {
    throw new Error('B2 is not configured');
  }
  b2Cache = value;
  return value;
}

const enc = new TextEncoder();
async function sha256hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', k, enc.encode(data));
}
function encodeQueryPair(k: string, v: string): string {
  const strict = (s: string) =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${strict(k)}=${strict(v)}`;
}

async function s3(
  cfg: B2,
  method: string,
  objectKey: string,
  rawQuery: Record<string, string> = {},
): Promise<Response> {
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const path = `/${cfg.bucket}${objectKey === '' ? '' : '/' + objectKey.split('/').map(encodeURIComponent).join('/')}`;
  const canonicalQuery = Object.keys(rawQuery)
    .sort()
    .map((k) => encodeQueryPair(k, rawQuery[k]))
    .join('&');
  const headers: Record<string, string> = {
    host: cfg.host,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join('');
  const canonical = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256hex(canonical)].join('\n');
  let key: ArrayBuffer = (enc.encode('AWS4' + cfg.appKey) as Uint8Array).buffer as ArrayBuffer;
  for (const part of [date, cfg.region, 's3', 'aws4_request']) key = await hmac(key, part);
  const sig = [...new Uint8Array(await hmac(key, toSign))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const url = `https://${cfg.host}${path}${canonicalQuery === '' ? '' : '?' + canonicalQuery}`;
  return await fetch(url, {
    method,
    headers: {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    },
  });
}

const xmlUnescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#3[49];/g, (m) => (m === '&#34;' ? '"' : "'"))
    .replace(/&amp;/g, '&');

/** Every version under the account's prefix, destroyed by versionId — a
 *  purge leaves nothing, not even hide markers for the lifecycle to sweep.
 *  Returns how many versions went. */
async function purgePrefix(cfg: B2, prefix: string): Promise<number> {
  let removed = 0;
  for (let round = 0; round < 400; round++) {
    const list = await s3(cfg, 'GET', '', { versions: '', prefix, 'max-keys': '500' });
    const text = await list.text();
    if (!list.ok) throw new Error(`version list failed: ${list.status}`);
    const versions = [...text.matchAll(/<(?:Version|DeleteMarker)>[\s\S]*?<\/(?:Version|DeleteMarker)>/g)]
      .map((m) => ({
        key: xmlUnescape(m[0].match(/<Key>([^<]*)<\/Key>/)?.[1] ?? ''),
        id: m[0].match(/<VersionId>([^<]*)<\/VersionId>/)?.[1] ?? '',
      }))
      .filter((v) => v.key.startsWith(prefix) && v.id !== '');
    if (versions.length === 0) break;
    for (let i = 0; i < versions.length; i += 8) {
      const answers = await Promise.all(
        versions.slice(i, i + 8).map((v) => s3(cfg, 'DELETE', v.key, { versionId: v.id })),
      );
      for (const gone of answers) {
        if (!gone.ok && gone.status !== 404) throw new Error(`version delete failed: ${gone.status}`);
        removed++;
      }
    }
    if (!text.includes('<IsTruncated>true</IsTruncated>')) break;
  }
  return removed;
}

/** Backblaze's own answer about the bucket, held against the catalogue.
 *
 *  This is the only place the two sides of TDG Cloud are ever compared. The
 *  catalogue is what we BILL against; the bucket is what we PAY for, and
 *  nothing else in the system would ever notice them drifting apart:
 *
 *    · an ORPHAN is an object B2 is charging us for that no account claims —
 *      an upload whose `upload-finish` never ran, or a delete that removed
 *      the row and then failed on the bytes. It costs money forever and is
 *      invisible from every other screen.
 *    · a GHOST is the opposite: a catalogue row promising bytes that are not
 *      there. The person is billed quota for a file that would 404.
 *    · OLD VERSIONS and HIDE MARKERS are the B2-specific tax. `hardDelete`
 *      destroys versions by id precisely so these stay at zero; a number
 *      above zero here means something took the plain-S3-DELETE path.
 *
 *  Read-only, and deliberately so — it reports, it never reconciles. What to
 *  do about a discrepancy is a decision, not a sweep.
 */
const AUDIT_CAP = 200_000;

type BucketAudit = {
  bucket: string;
  stored: { objects: number; bytes: number };
  old_versions: { count: number; bytes: number };
  hide_markers: number;
  catalogue: { rows: number; bytes: number };
  /** The first 200 of each, to look at. `counts` carries the real totals —
   *  a listing that silently stops at 200 reads as "only 200 wrong". */
  orphans: { key: string; bytes: number }[];
  ghosts: { key: string; bytes: number }[];
  mismatched: { key: string; bucket_bytes: number; catalogue_bytes: number }[];
  counts: { orphans: number; ghosts: number; mismatched: number; orphan_bytes: number };
  truncated: boolean;
};

const LIST_CAP = 200;

async function bucketAudit(): Promise<BucketAudit> {
  const cfg = await b2();

  //  Every version, not just the current one: an old version is a line on
  //  the bill exactly like a live object is.
  const live = new Map<string, number>();
  let oldCount = 0;
  let oldBytes = 0;
  let markers = 0;
  let truncated = false;
  let keyMarker = '';
  let versionMarker = '';

  for (let round = 0; ; round++) {
    const query: Record<string, string> = { versions: '', 'max-keys': '1000' };
    if (keyMarker !== '') query['key-marker'] = keyMarker;
    if (versionMarker !== '') query['version-id-marker'] = versionMarker;
    const list = await s3(cfg, 'GET', '', query);
    const text = await list.text();
    if (!list.ok) throw new Error(`version list failed: ${list.status}`);

    for (const m of text.matchAll(/<Version>[\s\S]*?<\/Version>/g)) {
      const key = xmlUnescape(m[0].match(/<Key>([^<]*)<\/Key>/)?.[1] ?? '');
      const size = Number(m[0].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0);
      if (m[0].includes('<IsLatest>true</IsLatest>')) live.set(key, size);
      else {
        oldCount++;
        oldBytes += size;
      }
    }
    markers += [...text.matchAll(/<DeleteMarker>/g)].length;

    if (live.size + oldCount >= AUDIT_CAP) {
      truncated = true;
      break;
    }
    if (!text.includes('<IsTruncated>true</IsTruncated>')) break;
    keyMarker = xmlUnescape(text.match(/<NextKeyMarker>([^<]*)<\/NextKeyMarker>/)?.[1] ?? '');
    versionMarker = text.match(/<NextVersionIdMarker>([^<]*)<\/NextVersionIdMarker>/)?.[1] ?? '';
    if (keyMarker === '') break;
    if (round > 400) {
      truncated = true;
      break;
    }
  }

  //  The catalogue, in the same key shape the bucket uses.
  const claimed = new Map<string, number>();
  let rows = 0;
  let catalogueBytes = 0;
  for (let page = 0; page < 400; page++) {
    const res = await rest(
      `/rest/v1/tdg_cloud_files?select=user_id,app,path,bytes&limit=1000&offset=${page * 1000}&order=user_id,app,path`,
    );
    if (!res.ok) throw new Error(`catalogue read failed: ${res.status}`);
    const batch = (await res.json()) as { user_id: string; app: string; path: string; bytes: number }[];
    if (batch.length === 0) break;
    for (const row of batch) {
      claimed.set(`${row.user_id}/${row.app}/${row.path}`, Number(row.bytes) || 0);
      catalogueBytes += Number(row.bytes) || 0;
      rows++;
    }
    if (batch.length < 1000) break;
  }

  const orphans: { key: string; bytes: number }[] = [];
  const ghosts: { key: string; bytes: number }[] = [];
  const mismatched: { key: string; bucket_bytes: number; catalogue_bytes: number }[] = [];
  let storedBytes = 0;
  let orphanCount = 0;
  let orphanBytes = 0;
  let ghostCount = 0;
  let mismatchCount = 0;

  for (const [key, bytes] of live) {
    storedBytes += bytes;
    const claim = claimed.get(key);
    if (claim === undefined) {
      orphanCount++;
      orphanBytes += bytes;
      if (orphans.length < LIST_CAP) orphans.push({ key, bytes });
    } else if (claim !== bytes) {
      mismatchCount++;
      if (mismatched.length < LIST_CAP) mismatched.push({ key, bucket_bytes: bytes, catalogue_bytes: claim });
    }
  }
  //  A ghost is only meaningful when the listing was complete; a truncated
  //  sweep would report every unlisted file as missing, which is a lie.
  if (!truncated) {
    for (const [key, bytes] of claimed) {
      if (live.has(key)) continue;
      ghostCount++;
      if (ghosts.length < LIST_CAP) ghosts.push({ key, bytes });
    }
  }

  return {
    bucket: cfg.bucket,
    stored: { objects: live.size, bytes: storedBytes },
    old_versions: { count: oldCount, bytes: oldBytes },
    hide_markers: markers,
    catalogue: { rows, bytes: catalogueBytes },
    orphans,
    ghosts,
    mismatched,
    counts: {
      orphans: orphanCount,
      ghosts: ghostCount,
      mismatched: mismatchCount,
      orphan_bytes: orphanBytes,
    },
    truncated,
  };
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

    if (action === 'bucket') {
      return json(await bucketAudit());
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

      const cfg2 = await b2();
      const purged: { user_id: string; objects: number }[] = [];
      for (const candidate of ready) {
        const removed = await purgePrefix(cfg2, `${candidate.user_id}/`);
        await rest(`/rest/v1/rpc/tdg_cloud_account_remove_all`, {
          method: 'POST',
          body: JSON.stringify({ p_uid: candidate.user_id }),
        });
        await rest(`/rest/v1/tdg_cloud_sync_state?user_id=eq.${candidate.user_id}`, { method: 'DELETE' });
        await audit(
          candidate.user_id,
          'cloud-purge',
          `retention expired ${candidate.deadline}; removed ${removed} hosted object versions (${candidate.bytes} bytes)`,
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
