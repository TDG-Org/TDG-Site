-- ═══════════════════════════════════════════════════════════════════════════
--  Protected developer accounts
--  Applied 2026-08-21 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS DOES
--  Two accounts, @luke and @nm8, keep their Developer permission for good.
--  Their profile row cannot be deleted either, because deleting the row is
--  just a slower way of taking the permission away.
--
--  Everyone else is unchanged. @tdgl is deliberately NOT on the list: leaving
--  one revocable developer account means the "can a developer be demoted at
--  all?" path stays exercised and testable.
--
--
--  WHY THE LIST IS user_id AND NOT username
--  A username is editable from this very console. tdg_admin_set_profile will
--  happily rename @luke, and a protection keyed on the handle would come off
--  with the handle. A user_id is fixed for life, which is the property this
--  needs. The handles are in the comments so the list is readable; they are
--  not what it matches on.
--
--
--  WHY A TRIGGER AND NOT JUST A CHECK INSIDE tdg_admin_set_admin
--  Today tdg_admin_set_admin is the only thing in the database that writes
--  profiles.is_admin, and `authenticated` has no column grant on is_admin, so
--  a check inside that one function would in fact hold right now.
--
--  It holds because of two facts that are true today and are not guaranteed
--  to stay true: nobody has added a second writer, and nobody has widened the
--  column grant. service_role bypasses RLS and column grants entirely, so any
--  edge function added later is one line away from being a second writer, and
--  it would not know this rule existed.
--
--  A BEFORE trigger on the table does not care which path the write came from.
--  It is the difference between "the console cannot do this" and "this cannot
--  happen", and the second one is what was asked for. The guards inside the
--  two admin functions stay as well, because a trigger's error message is a
--  worse thing to read than a sentence written for the person reading it.
--
--
--  HOW TO UNDO IT, SINCE THAT IS THE POINT OF WRITING IT DOWN
--  Change the list in tdg_protected_account and re-run that function. The
--  trigger reads the list on every write, so nothing else needs touching.
--  There is deliberately no console button and no admin function for this:
--  a protection a developer can switch off from the page it protects is not
--  a protection, it is a speed bump.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · the list ───────────────────────────────────────────────────────────
--  Hardcoded rather than a table, on purpose. A table needs a write policy or
--  an admin function to maintain it, and either one is a door onto the thing
--  this exists to make doorless. Changing who is protected should cost a
--  migration, which is a decision with a paper trail.
create or replace function public.tdg_protected_account(p_user uuid)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_user in (
    '6fd15fbe-8537-4ddb-bc2f-ff357f596e1b'::uuid,  -- @luke  (Luke)
    '05415c0f-7891-440d-befa-99b8f7ed8927'::uuid   -- @nm8   (Nate)
  );
$$;

comment on function public.tdg_protected_account(uuid) is
  'True for a TDG owner account whose Developer permission cannot be removed and whose profile cannot be deleted. Enforced by the profiles_protect_developer trigger.';


-- ── 2 · the enforcement ────────────────────────────────────────────────────
--  BEFORE UPDATE OR DELETE, so it sees every writer: the admin functions,
--  service_role from an edge function, and the SQL editor alike.
--
--  The UPDATE arm only fires when the row would come out without is_admin.
--  An ordinary profile edit carries is_admin through unchanged and never
--  trips it, so editing a protected account's bio still works exactly as it
--  did.
create or replace function public.tdg_protect_developer()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    if public.tdg_protected_account(old.user_id) then
      raise exception 'tdg: % is a protected TDG owner account and cannot be deleted',
        coalesce('@' || old.username, old.user_id::text)
        using errcode = '42501';
    end if;
    return old;
  end if;

  if public.tdg_protected_account(new.user_id) and new.is_admin is distinct from true then
    raise exception 'tdg: % is a protected TDG owner account. Its Developer permission cannot be removed.',
      coalesce('@' || new.username, '@' || old.username, new.user_id::text)
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_developer on public.profiles;
create trigger profiles_protect_developer
  before update or delete on public.profiles
  for each row execute function public.tdg_protect_developer();


-- ── 3 · the same refusal, in words, where somebody will read it ────────────
--  Unchanged from 20260821090000 except for the two new lines, and for the
--  em dash in the self-refusal becoming a full stop. Both messages surface as
--  toasts in the console, and the site's own copy no longer uses em dashes.
create or replace function public.tdg_admin_set_admin(p_target uuid, p_admin boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_me uuid := public.tdg_admin_uid();
begin
  if p_target is null or p_admin is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if p_target = v_me then
    raise exception 'tdg: you cannot change your own developer permission. Ask the other developer.'
      using errcode = '42501';
  end if;
  -- Revoking only. A protected account is already a developer, and re-granting
  -- one is a no-op rather than something worth refusing.
  if not p_admin and public.tdg_protected_account(p_target) then
    raise exception 'tdg: this is a protected TDG owner account. Its Developer permission cannot be removed.'
      using errcode = '42501';
  end if;

  update public.profiles p set is_admin = p_admin where p.user_id = p_target;
  if not found then
    raise exception 'tdg: no such account' using errcode = '02000';
  end if;

  perform public.tdg_admin_log(
    p_target,
    case when p_admin then 'grant-developer' else 'revoke-developer' end,
    null);
end;
$$;

--  Unchanged from 20260821090000 except for the one new guard. It sits before
--  the friend-list scrubbing so a refused delete does no work first, and so
--  the message names the reason rather than arriving from a trigger.
create or replace function public.tdg_admin_delete_forever(p_target uuid)
returns void
language plpgsql security definer set search_path to 'public', 'auth'
as $$
declare
  v_me   uuid := public.tdg_admin_uid();
  v_soft boolean;
  v_who  text;
begin
  if p_target is null then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;
  if p_target = v_me then
    raise exception 'tdg: you cannot delete your own developer account' using errcode = '42501';
  end if;
  if public.tdg_protected_account(p_target) then
    raise exception 'tdg: this is a protected TDG owner account and cannot be deleted.'
      using errcode = '42501';
  end if;

  select coalesce(s.deleted_by_admin, false) into v_soft
    from public.bea_profile_state s where s.user_id = p_target;
  if not coalesce(v_soft, false) then
    raise exception 'tdg: soft-delete the account first' using errcode = '42501';
  end if;

  select coalesce(p.display_name, p.username, p_target::text) into v_who
    from public.profiles p where p.user_id = p_target;

  -- Logged BEFORE the delete: the audit row's target_id is ON DELETE SET NULL,
  -- so the name written here is the only record of who this was.
  perform public.tdg_admin_log(p_target, 'delete-forever', coalesce(v_who, p_target::text));

  -- Array elements cannot carry a foreign key, so the departing account has to
  -- be scrubbed out of everyone else's lists by hand.
  update public.bea_profile_state s
     set friend_ids    = array_remove(s.friend_ids, p_target),
         blocked_ids   = array_remove(s.blocked_ids, p_target),
         requested_ids = array_remove(s.requested_ids, p_target),
         favorite_ids  = array_remove(s.favorite_ids, p_target),
         friend_order  = array_remove(s.friend_order, p_target)
   where p_target = any (s.friend_ids)    or p_target = any (s.blocked_ids)
      or p_target = any (s.requested_ids) or p_target = any (s.favorite_ids)
      or p_target = any (s.friend_order);

  -- mak_typing_records is the one child table whose FK is NO ACTION rather
  -- than CASCADE, so the delete below fails on any account with a leaderboard
  -- entry unless this goes first.
  delete from public.mak_typing_records r where r.user_id = p_target;

  delete from auth.users u where u.id = p_target;
end;
$$;


-- ── 4 · so the console can say so instead of offering a button ─────────────
--  A separate read rather than a new column on tdg_admin_accounts. That
--  function returns forty-odd columns and changing a `returns table` means
--  dropping and recreating it, which is a real risk taken for one boolean the
--  page can derive itself. The list is short, it changes about never, and the
--  console already fetches a catalog once at boot.
--
--  This is presentation only. Nothing here decides anything; section 2 does.
create or replace function public.tdg_admin_protected_accounts()
returns uuid[]
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  perform public.tdg_admin_uid();
  return array(
    select p.user_id from public.profiles p
     where public.tdg_protected_account(p.user_id)
     order by p.username
  );
end;
$$;


-- ── 5 · grants ─────────────────────────────────────────────────────────────
--  `authenticated` only, same as every other tdg_admin_* function. The guard
--  inside is the boundary; this just stops the door being rattled.
revoke all on function public.tdg_admin_protected_accounts() from public;
grant execute on function public.tdg_admin_protected_accounts() to authenticated;
