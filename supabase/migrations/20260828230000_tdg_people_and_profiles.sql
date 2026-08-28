-- ═══════════════════════════════════════════════════════════════════════════
-- People, and the pages they have
--
-- Applied 2026-08-28 against tdg-core (ddbksawvchsauiuiwvrl).
--
-- Until now the only door onto somebody ELSE'S account was
-- `tdg_find_profile`, which takes one exact handle and answers one row. That
-- is enough to send a friend request to a person you already know the spelling
-- of, and it is not enough to be a social system: you could not look someone
-- up, you could not browse the accounts on this project, and there was nowhere
-- to READ what you found. This file is the server half of all three.
--
--   tdg_standing(uuid)              where the caller stands with one account
--   tdg_profile(uuid)               one account's whole page, in one round trip
--   tdg_profile_at(text)            the same, resolved from a handle
--   tdg_search_profiles(text, int)  the people directory
--   tdg_set_favorite(uuid, bool)    star one friend, without resending the set
--
-- and it repairs three reads that were quietly wrong:
--
--   tdg_my_friends        returned `favorite` false and `sort_order` null for
--                         EVERY row -- hardcoded, since the merge that made
--                         this table shared -- while `tdg_set_favorites` and
--                         `tdg_set_friend_order` went on writing the two
--                         columns those values are supposed to come from. Both
--                         features have been dead in every app reading this
--                         for as long as they have existed on this schema, and
--                         nothing said so: a star you press, that saves, and
--                         that is gone when you come back.
--   tdg_incoming_requests / tdg_outgoing_requests
--                         gated `bio` on `profiles.public_profile`, which is
--                         the two-state MIRROR of the `profile` key and has
--                         never been the answer to "may this person read your
--                         bio". It leaked a `bio: self` bio to anybody you had
--                         asked, and withheld a `bio: public` one from
--                         anybody whose profile is friends-only. Both arms are
--                         now `tdg_can_view(user, 'bio')`, which is the one
--                         question that was always meant to be asked.
--   tdg_my_friends        showed a friend's bio with no check at all.
--
-- Every signature is byte-for-byte what it was, so the `bea_*` forwarders that
-- declare those exact shapes keep compiling and no deployed app has to know
-- this happened.
--
-- -- The one deliberate loosening, and its bounds ---------------------------
--
-- `tdg_find_profile` answers NOTHING for an account that has blocked you: the
-- handle reads as free, the page reads as absent, and the site had no way to
-- tell you the difference between "no such person" and "that person blocked
-- you". A block is a real answer and hiding it is not kindness -- it is the
-- reader concluding the site is broken.
--
-- So `tdg_profile_at` resolves a handle whoever holds it, and `tdg_profile`
-- always returns the row: the account exists, it has a name, and `standing`
-- says `blocked_by` out loud. **What is ON the page is unchanged.** Every
-- content key still goes through `tdg_can_view`, which still refuses
-- everything to somebody who has been blocked, so a blocked reader gets a
-- page with an identity, a sentence, and nothing else. The block keeps
-- everything it was ever protecting; it stops being a lie.
--
-- The directory draws the line one step tighter, on purpose:
-- `tdg_search_profiles` lists an account whose profile you may open, one you
-- already have a standing with, or one whose EXACT handle you typed. Somebody
-- who blocked you is reachable by handle and by link, and does not surface
-- while you browse -- a block that showed up in a list of suggestions would be
-- a block doing the opposite of its job.
--
-- Moderation is not a block and does not soften here. `tdg_is_findable` still
-- gates every one of these, so an account hidden or deleted by an admin
-- answers exactly what a handle nobody holds answers, which is nothing.
-- ═══════════════════════════════════════════════════════════════════════════


-- -- 1 - where you stand with somebody -------------------------------------
--
-- Seven words, and the ORDER they are tested in is the whole function.
--
-- A block is checked before a friendship because `tdg_block_user` ends the
-- friendship as it writes the block, so the two cannot both be true -- but a
-- stale row from before that verb existed could say otherwise, and the answer
-- a reader needs then is the one with a button under it. Mine before theirs
-- for the same reason: if I blocked them I can unblock them, and telling me
-- they blocked me would hide the only action I have.
--
-- `you_asked` and `they_asked` rather than `outgoing`/`incoming`: this string
-- is drawn as a sentence about two people, and the interface should not have
-- to work out which end of an arrow it is holding.
create or replace function public.tdg_standing(p_target uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when v.me is null       then 'none'
    when p_target = v.me    then 'self'
    when v.i_blocked        then 'blocked'
    when v.they_blocked     then 'blocked_by'
    when v.friend           then 'friend'
    when v.they_asked       then 'they_asked'
    when v.i_asked          then 'you_asked'
    else 'none'
  end
  from (
    select auth.uid() as me,
           coalesce((select p_target = any(m.blocked_ids)
                       from public.tdg_profile_state m where m.user_id = auth.uid()), false) as i_blocked,
           coalesce((select auth.uid() = any(t.blocked_ids)
                       from public.tdg_profile_state t where t.user_id = p_target), false) as they_blocked,
           coalesce((select p_target = any(m.friend_ids)
                       from public.tdg_profile_state m where m.user_id = auth.uid()), false) as friend,
           coalesce((select auth.uid() = any(t.requested_ids)
                       from public.tdg_profile_state t where t.user_id = p_target), false) as they_asked,
           coalesce((select p_target = any(m.requested_ids)
                       from public.tdg_profile_state m where m.user_id = auth.uid()), false) as i_asked
  ) v;
$$;

comment on function public.tdg_standing(uuid) is
  'Where the caller stands with one account: self / blocked / blocked_by / friend / they_asked / you_asked / none. The order of the tests is the contract - a block outranks a friendship, and MY block outranks theirs, because that is the arm with an action under it.';


-- -- 2 - one account's whole page, in one round trip -----------------------
--
-- Eight `tdg_can_view` answers, the counters and the lists, together. One call
-- because a profile that lands in eight pieces reads as a page still loading,
-- and because eight separate calls can disagree with each other: a friends
-- list arriving from a world where you were still friends, under a header from
-- a world where you are not.
--
-- **The visibility flags are returned as well as applied.** A column that is
-- null could be null because there is nothing there or because you may not see
-- it, and those are different sentences -- "no badges yet" and "they keep
-- their badges to themselves". A page that could not tell them apart would
-- have to guess, and the guess is always the unkind one.
--
-- Nothing here names an app. `apps` and `streaks` are keyed by whatever has
-- actually written a row, in the same shape `tdg_my_account_stats` answers, so
-- a product added tomorrow appears on every profile with no migration and the
-- interface can format both pages with one function (AGENTS.md rule 17).
create or replace function public.tdg_profile(p_target uuid)
returns table (
  user_id          uuid,
  username         text,
  display_name     text,
  bio              text,
  created_at       timestamptz,
  standing         text,
  visible          boolean,
  can_bio          boolean,
  can_friends      boolean,
  can_account_age  boolean,
  can_badges       boolean,
  can_streak       boolean,
  can_apps         boolean,
  can_request      boolean,
  friend_count     integer,
  mutual_count     integer,
  badges           jsonb,
  apps             jsonb,
  streaks          jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with seen as (
    select public.tdg_can_view(p_target, 'profile')         as v_profile,
           public.tdg_can_view(p_target, 'bio')             as v_bio,
           public.tdg_can_view(p_target, 'friends_list')    as v_friends,
           public.tdg_can_view(p_target, 'account_age')     as v_age,
           public.tdg_can_view(p_target, 'badges')          as v_badges,
           public.tdg_can_view(p_target, 'streak')          as v_streak,
           public.tdg_can_view(p_target, 'apps')            as v_apps,
           public.tdg_can_view(p_target, 'friend_requests') as v_request
  )
  select
    p.user_id,
    p.username,
    p.display_name,
    case when s.v_bio then p.bio end,
    case when s.v_age then p.created_at end,
    public.tdg_standing(p_target),
    s.v_profile, s.v_bio, s.v_friends, s.v_age, s.v_badges, s.v_streak, s.v_apps, s.v_request,
    -- Counted from the LIST rather than from the array, so the number and the
    -- names under it cannot disagree: `tdg_public_friends` drops a friend
    -- whose own profile the caller may not open, and a count taken from
    -- `friend_ids` would then be larger than the list it labels. It is already
    -- gated on `friends_list` from the inside, so it answers 0 either way and
    -- `can_friends` is what tells the page which zero it is.
    (select count(*)::integer from public.tdg_public_friends(p_target)),
    case when s.v_friends then (
      select count(*)::integer
        from public.tdg_profile_state mine
        join public.tdg_profile_state theirs on theirs.user_id = p_target
       cross join lateral unnest(coalesce(mine.friend_ids, '{}'::uuid[])) as f
       where mine.user_id = auth.uid()
         and f = any (coalesce(theirs.friend_ids, '{}'::uuid[]))
    ) end,
    case when s.v_badges then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'label', c.label, 'blurb', c.blurb,
               'derived', c.derived, 'grantedAt', b.granted_at)
             order by c.derived desc, b.granted_at desc nulls last, c.id)
        from public.tdg_badge_catalog() c
        left join public.tdg_account_badges b
          on b.user_id = p_target and b.badge = c.id
       where case when c.derived
                  then c.id = any (public.tdg_derived_badges(p_target))
                  else b.user_id is not null end
    ), '[]'::jsonb) end,
    case when s.v_apps then coalesce((
      select jsonb_object_agg(b.app, jsonb_build_object('since', b.epoch, 'earned', b.earned))
        from public.tdg_badges b where b.user_id = p_target
    ), '{}'::jsonb) end,
    case when s.v_streak then coalesce((
      select jsonb_object_agg(k.app, jsonb_build_object(
               'current', k."current", 'longest', k.longest,
               'days', k.total_days, 'lastActive', k.last_active_date))
        from public.tdg_streaks k where k.user_id = p_target
    ), '{}'::jsonb) end
  from seen s
  join public.profiles p on p.user_id = p_target
  where public.tdg_is_findable(p);
$$;

comment on function public.tdg_profile(uuid) is
  'One account''s profile page in one round trip: identity, where the caller stands with it, every tdg_can_view answer, and the counters and lists those answers allow. Returns the row even when the target has blocked the caller - the standing says blocked_by and tdg_can_view withholds everything else - so a block reads as a block rather than as an account that does not exist. Answers nothing for an account hidden or deleted by a moderator.';


-- A handle is what a person types and what a link carries; the id is what the
-- verbs take. One function rather than making every caller do the lookup and
-- then the read, and it deliberately does NOT go through `tdg_find_profile`:
-- that one hides an account that has blocked you, which is exactly the answer
-- this page exists to replace.
create or replace function public.tdg_profile_at(p_username text)
returns table (
  user_id          uuid,
  username         text,
  display_name     text,
  bio              text,
  created_at       timestamptz,
  standing         text,
  visible          boolean,
  can_bio          boolean,
  can_friends      boolean,
  can_account_age  boolean,
  can_badges       boolean,
  can_streak       boolean,
  can_apps         boolean,
  can_request      boolean,
  friend_count     integer,
  mutual_count     integer,
  badges           jsonb,
  apps             jsonb,
  streaks          jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select * from public.tdg_profile((
    select p.user_id
      from public.profiles p
     where lower(p.username) = lower(trim(both from replace(coalesce(p_username, ''), '@', '')))
       and public.tdg_is_findable(p)
     limit 1
  ));
$$;

comment on function public.tdg_profile_at(text) is
  'tdg_profile, resolved from a handle. A handle nobody holds and an account a moderator has hidden are the same answer - nothing - which is the property src/auth/README.md protects everywhere on this project.';


-- -- 3 - the directory -----------------------------------------------------
--
-- Who is on TDG, and where you stand with each of them.
--
-- **An empty query is not an error, it is a browse.** The first thing somebody
-- opening a people search sees should be people; a box that answers nothing
-- until you have guessed part of a name is a box that cannot be explored, and
-- "type something" is the emptiest of the empty states.
--
-- Three ways in, and the third is the one that matters:
--   - the caller may open that profile -- the ordinary case;
--   - the caller already has a standing with them -- a friend, a request
--     either way, somebody they blocked. A directory that hid your own friends
--     because they went friends-only would be a directory you cannot trust;
--   - the query IS their exact handle. This is the door `tdg_find_profile`
--     has always been, kept open at exactly its old width, so a private
--     account can still be found by somebody who knows how to spell it and can
--     still be sent a request.
--
-- Ordering is what makes it feel like a search rather than a table: the exact
-- handle, then the people you know, then the names that START with what was
-- typed, then everything else that merely contains it, alphabetically within
-- each. A match on the front of a name is what somebody typing three letters
-- is looking for; one in the middle is a coincidence they will scroll past.
create or replace function public.tdg_search_profiles(p_q text default '', p_limit integer default 24)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  bio          text,
  created_at   timestamptz,
  standing     text,
  visible      boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_me  uuid := auth.uid();
  v_q   text := lower(trim(both from replace(coalesce(p_q, ''), '@', '')));
  v_max integer := greatest(1, least(coalesce(p_limit, 24), 50));
begin
  if v_me is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;

  return query
  with hit as (
    select p.user_id                                     as uid,
           p.username                                    as uname,
           p.display_name                                as dname,
           p.bio                                         as about,
           p.created_at                                  as joined,
           public.tdg_standing(p.user_id)                as stand,
           public.tdg_can_view(p.user_id, 'profile')     as seen,
           public.tdg_can_view(p.user_id, 'bio')         as bio_ok,
           public.tdg_can_view(p.user_id, 'account_age') as age_ok,
           lower(coalesce(p.username, '')) = v_q         as exact,
           (lower(coalesce(p.username, '')) like v_q || '%'
            or lower(coalesce(p.display_name, '')) like v_q || '%') as starts
      from public.profiles p
     where p.user_id <> v_me
       and public.tdg_is_findable(p)
       -- A handle is the address of a profile page, so an account without one
       -- is a row with nowhere to go. It is a real account and it is reachable
       -- everywhere it can be acted on -- a friend with no handle still
       -- appears in your friends list, because that list is your own data --
       -- but a directory whose first row opens nothing is a directory that
       -- looks broken on arrival.
       and coalesce(trim(both from p.username), '') <> ''
       and (v_q = ''
            or lower(p.username) like '%' || v_q || '%'
            or lower(coalesce(p.display_name, '')) like '%' || v_q || '%')
  )
  select h.uid, h.uname, h.dname,
         case when h.bio_ok then h.about end,
         -- The join date is `account_age`'s to give, and a directory row is
         -- not a way around a setting the profile page itself honours.
         case when h.age_ok then h.joined end,
         h.stand, h.seen
    from hit h
   where h.seen
      or h.exact
      or h.stand in ('friend', 'they_asked', 'you_asked', 'blocked')
   order by
     case when h.exact then 0
          when h.stand = 'friend' then 1
          when h.starts then 2
          else 3 end,
     lower(coalesce(h.dname, h.uname, '')),
     h.uid
   limit v_max;
end;
$$;

comment on function public.tdg_search_profiles(text, integer) is
  'The people directory: accounts whose profile the caller may open, plus anyone they already have a standing with, plus an exact handle match - which is the door tdg_find_profile has always been, kept at its old width. An empty query browses rather than refusing. Moderation-hidden accounts never appear, and neither does the caller.';


-- -- 4 - starring one friend -----------------------------------------------
--
-- `tdg_set_favorites` takes the WHOLE set, which is right for a screen that
-- reorders a list and wrong for a star you press: two presses in flight
-- together each send a set computed before the other landed, and the loser
-- silently un-stars whatever the winner had just starred. A verb that names
-- one person and one direction cannot do that, and it is idempotent, so a
-- double-press and a stale page land on the same answer.
--
-- The set verb is untouched -- an app with a reorder screen sends a whole
-- ordering and should keep doing so.
create or replace function public.tdg_set_favorite(target uuid, on_off boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.tdg_profile_state (user_id) values (me) on conflict (user_id) do nothing;
  update public.tdg_profile_state
     set favorite_ids = case
           -- Only a friend may be a favourite, which is the same rule
           -- `tdg_set_favorites` enforces by filtering its input. Starring
           -- somebody you are not friends with would survive an unfriend and
           -- reappear the day you became friends again.
           when on_off and target = any(friend_ids) and not (target = any(favorite_ids))
             then array_append(favorite_ids, target)
           when not on_off then array_remove(favorite_ids, target)
           else favorite_ids
         end,
         updated_at = now()
   where user_id = me;
end;
$$;

comment on function public.tdg_set_favorite(uuid, boolean) is
  'Star or unstar ONE friend. Idempotent, and it cannot clobber a concurrent press the way resending the whole set through tdg_set_favorites can. Only a friend can be starred.';


-- -- 5 - the three reads that were wrong -----------------------------------
--
-- Signatures byte-for-byte unchanged. `bea_my_friends`, `bea_incoming_requests`
-- and `bea_outgoing_requests` are `select * from` forwarders declaring these
-- exact shapes, so widening any of them would need both halves in one breath
-- and none of them needs widening: the columns were always there, they were
-- being filled with constants.

-- `favorite` was `false` and `sort_order` was `null`, for every friend, always
-- -- while `favorite_ids` and `friend_order` sat on the row being written by
-- two verbs whose whole purpose was to fill them. `array_position` gives the
-- 1-based place in a custom ordering and null for a friend who is not in one,
-- which is exactly what a client sorting by it needs to put the unordered
-- remainder last.
create or replace function public.tdg_my_friends()
returns table (user_id uuid, username text, display_name text, bio text,
               favorite boolean, sort_order integer, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.user_id,
         p.username,
         p.display_name,
         case when public.tdg_can_view(p.user_id, 'bio') then p.bio end,
         fid = any (coalesce(s.favorite_ids, '{}'::uuid[])),
         array_position(coalesce(s.friend_order, '{}'::uuid[]), fid),
         p.created_at
  from public.tdg_profile_state s
  cross join lateral unnest(s.friend_ids) as fid
  join public.profiles p on p.user_id = fid
  where s.user_id = auth.uid()
  -- The default order stays alphabetical. A client that wants the custom one
  -- has `sort_order` and sorts by it; changing what this returns would have
  -- silently reordered a list in an app that is not part of this change.
  order by lower(coalesce(p.display_name, p.username));
$$;

comment on function public.tdg_my_friends() is
  'The caller''s friends, with `favorite` and `sort_order` read from favorite_ids and friend_order - both were hardcoded false/null until 2026-08-28, which had quietly killed both features on every app reading this. Bio is gated on tdg_privacy''s `bio` key rather than shown to every friend.';

create or replace function public.tdg_incoming_requests()
returns table (user_id uuid, username text, display_name text, bio text,
               created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.user_id,
         p.username,
         p.display_name,
         -- Was `p.public_profile`: the two-state mirror of a DIFFERENT key,
         -- which showed a `bio: self` bio to anybody who asked and hid a
         -- `bio: public` one behind a friends-only profile.
         case when public.tdg_can_view(p.user_id, 'bio') then p.bio end,
         case when public.tdg_can_view(p.user_id, 'account_age') then p.created_at end
  from public.tdg_profile_state s
  join public.profiles p on p.user_id = s.user_id
  where auth.uid() = any (s.requested_ids)
    and public.tdg_is_findable(p)
    and not exists (
      select 1 from public.tdg_profile_state mine
      where mine.user_id = auth.uid() and s.user_id = any (mine.blocked_ids)
    )
    and not (auth.uid() = any (s.blocked_ids))
  order by lower(coalesce(p.display_name, p.username));
$$;

comment on function public.tdg_incoming_requests() is
  'People who have asked to be the caller''s friend. Bio and join date are gated on tdg_privacy rather than on profiles.public_profile, which is the mirror of a different key entirely.';

create or replace function public.tdg_outgoing_requests()
returns table (user_id uuid, username text, display_name text, bio text,
               created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.user_id,
         p.username,
         p.display_name,
         case when public.tdg_can_view(p.user_id, 'bio') then p.bio end,
         case when public.tdg_can_view(p.user_id, 'account_age') then p.created_at end
  from public.tdg_profile_state s
  cross join lateral unnest(s.requested_ids) as rid
  join public.profiles p on p.user_id = rid
  where s.user_id = auth.uid()
    and public.tdg_is_findable(p)
  order by lower(coalesce(p.display_name, p.username));
$$;

comment on function public.tdg_outgoing_requests() is
  'Requests the caller has sent and nobody has answered. Bio and join date gated on tdg_privacy - see tdg_incoming_requests.';


-- -- 6 - grants ------------------------------------------------------------
--
-- `authenticated`, never `anon` (supabase/migrations/README.md). Every one of
-- these names a person, which is what disqualifies it from the two exceptions
-- on this project: those are granted to `anon` precisely because they have no
-- identity in them at all.
--
-- `tdg_standing` is internal. It is called by the two functions above, which
-- are SECURITY DEFINER and therefore run it regardless; granting it as well
-- would only add a verb whose whole answer is already in theirs.
revoke all on function public.tdg_standing(uuid)                    from public;
revoke all on function public.tdg_profile(uuid)                     from public;
revoke all on function public.tdg_profile_at(text)                  from public;
revoke all on function public.tdg_search_profiles(text, integer)    from public;
revoke all on function public.tdg_set_favorite(uuid, boolean)       from public;

grant execute on function public.tdg_profile(uuid)                  to authenticated;
grant execute on function public.tdg_profile_at(text)               to authenticated;
grant execute on function public.tdg_search_profiles(text, integer) to authenticated;
grant execute on function public.tdg_set_favorite(uuid, boolean)    to authenticated;
