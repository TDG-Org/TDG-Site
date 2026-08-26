-- ═══════════════════════════════════════════════════════════════════════════
--  public.tdg_admin_set_pack: write the authoritative grants column when an
--  app has one, so its on/off switch changes what the app itself reads.
--  Applied 2026-08-26 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  THE FAILURE
--  `20260823120000_dynamic_app_registry.sql` made this verb work for every
--  `<app>_entitlements` table by writing `owned_packs`. That is authoritative
--  for a one-time-only table such as DevFleet's. It is only a LEGACY MIRROR in
--  TDG Veditor: the app reads `grants`, and `veditor_sync_owned_packs()` derives
--  `owned_packs` whenever `grants` changes.
--
--  So after a developer put TDG Veditor's Theme Pack into the impossible
--  subscription state Ended, checking its tile added `themes` to
--  `owned_packs` but left the ended grant untouched. The Developer page looked
--  checked; the app correctly kept the Theme Pack locked. Revoking a live
--  grant had the inverse failure: the mirror changed and the authoritative
--  grant remained in force.
--
--  THE BOUNDARY
--  `tdg_store_apps().has_grants` already records which shape an app uses. For
--  those apps, ON is a perpetual admin grant and OFF removes the grant. The
--  app's own trigger derives the mirror. Apps without `grants` keep the exact
--  old `owned_packs` path, so DevFleet and future one-time-only tables do not
--  need a column they have no use for.
--
--  The checkbox is intentionally simpler than `tdg_admin_set_pack_grant`:
--  it grants or revokes access. Subscription simulation is a separate control
--  and is offered only for a pack the shop actually sells on a recurring plan.

begin;

create or replace function public.tdg_admin_set_pack(
  p_target uuid, p_app text, p_pack text, p_owned boolean
)
returns text[]
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me            uuid   := public.tdg_admin_uid();
  v_app           text   := lower(btrim(coalesce(p_app, '')));
  v_pack          text   := btrim(coalesce(p_pack, ''));
  v_reg           record;
  v_before        text[];
  v_after         text[];
  v_grants_before jsonb;
  v_grants_after  jsonb;
  v_held          jsonb;
begin
  if p_target is null or p_owned is null or v_pack = '' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  select * into v_reg from public.tdg_store_apps() a where a.app_id = v_app;
  if not found then
    raise exception 'tdg: no app called "%" — an app is registered by having a public.<app>_entitlements table', v_app
      using errcode = '22023';
  end if;

  -- Granting is held to the app's own list where it publishes one. Revoking
  -- never is, so a retired or stray pack can always be taken back.
  if p_owned then
    if array_length(v_reg.known_packs, 1) is not null then
      if not (v_pack = any (v_reg.known_packs)) then
        raise exception 'tdg: % does not sell a pack called "%"', v_app, v_pack
          using errcode = '22023';
      end if;
    elsif v_pack !~ '^[a-z0-9][a-z0-9_-]{1,47}$' then
      raise exception 'tdg: a pack id is 2-48 characters, lowercase letters, numbers, - and _'
        using errcode = '22023';
    end if;
  end if;

  if not exists (select 1 from public.profiles p where p.user_id = p_target) then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  execute format('insert into public.%I (user_id) values ($1) on conflict (user_id) do nothing',
                 v_reg.entitlements_table)
    using p_target;

  -- Lock the row once and read both shapes. `owned_packs` is kept for the
  -- before/after result and audit decision even when `grants` owns the write.
  execute format(
    'select coalesce(e.owned_packs, ''{}''::text[]), %s from public.%I e where e.user_id = $1 for update',
    case when v_reg.has_grants
      then 'coalesce(e.grants, ''{}''::jsonb)'
      else '''{}''::jsonb'
    end,
    v_reg.entitlements_table)
    into v_before, v_grants_before using p_target;
  v_before        := coalesce(v_before, '{}'::text[]);
  v_grants_before := coalesce(v_grants_before, '{}'::jsonb);

  if v_reg.has_grants then
    v_held := coalesce(v_grants_before -> v_pack, '{}'::jsonb);

    if p_owned then
      -- A checkbox grant is bought-outright in shape: no subscription clock,
      -- status or Stripe handle. Keep the original `since` when there is one,
      -- because repairing an ended grant must not rewrite its history.
      v_grants_after := v_grants_before || jsonb_build_object(
        v_pack,
        jsonb_build_object(
          'kind', 'perpetual',
          'status', null,
          'currentPeriodEnd', null,
          'cancelAtPeriodEnd', false,
          'subscriptionId', null,
          'since', coalesce(
            v_held -> 'since',
            to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
          )
        )
      );
    else
      v_grants_after := v_grants_before - v_pack;
    end if;

    -- This is the authoritative write. TDG Veditor's BEFORE trigger derives
    -- `owned_packs`; any future grants-aware app owns the same invariant.
    execute format('update public.%I e set grants = $1 where e.user_id = $2',
                   v_reg.entitlements_table)
      using v_grants_after, p_target;

    execute format(
      'select coalesce(e.owned_packs, ''{}''::text[]) from public.%I e where e.user_id = $1',
      v_reg.entitlements_table)
      into v_after using p_target;
  else
    -- One-time-only tables have no richer source. Preserve the old path byte
    -- for byte: this is still the authoritative column for them.
    if p_owned then
      v_after := case when v_pack = any (v_before) then v_before else v_before || v_pack end;
    else
      v_after := array_remove(v_before, v_pack);
    end if;
    v_after := (select coalesce(array_agg(x order by x), '{}'::text[]) from unnest(v_after) as x);

    execute format('update public.%I e set owned_packs = $1, updated_at = now() where e.user_id = $2',
                   v_reg.entitlements_table)
      using v_after, p_target;
    v_grants_after := v_grants_before;
  end if;

  v_after := coalesce(v_after, '{}'::text[]);

  if v_after is distinct from v_before
     or v_grants_after is distinct from v_grants_before then
    if v_reg.events_table is not null then
      execute format(
        'insert into public.%I (stripe_event_id, event_type, user_id, pack) values ($1, $2, $3, $4)',
        v_reg.events_table)
        using 'admin:' || gen_random_uuid()::text,
              v_app || (case when p_owned then '.admin.grant' else '.admin.revoke' end),
              p_target, v_pack;
    end if;
    perform public.tdg_admin_log(
      p_target,
      case when p_owned then 'grant-pack' else 'revoke-pack' end,
      v_app || ':' || v_pack);
  end if;

  perform v_me;
  return v_after;
end;
$$;

revoke all on function public.tdg_admin_set_pack(uuid, text, text, boolean)
from public, authenticated;

grant execute on function public.tdg_admin_set_pack(uuid, text, text, boolean)
to authenticated;

commit;
