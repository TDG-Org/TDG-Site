-- ═══════════════════════════════════════════════════════════════════════════
--  Two verbs the Developer console had no way to ask for:
--    1. public.tdg_admin_reset_product — put one product on one account back
--       to what was actually PAID for, undoing everything the console did.
--    2. public.tdg_admin_cloud_account — one account's whole TDG Cloud
--       standing, so the console's Cloud half can show a plan against the
--       storage it is actually holding.
--  Applied 2026-08-30 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHY A RESET IS NOT "SWITCH EVERY PACK OFF"
--  The console can already set a pack to Not Owned, and that is a DECISION: it
--  says this account does not have this, whatever it paid. What it cannot say
--  is "forget I touched this" — and that is the one a developer wants most
--  often, because this console's whole purpose is trying states out on real
--  accounts. Three days of testing leave a row full of hand-made grants and
--  lifted-and-relaid blocks, and putting it back by hand means remembering
--  which of them was real, which nothing on the page records.
--
--  So a reset REMOVES what only this console explains and leaves everything
--  else exactly as it was. What is left is what the money says.
--
--  HOW A HAND-MADE GRANT IS TOLD FROM A REAL ONE
--  Two signals, both of which already exist and neither of which is a new
--  column to keep in step:
--
--    · `subscriptionId` on the grant. Only a Stripe webhook ever writes one —
--      `tdg_admin_set_pack_grant` refuses to invent one and carries forward
--      whatever was there, because that id is the only handle the Store's
--      Cancel button has. A grant carrying one is Stripe's, including one a
--      developer has since edited to move a period end for support.
--    · a row in `<app>_purchase_events` for that pack whose `stripe_event_id`
--      is NOT `admin:<uuid>`. Admin writes stamp themselves that way (see
--      tdg_admin_set_pack in 20260823120000); a real delivery carries Stripe's
--      own `evt_…`. So a pack Stripe has never touched on this account has
--      nothing but this console to explain it.
--
--  Anything either signal claims is kept. The reset only ever REMOVES, never
--  adds, so a purchase Stripe has already taken back stays taken back — there
--  is no shape of this that hands somebody a pack they did not pay for.
--
--  It refuses outright for an app with no ledger table. There would be no
--  record of what Stripe granted, so a "reset" there would be a guess wearing
--  the word reset, and a guess about money is the one thing this family of
--  functions exists not to make.
--
--  WHY IT LIFTS THE BLOCKS FIRST, AND FILTERS AFTERWARDS
--  A block does not merely mark a pack; it TAKES the grant off the row and
--  keeps it in `held_before`. So a reset that filtered the row first and
--  deleted the blocks second would be reading a row with the interesting part
--  missing: a real purchase somebody had revoked would silently stay gone, and
--  a hand grant a block was holding would disappear without ever being
--  counted, so the answer would say "nothing removed" about a press that
--  changed what the account owns.
--
--  So the blocks come off first and what they took goes back on the row, and
--  THEN the one filter below decides the lot. Both halves of the promise fall
--  out of that order: a revoked real purchase comes back, because it was paid
--  for; a revoked hand grant does not, because nothing but this console ever
--  explained it.
--
--  WHY THE CLOUD READ IS HERE
--  `tdg_cloud_status()` is self-only by construction: the uuid comes from the
--  token and never from a parameter, which is what makes it safe to grant to
--  every account. The console needs the same picture about SOMEBODY ELSE, so
--  it needs its own verb, opening with `tdg_admin_uid()` like every other
--  admin read. It answers the same shape, minus the warnings a person sees on
--  their own page: a developer reads the numbers and draws their own.

begin;

/* ── 1 · reset one product to what was paid for ─────────────────────────── */

create or replace function public.tdg_admin_reset_product(
  p_target uuid,
  p_app    text,
  p_pack   text default '*'
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_me      uuid    := public.tdg_admin_uid();
  v_app     text    := lower(btrim(coalesce(p_app, '')));
  v_pack    text    := coalesce(nullif(btrim(coalesce(p_pack, '')), ''), '*');
  v_whole   boolean;
  v_reg     record;
  v_paid    text[]  := '{}'::text[];
  v_grants  jsonb   := '{}'::jsonb;
  v_kept    jsonb   := '{}'::jsonb;
  v_packs   text[]  := '{}'::text[];
  v_keep    text[]  := '{}'::text[];
  v_removed text[]  := '{}'::text[];
  v_back    jsonb   := '{}'::jsonb;
  v_backs   text[]  := '{}'::text[];
  v_blocks  integer := 0;
  v_sub     text;
  r         record;
  v_one     text;
begin
  if p_target is null or v_app = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if v_pack <> '*' and v_pack !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
    raise exception 'tdg: a pack id is 2-48 characters of lowercase letters, numbers, - and _, or * for the whole app'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles pr where pr.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  v_whole := v_pack = '*';

  select * into v_reg from public.tdg_store_apps() a where a.app_id = v_app;
  if not found then
    raise exception 'tdg: no app called "%" — an app is registered by having a public.<app>_entitlements table', v_app
      using errcode = '22023';
  end if;

  --  See the header: with no ledger there is no record of what Stripe granted,
  --  and a reset that could only guess must say so rather than guess.
  if v_reg.events_table is null then
    raise exception 'tdg: % keeps no purchase ledger, so there is no record of what Stripe granted and a reset here could only guess', v_app
      using errcode = '22023';
  end if;

  --  Same refusal `tdg_admin_set_revocation` makes one level up, for the same
  --  reason: under a whole-app block the row is already empty, so a per-pack
  --  reset would do nothing and leave the block standing over it.
  if not v_whole and exists (
    select 1 from public.tdg_product_revocations t
     where t.user_id = p_target and t.app = v_app and t.pack = '*'
  ) then
    raise exception 'tdg: the whole of % is revoked for this account, so one pack cannot be reset under it — reset the whole app instead', v_app
      using errcode = '22023';
  end if;

  --  Every pack a REAL Stripe delivery has touched on this account. `left(…, 6)`
  --  rather than a `like` so nothing in this string needs escaping through
  --  format(); admin writes stamp themselves `admin:<uuid>`.
  execute format(
    'select coalesce(array_agg(distinct e.pack), ''{}''::text[]) from public.%I e '
    || 'where e.user_id = $1 and e.pack is not null and left(e.stripe_event_id, 6) <> ''admin:''',
    v_reg.events_table)
    into v_paid using p_target;
  v_paid := coalesce(v_paid, '{}'::text[]);

  execute format('insert into public.%I (user_id) values ($1) on conflict (user_id) do nothing',
                 v_reg.entitlements_table) using p_target;

  --  The blocks come off FIRST and hand back exactly what they took, so the
  --  filter below sees the whole account rather than a row with the
  --  interesting part missing. The header argues the order at length.
  for r in
    --  Wrapped in a CTE because plpgsql will not iterate a bare
    --  `delete … returning`; the delete still runs exactly once.
    with gone as (
      delete from public.tdg_product_revocations t
       where t.user_id = p_target and t.app = v_app and (v_whole or t.pack = v_pack)
      returning coalesce(t.held_before, '{}'::jsonb) as held
    )
    select g.held from gone g
  loop
    v_blocks := v_blocks + 1;
    if v_reg.has_grants and (r.held ? 'grants') then
      v_back := v_back || (r.held -> 'grants');
    elsif (not v_reg.has_grants) and (r.held ? 'packs') then
      v_backs := v_backs || (
        select coalesce(array_agg(pk), '{}'::text[])
          from jsonb_array_elements_text(r.held -> 'packs') as t(pk));
    end if;
  end loop;

  if v_reg.has_grants then
    execute format('select coalesce(e.grants, ''{}''::jsonb) from public.%I e where e.user_id = $1 for update',
                   v_reg.entitlements_table) into v_grants using p_target;
    --  Anything bought since a block went on keeps its own grant; what the
    --  block took comes back beside it. `||` and not a replace, the same way
    --  `tdg_admin_set_revocation` puts one back.
    v_grants := coalesce(v_grants, '{}'::jsonb) || v_back;

    for r in select key, value from jsonb_each(v_grants) loop
      v_sub := nullif(btrim(coalesce(r.value ->> 'subscriptionId', '')), '');
      if (not v_whole and r.key <> v_pack)   --  out of scope, left alone
         or v_sub is not null                --  Stripe's own subscription
         or r.key = any (v_paid)             --  Stripe has really paid for it
      then
        v_kept := v_kept || jsonb_build_object(r.key, r.value);
      else
        v_removed := v_removed || r.key;
      end if;
    end loop;

    --  A lifted block always writes, even when nothing was filtered out: what
    --  it handed back is on `v_grants` and not yet on the row.
    if v_blocks > 0 or v_kept is distinct from v_grants then
      --  `owned_packs` is derived from this by the app's own BEFORE trigger,
      --  through <app>_packs_in_force(). Never written here directly.
      execute format('update public.%I e set grants = $2 where e.user_id = $1',
                     v_reg.entitlements_table) using p_target, v_kept;
    end if;
  else
    execute format('select coalesce(e.owned_packs, ''{}''::text[]) from public.%I e where e.user_id = $1 for update',
                   v_reg.entitlements_table) into v_packs using p_target;
    v_packs := (
      select coalesce(array_agg(distinct x), '{}'::text[])
        from unnest(coalesce(v_packs, '{}'::text[]) || v_backs) as x);

    foreach v_one in array v_packs loop
      if (not v_whole and v_one <> v_pack) or v_one = any (v_paid) then
        v_keep := v_keep || v_one;
      else
        v_removed := v_removed || v_one;
      end if;
    end loop;

    if v_blocks > 0 or coalesce(array_length(v_removed, 1), 0) > 0 then
      v_keep := (select coalesce(array_agg(x order by x), '{}'::text[]) from unnest(v_keep) as x);
      execute format('update public.%I e set owned_packs = $2, updated_at = now() where e.user_id = $1',
                     v_reg.entitlements_table) using p_target, v_keep;
    end if;
  end if;

  --  One ledger row per pack taken back, so Purchases shows the reset beside
  --  the grants it undid rather than leaving a hole in the trail.
  foreach v_one in array v_removed loop
    execute format(
      'insert into public.%I (stripe_event_id, event_type, user_id, pack) values ($1, $2, $3, $4)',
      v_reg.events_table)
      using 'admin:' || gen_random_uuid()::text, v_app || '.admin.reset', p_target, v_one;
  end loop;

  perform public.tdg_admin_log(
    p_target, 'reset-product',
    v_app || ':' || v_pack
      || ' — ' || coalesce(array_length(v_removed, 1), 0) || ' hand grant(s) taken back, '
      || v_blocks || ' block(s) lifted');

  perform v_me;

  return jsonb_build_object(
    'app',           v_app,
    'pack',          v_pack,
    'removed',       to_jsonb(v_removed),
    --  What Stripe is on the record for, so the console can say why anything
    --  survived rather than leaving the developer to wonder.
    'paid_for',      to_jsonb(v_paid),
    'blocks_lifted', v_blocks
  );
end;
$fn$;

revoke all on function public.tdg_admin_reset_product(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.tdg_admin_reset_product(uuid, text, text)
  to authenticated;


/* ── 2 · one account's Cloud standing, for the console ──────────────────── */

--  The same picture `tdg_cloud_status()` gives a person about themselves,
--  answered about somebody else for a developer. Warnings are deliberately not
--  computed here: those are sentences written for the account holder, and a
--  console reads the numbers.
create or replace function public.tdg_admin_cloud_account(p_target uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $fn$
declare
  v_doc       jsonb   := public.tdg_cloud_config_doc();
  v_plan      record;
  v_grant     jsonb;
  v_used      bigint  := 0;
  v_files     integer := 0;
  v_reserved  bigint  := 0;
  v_per_app   jsonb   := '[]'::jsonb;
  v_egress    bigint  := 0;
  v_allow_x   numeric := coalesce((v_doc #>> '{egress,monthly_allowance_x_quota}')::numeric, 1.0);
  v_ret_days  integer := coalesce((v_doc #>> '{retention,read_only_days}')::integer, 90);
  v_deadline  timestamptz;
  v_retention jsonb;
  v_override  numeric;
begin
  perform public.tdg_admin_uid();
  if p_target is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  select * into v_plan from public.tdg_cloud_plan_of(p_target);

  select coalesce(sum(u.bytes), 0), coalesce(sum(u.files), 0),
         coalesce(jsonb_agg(jsonb_build_object('app', u.app, 'bytes', u.bytes, 'files', u.files)
                            order by u.bytes desc), '[]'::jsonb)
    into v_used, v_files, v_per_app
    from public.tdg_cloud_usage u where u.user_id = p_target;

  select coalesce(sum(r.bytes), 0) into v_reserved
    from public.tdg_cloud_reservations r
   where r.user_id = p_target and r.expires_at > now();

  select coalesce(sum(e.bytes), 0) into v_egress
    from public.tdg_cloud_egress e
   where e.user_id = p_target and e.month = date_trunc('month', now())::date;

  select e.grants -> v_plan.pack into v_grant
    from public.cloud_entitlements e where e.user_id = p_target;

  --  Derived exactly as the account's own read derives it, so the console and
  --  the person's Account page can never word one row two ways.
  if not v_plan.in_force and v_used > 0 then
    v_deadline := coalesce(v_plan.lapsed_at, now()) + make_interval(days => v_ret_days);
    v_retention := jsonb_build_object(
      'state', case when v_deadline <= now() then 'purge_eligible' else 'read_only' end,
      'lapsed_at', v_plan.lapsed_at,
      'deadline', v_deadline);
  else
    v_retention := jsonb_build_object('state', 'none');
  end if;

  v_override := (v_doc #>> array['limits', 'quota_override_gb', p_target::text])::numeric;

  return jsonb_build_object(
    'available',        coalesce((v_doc #>> '{availability,available}')::boolean, false),
    --  Whether CLOUD WORKS FOR THEM today: launched, or the developer/tester
    --  door. It is the fact that decides whether anything else here can move,
    --  so it is answered rather than left to be inferred from two flags.
    'enabled_for_them', public.tdg_cloud_enabled_for(p_target),
    'plan', case when v_plan.pack is null then null else jsonb_build_object(
      'pack',  v_plan.pack,
      'name',  v_doc #>> array['plans', v_plan.pack, 'name'],
      'grant', v_grant) end,
    'quota_bytes',      v_plan.quota_bytes,
    'quota_override_gb', v_override,
    'used_bytes',       v_used,
    'reserved_bytes',   v_reserved,
    'free_bytes',       greatest(v_plan.quota_bytes - v_used - v_reserved, 0),
    'files',            v_files,
    'per_app',          v_per_app,
    'egress',           jsonb_build_object(
      'month_bytes',     v_egress,
      'allowance_bytes', (v_plan.quota_bytes * v_allow_x)::bigint),
    'retention',        v_retention
  );
end;
$fn$;

revoke all on function public.tdg_admin_cloud_account(uuid) from public, anon, authenticated;
grant execute on function public.tdg_admin_cloud_account(uuid) to authenticated;

commit;
