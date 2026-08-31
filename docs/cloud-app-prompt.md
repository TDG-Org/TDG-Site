# TDG Cloud · the brief for each app's own session

Paste this into a Claude session in a TDG app repository (TDG Veditor,
DevFleet, Bible Educator, Makullveny, Music Everything, the Developer app)
when that app is ready to integrate TDG Cloud. One paste per repo. The
backend is finished and dormant; the app's job is to talk to it correctly and
say the honest sentence while it is unavailable.

---

Integrate TDG Cloud into this app, respecting that the service is COMING SOON
and centrally controlled by TDG Core (Supabase project `ddbksawvchsauiuiwvrl`).

**What TDG Cloud is.** One pooled storage allowance per TDG Account, shared
across every compatible TDG app, sold as two subscription plans (`standard`,
`studio`) whose names, quotas, prices and availability all live in
`tdg_cloud_config` on TDG Core. Never hard-code any of those; read them.

**The server surface you build against (all live today):**

- `tdg_cloud_public_config()` — anon-callable: `{available, plans[], retention_read_only_days}`. Payment links are null while Cloud is unavailable, deliberately.
- `tdg_cloud_status()` — authenticated, self: availability for THIS account (`enabled_for_you` opens early for developer/tester accounts while `available` is still false), the plan and its grant, `quota_bytes` / `used_bytes` / `reserved_bytes` / `free_bytes`, `per_app[]`, `egress`, `retention {state, deadline}`, `revoked`, and `warnings[]` the server computed. Poll it the way you poll entitlements: foreground, and after any upload batch.
- **All bytes move through the `cloud-storage` Edge Function** (`POST
  {SUPABASE_URL}/functions/v1/cloud-storage`, JSON `{action, ...}`, header
  `Authorization: Bearer <the user's access token>`). The bytes themselves
  live in Backblaze B2; the function checks every gate in Postgres and hands
  back **presigned URLs** your app then PUTs/GETs directly — never a raw
  storage credential, and never a Supabase Storage call (`supabase.storage`
  has no part in TDG Cloud). Refusals are JSON `{error: {code, message}}`
  with the same SQLSTATEs to match on (never message text): `TDGC1` not
  available, `TDGC2` no plan in force / read-only retention, `TDGC3` quota
  full, `TDGC4` limits, `42501` revoked, `22023` bad input, `28000` signed
  out, plus `size_mismatch` (you uploaded more bytes than you reserved — the
  object is discarded, re-begin with the true size) and `storage_error`.
  - `{action: 'upload-begin', app, path, bytes, meta?}` — `bytes` is the file's
    exact size **in bytes** (never a string length). Small files (≤4 GiB)
    answer `{mode:'single', url, reservation_id, expires_at}`: PUT the bytes
    to `url`, then call `upload-finish`. Bigger files answer
    `{mode:'multipart', upload_id, part_size, part_urls:[{part,url}]}`: PUT
    each `part_size` slice to its URL (keep each response's `ETag` header),
    then finish with the parts. `{action:'upload-part-urls', app, path,
    upload_id, from, count}` re-issues URLs if one expires mid-upload.
  - `{action: 'upload-finish', app, path, upload_id?, parts?:[{part,etag}]}` —
    the function verifies the object landed (its own HEAD), books the REAL
    size into the catalogue, and consumes the reservation. An upload is not
    hosted until this answers `{ok:true}`.
  - `{action: 'upload-cancel', reservation_id, app?, path?, upload_id?}` —
    gives the space back early (and aborts a multipart in progress).
  - `{action: 'download', app, path, filename?}` — meters egress
    (`tdg_cloud_begin_download` behind it) and answers `{url, bytes,
    expires_in}`: a minutes-long presigned GET straight to B2. `filename`
    signs a content-disposition into the URL for save-as flows. Reads are
    never gated on the plan: retention promises a lapsed account can still
    read, download and delete.
  - `{action: 'delete', app, path}` and `{action: 'delete-all'}` — destroy
    every stored version of the object(s) (delete means gone, not hidden)
    and settle the usage books server-side. `delete-all` also clears sync
    state.
- `tdg_cloud_annotate_file(p_app, p_path, p_meta)` — merge your sync metadata (content hash, client mtime, kind) onto the hosted file's catalogue row, so delta sync can compare without downloading. `p_meta` also rides on `begin_upload`.
- `tdg_cloud_set_sync_state(p_app, p_state)` — your app's cursors and per-device high-water marks, ≤64 kB, never content. Read your own back from `tdg_cloud_sync_state` over RLS; hosted file rows are `tdg_cloud_files`, usage `tdg_cloud_usage`, egress `tdg_cloud_egress`, all owner-readable.
- Plans are bought on TDG Cebu's Store and managed there or on its Account page; do not build checkout into the app. Deep-link to the site.

**Your `p_app` id** is this app's backend id (`veditor`, `devfleet`, `bea`,
`makullveny`, `music-everything`, …) — lowercase, the shape
`^[a-z0-9][a-z0-9-]{1,31}$`. Paths are relative, forward-slash, no `..`; the
object key is `<user_id>/<app>/<path>` and identity is the path — there is no
rename, so a moved file is delete + re-upload.

**Migrating an app that already integrated the old transport:** everything
about the RPCs, the codes, the flags and the UI contract is unchanged — only
the byte transport moved. Replace any `supabase.storage.from('tdg-cloud')`
upload/download/remove with the `cloud-storage` verbs above (begin → PUT the
presigned URL → finish; download → GET the answered URL; delete verb instead
of remove). That bucket no longer exists.

**What to sync, and what never to.** Inspect this app and sync only
meaningful user data: projects, documents, saves, settings-like state that is
not already in `tdg_preferences`, media the user imported or produced.
NEVER caches, temp files, logs, thumbnails, proxies, render output that can be
re-derived, node_modules-shaped directories, or anything device-specific.
Storage the user pays for must never be spent on housekeeping. Use
content hashes + `annotate_file` for incremental/delta sync; upload only what
changed.

**Respect the flags, visibly.**
- If `enabled_for_you` is false: every Cloud surface in the app says Coming
  Soon in words — never a broken control, never silence. No uploads, no sync
  bookkeeping writes.
- If the plan lapses (`TDGC2` / `retention.state = 'read_only'`): pause
  uploads and sync, keep reads/downloads/deletes working, show the deadline
  the status reports and that resubscribing before it restores everything.
- At quota (`TDGC3` / `warnings` quota_full): pause new hosted writes, say so
  where the user is looking, keep everything local working, and keep hosted
  data readable. Surface the 80%/95% warnings before the wall.
- If `revoked`: say the recorded reason; never offer Cloud controls that will
  refuse.
- Local work is NEVER lost or blocked because Cloud is off, full, lapsed or
  unreachable. Cloud is a mirror of local truth, not a gate on it.

**Where it goes in the app:** the existing Account/Settings surface (plan,
pooled usage, this app's share, sync state, a link to TDG Cebu to manage
or buy), any backup/sync areas, and Help/About mentions. No new duplicate
pages. Match this app's existing design system and conventions; every state
styled, both themes if the app has them.

Developer accounts can test the whole path today (`dev_testing` is on in
config). Follow this repo's own AGENTS/CLAUDE instructions, run its checks,
and finish with a summary of what will light up automatically on the day TDG
Core flips `availability.available`.
