# `supabase/` · the part of TDG-Site that runs on the server

Not part of the site bundle. Vite never sees it and GitHub Pages never serves
it; it is Deno source that runs on Supabase, kept here because the alternative,
code that exists only on a server, is a login nobody can restore when somebody
deletes it in a dashboard.

| Path | What it is |
| --- | --- |
| `functions/tdg-site-account/index.ts` | Turns "username **or** email + password" into a session, and sends a password-reset link for either. |
| `functions/tdg-site-billing/index.ts` | Changes or stops a subscription bought from the Store. |
| `functions/tdg-site-deploys/index.ts` | Answers which TDG-Org GitHub Pages sites exist — `live`, `down` or `absent`, in one batched response — for `src/live/`'s deploy discovery. Probed here rather than in the browser because every browser-side miss is a 404 printed in the console, and answered three ways rather than two because of `tdg_site_deploys_seen`: the function remembers every site it has seen answering, which is how a site that was taken DOWN gets `Temporarily unavailable` instead of being un-announced as `Coming soon`. Deployed with `--no-verify-jwt`: the caller is an anonymous visitor and the answer is whether a public website exists. A caller sends repo names only — never a URL — and the function probes only `https://tdg-org.github.io/`. |
| `migrations/` | SQL already applied to the shared project. The `tdg_admin_*` family behind the site's Developer console (`src/dev/`), the feedback tables, the account badges, `tdg_billing_subscription`, and the site-content overlay below. |

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


## The site's own words, editable without a deploy

`20260828120000_site_content_overrides.sql` adds `tdg_site_content`: one jsonb
row holding what the Developer console's **Content** tab has changed about our
own product cards — the order of them, whether each is shown, its words, its
icon, its cover, its access button, and every section of its own page. The
site's half is [`src/content/`](../src/content/README.md).

**It is an overlay, never the source.** `src/data/` in the site repo is still
where a product's words are written, and it is still what a visitor sees when
the row says nothing, when the read fails, and when this whole table is empty.
That is the only reason a marketing page is allowed to depend on a database at
all: the failure mode is the built-in site, exactly.

**Why a document and not a schema.** What is being stored is the shape of
`AppCard`, `ToolCard` and `AppPage` in TypeScript — nested arrays of sections,
each holding blocks of seven different kinds. Tables would put that shape in two
places, in two languages, and every new block type would be a migration before
it could be a paragraph. The site validates what it reads and drops what it
cannot understand, so a document written by a newer console than the bundle
reading it degrades to the built-in copy rather than to a blank card.

**Why the read is granted to `anon`.** It is the second exception to
`migrations/README.md`'s standing rule, and that file now argues both. The short
version: no parameter, no `auth.uid()`, no refusal to probe with, and what comes
back is the text of a public page every visitor is about to be shown.

**Why every publish keeps the one it replaced.** Nothing else this console
changes is invisible to the person it affects — an account's owner can see their
own tier. This changes what every visitor reads, and a paragraph deleted by a
mis-click has no other copy. So a BEFORE UPDATE trigger writes the outgoing
version to `tdg_site_content_history` and trims it to fifty. A trigger rather
than a line inside the write verb, because a second writer added later cannot
forget a trigger.

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

## Who may see what, and the three tables that stopped being their own

`20260828090000_tdg_privacy_and_table_merges.sql` adds **`tdg_privacy`**: one
row per account, one jsonb of control → audience, and one function
(`tdg_can_view`) that every read on this project asks rather than re-deriving
the rule. The site's half is [`src/account/`](../src/account/README.md); there
is no edge function, because nothing here needs a secret.

**The point of it is the middle value.** A boolean answers *everyone or
nobody*, so the one thing people actually want to say — *my friends, and not
the internet* — had nowhere to live. Every control now takes `public`,
`friends` or `self`, and `tdg_privacy_catalog()` is the list of which controls
exist, exactly the way `tdg_badge_catalog()` and `tdg_feedback_kinds()` already
work: a new control is a migration and no TypeScript, in any TDG app.

**`profiles.public_profile` and `public_friend_list` are still there, as
mirrors.** Four deployed apps read them and two write them, and none of those
builds could be changed by a migration. They carry the two-state projection —
true exactly when the audience is `public`, so a friends-only profile reads
false, which is the conservative answer and the right one. `tdg_set_privacy`
writes both; a legacy write straight at the column is forwarded back by
`tdg_profiles_forward_privacy`. **That trigger has one subtlety and it is
load-bearing:** a write of `false` over an audience that is already narrower
than public leaves it alone. Without it every Bible Educator profile save —
which sends `public_profile` alongside the display name whether or not anybody
touched it — would quietly downgrade "friends only" to "only me".

Three tables merged in the same migration, and each for its own reason:

| Was | Is | Why |
| --- | --- | --- |
| `bea_public_stats` | `tdg_privacy` + `tdg_badges.published` | Two unrelated things wearing one row. Who may see your account is an account fact; the published badge snapshot is per (account, app), which `tdg_badges` already held. |
| `bea_streaks` | `tdg_streaks`, keyed `(user_id, app)` | A streak is a run of days an ACCOUNT kept. The same move `tdg_badges` made over `devfleet_badges`, so a second app wanting one needs no migration. |
| `mak_typing_rate_limit` | `tdg_rate_limits`, keyed `(user_id, bucket)` | Nothing about counting submissions is typing-shaped. Server-side only: no client named it then and none may now. |

**`bea_public_stats_for` is kept**, as a forwarder answering its exact old shape
from the new sources — so a browser still running the Bible Educator build from
before the merge draws a public profile page correctly. It joins
`bea_find_profile` and `bea_is_visible`, which have been forwarders since the
`bea_*` → `tdg_*` move.

**`devfleet_badges` was deliberately NOT merged**, though `tdg_badges`
supersedes it and says so in its own comment: DevFleet reads that table
directly and returns its row type out of `devfleet_badge_sync`, and that repo
was not open. Retiring it is its own job, done with DevFleet in front of you.

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
