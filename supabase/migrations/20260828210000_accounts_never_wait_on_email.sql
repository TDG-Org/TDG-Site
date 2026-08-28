-- 20260828210000_accounts_never_wait_on_email.sql
-- Applied 2026-08-28 to tdg-core (ddbksawvchsauiuiwvrl).
--
-- ─────────────────────────────────────────────────────────────────────────
-- A TDG account is never blocked on email verification.
-- ─────────────────────────────────────────────────────────────────────────
--
-- The policy, in one sentence: signing up creates an account you are already
-- signed in to, and signing in never asks you to go and find a link first.
-- It holds for every TDG app, because every TDG app is one account on this
-- one project — TDG-Site, Bible Educator, TDG Veditor, DevFleet, Makullveny.
--
-- ## What was actually stopping it
--
-- GoTrue's own `mailer_autoconfirm`, a project setting, is `false`. With it
-- off, a sign-up inserts the row with `email_confirmed_at` NULL, mails a
-- confirmation link, and answers the browser with a user and **no session**;
-- the password grant then answers `email_not_confirmed` until the link is
-- clicked. Read the setting yourself — it is public and needs no secret:
--
--     curl -H "apikey: <publishable key>" \
--       https://ddbksawvchsauiuiwvrl.supabase.co/auth/v1/settings
--
-- That setting is a dashboard switch. It is not in this database, no SQL can
-- move it, and nothing in any TDG repo can either — which is why the policy is
-- written here instead. This file makes it true without the switch, and keeps
-- it true if somebody flips that switch back a year from now not knowing what
-- it was for.
--
-- ## What this does
--
-- A `BEFORE INSERT` trigger on `auth.users` stamps `email_confirmed_at` on
-- every account at the moment it is created, so the row is confirmed before
-- GoTrue has finished writing it.
--
-- `confirmed_at` is NOT written and must never be: it is a GENERATED column,
-- `LEAST(email_confirmed_at, phone_confirmed_at)`, so it follows on its own.
--
-- ## Measured, not reasoned about
--
-- The expectation while writing this was that GoTrue decides from its config
-- alone, so a stamped row would still get a pointless confirmation email and
-- still be answered with no session. **That is not what it does**, and the
-- difference is the whole value of the file, so it was driven rather than
-- argued: one throwaway account created through the real `/auth/v1/signup` on
-- this project, then deleted.
--
--   * the sign-up answered with an `access_token` — a real session, so the
--     browser is signed in the moment the account exists;
--   * `confirmation_token` came back empty and `confirmation_sent_at` NULL —
--     **no confirmation email was sent at all**, because by the time GoTrue
--     looks at the row it has come back confirmed;
--   * `/auth/v1/token?grant_type=password` answered with a session;
--   * so did `tdg-site-account` with a USERNAME, which is the path this site's
--     login actually takes.
--
-- So this alone is both halves of the ask, for every app, with no client
-- change required. Turning the dashboard switch off as well is still tidier —
-- it makes the intent readable from the dashboard instead of only from a
-- trigger — but nothing depends on it any more.
--
-- ## INSERT only, deliberately
--
-- Changing the email on an existing account is a different flow and keeps its
-- confirmation. That one is not "prove you own the address you just typed
-- before we let you in" — it is "prove you own the address before we move an
-- existing account onto it", and an account that can be moved onto an address
-- nobody owns is a way to take an account over. The ask was about creating an
-- account and signing in. This is that, and only that.
--
-- ## It cannot fail a sign-up
--
-- The body is wrapped in `exception when others then return new`, the same
-- shape `handle_new_user` uses on this same table and for the same reason:
-- this runs inside every account creation on five products, and a trigger that
-- raises is five products that cannot make accounts. The worst case here is
-- that it does nothing and the old behaviour comes back — which the site's own
-- `signUp` is written to survive; see `src/auth/AuthProvider.tsx`.

create or replace function public.tdg_confirm_email_on_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Only an account with an address, and only one nothing has confirmed yet.
  -- If the dashboard switch is ever turned off, GoTrue sets this itself and
  -- this arm stops being reached, which is the point: the file becomes a
  -- no-op rather than a second opinion.
  if new.email is not null and new.email_confirmed_at is null then
    new.email_confirmed_at := coalesce(new.created_at, now());
  end if;
  return new;
exception when others then
  -- Never fail an account creation. See the header.
  return new;
end;
$$;

-- `postgres=X/postgres`, matching `handle_new_user` on this table. A trigger
-- fires regardless of EXECUTE on the function, so nothing needs the grant, and
-- a SECURITY DEFINER function callable by every signed-in client is a surface
-- with nothing on the other side of it.
revoke all on function public.tdg_confirm_email_on_signup() from public;

drop trigger if exists on_auth_user_confirm_email on auth.users;
create trigger on_auth_user_confirm_email
  before insert on auth.users
  for each row execute function public.tdg_confirm_email_on_signup();

-- Anybody already stranded. Zero rows when this file was written — all seven
-- accounts on the project were confirmed — and it is here for the person who
-- runs this file against a project where that is not true.
update auth.users
   set email_confirmed_at = coalesce(created_at, now())
 where email_confirmed_at is null
   and email is not null;
