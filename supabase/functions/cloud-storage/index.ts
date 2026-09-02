/** `cloud-storage` — the one door between TDG Cloud clients and Backblaze B2.
 *
 *  ── The shape of the thing ──
 *  Postgres stays the law: `tdg_cloud_begin_upload` still decides whether an
 *  upload may happen (availability, plan, retention, revocation, quota, the
 *  limits), `tdg_cloud_begin_download` still meters egress, and the
 *  `tdg_cloud_files`/`_usage` catalogue is still the record. What moved is the
 *  bytes: they live in the private B2 bucket, and THIS function is the only
 *  thing that holds the credential for it (from Vault, via the service-only
 *  `tdg_cloud_b2_credentials()`).
 *
 *  Clients never see that key. They get S3-presigned URLs — capability
 *  tokens scoped to ONE exact object name, one verb, and a short expiry —
 *  and move the bytes themselves, client↔B2 directly in both directions. So
 *  hosted traffic costs no Supabase egress, and a browser can PUT a gigabyte
 *  without a byte of it passing through here.
 *
 *  ── Why the gates cannot be skipped ──
 *  A presigned PUT exists only AFTER `tdg_cloud_begin_upload` said yes —
 *  the RPC runs with the CALLER's own JWT (forwarded verbatim), so auth.uid()
 *  and every refusal (TDGC1..4, 42501, 22023, 28000) are exactly what the
 *  contract documents; this function adds no policy of its own on that path,
 *  and its refusals pass through with the same `{error: {code, message}}`
 *  shape clients already match on. The catalogue is written only by
 *  `upload-finish`, which HEADs the object with its own eyes first and
 *  refuses to book more bytes than the reservation promised — a client that
 *  lies about size loses the object, not the ledger.
 *
 *  ── Verbs (POST JSON `{action, ...}`, `Authorization: Bearer <user JWT>`) ──
 *    upload-begin   {app, path, bytes, meta?} → reservation + presigned PUT
 *                   (or multipart: upload_id + part URLs, 256 MiB parts)
 *    upload-part-urls {app, path, upload_id, from, count} → more part URLs
 *    upload-finish  {app, path, upload_id?, parts?} → HEAD, book, consume
 *                   (a size that overruns its reservation loses the object
 *                    AND releases the reservation — see the branch itself)
 *    upload-cancel  {reservation_id, app?, path?, upload_id?} → give space back
 *    download       {app, path, filename?} → metered presigned GET
 *    delete         {app, path} → remove object + settle the books
 *    delete-all     {} → empty the account (objects, catalogue, sync state)
 *  GET → health stamp (no identity, no secrets).
 */

const SOURCE_STAMP = 'cloud-storage@4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';

/** Single-request PUT ceiling. S3 caps one PUT at 5 GiB; staying under it
 *  with margin keeps every edge (proxies, retries) comfortable. */
const SINGLE_MAX = 4 * 1024 ** 3;
const PART_SIZE = 256 * 1024 ** 2;
/** Presigned URLs die on their own; uploads get the long leash (a reservation
 *  lives 60 minutes by default), downloads the short one. */
const UPLOAD_URL_TTL = 3600;
const DOWNLOAD_URL_TTL = 900;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function refuse(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status);
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

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

/** An RPC as the SERVICE — accounting primitives and the credential read. */
async function serviceRpc(fn: string, args: Record<string, unknown>): Promise<Response> {
  return await rest(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
}

/** An RPC as the CALLER: their JWT decides auth.uid() and the role, so the
 *  gate functions behave exactly as if the app had called PostgREST itself —
 *  including every SQLSTATE the contract documents. */
async function userRpc(fn: string, args: Record<string, unknown>, token: string): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
}

/** PostgREST's error body, re-shaped to the `{code, message}` the apps match
 *  on (SQLSTATEs like TDGC3 ride in `code`). */
async function passthrough(res: Response): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* an empty error body stays an empty error */
  }
  return refuse(
    String(body.code ?? 'error'),
    String(body.message ?? 'the request was refused'),
    res.status >= 400 && res.status < 500 ? res.status : 500,
  );
}

async function callerId(token: string): Promise<string | null> {
  if (token === '') return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as Record<string, unknown>;
  const id = String(user?.id ?? '');
  return id === '' ? null : id;
}

// ── B2 via its S3 face ───────────────────────────────────────────────────────

type B2 = { keyId: string; appKey: string; bucket: string; region: string; host: string };

let b2Cache: { value: B2; at: number } | null = null;

async function b2(): Promise<B2> {
  if (b2Cache !== null && Date.now() - b2Cache.at < 5 * 60_000) return b2Cache.value;

  const credsRes = await serviceRpc('tdg_cloud_b2_credentials', {});
  if (!credsRes.ok) throw new Error(`credentials read failed: ${credsRes.status}`);
  const creds = (await credsRes.json()) as Record<string, unknown>;

  const cfgRes = await rest('/rest/v1/tdg_cloud_config?select=doc');
  if (!cfgRes.ok) throw new Error(`config read failed: ${cfgRes.status}`);
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
    throw new Error('B2 is not configured (vault credentials or config.storage missing)');
  }
  b2Cache = { value, at: Date.now() };
  return value;
}

const enc = new TextEncoder();

async function sha256hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', k, enc.encode(data));
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function amzNow(): { amzDate: string; date: string } {
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amzDate, date: amzDate.slice(0, 8) };
}

function encodePath(objectKey: string): string {
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

function encodeQueryPair(k: string, v: string): string {
  // SigV4 wants RFC 3986 strictly — encodeURIComponent leaves !'()* alone.
  const strict = (s: string) =>
    encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${strict(k)}=${strict(v)}`;
}

async function signingKey(cfg: B2, date: string): Promise<ArrayBuffer> {
  let key: ArrayBuffer = (enc.encode('AWS4' + cfg.appKey) as Uint8Array).buffer as ArrayBuffer;
  for (const part of [date, cfg.region, 's3', 'aws4_request']) key = await hmac(key, part);
  return key;
}

/** A presigned URL: the whole authorization lives in the query string, so
 *  whoever holds it can do exactly this verb on exactly this object until
 *  the expiry — and nothing else. */
async function presign(
  cfg: B2,
  method: string,
  objectKey: string,
  expires: number,
  extraQuery: Record<string, string> = {},
): Promise<string> {
  const { amzDate, date } = amzNow();
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const path = `/${cfg.bucket}/${encodePath(objectKey)}`;
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.keyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
    ...extraQuery,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => encodeQueryPair(k, query[k]))
    .join('&');
  const canonical = [method, path, canonicalQuery, `host:${cfg.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256hex(canonical)].join('\n');
  const sig = hex(await hmac(await signingKey(cfg, date), toSign));
  return `https://${cfg.host}${path}?${canonicalQuery}&X-Amz-Signature=${sig}`;
}

/** A server-side S3 request (HEAD/DELETE/multipart bookkeeping), signed in
 *  headers. Bulk bytes never travel this way — only questions and orders. */
async function s3(
  cfg: B2,
  method: string,
  objectKey: string,
  rawQuery: Record<string, string> = {},
  body: string | null = null,
): Promise<Response> {
  const { amzDate, date } = amzNow();
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const path = `/${cfg.bucket}${objectKey === '' ? '' : '/' + encodePath(objectKey)}`;
  const canonicalQuery = Object.keys(rawQuery)
    .sort()
    .map((k) => encodeQueryPair(k, rawQuery[k]))
    .join('&');
  const payloadHash = body === null ? 'UNSIGNED-PAYLOAD' : await sha256hex(body);
  const headers: Record<string, string> = {
    host: cfg.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join('');
  const canonical = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256hex(canonical)].join('\n');
  const sig = hex(await hmac(await signingKey(cfg, date), toSign));
  const url = `https://${cfg.host}${path}${canonicalQuery === '' ? '' : '?' + canonicalQuery}`;
  return await fetch(url, {
    method,
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    },
    ...(body === null ? {} : { body }),
  });
}

const xmlUnescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#3[49];/g, (m) => (m === '&#34;' ? '"' : "'"))
    .replace(/&amp;/g, '&');

/** Every version of exactly this name, newest first as B2 lists them, or
 *  null when the listing failed.
 *
 *  PAGED, which the first version of this was not: it asked for one page of
 *  100 and stopped, so an object rewritten 150 times in a day — a sync app
 *  re-saving `settings.json` — kept 50 versions after a "delete", the 51st
 *  newest became the current object, the catalogue row was gone, and the
 *  bytes were an orphan billed to us with the delete reported as done. */
async function listVersions(cfg: B2, objectKey: string): Promise<{ id: string; latest: boolean }[] | null> {
  const out: { id: string; latest: boolean }[] = [];
  let keyMarker = '';
  let versionMarker = '';
  for (let round = 0; round < 200; round++) {
    const query: Record<string, string> = { versions: '', prefix: objectKey, 'max-keys': '1000' };
    if (keyMarker !== '') query['key-marker'] = keyMarker;
    if (versionMarker !== '') query['version-id-marker'] = versionMarker;
    const list = await s3(cfg, 'GET', '', query);
    const text = await list.text();
    if (!list.ok) {
      console.error('cloud-storage: version list failed', list.status, text.slice(0, 200));
      return null;
    }
    for (const m of text.matchAll(/<(?:Version|DeleteMarker)>[\s\S]*?<\/(?:Version|DeleteMarker)>/g)) {
      const key = xmlUnescape(m[0].match(/<Key>([^<]*)<\/Key>/)?.[1] ?? '');
      const id = m[0].match(/<VersionId>([^<]*)<\/VersionId>/)?.[1] ?? '';
      // The prefix also matches LONGER names; only exactly this object counts.
      if (key !== objectKey || id === '') continue;
      out.push({ id, latest: m[0].includes('<IsLatest>true</IsLatest>') });
    }
    if (!text.includes('<IsTruncated>true</IsTruncated>')) break;
    keyMarker = xmlUnescape(text.match(/<NextKeyMarker>([^<]*)<\/NextKeyMarker>/)?.[1] ?? '');
    versionMarker = text.match(/<NextVersionIdMarker>([^<]*)<\/NextVersionIdMarker>/)?.[1] ?? '';
    // Keys list in order, so a marker past this name means every version of
    // it has been seen; the rest of the prefix is longer names.
    if (keyMarker === '' || keyMarker > objectKey) break;
  }
  return out;
}

/** Delete means GONE, not hidden. A plain S3 DELETE on a B2 bucket writes a
 *  hide marker (the lifecycle sweeps those a day later), and deleting only
 *  the newest version would resurrect the one beneath it — so a real delete
 *  lists every version of exactly this name and destroys each by versionId. */
async function hardDelete(cfg: B2, objectKey: string): Promise<boolean> {
  const versions = await listVersions(cfg, objectKey);
  if (versions === null) return false;
  for (const v of versions) {
    const gone = await s3(cfg, 'DELETE', objectKey, { versionId: v.id });
    if (!gone.ok && gone.status !== 404) {
      console.error('cloud-storage: version delete failed', gone.status);
      return false;
    }
  }
  return true;
}

/** The OTHER delete: only the newest version goes, and whatever stood
 *  beneath it becomes current again.
 *
 *  For an upload that must not be kept — larger than its reservation, or
 *  with no reservation behind it at all. `hardDelete` here destroyed every
 *  version of the name, the previously booked good file included, and left
 *  the catalogue row promising bytes that would 404 on download: a client
 *  that lied about size lost the object it had, not only the object it
 *  sent. Taking the newest version alone puts the bucket back to what the
 *  catalogue says. (B2's lifecycle keeps superseded versions for a day, so
 *  the good one is still there on any honest timescale.) */
async function deleteLatestVersion(cfg: B2, objectKey: string): Promise<boolean> {
  const versions = await listVersions(cfg, objectKey);
  if (versions === null) return false;
  const latest = versions.find((v) => v.latest);
  if (!latest) return true;
  const gone = await s3(cfg, 'DELETE', objectKey, { versionId: latest.id });
  if (!gone.ok && gone.status !== 404) {
    console.error('cloud-storage: latest-version delete failed', gone.status);
    return false;
  }
  return true;
}

/** The bytes the catalogue books for this path, or NaN when it books none. */
async function bookedBytes(uid: string, app: string, path: string): Promise<number> {
  const res = await rest(
    `/rest/v1/tdg_cloud_files?user_id=eq.${uid}&app=eq.${encodeURIComponent(app)}&path=eq.${encodeURIComponent(path)}&select=bytes`,
  );
  if (!res.ok) return NaN;
  return Number(((await res.json())?.[0] as Record<string, unknown> | undefined)?.bytes ?? NaN);
}

/** The reservation standing behind this path, or null when there is none. */
async function reservationFor(
  uid: string,
  app: string,
  path: string,
): Promise<{ bytes: number; live: boolean } | null> {
  const res = await rest(
    `/rest/v1/tdg_cloud_reservations?user_id=eq.${uid}&app=eq.${encodeURIComponent(app)}&path=eq.${encodeURIComponent(path)}&select=bytes,expires_at`,
  );
  if (!res.ok) return null;
  const row = (await res.json())?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const bytes = Number(row.bytes ?? NaN);
  if (!Number.isFinite(bytes)) return null;
  return { bytes, live: Date.parse(String(row.expires_at ?? '')) > Date.now() };
}

// ── input hygiene (the RPCs re-check; this keeps bad names out of URLs) ─────

const APP_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

function validPath(path: string): boolean {
  if (path.length === 0 || path.length > 512) return false;
  if (path.startsWith('/') || path.endsWith('/')) return false;
  if (path.includes('\\') || path.includes('//')) return false;
  return !path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..');
}

function partUrlsFor(
  cfg: B2,
  objectKey: string,
  uploadId: string,
  from: number,
  count: number,
): Promise<{ part: number; url: string }[]> {
  const jobs: Promise<{ part: number; url: string }>[] = [];
  for (let part = from; part < from + count; part++) {
    jobs.push(
      presign(cfg, 'PUT', objectKey, UPLOAD_URL_TTL, {
        partNumber: String(part),
        uploadId,
      }).then((url) => ({ part, url })),
    );
  }
  return Promise.all(jobs);
}

// ── the verbs ────────────────────────────────────────────────────────────────

async function uploadBegin(token: string, body: Record<string, unknown>): Promise<Response> {
  const bytes = Number(body.bytes);
  const gate = await userRpc(
    'tdg_cloud_begin_upload',
    { p_app: body.app, p_path: body.path, p_bytes: bytes, p_meta: body.meta ?? null },
    token,
  );
  if (!gate.ok) return await passthrough(gate);
  const reservation = (await gate.json()) as Record<string, unknown>;
  const objectKey = String(reservation.object_path ?? '');
  const cfg = await b2();

  if (bytes <= SINGLE_MAX) {
    return json({
      mode: 'single',
      url: await presign(cfg, 'PUT', objectKey, UPLOAD_URL_TTL),
      object_path: objectKey,
      reservation_id: reservation.reservation_id,
      expires_at: reservation.expires_at,
    });
  }

  const create = await s3(cfg, 'POST', objectKey, { uploads: '' });
  const createText = await create.text();
  if (!create.ok) {
    console.error('cloud-storage: multipart create failed', create.status, createText);
    return refuse('storage_error', 'the storage backend refused to start the upload', 502);
  }
  const uploadId = createText.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  if (!uploadId) return refuse('storage_error', 'the storage backend answered strangely', 502);
  const parts = Math.ceil(bytes / PART_SIZE);
  return json({
    mode: 'multipart',
    upload_id: uploadId,
    part_size: PART_SIZE,
    part_urls: await partUrlsFor(cfg, objectKey, uploadId, 1, parts),
    object_path: objectKey,
    reservation_id: reservation.reservation_id,
    expires_at: reservation.expires_at,
  });
}

async function uploadPartUrls(uid: string, body: Record<string, unknown>): Promise<Response> {
  const app = String(body.app ?? '');
  const path = String(body.path ?? '');
  const uploadId = String(body.upload_id ?? '');
  const from = Math.max(1, Number(body.from) || 1);
  const count = Math.min(64, Math.max(1, Number(body.count) || 1));
  if (!APP_RE.test(app) || !validPath(path) || uploadId === '') return refuse('22023', 'bad request');
  /*
   * A part URL is a licence to put 256 MiB somewhere we pay for, so it is
   * handed out only against a LIVE reservation, and only for the parts that
   * reservation's size can hold. Nothing bounded this before: a caller could
   * ask for parts 1…∞ under any `upload_id` and stack terabytes of unfinished
   * multipart parts in the bucket, billed and invisible to every audit.
   */
  const reservation = await reservationFor(uid, app, path);
  if (reservation === null || !reservation.live) {
    return refuse('no_reservation', 'no live reservation stands behind this upload — begin it again', 409);
  }
  const maxPart = Math.max(1, Math.ceil(reservation.bytes / PART_SIZE));
  if (from + count - 1 > maxPart) {
    return refuse('22023', `this upload has at most ${maxPart} part${maxPart === 1 ? '' : 's'}`);
  }
  const cfg = await b2();
  return json({ part_urls: await partUrlsFor(cfg, `${uid}/${app}/${path}`, uploadId, from, count) });
}

async function uploadFinish(uid: string, body: Record<string, unknown>): Promise<Response> {
  const app = String(body.app ?? '');
  const path = String(body.path ?? '');
  if (!APP_RE.test(app) || !validPath(path)) return refuse('22023', 'bad request');
  const objectKey = `${uid}/${app}/${path}`;
  const cfg = await b2();

  const uploadId = String(body.upload_id ?? '');
  if (uploadId !== '') {
    const parts = Array.isArray(body.parts) ? (body.parts as Record<string, unknown>[]) : [];
    if (parts.length === 0) return refuse('22023', 'a multipart finish needs its parts');
    const xml =
      '<CompleteMultipartUpload>' +
      parts
        .map((p) => ({ n: Number(p.part), etag: String(p.etag ?? '').replace(/"/g, '') }))
        .sort((a, b) => a.n - b.n)
        .map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>"${p.etag}"</ETag></Part>`)
        .join('') +
      '</CompleteMultipartUpload>';
    const done = await s3(cfg, 'POST', objectKey, { uploadId }, xml);
    const doneText = await done.text();
    // S3 completes can 200 with an <Error> body; both faces are checked.
    if (!done.ok || doneText.includes('<Error>')) {
      console.error('cloud-storage: multipart complete failed', done.status, doneText);
      return refuse('storage_error', 'the storage backend could not assemble the upload', 502);
    }
  }

  const head = await s3(cfg, 'HEAD', objectKey);
  if (!head.ok) return refuse('not_landed', 'no uploaded object was found to book', 409);
  const actual = Number(head.headers.get('content-length') ?? 0);

  /*
   * The reservation promised a size and quota was granted for THAT size —
   * and it is the ONLY key to booking. With no reservation behind the path,
   * one of two things is true: this is a retry of a finish that already
   * booked (the answer was lost on the way back; the catalogue holds exactly
   * these bytes, and the honest reply is the same "ok" again), or it is an
   * object nothing promised space for — a reservation cancelled or reaped
   * after the PUT, which is how a one-byte reservation used to book four
   * gigabytes, because a missing row read as NaN and the size guard below
   * was simply skipped. That object is not kept.
   */
  const where = `user_id=eq.${uid}&app=eq.${encodeURIComponent(app)}&path=eq.${encodeURIComponent(path)}`;
  const reservation = await reservationFor(uid, app, path);
  if (reservation === null) {
    const booked = await bookedBytes(uid, app, path);
    if (Number.isFinite(booked) && booked === actual) {
      return json({ ok: true, bytes: actual, object_path: objectKey, already_booked: true });
    }
    await deleteLatestVersion(cfg, objectKey);
    return refuse('no_reservation', 'no reservation stands behind this upload, so it was not kept — begin it again', 409);
  }
  // More bytes than promised do not get booked — the newest version goes
  // (and only the newest: the file this was replacing stays current, so the
  // catalogue row it has still describes a real object), the space stays.
  if (actual > reservation.bytes) {
    await deleteLatestVersion(cfg, objectKey);
    // This reservation is spent: the object it was for is gone and no retry
    // of THIS finish can ever book it. Leaving it to die of its own TTL would
    // hold quota, and one of the 64 open-reservation slots, for an hour —
    // so a client that lies 64 times locks itself out of uploading at all.
    // The client is asked to `upload-cancel` too, but the server already
    // knows, and Veditor's broker never calls cancel.
    await rest(`/rest/v1/tdg_cloud_reservations?${where}`, { method: 'DELETE' }).catch(() => undefined);
    return refuse('size_mismatch', 'the upload was larger than its reservation, so it was not kept', 409);
  }

  const book = await serviceRpc('tdg_cloud_account_upsert', {
    p_uid: uid,
    p_app: app,
    p_path: path,
    p_bytes: actual,
  });
  if (!book.ok) {
    // Postgres holds the same two rules (TDGC5 no reservation, TDGC3 larger
    // than it) and is the boundary; a refusal from there passes through in
    // its own words rather than being dressed as a server fault.
    if (book.status >= 400 && book.status < 500) return await passthrough(book);
    console.error('cloud-storage: account_upsert failed', book.status, await book.text());
    return refuse('server_error', 'the upload landed but could not be booked — retry finish', 500);
  }
  return json({ ok: true, bytes: actual, object_path: objectKey });
}

async function uploadCancel(token: string, body: Record<string, unknown>): Promise<Response> {
  const cancel = await userRpc('tdg_cloud_cancel_upload', { p_id: body.reservation_id }, token);
  if (!cancel.ok) return await passthrough(cancel);
  const uploadId = String(body.upload_id ?? '');
  const app = String(body.app ?? '');
  const path = String(body.path ?? '');
  if (APP_RE.test(app) && validPath(path)) {
    const uid = await callerId(token);
    if (uid !== null) {
      const cfg = await b2();
      const key = `${uid}/${app}/${path}`;
      if (uploadId !== '') {
        // A multipart upload is aborted so its parts stop being billed.
        await s3(cfg, 'DELETE', key, { uploadId }).catch(() => undefined);
      } else {
        // A single PUT may already have landed. Bytes that arrived under a
        // reservation which is now cancelled are bytes nothing will ever
        // book: unless the catalogue already holds exactly what is there (a
        // cancel sent after a finish, harmless), the newest version goes and
        // whatever was booked before it stands.
        try {
          const head = await s3(cfg, 'HEAD', key);
          if (head.ok) {
            const size = Number(head.headers.get('content-length') ?? NaN);
            const booked = await bookedBytes(uid, app, path);
            if (!(Number.isFinite(booked) && booked === size)) await deleteLatestVersion(cfg, key);
          }
        } catch (err) {
          console.error('cloud-storage: cancel cleanup failed', err);
        }
      }
    }
  }
  return json({ ok: true });
}

async function download(token: string, body: Record<string, unknown>): Promise<Response> {
  const meter = await userRpc('tdg_cloud_begin_download', { p_app: body.app, p_path: body.path }, token);
  if (!meter.ok) return await passthrough(meter);
  const answer = (await meter.json()) as Record<string, unknown>;
  const cfg = await b2();
  const extra: Record<string, string> = {};
  const filename = String(body.filename ?? '');
  if (filename !== '' && filename.length <= 200) {
    // Signed into the URL, so the browser saves under the file's own name
    // even though the bytes come from another origin.
    extra['response-content-disposition'] = `attachment; filename="${filename.replace(/[\\"\r\n]/g, '_')}"`;
  }
  return json({
    url: await presign(cfg, 'GET', String(answer.object_path ?? ''), DOWNLOAD_URL_TTL, extra),
    bytes: answer.bytes,
    expires_in: DOWNLOAD_URL_TTL,
  });
}

async function removeOne(uid: string, body: Record<string, unknown>): Promise<Response> {
  const app = String(body.app ?? '');
  const path = String(body.path ?? '');
  if (!APP_RE.test(app) || !validPath(path)) return refuse('22023', 'bad request');

  const row = await rest(
    `/rest/v1/tdg_cloud_files?user_id=eq.${uid}&app=eq.${encodeURIComponent(app)}&path=eq.${encodeURIComponent(path)}&select=path`,
  );
  if (!row.ok || ((await row.json()) as unknown[]).length === 0) {
    return refuse('02000', 'no such hosted file', 404);
  }

  const cfg = await b2();
  if (!(await hardDelete(cfg, `${uid}/${app}/${path}`))) {
    return refuse('storage_error', 'the storage backend refused the delete', 502);
  }
  const book = await serviceRpc('tdg_cloud_account_remove', { p_uid: uid, p_app: app, p_path: path });
  if (!book.ok) return refuse('server_error', 'the object went but the books did not settle — retry', 500);
  return json({ ok: true });
}

async function removeAll(uid: string): Promise<Response> {
  const cfg = await b2();
  let removed = 0;
  // The catalogue names what exists; pages are re-read from the top because
  // each pass deletes what the last one listed.
  for (let round = 0; round < 200; round++) {
    const page = await rest(`/rest/v1/tdg_cloud_files?user_id=eq.${uid}&select=app,path&limit=500`);
    if (!page.ok) return refuse('server_error', 'could not read the catalogue', 500);
    const rows = (await page.json()) as { app: string; path: string }[];
    if (rows.length === 0) break;
    for (let i = 0; i < rows.length; i += 8) {
      const answers = await Promise.all(
        rows.slice(i, i + 8).map((r) => hardDelete(cfg, `${uid}/${r.app}/${r.path}`)),
      );
      for (const ok of answers) {
        if (ok) removed++;
        else return refuse('storage_error', `the storage backend refused a delete after ${removed} removals`, 502);
      }
    }
    if (rows.length < 500) break;
  }
  const settle = await serviceRpc('tdg_cloud_account_remove_all', { p_uid: uid });
  if (!settle.ok) return refuse('server_error', 'objects removed but the books did not settle', 500);
  await rest(`/rest/v1/tdg_cloud_sync_state?user_id=eq.${uid}`, { method: 'DELETE' }).catch(() => undefined);
  return json({ ok: true, removed });
}

// ── the door ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method === 'GET') {
    let storageReady = false;
    try {
      await b2();
      storageReady = true;
    } catch {
      /* the stamp says so instead of throwing */
    }
    return json({
      function: 'cloud-storage',
      stamp: SOURCE_STAMP,
      configured: { supabase: SUPABASE_URL !== '' && SERVICE_KEY !== '', storage: storageReady },
    });
  }
  if (req.method !== 'POST') return refuse('bad_request', 'POST a verb', 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return refuse('server_error', 'not configured', 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token === '' || token === SERVICE_KEY) {
    // The service key is not a person; every verb here acts as somebody.
    return refuse('28000', 'sign in first', 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return refuse('22023', 'bad request');
  }

  try {
    const action = String(body.action ?? '');
    // upload-begin / upload-cancel / download forward the caller's JWT into
    // the gate RPCs and need no separate identity resolution; the rest act
    // on resources named by uid, so the uid must be proven first.
    if (action === 'upload-begin') return await uploadBegin(token, body);
    if (action === 'upload-cancel') return await uploadCancel(token, body);
    if (action === 'download') return await download(token, body);

    const uid = await callerId(token);
    if (uid === null) return refuse('28000', 'sign in first', 401);
    if (action === 'upload-part-urls') return await uploadPartUrls(uid, body);
    if (action === 'upload-finish') return await uploadFinish(uid, body);
    if (action === 'delete') return await removeOne(uid, body);
    if (action === 'delete-all') return await removeAll(uid);
    return refuse('22023', 'unknown action');
  } catch (err) {
    console.error('cloud-storage failed', body?.action, err);
    return refuse('server_error', 'something went wrong on our side', 500);
  }
});
