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
- `tdg_cloud_begin_upload(p_app, p_path, p_bytes, p_meta)` — the ONLY way to open the bucket for a write. Refusals carry SQLSTATEs to match on (never message text): `TDGC1` not available, `TDGC2` no plan in force / read-only retention, `TDGC3` quota full, `TDGC4` limits (too many in flight, file-count cap), `42501` revoked, `22023` bad input. Returns `{reservation_id, object_path, expires_at}`. Then upload to bucket `tdg-cloud` at exactly `object_path` with the standard Storage API; the reservation is consumed server-side when the object lands. `tdg_cloud_cancel_upload(id)` gives the space back early.
- `tdg_cloud_begin_download(p_app, p_path)` — call before downloading so egress is metered, then fetch `object_path` over Storage. Reads are never gated on the plan: retention promises a lapsed account can still read, download and delete.
- `tdg_cloud_annotate_file(p_app, p_path, p_meta)` — merge your sync metadata (content hash, client mtime, kind) onto the hosted file's catalogue row, so delta sync can compare without downloading. `p_meta` also rides on `begin_upload`.
- `tdg_cloud_set_sync_state(p_app, p_state)` — your app's cursors and per-device high-water marks, ≤64 kB, never content. Read your own back from `tdg_cloud_sync_state` over RLS; hosted file rows are `tdg_cloud_files`, usage `tdg_cloud_usage`, egress `tdg_cloud_egress`, all owner-readable.
- Plans are bought on the TDG site's Store and managed there or on its Account page; do not build checkout into the app. Deep-link to the site.

**Your `p_app` id** is this app's backend id (`veditor`, `devfleet`, `bea`,
`makullveny`, `music-everything`, …) — lowercase, the shape
`^[a-z0-9][a-z0-9-]{1,31}$`. Paths are relative, forward-slash, no `..`; the
object key is `<user_id>/<app>/<path>` and identity is the path — there is no
rename, so a moved file is delete + re-upload.

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
pooled usage, this app's share, sync state, a link to the TDG site to manage
or buy), any backup/sync areas, and Help/About mentions. No new duplicate
pages. Match this app's existing design system and conventions; every state
styled, both themes if the app has them.

Developer accounts can test the whole path today (`dev_testing` is on in
config). Follow this repo's own AGENTS/CLAUDE instructions, run its checks,
and finish with a summary of what will light up automatically on the day TDG
Core flips `availability.available`.
