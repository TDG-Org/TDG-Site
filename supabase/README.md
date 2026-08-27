# `supabase/` · the part of TDG-Site that runs on the server

Not part of the site bundle. Vite never sees it and GitHub Pages never serves
it; it is Deno source that runs on Supabase, kept here because the alternative,
code that exists only on a server, is a login nobody can restore when somebody
deletes it in a dashboard.

| Path | What it is |
| --- | --- |
| `functions/tdg-site-account/index.ts` | Turns "username **or** email + password" into a session, and sends a password-reset link for either. |
| `functions/tdg-site-billing/index.ts` | Changes or stops a subscription bought from the Store. |
| `migrations/` | SQL already applied to the shared project. The `tdg_admin_*` family behind the site's Developer console (`src/dev/`), the feedback tables, the account badges, and `tdg_billing_subscription`. |

## Why the site cannot do this itself

GoTrue only knows email and password. Signing in with a USERNAME needs
something to turn a handle into an address first, and that something may not be
callable by a browser, because a function that turns a public username into
somebody's email address is an email-harvesting endpoint.

`bea_login_identity` is `SECURITY DEFINER` in tdg-core and granted to
`service_role` and nothing else. This function is the only thing on this site
that reaches it, and it never returns the address it resolved: only a session,
or a refusal.

## Why it is its own endpoint

`bea-account`, `mak-account` and `veditor-account` do the same job for the other
TDG apps. Each app owns its own so that no app's login can break another's. A
shared one would be a single point of failure across four products. The
genuinely shared piece is the SQL resolver, which is app-neutral despite its
`bea_` prefix.

## `tdg-site-billing`, and why the browser cannot do any of it

Changing a plan or stopping one needs the Stripe secret key, and a page served
from GitHub Pages may never hold one. So the browser sends an app id, a pack id
and its own access token, and gets back either a short-lived
`https://billing.stripe.com/...` URL or a yes.

**The client names nothing.** No customer id, no subscription id, no account id
— and none would be honoured if it sent one, because no field of the request
body is ever passed to Stripe. The account is resolved from the token through
`/auth/v1/user`, and the Stripe ids come from that account's own
`<app>_entitlements` row.

**The app's table is resolved in SQL, not in the function.** Ownership lives in
`<app>_entitlements`, one table per app, so reading it means building a table
name out of a string the browser sent — the one shape of query that cannot be
parameterised. `tdg_billing_subscription` matches that string against
`tdg_store_apps()`, which discovers the real tables, and raises on anything
else. It is `service_role`-only and it is a READ: it cannot grant, revoke,
cancel or extend anything.

**Cancelling is `cancel_at_period_end` and never "cancel now."** Stripe leaves
the subscription active until the period ends and `<app>_packs_in_force()` keeps
the pack in force while that is true, so every day already paid for keeps
working — in the app as well as on the site. It is done with one API call rather
than through Stripe's own cancel flow deliberately: that flow's behaviour is a
**dashboard setting**, and a setting flipped to "immediately" would take days off
somebody's purchase silently, with nothing in this repo changed and nothing to
notice it.

**The function writes nothing.** `<app>_entitlements` has exactly one writer,
that app's own Stripe webhook, and a second one would be a second opinion about
what somebody has paid for.

### What it needs from Stripe, and how you find out it is missing

The key is `TDG_APPS_STRIPE_SECRET_KEY` — the account every TDG app sells on,
the same one `veditor-stripe-webhook` reads, and that file's header explains the
naming at length. It is a **restricted** key, and this function needs two
permissions the webhook does not:

| Verb | Stripe permission |
| --- | --- |
| Change Plan · Payment & Receipts | **Billing Portal — write** |
| Cancel Subscription · Resume Subscription | **Subscriptions — write** |

A key without one answers `more_permissions_required`, which this function tells
apart from every other refusal on purpose: it logs it at ERROR level naming the
missing permission, and answers `billing_unavailable`, so the card says *our*
setup would not allow it and nothing on the account changed — rather than
telling somebody to try their card again for a problem that is ours. The plan
picker additionally wants the portal configuration to have the
`subscription_update` flow enabled; when it does not, the function falls back to
the plain portal, which reaches the same controls one click further in.

## Account badges, and the one number the footer prints

`20260826120000_tdg_account_badges.sql` adds a **global** mark on a TDG
account — Bug Hunter, Playtester, Supporter, Early Access, plus Developer and
Subscriber — true in every TDG app at once. The site's half is
[`src/badges/`](../src/badges/README.md); there is no edge function, because
nothing here needs a secret.

**It is not `tdg_badges`.** That name was already taken by per-app achievement
state, written by `tdg_badge_sync()` from inside an app, and it has live rows.
These are `tdg_account_badges`, and the two are unrelated.

**Two of the six are never stored.** Developer *is* `profiles.is_admin` and
Subscriber *is* a paid `subscriptions.tier`. Each already has exactly one
authority, and a row repeating it would be a second opinion that goes stale the
moment the flag flips. So the catalogue marks them `derived`, every read
computes them, and `tdg_admin_badge_set` refuses one **with a sentence** rather
than silently doing nothing.

**The catalogue is `tdg_badge_catalog()`, in SQL.** Same reason
`tdg_feedback_kinds()` is: the server validates against exactly the list the
console offered. A new badge is a migration, and no TypeScript changes.

**The table has no policies.** RLS on, every client grant revoked, the four
verbs are the whole surface — `tdg_my_badges` (the caller's own, and it takes
no user id on purpose), `tdg_public_stats`, `tdg_admin_badges` and
`tdg_admin_badge_set`, the last two opening with `tdg_admin_uid()` and every
change they make landing in `bea_moderation_audit`.

**`tdg_public_stats()` is the one function on this project granted to `anon`**,
against the standing rule in `migrations/README.md`, and the exception is
deliberate: it carries no identity and no refusal, and the footer is on every
page including the ones nobody has signed in to read. It answers two integers —
how many accounts, how many badges awarded — and there is nothing else in the
shape to ask for. `accounts` counts `public.profiles`, which is the same count
`tdg_admin_overview()` calls `accounts`, so the footer and the console cannot
disagree. **The site prints it exactly as it comes back**: never rounded, never
padded, and never replaced by a fallback when the read fails.

## Deploying

```bash
npx supabase functions deploy tdg-site-account --project-ref ddbksawvchsauiuiwvrl --no-verify-jwt --use-api
```

```bash
npx supabase functions deploy tdg-site-billing --project-ref ddbksawvchsauiuiwvrl --use-api
```

Three things about that command, each of which bites:

- **`--no-verify-jwt` is not optional for `tdg-site-account`.** Every caller is
  signed out by definition, because this *is* the sign-in path. A deploy that
  forgets the flag turns every sign-in into a 401 while the source still looks
  perfect. **`tdg-site-billing` is the opposite** and must keep `verify_jwt` ON:
  every caller there is signed in by definition. That check is not the
  authentication though — a project's publishable key is also a valid JWT — so
  the function resolves the real user through `/auth/v1/user` regardless.
- **`--use-api` bundles server-side.** Without it the CLI wants Docker running,
  and "deploy failed" on a machine that has no Docker is a confusing way to find
  that out.
- **Never add `--prune`.** It deletes functions that exist in the project but not
  in this folder, and this project also hosts `bea-account`, `mak-account`,
  `mak-checkout`, `mak-billing-portal`, `mak-stripe-webhook`, `veditor-account`
  `veditor-stripe-webhook`, `veditor-provision-prices`, `devfleet-account`,
  `devfleet-stripe-webhook` and `music-account`, none of which are here. Pruning
  from this repo would take out Bible Educator's, DevFleet's, Music Everything's
  and Makullveny's logins, both apps' purchase webhooks, and Makullveny's
  billing.

The function reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_ANON_KEY` from the project's own environment. Supabase provides all
three; **none of them belongs in this repo.**

## Is the copy here the code that is running?

```bash
curl -s -X POST https://ddbksawvchsauiuiwvrl.supabase.co/functions/v1/tdg-site-account \
  -H "Content-Type: application/json" -d '{"action":"version"}'
```

It answers `SOURCE_STAMP`. Unlike the Veditor's copy there is no script that
digests the file, so that stamp is only as honest as whoever last edited it.
Bump it by hand when you change this function, or it will confidently name a
version that is not deployed.

`tdg-site-billing` answers the same `{"action":"version"}`, before it needs an
identity — but its gateway wants a JWT, so send the publishable key as both
`apikey` and `Authorization: Bearer`. Anything past `version` still answers 401
with it, which is the `/auth/v1/user` resolve doing its job and is worth
checking after a deploy.
