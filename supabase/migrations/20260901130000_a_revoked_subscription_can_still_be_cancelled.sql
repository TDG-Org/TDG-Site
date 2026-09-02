-- ═══════════════════════════════════════════════════════════════════════════
--  A revoked subscription can still be cancelled
--
--  Revoking a pack (20260828235900) moves its grant out of
--  `<app>_entitlements.grants` and into `tdg_product_revocations.held_before`,
--  so that lifting the block gives back exactly what it took. Two readers only
--  ever looked at the live grants, and between them they left a person paying
--  for a thing they could not use, with no button anywhere to stop it:
--
--  1. `tdg_billing_subscription` — the one read behind Manage or Cancel Plan —
--     answered "no subscription" for a revoked pack, because the grant was no
--     longer on the row it read. The Stripe subscription behind that grant was
--     untouched and went on charging every period. A block is ours to put on;
--     the bill is not ours to keep sending.
--  2. `tdg_my_revocations()` told the account what was blocked and why, but not
--     that a subscription was still renewing under it, so the Store's revoked
--     card had nothing to draw a Cancel entrance from.
--
--  Now the billing read falls back to the held grant — the pack's own
--  revocation row first, then the whole-app row — and the revocation read
--  carries `held_grants`: the grants the block took, which the account could
--  read on its own entitlements row before the block and may read here after
--  it (RLS on the table is already "your own rows and nothing else").
--
--  Nothing here changes what is held, what is revoked, or what is in force:
--  `<app>_packs_in_force` still reads the live row, so a revoked pack stays out
--  of reach. This only lets the person stop paying for it. Proven in a
--  rolled-back block before it was applied: a revocation holding an active
--  veditor subscription answers its `subscriptionId` from the billing read and
--  its grant from the revocation read; without the rows, both answer nothing.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · the billing read looks under the block ─────────────────────────────
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

  -- Not on the live row: is it under a block? A revocation carries the grant
  -- it took, and a subscription taken off the row is still a subscription at
  -- Stripe. The pack's own row wins over a whole-app row, because that is the
  -- one that took exactly this pack.
  if v_entry is null or jsonb_typeof(v_entry) <> 'object' then
    select r.held_before -> 'grants' -> v_pack
      into v_entry
      from public.tdg_product_revocations r
     where r.user_id = p_user
       and r.app = v_app
       and r.pack in (v_pack, '*')
       and jsonb_typeof(r.held_before -> 'grants' -> v_pack) = 'object'
     order by (r.pack = v_pack) desc
     limit 1;
  end if;

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

revoke all on function public.tdg_billing_subscription(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.tdg_billing_subscription(text, uuid, text)
  to service_role;

-- ── 2 · the account's own read says what the block is holding ──────────────
--  A new column, so the function is dropped and made again rather than
--  replaced: Postgres will not change a table-returning function's shape in
--  place. Same body otherwise, same grants — yours and nothing else.
drop function if exists public.tdg_my_revocations();

create function public.tdg_my_revocations()
returns table (
  app         text,
  pack        text,
  reason      text,
  created_at  timestamptz,
  --  The grants the block took, keyed by pack: `{}` when it took nothing (an
  --  app the registry does not know, or a pack that was never held). The Store
  --  reads it for one purpose — a subscription still renewing under a pack
  --  the person can no longer use gets the one button that stops it.
  held_grants jsonb
)
language sql
stable
set search_path to 'public'
as $$
  select r.app, r.pack, r.reason, r.created_at,
         coalesce(r.held_before -> 'grants', '{}'::jsonb)
    from public.tdg_product_revocations r
   where r.user_id = auth.uid()
   order by r.app, r.pack
$$;

revoke all on function public.tdg_my_revocations() from public, anon;
grant execute on function public.tdg_my_revocations() to authenticated;

commit;
