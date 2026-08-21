# `supabase/migrations/` — SQL that has already been applied

Every file here has been run against the shared `tdg-core` project
(`ddbksawvchsauiuiwvrl`). They are kept because the alternative — schema that
exists only inside a dashboard — is a database nobody can rebuild, and a change
nobody can read the reasoning for six months later.

| File | What it added |
| --- | --- |
| `20260821090000_tdg_core_admin_console.sql` | The `tdg_admin_*` family: the server half of the site's Developer console (`src/dev/`). Reads that fold one account's standing across all four TDG apps into one row, and narrow write verbs for permissions, subscriptions, entitlements and moderation — each one guarded by `bea_is_admin()` and each one writing its own audit row. |

## Rules

- **A file here has been applied.** Never edit one to change the database; write
  a new file. Editing is only for fixing a comment, or for correcting the file
  to match a hotfix that was applied straight to the project — and if you do
  that, say so in the file.
- **Bible Educator owns its own migrations**, in its own repo, against this same
  project. Two repos, one database: check both before assuming a function does
  not exist.
- **`bea_is_admin()` is shared and must never fork.** It is the single answer to
  "is this person a developer" for every TDG app. New admin functions call it;
  they do not re-implement it.
- **Grants go to `authenticated`, never `anon`.** A signed-out caller has no
  admin row to check, so reaching these could only ever produce a refusal and a
  probe endpoint.

## Applying one

There is no `supabase link` on this repo. These were applied through the
Supabase MCP `apply_migration`, which wraps the statement in a transaction and
records it in the project's migration history. The dashboard SQL editor works
too. Either way, re-read `pg_get_functiondef` afterwards and check the file here
still matches what is actually running.
