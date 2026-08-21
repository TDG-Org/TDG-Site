# `supabase/` — the part of TDG-Site that runs on the server

Not part of the site bundle. Vite never sees it and GitHub Pages never serves
it; it is Deno source that runs on Supabase, kept here because the alternative —
code that exists only on a server — is a login nobody can restore when somebody
deletes it in a dashboard.

| Path | What it is |
| --- | --- |
| `functions/tdg-site-account/index.ts` | Turns "username **or** email + password" into a session, and sends a password-reset link for either. |

## Why the site cannot do this itself

GoTrue only knows email and password. Signing in with a USERNAME needs
something to turn a handle into an address first — and that something may not be
callable by a browser, because a function that turns a public username into
somebody's email address is an email-harvesting endpoint.

`bea_login_identity` is `SECURITY DEFINER` in tdg-core and granted to
`service_role` and nothing else. This function is the only thing on this site
that reaches it, and it never returns the address it resolved: only a session,
or a refusal.

## Why it is its own endpoint

`bea-account`, `mak-account` and `veditor-account` do the same job for the other
TDG apps. Each app owns its own so that no app's login can break another's — a
shared one would be a single point of failure across four products. The
genuinely shared piece is the SQL resolver, which is app-neutral despite its
`bea_` prefix.

## Deploying

```bash
npx supabase functions deploy tdg-site-account --project-ref ddbksawvchsauiuiwvrl --no-verify-jwt --use-api
```

Three things about that command, each of which bites:

- **`--no-verify-jwt` is not optional.** Every caller is signed out by
  definition, because this *is* the sign-in path. A deploy that forgets the flag
  turns every sign-in into a 401 while the source still looks perfect.
- **`--use-api` bundles server-side.** Without it the CLI wants Docker running,
  and "deploy failed" on a machine that has no Docker is a confusing way to find
  that out.
- **Never add `--prune`.** It deletes functions that exist in the project but not
  in this folder — and this project also hosts `bea-account`, `mak-account`,
  `mak-checkout`, `mak-billing-portal`, `mak-stripe-webhook`, `veditor-account`
  and `veditor-stripe-webhook`, none of which are here. Pruning from this repo
  would take out Bible Educator's and Makullveny's logins and Makullveny's
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
digests the file, so that stamp is only as honest as whoever last edited it —
bump it by hand when you change this function, or it will confidently name a
version that is not deployed.
