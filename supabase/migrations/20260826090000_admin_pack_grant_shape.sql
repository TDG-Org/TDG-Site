-- ═══════════════════════════════════════════════════════════════════════════
--  public.tdg_admin_set_pack_grant: grant a pack the way it is actually HELD,
--  not just on or off.
--  Applied 2026-08-26 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT WAS MISSING
--  `tdg_admin_set_pack` writes `owned_packs` and nothing else. The BEFORE
--  trigger on an app that records grants reads that as a "legacy write" — a
--  writer that said nothing about grants — and promotes each bare pack id to a
--  PERPETUAL grant, which is the historically true reading of a bare id and the
--  right default for it.
--
--  The consequence is that every pack a developer has ever granted is perpetual.
--  There has been no way to put an account into any of the states a real
--  subscription passes through, so the whole subscription surface of the Store
--  — renewing on a date, cancelled and running out, in a trial, behind on a
--  payment, lapsed — was unreachable by anybody without a live Stripe
--  subscription, and there is not one yet: both apps are pre-release and every
--  `stripe_customer_id` on the project is null.
--
--  A state nobody can reach is a state nobody has looked at, and this one is on
--  the money path.
--
--  WHAT THIS IS NOT
--  It is not a second opinion about what somebody has paid for. Stripe's
--  webhook remains the only thing that writes a grant from a PAYMENT; this
--  writes one from a developer, deliberately, with their name on it in
--  `tdg_moderation_audit` and a row in the app's own purchase ledger — exactly
--  as `tdg_admin_set_pack` already does for a plain grant. The console is not a
--  back door; it is a door with a log on it.
--
--  IT NEVER INVENTS A STRIPE SUBSCRIPTION ID
--  `subscriptionId` is carried over from whatever was already on the grant and
--  is never written by this function. That matters in both directions: a
--  developer nudging a period end on a REAL subscriber must not detach their
--  row from Stripe, and a hand-made subscription must not look like one the
--  Store could cancel — `tdg-site-billing` acts on that id alone, so a fake one
--  would be a Cancel button that reached into a live Stripe account looking for
--  something that was never there.
--
--  WHY THE APP MUST ACTUALLY HAVE A `grants` COLUMN
--  It refuses an app whose entitlements table has none, rather than quietly
--  writing a column that does not exist or falling back to a plain grant.
--  DevFleet's table has no `grants` today because DevFleet sells nothing with a
--  clock on it, and a console that silently downgraded the request would teach
--  a developer that the switch works when it does not.

begin;

create or replace function public.tdg_admin_set_pack_grant(
  p_target               uuid,
  p_app                  text,
  p_pack                 text,
  p_kind                 text,
  p_status               text        default null,
  p_period_end           timestamptz default null,
  p_cancel_at_period_end boolean     default false
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me     uuid := public.tdg_admin_uid();
  v_app    text := lower(btrim(coalesce(p_app, '')));
  v_pack   text := btrim(coalesce(p_pack, ''));
  v_kind   text := lower(btrim(coalesce(p_kind, '')));
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_reg    record;
  v_before jsonb;
  v_after  jsonb;
  v_held   jsonb;
  v_iso    text;
begin
  if p_target is null or v_pack = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if v_kind not in ('perpetual', 'subscription') then
    raise exception 'tdg: a grant is either perpetual or subscription' using errcode = '22023';
  end if;

  -- The app is MATCHED against the registry rather than trusted, the same way
  -- `tdg_admin_set_pack` matches it, so the only table name this ever builds is
  -- one the registry found for itself.
  select * into v_reg from public.tdg_store_apps() a where a.app_id = v_app;
  if not found then
    raise exception 'tdg: no app called "%" — an app is registered by having a public.<app>_entitlements table', v_app
      using errcode = '22023';
  end if;
  if not v_reg.has_grants then
    raise exception 'tdg: % records no grants — its entitlements table has no jsonb grants column, so a pack there can only be held outright', v_app
      using errcode = '22023';
  end if;

  -- Held to the app's own list when it publishes one, and to a well-formed id
  -- when it does not. Same rule as a plain grant: an app on its first day has
  -- no list, and refusing every pack until it has one is a console that cannot
  -- help with the product it was needed for first.
  if array_length(v_reg.known_packs, 1) is not null then
    if not (v_pack = any (v_reg.known_packs)) then
      raise exception 'tdg: % does not sell a pack called "%"', v_app, v_pack using errcode = '22023';
    end if;
  elsif v_pack !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
    raise exception 'tdg: a pack id is 2-48 characters, lowercase letters, numbers, - and _'
      using errcode = '22023';
  end if;

  if v_kind = 'subscription' then
    v_status := coalesce(v_status, 'active');
    if not (v_status = any (array[
      'active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused'
    ])) then
      raise exception 'tdg: unknown subscription status "%"', v_status using errcode = '22023';
    end if;
    -- Every question about a subscription is answered from this date — is it
    -- in force, when does it renew, when does it stop, how long is the grace
    -- after a failed payment. A subscription without one is a row
    -- `<app>_packs_in_force()` will refuse, which would read as a grant that
    -- silently did nothing.
    if p_period_end is null then
      raise exception 'tdg: a subscription grant needs a period end — it is the date everything else about it is decided from'
        using errcode = '22023';
    end if;
  end if;

  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  execute format('insert into public.%I (user_id) values ($1) on conflict (user_id) do nothing',
                 v_reg.entitlements_table)
    using p_target;

  execute format(
    'select coalesce(e.grants, ''{}''::jsonb) from public.%I e where e.user_id = $1 for update',
    v_reg.entitlements_table)
    into v_before using p_target;
  v_before := coalesce(v_before, '{}'::jsonb);
  v_held   := coalesce(v_before -> v_pack, '{}'::jsonb);

  -- The same ISO shape the webhooks write, so a row cannot be told apart by
  -- its formatting.
  v_iso := to_char(p_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  v_after := v_before || jsonb_build_object(v_pack, jsonb_build_object(
    'kind',   v_kind,
    'status', case when v_kind = 'subscription' then to_jsonb(v_status) else 'null'::jsonb end,
    'currentPeriodEnd',
              case when v_kind = 'subscription' then to_jsonb(v_iso) else 'null'::jsonb end,
    'cancelAtPeriodEnd',
              case when v_kind = 'subscription' then coalesce(p_cancel_at_period_end, false) else false end,
    -- Carried, never written. See the header: writing one would be a Cancel
    -- button aimed at a subscription that does not exist, and clearing one
    -- would detach a real subscriber from Stripe.
    'subscriptionId', coalesce(v_held -> 'subscriptionId', 'null'::jsonb),
    -- When the account FIRST got this pack. It does not move for a renewal and
    -- it must not move for a developer either.
    'since', coalesce(
      v_held -> 'since',
      to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    )
  ));

  -- `grants` and never `owned_packs`. The BEFORE trigger derives that from
  -- this, through `<app>_packs_in_force()`, which is the one place the question
  -- "is this in force right now" is answered — so a `canceled` grant or an
  -- expired period drops the pack out on its own and this function never has to
  -- know the rule.
  execute format('update public.%I e set grants = $1 where e.user_id = $2', v_reg.entitlements_table)
    using v_after, p_target;

  if v_after is distinct from v_before then
    if v_reg.events_table is not null then
      execute format(
        'insert into public.%I (stripe_event_id, event_type, user_id, pack) values ($1, $2, $3, $4)',
        v_reg.events_table)
        using 'admin:' || gen_random_uuid()::text,
              v_app || '.admin.grant-shape',
              p_target, v_pack;
    end if;
    perform public.tdg_admin_log(
      p_target,
      'set-pack-grant',
      v_app || ':' || v_pack || ' → ' || v_kind
        || coalesce(' / ' || v_status, '')
        || case when v_kind = 'subscription' and coalesce(p_cancel_at_period_end, false)
                then ' / ending' else '' end
        || coalesce(' until ' || v_iso, ''));
  end if;

  perform v_me;
  return v_after;
end;
$$;

-- Same door as every other `tdg_admin_*` verb: reachable by a signed-in role
-- and refused inside by `tdg_admin_uid()`, which raises `42501` for anybody who
-- is not a TDG developer. The grant is not the lock; the function body is.
revoke all on function
  public.tdg_admin_set_pack_grant(uuid, text, text, text, text, timestamptz, boolean)
from public, authenticated;

grant execute on function
  public.tdg_admin_set_pack_grant(uuid, text, text, text, text, timestamptz, boolean)
to authenticated;

commit;
