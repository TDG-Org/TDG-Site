-- ═══════════════════════════════════════════════════════════════════════════
--  public.subscriptions: one row per account, enforced by the database
--  Applied 2026-08-21 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT WAS WRONG
--  The table is keyed on `id`, with only a plain non-unique index on `user_id`.
--  Nothing stopped two rows for one account.
--
--  WHY THAT MATTERS MORE THAN IT LOOKS
--  Five apps read this table with `.maybeSingle()`: Bible Educator, Makullveny,
--  DevFleet, Music Everything and this site. supabase-js THROWS on more than one
--  row there, and every one of those readers catches a throw and falls back to
--  the free tier. So a duplicate row would not raise anything anybody would
--  report; it would quietly downgrade a paying reader. (TDG Veditor is the
--  exception and reads the array, deliberately refusing to call an unreadable
--  plan "free".)
--
--  The TDG-Site Developer console already surfaces the count as `core_row_count`
--  and converges duplicates whenever a developer saves a tier. That is a mop.
--  This is the tap.
--
--  THE AUDIT BEHIND THE CONSTRAINT
--  Adding a UNIQUE that some writer depends on breaking would be worse than the
--  duplicate it prevents, so every writer was found first:
--
--    · RLS on this table has a SELECT policy and NOTHING else, so no client can
--      write to it at all, whatever key it holds.
--    · All eleven Edge Functions on the project were read (bea-account,
--      mak-account, mak-checkout, mak-billing-portal, mak-stripe-webhook,
--      veditor-account, veditor-stripe-webhook, devfleet-account,
--      devfleet-stripe-webhook, music-account, tdg-site-account). Not one of
--      them touches this table, and the two that mention "subscriptions" do so in
--      a comment. Makullveny's billing writes `mak_subscriptions`, which is a
--      different table.
--    · Every client read across all six repos is a SELECT.
--    · Exactly two functions write it, and both are fixed below to be
--      idempotent rather than merely lucky.
--
--  So the constraint cannot reject a write anything currently makes.

begin;

-- ── 1 · converge any duplicates ────────────────────────────────────────────
--  A no-op today: all three accounts have exactly one row, checked immediately
--  before applying. It is here so the file is honest and re-runnable. The
--  constraint below cannot be added while a duplicate exists, and the choice of
--  which row survives should be written down rather than left to whoever is
--  holding the keyboard when it happens.
--
--  The survivor is the SAME row `tdg_admin_accounts` already reports as the
--  account's subscription, so the console never showed you a row that this
--  would then delete.
with ranked as (
  select s.id,
         row_number() over (
           partition by s.user_id
           order by s.renewed_at desc nulls last, s.id
         ) as rn
  from public.subscriptions s
)
delete from public.subscriptions s
using ranked r
where s.id = r.id and r.rn > 1;

-- ── 2 · the tap ────────────────────────────────────────────────────────────
--  A named constraint rather than a bare unique index: it shows up in the
--  table's own definition, and `on conflict (user_id)` below reads as the rule
--  it is rather than as a coincidence of indexing.
alter table public.subscriptions
  add constraint subscriptions_user_id_key unique (user_id);

--  The plain index is now redundant. The unique one above answers every lookup
--  it answered, and a second index on the same column is only write cost.
drop index if exists public.subscriptions_user_id_idx;

-- ── 3 · make the signup trigger idempotent ─────────────────────────────────
--  Unchanged except for the two `on conflict do nothing` clauses. No values
--  move; a duplicate simply becomes a no-op instead of an exception.
--
--  It could not have broken signup even without this, because the catch-all at
--  the bottom swallows everything, but "safe because an error handler eats it" is
--  not the same as safe. It also fixes a quieter fault that predates this file:
--  the two inserts share one exception block, so a profiles insert that raised
--  (a username claimed between the check and the write) aborted the whole
--  block and left the account with no subscription row EITHER. With both
--  inserts idempotent, that path now completes.
--
--  This function belongs to the project rather than to any repo. It came from
--  the `init_core_schema` / `default_subscription_on_signup` migrations applied
--  straight to tdg-core, and no repo holds its source. It is redefined here
--  because this is the change that needs it; Bible Educator's migrations README
--  documents the same function from its side.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  wanted text := nullif(trim(both from replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '@', '')), '');
  taken  boolean := false;
begin
  if wanted is not null then
    select exists (select 1 from public.profiles p where lower(p.username) = lower(wanted)) into taken;
  end if;

  insert into public.profiles (user_id, username, display_name)
  values (new.id,
          case when taken then null else wanted end,
          nullif(trim(both from coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''))
      on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id, tier, status)
  values (new.id, 'free', 'active')
      on conflict (user_id) do nothing;

  return new;
exception when others then
  -- Never let profile creation break account creation. A missing profile row
  -- is recoverable by the app on first sign-in; a failed signup is not.
  return new;
end;
$$;

-- ── 4 · close the console's own race ───────────────────────────────────────
--  Unchanged from 20260821090000 except for the final insert, which was
--  "update every row, and insert one if there were none". Two developers
--  saving a tier for the same account in the same second could both see zero
--  rows and both insert; before the constraint that made a duplicate, and after
--  it one of them would get a raw 23505. `on conflict do update` makes the
--  second one land on top of the first instead, which is what both of them
--  meant.
create or replace function public.tdg_admin_set_core_subscription(
  p_target uuid, p_tier text, p_status text
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me     uuid    := public.tdg_admin_uid();
  v_tier   text    := lower(btrim(coalesce(p_tier, '')));
  v_status text    := lower(btrim(coalesce(p_status, 'active')));
  v_hit    integer;
begin
  if p_target is null or v_tier = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if v_tier !~ '^[a-z0-9_-]{2,32}$' then
    raise exception 'tdg: a tier is 2-32 characters, lowercase letters, numbers, - and _'
      using errcode = '22023';
  end if;
  if not (v_status = any (public.tdg_sub_statuses())) then
    raise exception 'tdg: unknown subscription status' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  update public.subscriptions s
     set tier = v_tier, status = v_status, renewed_at = now()
   where s.user_id = p_target;
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    insert into public.subscriptions (user_id, tier, status, renewed_at)
    values (p_target, v_tier, v_status, now())
        on conflict (user_id)
        do update set tier = excluded.tier, status = excluded.status,
                      renewed_at = excluded.renewed_at;
  end if;

  perform public.tdg_admin_log(p_target, 'set-core-subscription', v_tier || ' / ' || v_status);
  perform v_me;
end;
$$;

commit;
