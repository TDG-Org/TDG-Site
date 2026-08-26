# `supabase/migrations/` · SQL that has already been applied

Every file here has been run against the shared `tdg-core` project
(`ddbksawvchsauiuiwvrl`). **A file that is written but not yet applied says so
in the table below AND in its own header, in those words, until somebody runs
it** — an unapplied file is the one thing this folder cannot be trusted about at
a glance, and there is no way to tell by looking. They are kept because the
alternative, schema that exists only inside a dashboard, is a database nobody
can rebuild, and a change nobody can read the reasoning for six months later.

| File | What it added |
| --- | --- |
| `20260821090000_tdg_core_admin_console.sql` | The `tdg_admin_*` family: the server half of the site's Developer console (`src/dev/`). Reads that fold one account's standing across all four TDG apps into one row, and narrow write verbs for permissions, subscriptions, entitlements and moderation, each one guarded by `bea_is_admin()` and each one writing its own audit row. |
| `20260821160000_subscriptions_one_row_per_account.sql` | A `UNIQUE (user_id)` on `public.subscriptions`, so one account cannot end up with two rows. Five apps read that table with `.maybeSingle()`, which throws on two rows and lands them on the free tier, so a duplicate would silently downgrade somebody who had paid. Also makes `handle_new_user` and `tdg_admin_set_core_subscription` idempotent, so the constraint cannot turn a retry into a failed signup. The file carries the audit of every writer that justified adding it. |
| `20260822015840_protected_developer_accounts.sql` | Two owner accounts, `@luke` and `@nm8`, whose Developer permission cannot be removed and whose profile row cannot be deleted. A `BEFORE UPDATE OR DELETE` trigger on `public.profiles` does the refusing, so it holds whichever path the write arrives by, including `service_role` and the SQL editor. The matching guards inside `tdg_admin_set_admin` and `tdg_admin_delete_forever` are there for the message, not the boundary. The list is keyed on `user_id`, because a username is editable from the console that the protection is protecting against. |
| `20260823120000_dynamic_app_registry.sql` | `tdg_store_apps()`, which finds every app with a pack Store by scanning for `public.<app>_entitlements`, and rewrites the five readers and the pack write to derive from it. Adding a TDG product to the Developer console is now the `create table` you had to do anyway: no `returns table` to widen, no union to extend, no `if v_app` arm to add. `tdg_admin_accounts` and `tdg_admin_overview` change shape (`store` and `store_owners` jsonb replace the four per-app columns) and so are dropped and recreated, which only `src/dev/` reads. |
| `20260823170000_user_feedback.sql` | User feedback, both directions. `tdg_feedback` + `tdg_feedback_replies` with RLS on and **no** client policies; the only doors are the verbs. Users: `tdg_feedback_submit` (validated, identity from the JWT, rate limited — the 20/day it shipped with is superseded by `20260823210000`), `tdg_feedback_inbox` (replies not yet shown), `tdg_feedback_ack` (mark one shown), `tdg_feedback_mine` (own history with the exchange). Developers: `tdg_admin_feedback` (the whole ledger with profiles joined), `_set_status`, `_reply` (which IS the delivery — the app's next `inbox()` call shows it) and `_delete`, every write audited via `tdg_admin_log`. Recreates `tdg_admin_overview` with a `feedback_new` count and adds both feedback vocabularies to `tdg_admin_catalog`. The app column is an open, shape-checked id rather than a list, for the registry's reason: a seventh app must land here without a migration. |
| `20260823210000_feedback_rate_limits.sql` | The feedback rate limit, made real and made visible. Replaces one 20/day cap with four rules per account over rolling windows — 60 seconds between reports, 5 an hour, 10 a day, and an identical resend inside 10 minutes that returns the ORIGINAL report's id and writes nothing, so a retry after a lost answer shows a receipt rather than a refusal. The numbers live once in `tdg_feedback_limits()`; `tdg_feedback_gate()` computes where an account stands and is shared by the submit gate and the new `tdg_feedback_quota()`, so the sentence a person is shown and the sentence they are refused with can never drift. `tdg_feedback_wait_words()` rounds a wait UP into words. Only `tdg_feedback_submit` and `tdg_feedback_quota` are granted; the numbers, the gate and the words are internal. |
| `20260823235000_feedback_helpers_pin_search_path.sql` | `set search_path to 'public'` on the four small feedback helpers that were missing it — `tdg_feedback_kinds`, `_statuses`, `_limits` and `_wait_words` — which Supabase's advisor flags as `function_search_path_mutable`. Not exploitable and not reachable: all four are SECURITY INVOKER, revoked from every client role, and only ever called from functions that had already pinned the path. Done because the pin is the only thing keeping that true and nothing said so, and because four exceptions in a family of fifteen teach the next reader that the exception is fine. Bodies byte-for-byte identical, verified against `prosrc` in the live project first. |
| `20260823230000_feedback_submit_serialized.sql` | One `pg_advisory_xact_lock` on the account at the top of `tdg_feedback_submit`. Every rule `20260823210000` added is read-then-decide, so two submissions in flight together each read a world where the other has not written yet: both miss the dedupe, both are told `ok` by the gate, and both insert — the double-click the 60-second cooldown was written for. With the lock the loser waits, sees the committed row, and takes the receipt path instead. A unique index would also stop the duplicate, but by raising a constraint error at a send that SUCCEEDED, which is the answer the dedupe exists to avoid. |
| `20260826120000_tdg_account_badges.sql` | Global account badges, and the one public number the site's footer prints. `tdg_account_badges` with RLS on and **no** client policies; the catalogue is `tdg_badge_catalog()` in SQL, for the same reason `tdg_feedback_kinds()` is, so a new badge is a migration and no TypeScript. Two of the six are `derived` — Developer *is* `profiles.is_admin`, Subscriber *is* a paid `subscriptions.tier` — computed on every read rather than stored, because a stored copy is a second opinion that goes stale the moment the flag flips; `tdg_admin_badge_set` refuses one with its own sentence rather than silently doing nothing. Verbs: `tdg_my_badges` (the caller's own, taking no user id on purpose — one that took one would be a profile-scraping endpoint), `tdg_public_stats` (two integers, and **the only function on this project granted to `anon`** — no identity, no refusal, and the footer is on the pages nobody signs in to read), `tdg_admin_badges` (every catalogue row with `held`, so the console draws a full switchboard) and `tdg_admin_badge_set`, both admin verbs opening with `tdg_admin_uid()` and auditing every change through `tdg_admin_log`. `user_id` is ON DELETE CASCADE, the opposite of `tdg_feedback`: a bug report outlives its reporter because the bug is still there, and a badge is a sentence about an account. NOT to be confused with `public.tdg_badges`, which is per-app achievement state and is untouched. |


## Rules

- **A file here has been applied.** Never edit one to change the database; write
  a new file. Editing is only for fixing a comment, or for correcting the file
  to match a hotfix that was applied straight to the project. If you do that,
  say so in the file.
- **Bible Educator owns its own migrations**, in its own repo, against this same
  project. Two repos, one database: check both before assuming a function does
  not exist.
- **`bea_is_admin()` is shared and must never fork.** It is the single answer to
  "is this person a developer" for every TDG app. New admin functions call it;
  they do not re-implement it.
- **Grants go to `authenticated`, never `anon`.** A signed-out caller has no
  admin row to check, so reaching these could only ever produce a refusal and a
  probe endpoint.

  There is exactly **one** exception, `tdg_public_stats()` in
  `20260826120000_tdg_account_badges.sql`, and what makes it one is that it has
  no identity in it at all: no parameter, no `auth.uid()`, no refusal to probe
  with, and a return shape of two integers that name nobody. It is granted to
  `anon` because the site's footer is on every page, including all the ones
  nobody has signed in to read. A second exception needs to clear the same bar,
  which is a high one — the moment a function can answer differently about
  different people, it belongs behind `authenticated`.

## Applying one

There is no `supabase link` on this repo. These were applied through the
Supabase MCP `apply_migration`, which wraps the statement in a transaction and
records it in the project's migration history. The dashboard SQL editor works
too. Either way, re-read `pg_get_functiondef` afterwards and check the file here
still matches what is actually running.
