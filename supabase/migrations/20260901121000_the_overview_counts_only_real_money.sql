-- ═══════════════════════════════════════════════════════════════════════════
--  The overview counts only real money
--
--  `tdg_admin_overview().gross_cents` summed `tdg_purchase_events.amount_cents`
--  over the whole ledger, and the ledger keeps Stripe test-mode events beside
--  the real ones — tagged `#test` in `event_type` by every webhook that writes
--  them, so the Purchases tab can print them as TEST and count them "in no
--  total" (src/dev/README.md: test money must not read like revenue). The
--  Overview's Taken tile sat directly above that line and counted them
--  anyway: one $19.99 test checkout read "Taken $19.99 · across every ledger"
--  over "$0.00 real · 1 test entry counted in no total". Two numbers on one
--  screen disagreeing about the same rows.
--
--  One `where` clause. Admin grants carry a null amount and never counted, so
--  nothing else in the sum moves. The client's tally (`eventKind` in
--  src/dev/format.ts) reads the same `#test` suffix, so the tile and the line
--  now agree by construction rather than by luck.
--
--  Verified on the live project in a rolled-back block: a fabricated `#test`
--  row worth 99999 cents left gross_cents exactly where it was.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.tdg_admin_overview()
returns table(accounts integer, developers integer, suspended integer, hidden integer,
              soft_deleted integer, unconfirmed integer, new_7d integer, new_30d integer,
              active_7d integer, core_paid integer, mak_paid integer, feedback_new integer,
              store_owners jsonb, gross_cents bigint)
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $function$
declare
  r        record;
  v_n      bigint;
  v_owners jsonb  := '{}'::jsonb;
  v_gross  bigint := 0;
begin
  perform public.tdg_admin_uid();

  for r in select * from public.tdg_store_apps() loop
    execute format(
      'select count(*) from public.%I e where coalesce(array_length(e.owned_packs, 1), 0) > 0',
      r.entitlements_table) into v_n;
    v_owners := v_owners || jsonb_build_object(r.app_id, v_n);
  end loop;

  --  Real money only. A `#test` suffix is how every webhook marks a Stripe
  --  test-mode event, and the Purchases tab's TEST kind reads the same mark.
  select coalesce(sum(e.amount_cents), 0)::bigint into v_gross
    from public.tdg_purchase_events e
   where e.event_type not like '%#test%';

  return query
  select
    (select count(*) from public.profiles)::integer,
    (select count(*) from public.profiles p where p.is_admin)::integer,
    (select count(*) from auth.users u
      where u.banned_until is not null and u.banned_until > now())::integer,
    (select count(*) from public.tdg_profile_state s
      where s.hidden_by_admin and (s.hidden_until is null or s.hidden_until > now()))::integer,
    (select count(*) from public.tdg_profile_state s where s.deleted_by_admin)::integer,
    (select count(*) from auth.users u where u.email_confirmed_at is null)::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '7 days')::integer,
    (select count(*) from public.profiles p where p.created_at > now() - interval '30 days')::integer,
    (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '7 days')::integer,
    (select count(*) from public.subscriptions s where s.tier <> 'free')::integer,
    (select count(*) from public.mak_subscriptions m
      where m.tier <> 'free' or m.candle_purchased_at is not null
         or coalesce(array_length(m.owned_themes, 1), 0) > 0)::integer,
    (select count(*) from public.tdg_feedback f where f.status = 'new')::integer,
    v_owners,
    v_gross;
end;
$function$;
