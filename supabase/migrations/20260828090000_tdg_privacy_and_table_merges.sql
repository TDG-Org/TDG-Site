-- ===========================================================================
-- tdg_privacy — one privacy authority for every TDG app, and three tables
-- that did not need to be their own.
--
-- Applied 2026-08-28.
--
-- WHY THIS EXISTS
--
-- A TDG account had its visibility written down in three unrelated places:
-- two booleans on `public.profiles` (`public_profile`, `public_friend_list`),
-- three more on `public.bea_public_stats` (`show_account_age`, `show_badges`,
-- `show_streak`), and nothing at all for anything added later. Three places
-- is not the problem by itself — the problem is that a boolean can only ever
-- answer "everyone or nobody", so there was no way to say the one thing
-- people actually want to say, which is *my friends, and not the internet*.
--
-- So: one row per account, one jsonb of key -> audience, one catalogue in SQL
-- that says which keys exist and what each may be set to, and ONE function
-- (`tdg_can_view`) that every read on this project asks. A new control is a
-- migration and no TypeScript, the same way `tdg_badge_catalog()` and
-- `tdg_feedback_kinds()` already work.
--
-- THE VOCABULARY IS THREE WORDS, NOT A BOOLEAN
--
--   public   anyone, signed in or not
--   friends  the people on your friends list
--   self     only you
--
-- `friend_requests` is the one key whose middle value means something else —
-- friends OF friends — because "only people already on your friends list may
-- ask to be your friend" is a sentence that cannot be true. The catalogue
-- carries that distinction as `kind = 'contact'` rather than this file
-- knowing it, so a second contact-shaped key needs no code change here.
--
-- `profiles.public_profile` AND `public_friend_list` STAY, AS MIRRORS
--
-- Four deployed apps read those two columns and two of them write them, and
-- none of those builds can be updated by this migration. They are therefore
-- kept, and kept TRUE, as the two-state projection of the three-state fact:
-- `public_profile` is `profile = 'public'`, and a friends-only profile reads
-- false there, which is the conservative answer and the right one — a client
-- that only understands "public or not" must not be told a friends-only
-- profile is public.
--
-- One fact, two doors. `tdg_set_privacy` writes the audience and the mirror
-- together. A legacy write straight at the column is forwarded the other way
-- by `tdg_profiles_forward_privacy`, which is careful about exactly one
-- thing: writing `false` over an audience that is ALREADY narrower than
-- public leaves it alone. Without that, every profile save Bible Educator
-- makes — which sends `public_profile` alongside the display name — would
-- quietly downgrade "friends only" to "only me". There is deliberately no
-- trigger on `tdg_privacy` itself, which is what makes the forward direction
-- terminate.
--
-- WHAT MERGED
--
--   bea_public_stats      -> tdg_privacy (the three switches)
--                         -> tdg_badges.published (the numbers it published),
--                            and the table is dropped. It was never Bible
--                            Educator's question: who may see your account is
--                            an account fact, and the badge snapshot already
--                            had a per-(account, app) home.
--   bea_streaks           -> tdg_streaks, keyed (user_id, app). A streak is a
--                            run of days an ACCOUNT kept, and Bible Educator's
--                            own notes already say so; a second app wanting
--                            one would have got `mak_streaks` beside it. Same
--                            move `tdg_badges` already made over
--                            `devfleet_badges`.
--   mak_typing_rate_limit -> tdg_rate_limits. Nothing about counting how often
--                            somebody submits is typing-shaped, and the next
--                            app to need one would have written a third table.
--                            Server-side only: no client names it, then or now.
--
-- `devfleet_badges` is NOT merged here, though `tdg_badges` supersedes it and
-- says so in its own comment. DevFleet reads that table directly and returns
-- its row type out of `devfleet_badge_sync`, and that repo is not part of
-- this change — retiring it is its own job, done with DevFleet open.
--
-- ⚠ **COMMENT-ONLY EDIT, 2026-08-28, after this file was applied.** That job
-- was done the same day, so the paragraph above is history rather than a
-- standing statement and a reader arriving cold would act on it. Nothing about
-- what this file DOES has changed. `devfleet_badges` and `devfleet_badge_sync`
-- were dropped by
-- `20260828170000_devfleet_badges_onto_tdg_badges.sql`, which carried every
-- row across with its epoch and its earned dates untouched and filed `commits`
-- as `tdg_badges.measurements.commits`. The DevFleet half shipped as v1.11.0.
-- ===========================================================================


-- ── 1 · the table ──────────────────────────────────────────────────────────
--
-- RLS on and NO client policies, like `tdg_account_badges` and `tdg_feedback`:
-- the verbs below are the whole surface. A direct client read would have to be
-- own-row-only anyway, and `tdg_my_privacy()` is that read with the catalogue
-- already joined, so a second door would only be a way to get a bare jsonb
-- with no idea which keys are real.

create table if not exists public.tdg_privacy (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.tdg_privacy is
  'Per-account visibility for every TDG app: one row per account, settings maps a catalogue key from tdg_privacy_catalog() to an audience of public/friends/self. The authority; profiles.public_profile and public_friend_list are its two-state mirrors, kept true by tdg_set_privacy and by the tdg_profiles_forward_privacy trigger. RLS on with no client policies — tdg_my_privacy, tdg_set_privacy, tdg_set_privacy_many, tdg_can_view and tdg_privacy_for are the whole surface.';

alter table public.tdg_privacy enable row level security;
revoke all on table public.tdg_privacy from anon, authenticated;


-- ── 2 · the catalogue ──────────────────────────────────────────────────────
--
-- In SQL for the reason `tdg_badge_catalog()` is: the server validates a save
-- against exactly the list the interface offered, so the two cannot drift, and
-- a control added tomorrow appears in every TDG app at once with no build.
--
--   kind      'content' is something your page SAYS about you, and is gated by
--             the `profile` key above it — a page nobody may open cannot show
--             a streak. 'contact' is something somebody may DO to you, and is
--             deliberately NOT gated: Bible Educator already, on purpose,
--             offers Send Friend Request on a private profile, because finding
--             somebody is the whole point of the page.
--   fallback  what an account that has never touched this answers. These are
--             the defaults the two old shapes already had — profile and friend
--             list public, the three published figures off — so nothing
--             anybody had chosen changes meaning on the day this ships.

create or replace function public.tdg_privacy_catalog()
returns table (id text, label text, blurb text, "group" text, kind text,
               allowed text[], fallback text, sort integer)
language sql
immutable
set search_path to 'public'
as $$
  select * from (values
    ('profile',         'Your Profile',      'Who can open your profile page at all.',          'visibility', 'content', array['public','friends','self'], 'public', 10),
    ('bio',             'Your Bio',          'The few lines you wrote about yourself.',         'page',       'content', array['public','friends','self'], 'public', 20),
    ('friends_list',    'Your Friends List', 'Who you are friends with.',                       'page',       'content', array['public','friends','self'], 'public', 30),
    ('account_age',     'TDG Account Age',   'When your TDG account began, and how old it is.', 'page',       'content', array['public','friends','self'], 'self',   40),
    ('badges',          'Your Badges',       'The badges you have earned across TDG apps.',     'page',       'content', array['public','friends','self'], 'self',   50),
    ('streak',          'Your Streak',       'How many days running you have kept.',            'page',       'content', array['public','friends','self'], 'self',   60),
    ('apps',            'Apps You Use',      'Which TDG apps this account has opened.',         'page',       'content', array['public','friends','self'], 'self',   70),
    ('friend_requests', 'Friend Requests',   'Who may ask to be your friend.',                  'contact',    'contact', array['public','friends','self'], 'public', 80)
  ) as c (id, label, blurb, "group", kind, allowed, fallback, sort);
$$;

comment on function public.tdg_privacy_catalog() is
  'Every privacy control a TDG app may offer, and what each may be set to. A new control is a row here and no TypeScript anywhere. kind=content is gated by the profile key; kind=contact is not, because a private profile still has to be able to receive a friend request.';

-- The three words, with what each one means written down once so no app has
-- to invent the sentence. `rank` is narrowness, so a comparison is arithmetic
-- rather than a chain of string equalities.
create or replace function public.tdg_privacy_audiences()
returns table (id text, label text, blurb text, contact_blurb text, rank integer)
language sql
immutable
set search_path to 'public'
as $$
  select * from (values
    ('public',  'Everyone',     'Anyone, whether they have a TDG account or not.', 'Anyone with a TDG account.', 0),
    ('friends', 'Friends Only', 'Only the people on your friends list.',           'Friends of your friends.',   1),
    ('self',    'Only Me',      'Nobody but you.',                                 'Nobody.',                    2)
  ) as a (id, label, blurb, contact_blurb, rank);
$$;


-- ── 3 · seeding, from the two shapes this replaces ─────────────────────────
--
-- Every account that exists gets a row now rather than on next write, so
-- `tdg_can_view` never has to tell a missing row from a deliberate default —
-- and so the count of rows here matches the count of accounts, which is the
-- only way to notice later that signup stopped writing one.

insert into public.tdg_privacy (user_id, settings)
select p.user_id,
       jsonb_build_object(
         'profile',      case when p.public_profile     then 'public' else 'self' end,
         'friends_list', case when p.public_friend_list then 'public' else 'self' end,
         'account_age',  case when coalesce(s.show_account_age, false) then 'public' else 'self' end,
         'badges',       case when coalesce(s.show_badges,      false) then 'public' else 'self' end,
         'streak',       case when coalesce(s.show_streak,      false) then 'public' else 'self' end
       )
from public.profiles p
left join public.bea_public_stats s on s.user_id = p.user_id
on conflict (user_id) do nothing;

-- A new account gets its row with the account, beside the profile and the
-- free subscription. Inside the same exception-swallowing block on purpose: a
-- privacy row that failed to write is recoverable (the catalogue's fallbacks
-- are the same values it would have held), and a failed signup is not.
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

  insert into public.tdg_privacy (user_id) values (new.id)
      on conflict (user_id) do nothing;

  return new;
exception when others then
  -- Never let profile creation break account creation. A missing profile row
  -- is recoverable by the app on first sign-in; a failed signup is not.
  return new;
end;
$$;


-- ── 4 · the one question every read asks ───────────────────────────────────
--
-- plpgsql rather than sql, because the master-switch check would otherwise
-- want to call this function from inside its own body, and a SQL function's
-- body is parsed at creation.
--
-- The order matters, and each step answers a DIFFERENT question:
--   1. is it me            — your own page is always your own page
--   2. moderated away      — not a privacy question, and it outranks one
--   3. did they block me   — a block is not a setting either
--   4. is the page open    — the master gate, for content keys only
--   5. the key's own audience

create or replace function public.tdg_can_view(p_target uuid, p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_me     uuid := auth.uid();
  v_key    record;
  v_aud    text;
  v_master text;
  v_friend boolean;
  v_fof    boolean;
begin
  if p_target is null then return false; end if;

  select * into v_key from public.tdg_privacy_catalog() k where k.id = p_key;
  if not found then return false; end if;

  if p_target = v_me then return true; end if;

  if exists (
    select 1 from public.tdg_profile_state s
     where s.user_id = p_target
       and (s.deleted_by_admin
            or (s.hidden_by_admin and (s.hidden_until is null or s.hidden_until > now()))
            or v_me = any (s.blocked_ids))
  ) then
    return false;
  end if;

  select coalesce(pv.settings ->> p_key, v_key.fallback),
         coalesce(pv.settings ->> 'profile',
                  (select k.fallback from public.tdg_privacy_catalog() k where k.id = 'profile'))
    into v_aud, v_master
    from (select 1) _
    left join public.tdg_privacy pv on pv.user_id = p_target;

  v_friend := v_me is not null and exists (
    select 1 from public.tdg_profile_state s
     where s.user_id = p_target and v_me = any (s.friend_ids));

  -- A page nobody may open cannot show anything on it. Contact keys are
  -- exempt: a private profile is still an account somebody may ask to be
  -- friends with, which is the whole reason its page is still a page.
  if v_key.kind = 'content' and p_key <> 'profile' then
    if v_master = 'self' then return false; end if;
    if v_master = 'friends' and not v_friend then return false; end if;
  end if;

  if v_aud = 'public' then return true; end if;

  if v_aud = 'friends' then
    if v_key.kind <> 'contact' then return v_friend; end if;
    -- 'Friends of your friends'. Already being friends counts: the narrower
    -- reading would refuse a request from somebody you are already friends
    -- with, which tdg_add_friend answers as a no-op anyway.
    if v_friend then return true; end if;
    v_fof := v_me is not null and exists (
      select 1
        from public.tdg_profile_state mine
        join public.tdg_profile_state theirs on theirs.user_id = p_target
       where mine.user_id = v_me
         and mine.friend_ids && theirs.friend_ids);
    return coalesce(v_fof, false);
  end if;

  return false;
end;
$$;

comment on function public.tdg_can_view(uuid, text) is
  'The single answer to "may the caller see this about that account". Every read on this project asks it rather than re-deriving the rule; moderation and blocks outrank the setting, and content keys are gated by the profile key above them.';

-- Every key at once, for a page that is about to draw a whole profile. One
-- round trip rather than eight, and the answers cannot disagree with each
-- other because they came from one snapshot.
create or replace function public.tdg_privacy_for(p_target uuid)
returns table (id text, visible boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select k.id, public.tdg_can_view(p_target, k.id)
  from public.tdg_privacy_catalog() k
  order by k.sort;
$$;

-- The caller's own settings, with the catalogue already joined so the
-- interface never writes a key, a label or an allowed value down.
-- `is_default` is drawn: a reader is entitled to know which of these they
-- chose and which were chosen for them.
create or replace function public.tdg_my_privacy()
returns table (id text, label text, blurb text, "group" text, kind text,
               allowed text[], audience text, is_default boolean, sort integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;

  return query
  select k.id, k.label, k.blurb, k."group", k.kind, k.allowed,
         coalesce(pv.settings ->> k.id, k.fallback),
         (pv.settings ->> k.id) is null,
         k.sort
    from public.tdg_privacy_catalog() k
    left join public.tdg_privacy pv on pv.user_id = v_me
   order by k.sort;
end;
$$;


-- ── 5 · writing one, and writing several ───────────────────────────────────
--
-- The whole save is one statement — `settings || jsonb_build_object(...)` —
-- so the lost-update race that five switches side by side used to make
-- ordinary cannot happen: there is no read in the client to go stale.
--
-- The mirror is written inside the same transaction for the same reason. A
-- `profiles` row whose boolean disagreed with the audience would be a lie
-- told to every app that has not been updated yet, which is all of them until
-- they are.

create or replace function public.tdg_set_privacy(p_key text, p_audience text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me  uuid := auth.uid();
  v_key record;
begin
  if v_me is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;

  select * into v_key from public.tdg_privacy_catalog() k where k.id = p_key;
  if not found then
    raise exception 'tdg: there is no privacy setting called %', coalesce(p_key, '(none)')
      using errcode = '22023';
  end if;
  if p_audience is null or not (p_audience = any (v_key.allowed)) then
    raise exception 'tdg: % cannot be set to %', v_key.label, coalesce(p_audience, '(nothing)')
      using errcode = '22023';
  end if;

  insert into public.tdg_privacy as pv (user_id, settings)
  values (v_me, jsonb_build_object(p_key, p_audience))
  on conflict (user_id) do update
     set settings   = pv.settings || jsonb_build_object(p_key, p_audience),
         updated_at = now();

  if p_key = 'profile' then
    update public.profiles set public_profile = (p_audience = 'public') where user_id = v_me;
  elsif p_key = 'friends_list' then
    update public.profiles set public_friend_list = (p_audience = 'public') where user_id = v_me;
  end if;
end;
$$;

-- One call for "Set All To Friends Only", and for an interface that saves a
-- whole panel at once. Every key is validated before any key is written, so a
-- batch with one bad value changes nothing rather than half of something.
create or replace function public.tdg_set_privacy_many(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  k    text;
  v    text;
begin
  if v_me is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  for k, v in select key, value #>> '{}' from jsonb_each(p_settings) loop
    if not exists (select 1 from public.tdg_privacy_catalog() c
                    where c.id = k and v = any (c.allowed)) then
      raise exception 'tdg: % cannot be set to %', k, coalesce(v, '(nothing)')
        using errcode = '22023';
    end if;
  end loop;

  for k, v in select key, value #>> '{}' from jsonb_each(p_settings) loop
    perform public.tdg_set_privacy(k, v);
  end loop;
end;
$$;


-- ── 6 · the legacy door, and the one thing it must not do ──────────────────
--
-- Bible Educator, Makullveny and the Developer console all write
-- `profiles.public_profile` directly, in the same UPDATE as a display name.
-- That keeps working, and lands in the same one authority.
--
-- The `false` case is the whole reason this is not two lines. Every profile
-- save sends the boolean whether or not the reader touched it, so a save from
-- a friends-only account arrives as `public_profile = false` and, taken at
-- face value, would silently rewrite 'friends' to 'self'. `false` therefore
-- means "not public" — which an audience already narrower than public
-- satisfies — and only moves the setting when it is currently 'public'.

create or replace function public.tdg_profiles_forward_privacy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_now  jsonb;
  v_next jsonb := '{}'::jsonb;
  v_aud  text;
begin
  if new.public_profile is not distinct from old.public_profile
     and new.public_friend_list is not distinct from old.public_friend_list then
    return new;
  end if;

  select coalesce(pv.settings, '{}'::jsonb) into v_now
    from public.tdg_privacy pv where pv.user_id = new.user_id;
  v_now := coalesce(v_now, '{}'::jsonb);

  if new.public_profile is distinct from old.public_profile then
    v_aud := coalesce(v_now ->> 'profile', 'public');
    if new.public_profile then
      if v_aud <> 'public' then v_next := v_next || jsonb_build_object('profile', 'public'); end if;
    elsif v_aud = 'public' then
      v_next := v_next || jsonb_build_object('profile', 'self');
    end if;
  end if;

  if new.public_friend_list is distinct from old.public_friend_list then
    v_aud := coalesce(v_now ->> 'friends_list', 'public');
    if new.public_friend_list then
      if v_aud <> 'public' then v_next := v_next || jsonb_build_object('friends_list', 'public'); end if;
    elsif v_aud = 'public' then
      v_next := v_next || jsonb_build_object('friends_list', 'self');
    end if;
  end if;

  if v_next <> '{}'::jsonb then
    insert into public.tdg_privacy as pv (user_id, settings)
    values (new.user_id, v_next)
    on conflict (user_id) do update
       set settings = pv.settings || v_next, updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists tdg_profiles_forward_privacy on public.profiles;
create trigger tdg_profiles_forward_privacy
  after update of public_profile, public_friend_list on public.profiles
  for each row execute function public.tdg_profiles_forward_privacy();

comment on column public.profiles.public_profile is
  'MIRROR of tdg_privacy''s `profile` audience, kept for apps that only understand public-or-not: true exactly when the audience is ''public'', so a friends-only profile reads false here. Written by tdg_set_privacy; a direct write is forwarded back into tdg_privacy by tdg_profiles_forward_privacy. The authority is tdg_privacy.';
comment on column public.profiles.public_friend_list is
  'MIRROR of tdg_privacy''s `friends_list` audience. See public_profile.';


-- ── 7 · the readers that used to ask a boolean ─────────────────────────────
--
-- Signatures unchanged, so nothing deployed has to know this happened. What
-- changes is that "friends only" is a real answer everywhere at once, rather
-- than a state the database had no way to hold.
--
-- `tdg_find_profile` still returns a column called `public_profile`, and it
-- now carries "may YOU see it", which is what every caller already used it
-- for: Bible Educator draws its `Private` badge from it and withholds the
-- page's content on it. A friend of a friends-only account gets `true` and
-- sees the page, which is the whole point.

create or replace function public.tdg_is_visible(p profiles)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select public.tdg_can_view(p.user_id, 'profile');
$$;

create or replace function public.tdg_find_profile(uname text)
returns table (user_id uuid, username text, display_name text, bio text,
               public_profile boolean, public_friend_list boolean,
               created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.user_id,
         p.username,
         p.display_name,
         case when public.tdg_can_view(p.user_id, 'bio') then p.bio else null end,
         public.tdg_can_view(p.user_id, 'profile'),
         public.tdg_can_view(p.user_id, 'friends_list'),
         p.created_at
  from public.profiles p
  where lower(p.username) = lower(trim(both from replace(uname, '@', '')))
    and public.tdg_is_findable(p)
    and not exists (
      select 1 from public.tdg_profile_state s
      where s.user_id = p.user_id and auth.uid() = any(s.blocked_ids)
    )
  limit 1;
$$;

create or replace function public.tdg_public_friends(target uuid)
returns table (user_id uuid, username text, display_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.user_id, p.username, p.display_name
  from public.tdg_profile_state s
  cross join lateral unnest(s.friend_ids) as fid
  join public.profiles p on p.user_id = fid
  where s.user_id = target
    and public.tdg_can_view(target, 'friends_list')
    and public.tdg_can_view(p.user_id, 'profile')
  order by lower(coalesce(p.display_name, p.username));
$$;

-- Asking to be somebody's friend is now a thing they get a say in. The
-- refusal names the SETTING rather than the person, so it cannot be read as
-- "that account does not exist" — which is a different answer and belongs to
-- a different question.
create or replace function public.tdg_add_friend(target uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if target = me then raise exception 'that is you' using errcode = '22023'; end if;
  if exists (
    select 1 from public.tdg_profile_state
    where (user_id = me and target = any(blocked_ids))
       or (user_id = target and me = any(blocked_ids))
  ) then
    raise exception 'this user cannot be added' using errcode = '42501';
  end if;

  insert into public.tdg_profile_state (user_id) values (me) on conflict (user_id) do nothing;
  insert into public.tdg_profile_state (user_id) values (target) on conflict (user_id) do nothing;

  -- Already friends: nothing to ask for.
  if exists (select 1 from public.tdg_profile_state
             where user_id = me and target = any(friend_ids)) then
    return;
  end if;

  -- They asked first, so this answers their request rather than raising one.
  -- Checked BEFORE the setting on purpose: somebody who asked you is somebody
  -- you may always answer, whatever they have since set.
  if exists (select 1 from public.tdg_profile_state
             where user_id = target and me = any(requested_ids)) then
    update public.tdg_profile_state
       set friend_ids = case when target = any(friend_ids) then friend_ids else array_append(friend_ids, target) end,
           requested_ids = array_remove(requested_ids, target),
           updated_at = now()
     where user_id = me;
    update public.tdg_profile_state
       set friend_ids = case when me = any(friend_ids) then friend_ids else array_append(friend_ids, me) end,
           requested_ids = array_remove(requested_ids, me),
           updated_at = now()
     where user_id = target;
    return;
  end if;

  if not public.tdg_can_view(target, 'friend_requests') then
    raise exception 'this account is not taking friend requests' using errcode = '42501';
  end if;

  -- Ordinary case: record the request on my row only. Idempotent, so asking
  -- twice does not stack up.
  update public.tdg_profile_state
     set requested_ids = case when target = any(requested_ids) then requested_ids else array_append(requested_ids, target) end,
         updated_at = now()
   where user_id = me;
end;
$$;


-- ── 8 · bea_streaks -> tdg_streaks ─────────────────────────────────────────
--
-- Keyed (user_id, app) the way `tdg_badges` is, and for the same reason: the
-- second app to want a streak must not need a migration, and every row of it
-- belongs to the TDG account rather than to whichever app happened to count
-- it first.

alter table public.bea_streaks rename to tdg_streaks;
alter table public.tdg_streaks add column if not exists app text not null default 'bea';
alter table public.tdg_streaks drop constraint if exists bea_streaks_pkey;
alter table public.tdg_streaks add primary key (user_id, app);
alter table public.tdg_streaks drop constraint if exists tdg_streaks_app_shape;
alter table public.tdg_streaks add constraint tdg_streaks_app_shape
  check (app ~ '^[a-z][a-z0-9-]{1,31}$');

alter policy bea_streaks_select_own on public.tdg_streaks rename to tdg_streaks_select_own;
alter policy bea_streaks_insert_own on public.tdg_streaks rename to tdg_streaks_insert_own;
alter policy bea_streaks_update_own on public.tdg_streaks rename to tdg_streaks_update_own;

comment on table public.tdg_streaks is
  'A run of days an ACCOUNT kept, one row per (account, app). Was bea_streaks until 2026-08-28, when it moved to the tdg_ family for the reason tdg_badges did: a streak belongs to the TDG account, and a second app wanting one must not need a migration. Merged client-side as a union of day runs. Who may see it is tdg_privacy''s `streak` key, never a column here.';


-- ── 9 · bea_public_stats -> tdg_privacy + tdg_badges.published ─────────────
--
-- What that table held was two unrelated things wearing one row: three
-- switches, which are an account fact and are now `tdg_privacy`'s, and a
-- snapshot of badge counters published so a stranger's browser could read
-- them, which is per-(account, app) and so is `tdg_badges`'s — the table that
-- already holds exactly that shape.

alter table public.tdg_badges add column if not exists published jsonb not null default '{}'::jsonb;

comment on column public.tdg_badges.published is
  'The counters this account chose to publish for this app, as read by a stranger''s browser through tdg_public_profile_stats. Written only by tdg_publish_stats, and only ever read back out through a function that applies tdg_privacy first — the switch decides what is SENT, not what is drawn.';

insert into public.tdg_badges (user_id, app, epoch, contributions, measurements, earned, published)
select s.user_id, 'bea', coalesce(s.updated_at, now()), '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
       jsonb_strip_nulls(jsonb_build_object(
         'counts',      s.badge_counts,
         'since',       s.badge_since,
         'seeded',      s.badge_seeded,
         'usageAnchor', s.usage_anchor
       ))
from public.bea_public_stats s
on conflict (user_id, app) do update
   set published = excluded.published;

-- Publishing is a write about the caller's own account and takes no target,
-- for the reason `tdg_my_badges` takes none: one that did would be a
-- profile-scraping endpoint wearing a save button.
create or replace function public.tdg_publish_stats(p_app text, p_published jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;
  if p_app is null or p_app !~ '^[a-z][a-z0-9-]{1,31}$' then
    raise exception 'tdg: a publish must say which app it is from' using errcode = '22023';
  end if;
  if p_published is null or jsonb_typeof(p_published) <> 'object' then
    raise exception 'tdg: bad request' using errcode = '22023';
  end if;

  insert into public.tdg_badges as b (user_id, app, published)
  values (v_me, p_app, p_published)
  on conflict (user_id, app) do update
     set published = p_published, updated_at = now();
end;
$$;

-- What a VIEWER may read about somebody's account, with every switch applied
-- in SQL. The booleans it answers are the server's, not the owner's raw
-- setting, so no page ever re-derives the rule — a friends-only account
-- answers false to a stranger with the switch on, and the page that receives
-- it cannot get that wrong because it never sees the setting.
create or replace function public.tdg_public_profile_stats(p_target uuid, p_app text default 'bea')
returns table (show_account_age boolean, show_badges boolean, show_streak boolean,
               created_at timestamptz, published jsonb,
               streak_current integer, streak_longest integer, streak_total integer,
               last_active_date date, current_start date, best_start date,
               best_end date, best_is_current boolean, dates_from date)
language sql
stable
security definer
set search_path to 'public'
as $$
  with allowed as (
    select public.tdg_can_view(p_target, 'account_age') as age,
           public.tdg_can_view(p_target, 'badges')      as badges,
           public.tdg_can_view(p_target, 'streak')      as streak
  )
  select a.age, a.badges, a.streak,
         case when a.age    then p.created_at end,
         case when a.badges then coalesce(b.published, '{}'::jsonb) else '{}'::jsonb end,
         case when a.streak then sk."current"        end,
         case when a.streak then sk.longest          end,
         case when a.streak then sk.total_days       end,
         case when a.streak then sk.last_active_date end,
         case when a.streak then sk.current_start    end,
         case when a.streak then sk.best_start       end,
         case when a.streak then sk.best_end         end,
         case when a.streak then sk.best_is_current  end,
         case when a.streak then sk.dates_from       end
  from allowed a
  join public.profiles p on p.user_id = p_target
  left join public.tdg_badges  b  on b.user_id  = p_target and b.app  = p_app
  left join public.tdg_streaks sk on sk.user_id = p_target and sk.app = p_app
  limit 1;
$$;

-- The shape Bible Educator's deployed build asks for, answered from the new
-- sources. Kept so a browser still running the build from before this
-- migration draws a public profile page correctly; it is a forwarder, like
-- `bea_find_profile` and `bea_is_visible` already are.
create or replace function public.bea_public_stats_for(target uuid)
returns table (show_account_age boolean, show_badges boolean, show_streak boolean,
               created_at timestamptz, badge_counts jsonb, badge_since jsonb,
               badge_seeded jsonb, usage_anchor timestamptz,
               streak_current integer, streak_longest integer, streak_total integer,
               last_active_date date, current_start date, best_start date,
               best_end date, best_is_current boolean, dates_from date)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.show_account_age, s.show_badges, s.show_streak, s.created_at,
         s.published -> 'counts',
         s.published -> 'since',
         s.published -> 'seeded',
         nullif(s.published ->> 'usageAnchor', '')::timestamptz,
         s.streak_current, s.streak_longest, s.streak_total, s.last_active_date,
         s.current_start, s.best_start, s.best_end, s.best_is_current, s.dates_from
  from public.tdg_public_profile_stats(target, 'bea') s;
$$;

drop table public.bea_public_stats;
drop function if exists public.bea_public_stats_touch();


-- ── 10 · mak_typing_rate_limit -> tdg_rate_limits ──────────────────────────
--
-- One rolling counter per (account, bucket), rewritten in place and never a
-- ledger of when anybody did anything. No client has ever named this table
-- and none may: the only door is a SECURITY DEFINER function that takes the
-- limit from its caller, which is itself server-side SQL.

create table if not exists public.tdg_rate_limits (
  user_id           uuid not null references auth.users (id) on delete cascade,
  bucket            text not null,
  window_started_at timestamptz not null default now(),
  count             integer not null default 0,
  primary key (user_id, bucket)
);

comment on table public.tdg_rate_limits is
  'Rolling per-account submission counters, one row per (account, bucket), rewritten in place — never a ledger of when anybody did anything. Was mak_typing_rate_limit until 2026-08-28; nothing about counting submissions is typing-shaped, and the next app to need one would have written a third table. Unreadable and unwritable by every client role; tdg_rate_take() is the only door.';

alter table public.tdg_rate_limits enable row level security;
revoke all on table public.tdg_rate_limits from anon, authenticated;

create or replace function public.tdg_rate_take(p_bucket text, p_limit integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user  uuid := auth.uid();
  v_now   timestamptz := now();
  v_count integer;
begin
  if v_user is null then return false; end if;
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 64 then
    return false;
  end if;

  insert into public.tdg_rate_limits as r (user_id, bucket, window_started_at, count)
  values (v_user, p_bucket, v_now, 1)
  on conflict (user_id, bucket) do update
    set window_started_at = case
          when r.window_started_at < v_now - p_window then v_now
          else r.window_started_at
        end,
        count = case
          when r.window_started_at < v_now - p_window then 1
          else r.count + 1
        end
  returning count into v_count;

  return v_count <= greatest(1, coalesce(p_limit, 1));
end;
$$;

insert into public.tdg_rate_limits (user_id, bucket, window_started_at, count)
select r.user_id, 'mak-typing', r.window_started_at, r.submissions
from public.mak_typing_rate_limit r
on conflict (user_id, bucket) do nothing;

-- Kept as a forwarder rather than removed: `mak_submit_typing_record` calls
-- it by name, and one rewritten function is a smaller change than two.
create or replace function public.mak_typing_rate_take(p_limit integer, p_window interval)
returns boolean
language sql
security definer
set search_path to 'public'
as $$ select public.tdg_rate_take('mak-typing', $1, $2) $$;

drop table public.mak_typing_rate_limit;


-- ── 11 · the Developer console's one join that moved ───────────────────────
--
-- Byte-for-byte the function that was running, with `bea_streaks` renamed and
-- the join narrowed to that app's row. Recreated rather than left alone
-- because its body names the table inside dynamic SQL, which nothing in
-- Postgres would have caught for us.

create or replace function public.tdg_admin_accounts(p_q text default ''::text, p_target uuid default null::uuid, p_max_rows integer default 200)
returns table (user_id uuid, email text, username text, display_name text, bio text, recovery_email text, is_admin boolean, public_profile boolean, public_friend_list boolean, created_at timestamptz, updated_at timestamptz, username_changed_at timestamptz, last_sign_in_at timestamptz, email_confirmed_at timestamptz, auth_banned_until timestamptz, status text, ban_until timestamptz, hidden_by_admin boolean, hidden_until timestamptz, deleted_by_admin boolean, deleted_at timestamptz, friend_count integer, streak_current integer, streak_longest integer, streak_total integer, core_tier text, core_status text, core_stripe_customer_id text, core_renewed_at timestamptz, core_row_count integer, mak_tier text, mak_status text, mak_themes text[], mak_candle_purchased_at timestamptz, mak_support_badge_at timestamptz, mak_period_end timestamptz, mak_cancel_at_period_end boolean, mak_stripe_customer_id text, store jsonb)
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_q     text := btrim(coalesce(p_q, ''));
  v_joins text := '';
  v_store text := '';
  v_alias text;
  v_sql   text;
  r       record;
  i       integer := 0;
begin
  perform public.tdg_admin_uid();
  v_q := regexp_replace(v_q, '^@', '');

  for r in select * from public.tdg_store_apps() loop
    i := i + 1;
    v_alias := 'ent' || i;

    v_joins := v_joins || format(
      ' left join public.%I %I on %I.user_id = p.user_id',
      r.entitlements_table, v_alias, v_alias);

    v_store := v_store || format(
      $s$ || jsonb_build_object(%L, jsonb_build_object(
               'packs', to_jsonb(coalesce(%I.owned_packs, '{}'::text[])),
               'stripe_customer_id', to_jsonb(%I.stripe_customer_id),
               'grants', %s))$s$,
      r.app_id, v_alias, v_alias,
      case
        when r.has_grants then format($g$coalesce(%I.grants, '{}'::jsonb)$g$, v_alias)
        else $g$'{}'::jsonb$g$
      end);
  end loop;

  v_sql := format($q$
    select
      p.user_id,
      u.email::text,
      p.username,
      p.display_name,
      p.bio,
      p.recovery_email,
      p.is_admin,
      p.public_profile,
      p.public_friend_list,
      p.created_at,
      p.updated_at,
      p.username_changed_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      u.banned_until,
      coalesce(st.status, 'active'),
      st.ban_until,
      coalesce(st.hidden_by_admin, false),
      st.hidden_until,
      coalesce(st.deleted_by_admin, false),
      st.deleted_at,
      coalesce(array_length(st.friend_ids, 1), 0),
      coalesce(sk."current", 0),
      coalesce(sk.longest, 0),
      coalesce(sk.total_days, 0),
      coalesce(co.tier, 'free'),
      coalesce(co.status, 'active'),
      co.stripe_customer_id,
      co.renewed_at,
      coalesce(co.row_count, 0)::integer,
      coalesce(mk.tier, 'free'),
      coalesce(mk.status, 'active'),
      coalesce(mk.owned_themes, '{}'::text[]),
      mk.candle_purchased_at,
      mk.support_badge_earned_at,
      mk.current_period_end,
      coalesce(mk.cancel_at_period_end, false),
      mk.stripe_customer_id,
      '{}'::jsonb %s
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.tdg_profile_state st on st.user_id = p.user_id
    left join public.tdg_streaks       sk on sk.user_id = p.user_id and sk.app = 'bea'
    left join lateral (
      select s.tier, s.status, s.stripe_customer_id, s.renewed_at,
             count(*) over () as row_count
      from public.subscriptions s
      where s.user_id = p.user_id
      order by s.renewed_at desc nulls last, s.id
      limit 1
    ) co on true
    left join public.mak_subscriptions mk on mk.user_id = p.user_id%s
    where ($2::uuid is null or p.user_id = $2::uuid)
      and ($2::uuid is not null
           or $1 = ''
           or p.username       ilike '%%' || $1 || '%%'
           or p.display_name   ilike '%%' || $1 || '%%'
           or u.email::text    ilike '%%' || $1 || '%%'
           or p.recovery_email ilike '%%' || $1 || '%%'
           or p.user_id::text  = $1)
    order by p.created_at desc
    limit greatest(1, least(coalesce($3, 200), 1000))
  $q$, v_store, v_joins);

  return query execute v_sql using v_q, p_target, p_max_rows;
end;
$function$;


-- ── 12 · what the Account page is FOR ──────────────────────────────────────
--
-- One call, because an Account page that lands in eight pieces reads as a
-- page still loading — the same reason the Store card reserves its height.
--
-- Everything here is DERIVED. `packs` walks whatever `tdg_store_apps()` turns
-- out to have found, and `apps` and `streaks` walk whatever has ever written a
-- row, so a product added tomorrow appears on this page with no migration and
-- no TypeScript: rule 17, one level down. A page that had to be TOLD the list
-- would fail by quietly leaving something off, which is the failure nobody
-- notices.

create or replace function public.tdg_my_account_stats()
returns table (created_at timestamptz, friends integer, requests_in integer,
               requests_out integer, blocked integer, badges integer,
               feedback_sent integer, apps jsonb, packs jsonb, streaks jsonb)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_me    uuid := auth.uid();
  v_packs jsonb := '{}'::jsonb;
  v_list  text[];
  r       record;
begin
  if v_me is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;

  for r in select * from public.tdg_store_apps() loop
    execute format('select coalesce(e.owned_packs, ''{}''::text[]) from public.%I e where e.user_id = $1',
                   r.entitlements_table)
      into v_list using v_me;
    v_packs := v_packs || jsonb_build_object(r.app_id, to_jsonb(coalesce(v_list, '{}'::text[])));
  end loop;

  return query
  select
    p.created_at,
    coalesce(array_length(s.friend_ids, 1), 0),
    (select count(*)::integer from public.tdg_profile_state o
      where v_me = any (o.requested_ids)),
    coalesce(array_length(s.requested_ids, 1), 0),
    coalesce(array_length(s.blocked_ids, 1), 0),
    (select count(*)::integer from public.tdg_my_badges()),
    (select count(*)::integer from public.tdg_feedback f where f.user_id = v_me),
    coalesce((select jsonb_object_agg(b.app, jsonb_build_object(
                       'since', b.epoch, 'earned', b.earned))
                from public.tdg_badges b where b.user_id = v_me), '{}'::jsonb),
    v_packs,
    coalesce((select jsonb_object_agg(k.app, jsonb_build_object(
                       'current', k."current", 'longest', k.longest,
                       'days', k.total_days, 'lastActive', k.last_active_date))
                from public.tdg_streaks k where k.user_id = v_me), '{}'::jsonb)
  from public.profiles p
  left join public.tdg_profile_state s on s.user_id = p.user_id
  where p.user_id = v_me;
end;
$$;


-- ── 13 · grants ────────────────────────────────────────────────────────────
--
-- `authenticated` and never `anon`, per migrations/README.md. The one
-- standing exception on this project is `tdg_public_stats()`, and nothing here
-- clears that bar: every function below can answer differently about different
-- people, which is exactly what puts it behind a session.
--
-- The two catalogues are the ones that could arguably be public, and are not:
-- an interface that offers privacy controls is an interface for somebody
-- signed in, and a signed-out reader has nothing to set.

revoke all on function public.tdg_privacy_catalog()                  from public;
revoke all on function public.tdg_privacy_audiences()                from public;
revoke all on function public.tdg_can_view(uuid, text)               from public;
revoke all on function public.tdg_privacy_for(uuid)                  from public;
revoke all on function public.tdg_my_privacy()                       from public;
revoke all on function public.tdg_set_privacy(text, text)            from public;
revoke all on function public.tdg_set_privacy_many(jsonb)            from public;
revoke all on function public.tdg_publish_stats(text, jsonb)         from public;
revoke all on function public.tdg_public_profile_stats(uuid, text)   from public;
revoke all on function public.tdg_my_account_stats()                 from public;
revoke all on function public.tdg_rate_take(text, integer, interval) from public;
revoke all on function public.tdg_profiles_forward_privacy()         from public;

grant execute on function public.tdg_privacy_catalog()                to authenticated;
grant execute on function public.tdg_privacy_audiences()              to authenticated;
grant execute on function public.tdg_can_view(uuid, text)             to authenticated;
grant execute on function public.tdg_privacy_for(uuid)                to authenticated;
grant execute on function public.tdg_my_privacy()                     to authenticated;
grant execute on function public.tdg_set_privacy(text, text)          to authenticated;
grant execute on function public.tdg_set_privacy_many(jsonb)          to authenticated;
grant execute on function public.tdg_publish_stats(text, jsonb)       to authenticated;
grant execute on function public.tdg_public_profile_stats(uuid, text) to authenticated;
grant execute on function public.tdg_my_account_stats()               to authenticated;
