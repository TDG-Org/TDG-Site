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
| `functions/cloud-stripe-webhook/index.ts` | Stripe → TDG Cloud plan ownership: writes `cloud_entitlements.grants` from checkout and subscription events, stamps the billing cadence into the grant, and maps live price ids to packs so a portal plan change between Standard and Studio moves the grant. Deployed with `--no-verify-jwt`; the refetch is the authentication, exactly like the veditor and devfleet webhooks it is a sibling of. |
| `functions/cloud-storage/index.ts` | The ONE door between TDG Cloud clients and the Backblaze B2 bucket. Forwards the caller's own JWT into the Postgres gates (`begin_upload`/`begin_download`), then answers S3-presigned URLs — single PUT or multipart — so bytes move client↔B2 directly; verifies each landed object with its own HEAD before booking it; refuses to book more than the reservation promised; deletes every version (gone, not hidden). Credential from Vault via `tdg_cloud_b2_credentials()`. Deployed `--no-verify-jwt` (it does its own auth and answers CORS). |
| `functions/cloud-b2-install/index.ts` | One-shot installer that moved the B2 application key from the machine that held it into Vault over one TLS hop (nonce-armed, retired immediately, exactly the `cloud-provision` pattern). Redeploy with a fresh nonce to rotate the credential. |
| `functions/cloud-maintenance/index.ts` | The deliberate arm of Cloud retention: the lapsed-accounts report, expired-reservation reaping, and — double-gated on the caller being a developer AND `availability.auto_purge` in config — the purge, which destroys every B2 object version under the account's prefix and settles the books in one verb. Dry-run by default. |
| `functions/cloud-provision/index.ts` | The one-run tool that created TDG Cloud's Stripe objects — two products, four prices, four **deactivated** Managed Payments payment links, the webhook endpoint — and wrote every id and URL into `tdg_cloud_config`. The deployed copy is a retired stub; redeploy this source with a fresh nonce in `PROVISION_KEY` to reprice, then retire it again. |
| `functions/tdg-store-verify/index.ts` | Answers whether Stripe still agrees with what the Store advertises: every app-tagged payment link's real amount, cadence and active state; the Cloud config held against Stripe in both directions (a configured link must exist, sell exactly the configured cents, and be active if and only if Cloud is on sale); and the three app webhook endpoints' health. `npm run verify:store` reads the catalogue out of `store.ts` and POSTs it for per-link verdicts. Deployed `--no-verify-jwt` for the `tdg-site-deploys` reason: no identity in, nothing non-public out — the Stripe key stays in the environment and only its conclusions leave. |
| `migrations/` | SQL already applied to the shared project. The trigger that keeps every TDG account signed in without an email round trip. The `tdg_admin_*` family behind the site's Developer console (`src/dev/`), the feedback tables, the account badges, product revocations, the product reset and account notices, `tdg_billing_subscription`, and the site-content overlay below. |

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

## Taking a product away, and saying so

`20260828235900_product_revocations_and_notices.sql` adds two tables that answer
two questions the console could decide and had nowhere to record.

### `tdg_product_revocations` — may they have this at all?

**A revocation is not "switch the pack off", and the difference is the whole
reason it has a table.** Switching a pack off says *this account does not have
this right now*, and the shop's next move is to offer to sell it again — right
for a refund, a lapse or a mistake, and exactly wrong for an account that must
not have the product and must not buy it back. Done with the switch alone, the
block lasts until somebody presses Buy.

One row per `(account, app, pack)`, with `pack = '*'` meaning the whole app —
a value you can see in a row rather than an absence you have to know how to
read. It carries the reason, which is written **for the person it is about**:
they read it on their own Store card, and their app reads it too.

**It remembers exactly what it took.** Revoking has to actually remove the
access — a block that left `owned_packs` intact would be a notice, not a
revocation, because every TDG app gates on that column. But removing the grant
outright would make the decision one-way: restoring would have to invent a
grant, and an invented grant is a purchase this project never received. So
`held_before` carries the exact grant (or, for an app with no `grants` column,
the exact pack ids) that came off, and lifting writes back precisely that —
`since` included, which is the day the account first got the pack and must not
move for a developer any more than it moves for a renewal. Measured on a
round trip: revoke then restore leaves the row identical, and no block behind.

`tdg_my_revocations()` is what an account and its apps read; the table also has
a plain owner-only `select` policy for an app that would rather read it
directly. There is no client write policy in either direction —
`tdg_admin_set_revocation` is the whole write surface, and it opens with
`tdg_admin_uid()` like every other privileged verb.

**Removing the entitlement is enough to stop an app unlocking the feature. It is
not enough to explain anything**, and an app that simply finds a pack missing
offers to sell it — the one sentence a revoked account must never be shown. The
site's Store draws the state today
([`src/store/`](../src/store/README.md)); the brief each other app's own session
needs is [`docs/revocation-app-prompt.md`](../docs/revocation-app-prompt.md).

### `tdg_admin_reset_product` — forget that we touched this

`20260830140000_reset_a_product_to_what_was_paid_for.sql`. The console can
already set a pack to Not Owned, and that is a DECISION. What it could not say
was *forget I touched this* — and that is the one wanted most often, because
this console's whole purpose is trying states out on real accounts. A reset
removes what only this console explains and leaves everything else exactly as it
was; what is left is what the money says.

**Two signals decide what Stripe is responsible for**, and both already existed:
a `subscriptionId` on the grant (only a webhook writes one — `tdg_admin_set_pack_grant`
refuses to invent one, because that id is the only handle the Store's Cancel
button has), and a row in `<app>_purchase_events` whose `stripe_event_id` is not
an `admin:<uuid>` one. Either claim keeps the grant. **The function only ever
removes**, so a purchase Stripe has already taken back stays taken back.

**Blocks come off first and hand back what they took**, then one filter decides
the lot. Filtering first would read a row with the interesting part missing —
`held_before` is where a block keeps the grant it lifted — so a revoked real
purchase would silently stay gone and a revoked hand grant would vanish
uncounted. In that order both halves fall out: a revoked real purchase comes
back, a revoked hand grant does not.

It **refuses for an app with no ledger** (`22023`, in a sentence): there would be
no record of what Stripe granted, so a reset there could only guess, and a guess
about money is what this whole family of functions exists not to make. It also
refuses a per-pack reset under a whole-app block, the same refusal
`tdg_admin_set_revocation` makes and for the same reason. Every pack it takes
back gets an `<app>.admin.reset` ledger row so Purchases shows the reset beside
the grants it undid, and one audit line names the counts.

### `tdg_admin_cloud_account` — one account's Cloud, for the console

Same migration. `tdg_cloud_status()` takes the uuid from the caller's own token
and never from a parameter, which is exactly what makes it safe to grant to
every authenticated account — and exactly why it cannot answer about somebody
else. So the console has its own verb, opening with `tdg_admin_uid()` like every
other admin read, answering the same shape minus the warnings: those are
sentences written for the account holder, and a developer reads the numbers.

### `tdg_notices` — and does anybody tell them?

One message to one account about what it owns, written by the developer who made
the change, from the tick box beside Save. The words are the point: *"we ended
your Pro Export Pack because the payment was reversed"* is not derivable from a
status column, which is why `tdg_admin_notify` takes them rather than composing
them, and why it is its own verb instead of a flag on every entitlement function
— a signature that never grows means adding the box to another panel is a client
edit and not a migration.

Delivery is the shape `tdg_feedback_replies` already has and no bigger: it waits
until the person's own app calls `tdg_my_notices()`, and `tdg_notice_ack()` is
pressed by them, so **"sent" and "seen" stay different facts**. There is no
outbound mail on this project and the entitlement path is the last place to add
a dependency that fails silently at somebody else's SMTP server. The site's half
is [`src/notices/`](../src/notices/README.md).

Every notice also writes an audit line, so *"did anybody tell them?"* is answered
in the same place as *"who changed it?"*.

### And one column on `tdg_admin_accounts`

`revocations jsonb`, every block on the account whatever app it names — including
an app the registry has never heard of, because **a block the console cannot see
is a block nobody can lift**. Changing a `returns table` needs a drop and a
recreate, and `DevAccount` in `src/dev/api.ts` is hand-written to match it column
for column: there is no generated types package here to catch a drift, so the two
move in the same sitting.

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

**`devfleet_badges` was the fourth, and it went on 2026-08-28** — its own
migration, `20260828170000_devfleet_badges_onto_tdg_badges.sql`, once the
DevFleet repo was open beside it. It could not ride along with the three above
because DevFleet read that table directly AND `devfleet_badge_sync` declared
`returns devfleet_badges`, so the table's row type was in a function signature:
dropping it needed the app's own edit landing in the same breath, or a `cascade`
that took the writer with it silently.

Every row moved with its `epoch`, its `earned` dates and its `created_at`
untouched — a re-stamped epoch re-opens the window the epoch exists to close, and
a re-stamped `earned` date is a badge quietly re-awarded. **`commits`, the one
column `tdg_badges` does not name, became `measurements.commits`**, which is the
only slot that keeps the property it was built to have: `contributions` is
replaced per machine and then summed across machines, so it would both lower the
figure on a machine with fewer repositories checked out and count the same
commits twice across two machines; `measurements` is merged by `tdg_measure_max`,
an element-wise `greatest()`, and is never summed. **No forwarder was left
behind**, because unlike the Bible Educator case there was no deployed build to
keep working: DevFleet is a desktop app with no auto-update, so the only copies
in the wild are ones somebody installed by hand, and the one account with badges
was rebuilt in the same work block.

## Looking somebody up, and reading their page

`20260828230000_tdg_people_and_profiles.sql` is what turned a friends list into
a social system. The site's half is [`src/people/`](../src/people/README.md) and
the search box in [`src/account/`](../src/account/README.md); there is no edge
function here either.

Before it, the only door onto somebody else's account was `tdg_find_profile`:
one exact handle, one row. That is enough to send a friend request to a person
whose spelling you already know, and it is not enough to look anybody up, browse
the project, or read what you found.

| Verb | What it answers |
| --- | --- |
| `tdg_profile(uuid)` | One account's whole page in one round trip: identity, the standing, **every** `tdg_can_view` answer, and the counters, badges, apps and streaks those answers allow. |
| `tdg_profile_at(text)` | The same, resolved from a handle — which is what a link carries and a person types. |
| `tdg_search_profiles(text,int)` | The directory. |
| `tdg_standing(uuid)` | Internal. `self` / `blocked` / `blocked_by` / `friend` / `they_asked` / `you_asked` / `none`. |
| `tdg_set_favorite(uuid,bool)` | Star ONE friend. |

**The visibility flags are returned as well as applied**, and that is the point
of the shape. A column that is null could be null because there is nothing there
or because you may not see it, and those are different sentences about a person
— "no badges yet" and "they keep their badges to themselves". The page never has
to guess, so it never guesses unkindly.

**The one deliberate loosening is the block, and its bounds are exact.**
`tdg_find_profile` answers nothing at all for an account that has blocked you:
the handle reads as free, the page reads as absent, and there was no way to tell
*no such person* from *that person blocked you*. So `tdg_profile_at` resolves
whoever holds the handle and `tdg_profile` always returns the row, and the
standing says `blocked_by` out loud. **What is on the page did not loosen by one
column** — every content key still goes through `tdg_can_view`, which still
refuses everything to somebody who has been blocked, so a blocked reader gets an
identity, a sentence, and nothing else. The directory is one step tighter still:
somebody who blocked you is reachable by exact handle and by link, and does not
surface while you browse, because a block that turned up in a list of
suggestions would be a block doing the opposite of its job.

**Moderation is not a block and does not soften.** `tdg_is_findable` gates every
one of these, so an account hidden or deleted by a developer answers exactly
what a handle nobody holds answers, which is nothing.

**The same file repairs three reads that were quietly wrong**, all with their
signatures byte-for-byte unchanged so the `bea_*` forwarders keep compiling:

- `tdg_my_friends` returned `favorite` **false** and `sort_order` **null** for
  every row, hardcoded, while `tdg_set_favorites` and `tdg_set_friend_order`
  went on writing the two columns those values come from. A star you press, that
  saves, and that is gone when you come back — dead in every app reading this
  for as long as the columns have existed, with nothing on any screen saying so.
  It was proved on the live project rather than reasoned about: `@luke` had
  three favourites stored and three rows answering `false`.
- `tdg_incoming_requests` and `tdg_outgoing_requests` gated `bio` on
  `profiles.public_profile` — the two-state MIRROR of the `profile` key, and
  never the answer to "may this person read your bio". It leaked a `bio: self`
  bio to anybody you had asked, and withheld a `bio: public` one from anybody
  whose profile is friends-only.
- `tdg_my_friends` showed a friend's bio with no check at all.

All three ask `tdg_can_view` now, which is the one question they were always
meant to ask.

## Signing up with Google leaves two of the three fields blank

A TDG account needs an **email, a password and a username**. The Sign up form
collects all three and `handle_new_user` reads the last two out of
`raw_user_meta_data` as the `auth.users` row is written. **Google sends
neither.** Measured on this project, not argued: the one Google-only account
here carries `iss sub name email picture full_name avatar_url provider_id
email_verified phone_verified` and no `username`, so its profile row was written
with a null username and `encrypted_password` was never set.

What that costs is not cosmetic. The account prints as `@(no username yet)`
wherever a profile is read, has **no profile page at all** — a TDG page is
addressed by its handle — and **cannot log in anywhere but the two apps that
draw a Google button.** Bible Educator ships `PUBLIC_SUPABASE_OAUTH` empty and
draws no social row; Music Everything, DevFleet and Makullveny have no OAuth
path at all. Every one of them offers username-or-email plus a password to an
account that has neither.

| Verb | What it answers |
| --- | --- |
| `tdg_account_setup()` | What the CALLER still needs: `needs_username`, `needs_password`, and the provider's own name as a suggestion. One row, or none when signed out. |
| `tdg_claim_username(text)` | Puts a username on the caller's account. `PT422` shape, `PT409` taken, `PT429` cooldown — the trigger's own sentence, with its date. |

**Why the answer is here and not in each app.** `auth.users.encrypted_password`
is readable by no client, and `user.identities` answers a different question —
which providers are linked, never whether a password grant would work. Five apps
share this project and any of them can be the window an OAuth account comes back
through, so the database answers once, for all of them.

**The missing fields are asked for, never invented.** A username derived from an
email address publishes half of somebody's address as a public handle, and
Google's `name` is their real name. So the name is offered to a form as a
prefilled, editable box and written by nothing else, and there is no suggested
username at all.

`tdg_claim_username` exists because the check-then-write every app was doing has
a race in it that is invisible when it is lost: at sign-up `handle_new_user`
does not fail on a taken name, it drops it and creates the account anyway, on
purpose, so a lost race cannot fail an account creation. The unique index
decides here instead. Both verbs are `authenticated` only; `anon` gets 42501.

The site's end is `AccountSetup` in `src/auth/AuthProvider.tsx` and the third
mode of `src/components/AuthModal.tsx`.

## TDG Cloud, built and dormant

`20260830120000_tdg_cloud.sql` (and the hardening file beside it) is the whole
Cloud brain: registry-shaped `cloud_entitlements` (which is what grew the
Developer console's cloud panel with no code), the `cloud_purchase_events`
ledger, the one-row `tdg_cloud_config` every surface reads, the
reservation-gated upload path (`tdg_cloud_begin_upload` is the only door),
usage accounting and file catalogue, metered downloads, per-app sync state,
derived read-only retention, and the admin config/metrics/retention verbs.

**The bytes live in Backblaze B2** (`20260831090000_tdg_cloud_b2.sql` is the
move): the private bucket `TDG-Cloud-Backblaze` (us-west-004, keep-only-last-
version lifecycle, CORS for presigned browser transfers), spoken to ONLY by
the `cloud-storage` Edge Function, whose credential sits in Supabase Vault
behind the service-only `tdg_cloud_b2_store`/`tdg_cloud_b2_credentials` pair
(installed by the one-shot `cloud-b2-install`, retired after its run; rotate
by re-running it). Postgres still decides every yes and no — the function
forwards the caller's own JWT into the gates, hands out per-object presigned
URLs, HEADs each landed object before booking it, and destroys every version
on delete (a plain S3 delete on B2 only hides). Client↔B2 is direct both
ways, so hosted bytes never count as Supabase egress. At $0.006/GB-month
with a free egress band, every plan now clears MORE than a dollar of profit
per month even at 100% quota utilization — the floor the second 2026-08-31
reprice (Standard 250 GB · $2.99/$31.99, Studio 2 TB · $19.99/$219.99) was
chosen by, with Studio's per-GB edge over Standard held to ~18% instead of
the 39% steal it briefly was. The old `tdg-cloud` Storage
bucket's policies and triggers are dropped (the platform kept the empty
bucket row; it is inert). The site's half is
[`src/cloud/`](../src/cloud/README.md); the brief for each app's own session
is [`docs/cloud-app-prompt.md`](../docs/cloud-app-prompt.md).

**Why it is dormant, and what dormant means.** `availability.available` in
`tdg_cloud_config` is false: the Store shows the plans as Coming Soon with no
payment links (the public config nulls them while unavailable), no ordinary
account can reserve an upload (`TDGC1`), and the four Stripe payment links are
DEACTIVATED besides — two independent locks. `dev_testing: true` lets
developer accounts drive the entire path today, which is how it was verified.

**The launch checklist**, in order, on the day the economics say go:

1. Stripe dashboard → Payment Links → activate the four links tagged
   `app=cloud` (`Cloud Standard`/`Cloud Studio` × monthly/annual).
2. `#/dev` → Cloud tab → check the plans and prices still say what you mean →
   flip **Available** on, tick the launch confirmation, Save. The Store sells
   within a minute; the apps' `tdg_cloud_status()` flips with it.
3. Optional, later: add the two Cloud products to the Stripe billing portal
   configuration so Change Plan offers the in-portal switcher (it falls back
   to the plain portal until then); enable `pg_cron` + `pg_net` or a schedule
   to call `cloud-maintenance` (`reap` weekly; `purge` only after flipping
   `auto_purge` on, when you are ready for retention to have teeth).

Nothing in any repo changes on launch day. That is the point.

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
