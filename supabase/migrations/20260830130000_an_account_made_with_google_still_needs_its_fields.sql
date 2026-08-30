-- 20260830130000_an_account_made_with_google_still_needs_its_fields.sql
-- Applied 2026-08-30 to tdg-core (ddbksawvchsauiuiwvrl).
--
-- ─────────────────────────────────────────────────────────────────────────
-- Signing up with Google is a sign-up, so it has to end with the same
-- account every other sign-up ends with.
-- ─────────────────────────────────────────────────────────────────────────
--
-- A TDG account needs three things: an email, a password, and a username.
-- The email/password form collects all three, and `handle_new_user` reads the
-- last two out of `raw_user_meta_data` as the `auth.users` row is written.
--
-- **Google sends neither of them**, and nothing anywhere noticed. Measured on
-- this project rather than reasoned about — the keys Google actually put on
-- the one Google-only account here, `9b9132c7`, created 2026-08-23:
--
--     iss  sub  name  email  picture  full_name  avatar_url
--     provider_id  email_verified  phone_verified
--
-- No `username`. No `display_name`. So `handle_new_user` inserted the profile
-- with **both columns null** and `encrypted_password` stayed null too, because
-- an OAuth account never had a password to encrypt. That account is real, it
-- is signed in, and it:
--
--   * prints as `@(no username yet)` in Bible Educator's developer console —
--     which is how this was found — and as a nameless row anywhere else that
--     reads a profile;
--   * has no profile page at all, because a TDG profile page is addressed by
--     its handle (`#/user/<handle>`);
--   * **cannot log in anywhere but the two apps that draw a Google button.**
--     Bible Educator ships with `PUBLIC_SUPABASE_OAUTH` empty, so it draws no
--     social row; Music Everything, DevFleet and Makullveny have no OAuth path
--     at all. Every one of them offers username-or-email + password, and this
--     account has neither a username nor a password.
--
-- The fix is not to invent the missing fields. A username derived from an
-- email address publishes half of somebody's address as a public handle, and a
-- display name taken from Google's `name` is their real name, published
-- without being asked. **The account is asked**, once, the next time it is
-- looking at a TDG app — which needs the app to be able to find out what is
-- missing, and to be able to set it. That is the two functions below.
--
-- ## Why the answer lives here and not in each app
--
-- Five apps share this one auth project and every one of them can be the
-- window an OAuth account comes back into. An app that worked out for itself
-- whether a password exists could not: `auth.users.encrypted_password` is not
-- readable by any client, and `user.identities` is the wrong question anyway
-- (it says which providers are linked, not whether a password grant would
-- work). So the database answers, once, for everybody.


-- ── 1 · what does this account still need? ─────────────────────────────────
--
-- One row for the caller, or NO ROW when nobody is signed in — an account
-- that does not exist cannot be missing anything, and a row of falses would
-- read as "signed out is fine" to a caller that forgot to check.
--
-- SECURITY DEFINER because `auth.users` is not readable by `authenticated`,
-- and `where u.id = auth.uid()` is the whole of what confines it: it answers
-- about the caller and about nobody else, so it can never become a way to ask
-- whether some OTHER account has a password.
--
-- `suggested_display_name` is a SUGGESTION and is deliberately not written
-- anywhere by this function. Google's `name` is the person's real name; it
-- belongs in a box they can see and edit before it becomes public, which is
-- what the form does with it. There is deliberately no suggested USERNAME for
-- the same reason, one step further: the only thing available to derive one
-- from is the email address, and a handle is public.
create or replace function public.tdg_account_setup()
returns table (
  needs_username        boolean,
  needs_password        boolean,
  suggested_display_name text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    nullif(btrim(coalesce(p.username, '')), '') is null,
    nullif(btrim(coalesce(u.encrypted_password, '')), '') is null,
    nullif(btrim(coalesce(
      u.raw_user_meta_data ->> 'display_name',
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      ''
    )), '')
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where u.id = auth.uid();
$$;

comment on function public.tdg_account_setup() is
  'What the signed-in account still needs before it is a whole TDG account: a '
  'username, a password, or neither. No row when signed out.';


-- ── 2 · claim the username, in one statement ──────────────────────────────
--
-- The check-then-write dance every app was doing has a race in it, and the
-- race is invisible when it is lost: `bea_username_available` says yes, a
-- second account takes the name, and the write fails with a bare 23505 that
-- each app translates for itself. Worse, at SIGN-UP `handle_new_user` does not
-- fail at all — it drops the taken name and inserts the profile anyway, on
-- purpose, so a lost race cannot fail an account creation. Somebody asks for
-- `clyde`, is told it worked, and has no username, with nothing saying why.
--
-- So the unique index decides, and this raises the sentence. `PT4xx` is
-- PostgREST's "answer with this HTTP status" convention, which is how the
-- browser gets a stable code to branch on instead of pattern-matching English.
--
-- **This is the first claim AND a rename.** It does not check which, because
-- `touch_profile_timestamps` already does: a first claim (old username null)
-- is free, and every change after it raises `PT429` with the date it comes
-- free written into the message. Repeating that rule here would be a second
-- copy of it that could disagree with the trigger, and the trigger is the one
-- that actually runs.
--
-- SECURITY DEFINER bypasses RLS on `profiles`, so `where user_id = v_me` is
-- load-bearing: it is the only thing standing between this and a rename of
-- somebody else's account. `auth.uid()` still reads the caller's JWT inside a
-- definer function, which is also what keeps the cooldown trigger honest.
create or replace function public.tdg_claim_username(uname text)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_me   uuid := auth.uid();
  -- A leading @ is how a human writes a username; nobody stores one.
  v_name text := nullif(btrim(replace(coalesce(uname, ''), '@', '')), '');
begin
  if v_me is null then
    raise exception 'tdg: sign in first — there is no account to put a username on.'
      using errcode = '28000';
  end if;

  if v_name is null then
    raise exception 'tdg: choose a username.' using errcode = 'PT422';
  end if;

  -- The same shape `bea_username_available`'s callers check for and the same
  -- one `tdg_admin_set_profile` enforces, kept as one regex rather than a
  -- sentence about a regex.
  if v_name !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'tdg: a username is 3-20 characters, letters, numbers and underscores.'
      using errcode = 'PT422';
  end if;

  update public.profiles set username = v_name where user_id = v_me;

  if not found then
    -- `handle_new_user` swallows its own failures so a signup can never fail,
    -- so an account CAN exist with no profile row. Then this is the moment to
    -- write one rather than to refuse — it is the same row that trigger would
    -- have written, one sign-in later.
    insert into public.profiles (user_id, username) values (v_me, v_name)
        on conflict (user_id) do update set username = excluded.username;
  end if;

  return v_name;
exception
  when unique_violation then
    raise exception 'tdg: that username is already taken.' using errcode = 'PT409';
end;
$$;

comment on function public.tdg_claim_username(text) is
  'Put a username on the signed-in account. PT422 bad shape, PT409 taken, '
  'PT429 inside the fortnight cooldown on a rename.';


-- ── 3 · who may call them ─────────────────────────────────────────────────
--
-- `authenticated` only. Neither is any use signed out — one answers about
-- `auth.uid()` and the other writes to it — and `anon` holding EXECUTE on a
-- definer function that touches `auth.users` is the shape of mistake that
-- `email_for_username` was dropped for.
revoke all on function public.tdg_account_setup()      from public;
revoke all on function public.tdg_claim_username(text) from public;

grant execute on function public.tdg_account_setup()      to authenticated;
grant execute on function public.tdg_claim_username(text) to authenticated;
