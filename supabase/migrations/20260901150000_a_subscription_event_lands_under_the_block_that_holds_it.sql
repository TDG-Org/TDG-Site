-- ═══════════════════════════════════════════════════════════════════════════
--  A subscription event lands under the block that holds it
--
--  Revoking a pack (20260828235900) moves its grant out of
--  `cloud_entitlements.grants` and into `tdg_product_revocations.held_before`,
--  and lifting writes back exactly what is held. 20260901130000 taught the two
--  READERS behind Manage or Cancel Plan to look under the block. Nobody taught
--  the WRITER. `cloud-stripe-webhook` resolved a `customer.subscription.*`
--  event to its account through `cloud_user_for_subscription`, which searched
--  only the live grants, fell back to the event's own metadata, and then
--  upserted the grant straight onto the live row. So the first renewal after a
--  revocation put the pack back — onto the row `cloud_packs_in_force()` reads,
--  which is back in force inside TDG Cloud itself and not only on the Store's
--  card. Latent today, because Cloud is Coming Soon and no subscription
--  exists; and exactly the sequence the first paying-then-revoked customer
--  produces on their next renewal. Found by reading, not by driving.
--
--  Two functions, both service-role only, because the boundary is Postgres
--  (AGENTS.md rule 12) and a TypeScript comparison one hop out is not one:
--
--  1. `cloud_user_for_subscription` also searches the held copies under
--     `tdg_product_revocations` (app = 'cloud'), live row first. A revoked
--     subscription's renewal is still that account's renewal — the ledger row
--     has to say whose money it was — and an owner found here is an owner the
--     webhook no longer has to guess from the event's metadata.
--
--  2. `cloud_apply_grant` is the webhook's ONE write, replacing its PostgREST
--     upsert. For a pack under a block — its own row first, then the whole-app
--     `*` row, the order `tdg_billing_subscription` reads in — it writes
--     Stripe's latest word into that row's `held_before -> 'grants'` and
--     leaves the live row alone; a live copy still sitting under a block is
--     taken off, since a live copy is the one thing the block exists to end.
--     For an unblocked pack it does exactly what the upsert did: keeps
--     `since`, never downgrades a perpetual grant, skips a write that changes
--     nothing (the retention anchor reads `updated_at`, so an idle write moves
--     a deadline), writes `stripe_customer_id` once and reports a second
--     payer rather than overwriting the first, and takes the pack a portal
--     plan change moved away from off wherever it lives — live row or held
--     copy — so one subscription is stored under one pack in one place. The
--     checkout path goes through the same door, so a payment link used by a
--     revoked account (the links are public URLs) lands under the block too:
--     recorded, and never in force.
--
--  Why the held copy and not a refusal: the block is ours; the subscription
--  is Stripe's, and it goes on renewing until the person cancels it — which
--  the Store's revoked card lets them do since 20260901130000. Lifting the
--  block writes back what is held, so the held copy has to be the CURRENT
--  truth: the latest period end, the latest status. A snapshot from the day
--  of the block would restore an account in force until a date already past,
--  or lapsed on a plan Stripe was still charging for.
--
--  Nothing here changes what is in force: `cloud_packs_in_force` still reads
--  the live row, and the live row never gains a blocked pack. Proven on the
--  live project in a rolled-back block before this file was applied: an
--  unblocked pack behaves as before (written, renewed with `since` kept, an
--  identical event writes nothing, a second Stripe customer is reported and
--  not written, a perpetual grant is never downgraded); a renewal under a
--  pack's own block leaves the live row untouched and updates the held copy,
--  which the lift then restores with the new period end; a whole-app block
--  covers both packs, and a portal move between them moves the held copy; a
--  block that held nothing holds the checkout that arrives under it; and the
--  owner lookup finds a subscription under either kind of block.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · whose subscription is this, under a block as well ──────────────────
--  Same shape as 20260901123000, so `create or replace` will take it. Live
--  row first: a subscription id is stored in exactly one place, but if a stale
--  live copy and a held copy ever both name it, the live one is the one in
--  force and the one `cloud_apply_grant` will take off.
create or replace function public.cloud_user_for_subscription(p_subscription_id text)
returns table (user_id uuid, pack text)
language sql
stable security definer
set search_path to 'public'
as $$
  select s.user_id, s.pack
    from (
      select e.user_id, g.key as pack, 0 as place
        from public.cloud_entitlements e,
             jsonb_each(case when jsonb_typeof(e.grants) = 'object' then e.grants else '{}'::jsonb end) as g(key, value)
       where g.value ->> 'subscriptionId' = p_subscription_id
      union all
      select r.user_id, g.key, 1
        from public.tdg_product_revocations r,
             jsonb_each(case when jsonb_typeof(r.held_before -> 'grants') = 'object'
                             then r.held_before -> 'grants' else '{}'::jsonb end) as g(key, value)
       where r.app = 'cloud'
         and g.value ->> 'subscriptionId' = p_subscription_id
    ) s
   where p_subscription_id is not null
     and p_subscription_id <> ''
   order by s.place
   limit 1;
$$;
comment on function public.cloud_user_for_subscription(text) is
  'Which account (and which pack) a Stripe subscription id belongs to: from the live cloud_entitlements grants first, then from the grants a tdg_product_revocations block is holding. Service role only; cloud-stripe-webhook is the one caller.';
revoke all on function public.cloud_user_for_subscription(text) from public, anon, authenticated;
grant execute on function public.cloud_user_for_subscription(text) to service_role;

-- ── 2 · the one write ──────────────────────────────────────────────────────
--  `p_grant` is the shape one key of `cloud_entitlements.grants` holds — kind,
--  status, currentPeriodEnd, cancelAtPeriodEnd, subscriptionId, since, plan —
--  and `since` is decided here, never by the caller: the date the account
--  first got the pack does not move for a renewal.
create or replace function public.cloud_apply_grant(
  p_user        uuid,
  p_pack        text,
  p_grant       jsonb,
  p_customer    text default null,
  p_remove_pack text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pack     text := lower(btrim(coalesce(p_pack, '')));
  v_remove   text := nullif(lower(btrim(coalesce(p_remove_pack, ''))), '');
  v_customer text := nullif(btrim(coalesce(p_customer, '')), '');
  v_kind     text := p_grant ->> 'kind';
  v_before   jsonb;              -- the live grants as found
  v_grants   jsonb;              -- the live grants as they will be written
  v_known    text;               -- the Stripe customer already on the row
  v_block    text;               -- the revocation row holding this pack: v_pack, '*', or null
  v_held     jsonb;              -- that row's held_before
  v_have     jsonb;              -- the entry this pack has now, wherever it lives
  v_next     jsonb;
  v_second   boolean := false;
begin
  if p_user is null or v_pack = '' or p_grant is null or jsonb_typeof(p_grant) <> 'object' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if v_pack <> all (public.cloud_known_packs()) then
    raise exception 'tdg: % is not a Cloud pack', v_pack using errcode = '22023';
  end if;
  if v_kind is null or v_kind not in ('perpetual', 'subscription') then
    raise exception 'tdg: a grant is perpetual or a subscription' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_user) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  insert into public.cloud_entitlements (user_id) values (p_user)
  on conflict (user_id) do nothing;

  select coalesce(e.grants, '{}'::jsonb), e.stripe_customer_id
    into v_before, v_known
    from public.cloud_entitlements e
   where e.user_id = p_user
   for update;
  v_grants := v_before;

  --  The Stripe customer is written ONCE, when the row has none. An account
  --  that checks out twice under two emails is two Stripe customers, and the
  --  last payer used to overwrite the first — so Manage or Cancel Plan then
  --  opened the portal of whichever paid last. The first stays; a second is
  --  reported so the webhook can log it for a human to merge in Stripe.
  if v_customer is not null then
    if v_known is null then
      update public.cloud_entitlements e
         set stripe_customer_id = v_customer
       where e.user_id = p_user;
    elsif v_known <> v_customer then
      v_second := true;
    end if;
  end if;

  --  Is this pack under a block? Its own row first, then the whole app — the
  --  order tdg_billing_subscription reads in, because the pack's own row is
  --  the one that took exactly this pack.
  select r.pack, coalesce(r.held_before, '{}'::jsonb)
    into v_block, v_held
    from public.tdg_product_revocations r
   where r.user_id = p_user and r.app = 'cloud' and r.pack in (v_pack, '*')
   order by (r.pack = v_pack) desc
   limit 1
   for update;

  --  What this pack holds now, wherever that is. Under a block the held copy
  --  is the truth; a live copy is read only when the block holds nothing, so
  --  its `since` survives the move off the live row.
  if v_block is not null then
    v_have := v_held -> 'grants' -> v_pack;
    if jsonb_typeof(v_have) is distinct from 'object' then
      v_have := v_grants -> v_pack;
    end if;
  else
    v_have := v_grants -> v_pack;
  end if;
  if jsonb_typeof(v_have) is distinct from 'object' then
    v_have := null;
  end if;

  --  A perpetual grant already held is never downgraded: an account granted
  --  Cloud outright from the console keeps it whatever a subscription does.
  if v_have ->> 'kind' = 'perpetual' and v_kind <> 'perpetual' then
    return jsonb_build_object(
      'written', false, 'why', 'perpetual',
      'blocked', v_block is not null, 'block', v_block, 'second_customer', v_second);
  end if;

  v_next := p_grant || jsonb_build_object('since',
    coalesce(nullif(v_have ->> 'since', ''), nullif(p_grant ->> 'since', ''),
             to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));

  --  An event that changes nothing writes nothing. `cloud_entitlements.updated_at`
  --  is the retention anchor when no subscription ever lapsed (20260901123000),
  --  so a write for its own sake would move a deadline. A live copy under a
  --  block is never "unchanged": it has to come off.
  if v_have is not null and v_remove is null
     and not (v_block is not null and v_grants ? v_pack)
     and v_have ->> 'kind'             is not distinct from v_next ->> 'kind'
     and v_have ->> 'status'           is not distinct from v_next ->> 'status'
     and v_have ->> 'currentPeriodEnd' is not distinct from v_next ->> 'currentPeriodEnd'
     and v_have ->> 'subscriptionId'   is not distinct from v_next ->> 'subscriptionId'
     and v_have ->> 'plan'             is not distinct from v_next ->> 'plan'
     and coalesce((v_have ->> 'cancelAtPeriodEnd')::boolean, false)
       = coalesce((v_next ->> 'cancelAtPeriodEnd')::boolean, false)
  then
    return jsonb_build_object(
      'written', false, 'why', 'unchanged',
      'blocked', v_block is not null, 'block', v_block, 'second_customer', v_second);
  end if;

  if v_block is not null then
    --  Stripe's latest word, kept where the block keeps what it took, so the
    --  lift restores the current truth and not the day of the block.
    update public.tdg_product_revocations r
       set held_before = v_held || jsonb_build_object('grants',
             coalesce(case when jsonb_typeof(v_held -> 'grants') = 'object' then v_held -> 'grants' end,
                      '{}'::jsonb)
             || jsonb_build_object(v_pack, v_next))
     where r.user_id = p_user and r.app = 'cloud' and r.pack = v_block;
    v_grants := v_grants - v_pack;
  else
    v_grants := v_grants || jsonb_build_object(v_pack, v_next);
  end if;

  --  The pack the subscription USED to be stored under, when a portal plan
  --  change moved it: taken away in the same write, or the account holds both
  --  quotas on one payment — from the live row, and from any held copy, so a
  --  lift cannot restore a pack the subscription no longer buys. A perpetual
  --  grant under that key is not the subscription's to take.
  if v_remove is not null and v_remove <> v_pack then
    if (v_grants -> v_remove ->> 'kind') is distinct from 'perpetual' then
      v_grants := v_grants - v_remove;
    end if;
    update public.tdg_product_revocations r
       set held_before = r.held_before
             || jsonb_build_object('grants', (r.held_before -> 'grants') - v_remove)
     where r.user_id = p_user and r.app = 'cloud' and r.pack in (v_remove, '*')
       and jsonb_typeof(r.held_before -> 'grants' -> v_remove) = 'object'
       and (r.held_before -> 'grants' -> v_remove ->> 'kind') is distinct from 'perpetual';
  end if;

  --  `owned_packs` is derived from this by cloud_entitlements_sync_owned
  --  through cloud_packs_in_force(); never written here directly.
  if v_grants is distinct from v_before then
    update public.cloud_entitlements e
       set grants = v_grants
     where e.user_id = p_user;
  end if;

  return jsonb_build_object(
    'written', true, 'why', null,
    'blocked', v_block is not null, 'block', v_block, 'second_customer', v_second);
end;
$$;

comment on function public.cloud_apply_grant(uuid, text, jsonb, text, text) is
  'The one write cloud-stripe-webhook makes to cloud_entitlements.grants. A pack under a tdg_product_revocations block (its own row, else the whole-app row) is written into that row''s held_before instead of the live row, so a revoked account stays revoked through every renewal and lifting the block restores Stripe''s latest word. Keeps since, never downgrades a perpetual grant, skips an unchanged event, writes stripe_customer_id once, and takes a moved-from pack off wherever it lives. Service role only.';
revoke all on function public.cloud_apply_grant(uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.cloud_apply_grant(uuid, text, jsonb, text, text) to service_role;

commit;
