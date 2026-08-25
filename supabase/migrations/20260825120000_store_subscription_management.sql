-- ═══════════════════════════════════════════════════════════════════════════
--  public.tdg_billing_subscription: which Stripe subscription is behind one
--  pack, on one account — the one read `tdg-site-billing` makes.
--  Applied 2026-08-25 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHY THIS EXISTS
--  The Store can now change or cancel a subscription. Doing either needs two
--  facts that live on the account's own entitlements row: the Stripe CUSTOMER
--  the account belongs to, and the Stripe SUBSCRIPTION behind the pack in
--  question. Both are already written there by that app's own Stripe webhook.
--
--  The Edge Function could read them itself — the service key can read any
--  table. It deliberately does not, and the reason is the table NAME. It is
--  `<app>_entitlements`, so a function reading it has to build the name from
--  a string the browser sent, and a table name built from user input is the
--  one shape of query that cannot be parameterised. Doing it here means the
--  browser's `app` never becomes part of any SQL text at all: it is matched
--  against `tdg_store_apps()`, which DISCOVERS the real tables, and a value
--  matching none of them raises instead of resolving.
--
--  So this is the same rule §12 of AGENTS.md states for every other privileged
--  verb on this project: the boundary is in Postgres, and only in Postgres.
--
--  WHY IT IS A READ AND NOTHING ELSE
--  It cannot grant, revoke, cancel or extend anything. `<app>_entitlements` is
--  written by exactly one thing — that app's own Stripe webhook, from Stripe's
--  own events — and a second writer would be a second opinion about what
--  somebody has paid for. The Store's cancel button changes the SUBSCRIPTION
--  at Stripe; the webhook then writes what Stripe says, and the card reads it
--  back through `useOwnedPacks`. Nothing in this file is on that path.
--
--  WHO MAY CALL IT
--  `service_role` and nothing else. It answers a question about one account's
--  billing from an id the caller supplies, which is exactly the shape a client
--  may never have. `tdg-site-billing` resolves that id from the caller's own
--  access token through `/auth/v1/user` before it gets here, so a browser can
--  only ever ask about itself.

begin;

-- ── 1 · the resolver ───────────────────────────────────────────────────────
--  Returns exactly one row, always, even for an account with no entitlements
--  row at all: the caller needs to tell "no Stripe customer" apart from "no
--  such app", and a function that returns nothing for both makes them the same
--  answer. `has_grants` is reported so the caller can say "this app does not
--  record subscriptions" rather than "you are not subscribed" — DevFleet's
--  table has no `grants` column today, and telling somebody they are not
--  subscribed to something that cannot be subscribed to is a different, worse
--  sentence than telling them there is nothing to manage.
create or replace function public.tdg_billing_subscription(
  p_app text, p_user uuid, p_pack text
)
returns table (
  stripe_customer_id   text,
  subscription_id      text,
  kind                 text,
  status               text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean,
  has_grants           boolean
)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_app    text := lower(btrim(coalesce(p_app, '')));
  v_pack   text := btrim(coalesce(p_pack, ''));
  v_table  text;
  v_grants jsonb := '{}'::jsonb;
  v_entry  jsonb;
begin
  if p_user is null or v_app = '' or v_pack = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  -- The ONLY place `v_app` is allowed to become a table name, and it can only
  -- become one that this query found for itself.
  select a.entitlements_table, a.has_grants
    into v_table, has_grants
    from public.tdg_store_apps() a
   where a.app_id = v_app;

  if v_table is null then
    raise exception 'tdg: no such app' using errcode = '02000';
  end if;

  if has_grants then
    execute format(
      'select e.stripe_customer_id, e.grants from public.%I e where e.user_id = $1',
      v_table
    ) into stripe_customer_id, v_grants using p_user;
  else
    execute format(
      'select e.stripe_customer_id from public.%I e where e.user_id = $1',
      v_table
    ) into stripe_customer_id using p_user;
  end if;

  cancel_at_period_end := false;
  v_entry := coalesce(v_grants, '{}'::jsonb) -> v_pack;

  if v_entry is not null and jsonb_typeof(v_entry) = 'object' then
    kind                 := nullif(v_entry ->> 'kind', '');
    status               := nullif(v_entry ->> 'status', '');
    subscription_id      := nullif(v_entry ->> 'subscriptionId', '');
    current_period_end   := nullif(v_entry ->> 'currentPeriodEnd', '')::timestamptz;
    cancel_at_period_end := coalesce((v_entry ->> 'cancelAtPeriodEnd')::boolean, false);
  end if;

  return next;
end;
$$;

-- ── 2 · who may ask ────────────────────────────────────────────────────────
--  Revoked from every client role explicitly rather than relying on the
--  default: a `security definer` function left executable by `authenticated`
--  would let any signed-in browser read any account's Stripe customer id by
--  typing a different uuid, which is the whole reason the id is resolved from
--  a token one layer up.
revoke all on function public.tdg_billing_subscription(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.tdg_billing_subscription(text, uuid, text)
  to service_role;

commit;
