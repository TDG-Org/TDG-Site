# `src/cloud/` · TDG Cloud, dormant on purpose

Pooled account storage for every TDG app — two paid plans, one allowance —
built completely and shipped **switched off**. Everything here is live code
against live tables; what makes it Coming Soon is one flag in
`tdg_cloud_config` on tdg-core, and launch day is a developer flipping it from
`#/dev`, not a deploy of this site.

| File | What it is |
| --- | --- |
| `config.ts` | The public config store: plans, quotas, prices and availability from `tdg_cloud_public_config()`, over the built-in copy in [`src/data/cloud.ts`](../data/cloud.ts), cached the way `src/content/store.ts` caches. **Fails closed**: `available` and the payment links only ever come from a fresh server answer, so nothing stale can open a checkout. |
| `useCloudStatus.ts` | The signed-in account's whole standing in one `tdg_cloud_status()` round trip: plan and grant, quota against used/reserved, per-app bytes, egress, retention, revocation, and the server's own warnings. Re-asks on foreground/focus/online/every 5 minutes, and a failed re-check never unsettles a settled answer — `useOwnedPacks`' rules, because it is the same money. |
| `CloudShelf.tsx` | The Store index's Cloud area: the two plan cards, priced from config, with every state given a face — Coming Soon (a disabled button that says so), on sale, held (usage meter + manage), revoked, could-not-check. Buying reuses the one `PlanChooser` and the pack cards' five-minute payment watch. |
| `CloudFold.tsx` | The Account page's fold: Coming Soon until Core opens the door for the account, then the management surface — plan and standing, the pooled meter, per-app usage and sync, warnings, browse/download every hosted file, and delete-all behind a typed confirmation. |
| `CloudManage.tsx` | Manage or Cancel Plan, mounted by BOTH surfaces above so rule 11 is kept mechanically. `tdg-site-billing` already handles `app: 'cloud'` because it resolves apps through the registry — cancelling is `cancel_at_period_end`, and the panel says what retention means before the press. |
| `api.ts` | The `tdg_admin_cloud_*` verbs behind the Developer console (config read/write, metrics, retention report, and `getCloudAccount` — one account's whole standing for the **TDG Core & Cloud** panel, which `tdg_cloud_status()` cannot answer because it takes the uuid from the caller's own token and never from a parameter). Here rather than in `src/dev/api.ts` for the badge-client reason: the folder that owns the surface owns its client. |
| `transfer.ts` | The site's client for the `cloud-storage` Edge Function — the one door to the Backblaze B2 bucket the bytes live in. Two verbs used here: `download` (metered, answers a minutes-long presigned URL the browser follows straight to B2) and `delete-all` (server-side wipe of every object version + the books, one call). Refusals matched on codes, billing-style. |
| `Cloud.css` | Both surfaces' clothes, tokens only, both themes. The plan cards are a mirrored pair and take their measurements from variables on their common parent (rule 6). |

## Where the truth lives

**TDG Core owns every number.** Plans, quotas, prices, availability, retention
days, egress policy — one jsonb row (`tdg_cloud_config`), edited from the
console's Cloud tab, read by this folder, by `cloud-stripe-webhook`'s price
map, and by the upload gate in Postgres. `src/data/cloud.ts` is the built-in
copy underneath it, shown while the read is in flight or failed, and it can
never sell anything — payment links exist only in a fresh server answer, and
only while the availability flag is on.

**Ownership is `cloud_entitlements`**, registry-shaped, written only by
`cloud-stripe-webhook` and the `tdg_admin_*` verbs — which is why the
Developer console grew a `cloud` panel, the Purchases filter a `cloud` source
and the overview a tile with **no code written for them**. That panel is now
mounted inside **TDG Core & Cloud** rather than in the Apps fold — Cloud belongs
to the account rather than to one app — but it is the same generic Store panel,
with the same pack pickers, the same revocation switch and the same reset. The
lift is one filter in `AccountDetail`; nothing about the discovery changed.

**Enforcement is in Postgres** (rule 12), **bytes are in Backblaze B2**.
`tdg_cloud_begin_upload` is still the only door — availability, plan, quota,
retention and revocation are all decided there — but the bytes it authorises
live in the private B2 bucket, reachable only through the `cloud-storage`
Edge Function, which forwards the caller's own JWT into those gates and then
hands out S3-presigned URLs scoped to one object and a short expiry. Client
and B2 talk directly in both directions (no Supabase egress), the catalogue
is written only after the function has HEADed the landed object itself, and
delete means gone: every version destroyed, not hidden. This folder only
ever *shows* those answers.

## The states, because every one has a face

Coming Soon is a real state with real copy, not an absence — a disabled CTA
that says why, on the shelf and in the fold. So are: checking, could-not-read
(never rendered as "no plan"), held with its standing sentence, quota high /
critical / full, egress past the fair-use allowance, read-only retention with
its deadline and the resubscribe promise, purge-eligible, and revoked with the
developer's own reason. The wording for the warnings lives in
`CloudFold.tsx`'s `warningFace`, one place.

## What launches, and what launching takes

Everything in this folder is already the launched behaviour behind the flag.
The launch itself is the checklist in `supabase/README.md` (§ TDG Cloud):
activate the four Stripe payment links, then flip `availability.available`
in the console's Cloud tab. No file here changes on launch day.
