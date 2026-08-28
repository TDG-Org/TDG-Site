-- ═══════════════════════════════════════════════════════════════════════════
--  Makullveny's Candle bundle, as ONE press instead of two contradictory ones
--  Applied 2026-08-28 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  THE BUG THIS CLOSES, AND THE ROW THAT PROVES IT
--  Makullveny stores two different facts in one table and the Developer
--  console offered a control for each, with no relationship between them:
--
--    mak_subscriptions.tier                free | candle | lantern | hearth
--    mak_subscriptions.candle_purchased_at  a timestamp, or null
--
--  The console's Tier dropdown offered `candle`, and a separate switch set the
--  flag. They look like two ways to say one thing. They are not: the app's
--  `src/entitlements.js` grants every piece of Candle content — the five
--  marketplace themes, the Journal, the Scroll, the raised capacity limits —
--  on `candlePurchased || tier >= hearth`, and NEVER on `tier = 'candle'`.
--  Its own comment says why, at length: Candle is a one-time purchase and
--  ranking it inside TIER_ORDER would hand it to every Lantern subscriber
--  because lantern(2) > candle(1).
--
--  So picking `candle` in that dropdown granted the account NOTHING while
--  looking exactly like the thing that grants everything. This is not
--  hypothetical: as of writing there is one live row on this project with
--  `tier = 'candle'` and `candle_purchased_at = null` — an account somebody
--  believes they gave the bundle to, that has never had it.
--
--  WHAT `tier = 'candle'` ACTUALLY IS
--  A MIRROR of the flag, maintained by Makullveny's own Stripe webhook. A
--  Candle checkout writes `tier = higherTier(existing, 'candle')`, `status =
--  'active'` and `candle_purchased_at = now()` together, and elsewhere the
--  webhook computes `floorTier = candle_purchased_at ? 'candle' : 'free'`. The
--  flag is the authority; the tier is how the ladder reports it.
--
--  So this verb writes the pair the way the webhook writes it, in one
--  statement, and the console offers one control. `tdg_admin_set_mak_flag`
--  stays exactly as it was — it is the narrow verb, and support may one day
--  need to move the flag without touching the ladder — but nothing in the
--  console calls it for Candle any more.
--
--  WHY IT DOES NOT TOUCH THE SUPPORT BADGE
--  A real Candle checkout also stamps `support_badge_earned_at`, and this
--  deliberately does not. A hand grant is not a purchase, the badge has its own
--  control two lines away, and one press quietly moving a second switch is the
--  same hidden coupling this migration exists to remove. The console says so
--  where the press is.

begin;

create or replace function public.tdg_admin_set_mak_candle(p_target uuid, p_on boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_me uuid := public.tdg_admin_uid();
begin
  if p_target is null or p_on is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  insert into public.mak_subscriptions (user_id) values (p_target)
      on conflict (user_id) do nothing;

  if p_on then
    update public.mak_subscriptions m
       set candle_purchased_at = coalesce(m.candle_purchased_at, now()),
           --  higherTier(): a Lantern or Hearth subscriber who buys Candle
           --  keeps their rung. Anyone else is raised to the mirror.
           tier = case when m.tier in ('lantern', 'hearth') then m.tier else 'candle' end,
           --  The webhook writes 'active' beside the raise, and a row reading
           --  `candle / canceled` would be a bundle the ladder reports as over
           --  while the flag says it is owned forever.
           status = case when m.tier in ('lantern', 'hearth') then m.status else 'active' end,
           updated_at = now()
     where m.user_id = p_target;
  else
    update public.mak_subscriptions m
       set candle_purchased_at = null,
           --  Only the mirror comes down. A real subscription rung is a
           --  different axis and revoking a one-time bundle must not cancel it.
           tier = case when m.tier = 'candle' then 'free' else m.tier end,
           updated_at = now()
     where m.user_id = p_target;
  end if;

  --  Makullveny's own ledger, in the shape its admin verbs already write, so
  --  a hand grant is not told apart from one by its formatting.
  insert into public.mak_subscription_events (stripe_event_id, event_type, user_id, tier)
  values ('admin:' || gen_random_uuid()::text,
          case when p_on then 'mak.admin.set_flag' else 'mak.admin.clear_flag' end,
          p_target, 'candle_bundle');

  perform public.tdg_admin_log(
    p_target,
    case when p_on then 'grant-mak-candle' else 'revoke-mak-candle' end,
    'candle bundle and the tier mirror');
  perform v_me;
end;
$fn$;

revoke all on function public.tdg_admin_set_mak_candle(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.tdg_admin_set_mak_candle(uuid, boolean) to authenticated;

commit;
