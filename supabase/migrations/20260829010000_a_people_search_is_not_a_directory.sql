-- ═══════════════════════════════════════════════════════════════════════════
-- A people search is not a directory
--
-- Applied 2026-08-29 against tdg-core (ddbksawvchsauiuiwvrl).
--
-- `20260828230000_tdg_people_and_profiles.sql` shipped `tdg_search_profiles`
-- with an empty query meaning **browse**, and wrote a paragraph defending it:
-- *"a box that answers nothing until you have guessed part of a name is a box
-- that cannot be explored."* That paragraph was wrong, and it was wrong in the
-- way that matters — it argued from what makes a nice control instead of from
-- what the product is.
--
-- The report, in the owner's words: *"I should not be seeing every single user
-- with an account in Friends & Social."*
--
-- He is right, and Bible Educator — the app this was asked to be like — never
-- had this. Its Friends & Sharing has one box that takes a `@username` and
-- sends a request, a second that searches the friends you already have, and no
-- way at all to page through the accounts on the project. Listing every
-- account to everybody signed in is a **membership list**, and nobody asked
-- for one: it is a fact about other people, handed out because it happened to
-- be the easiest thing to render.
--
-- So a query is now required, and two characters is the floor:
--
--   ''    -> nothing. Not an error, not a refusal: no rows, and the interface
--            says what to type.
--   'a'   -> nothing. One letter against `display_name ILIKE '%a%'` is the
--            directory again wearing a query, and it is the shape somebody
--            would reach for FIRST if they wanted the list this removes.
--   'ro'  -> a search.
--
-- **The exact-handle door is untouched**, and it is the one this must not
-- close: `tdg_find_profile` has always resolved a full username whoever holds
-- it, so a private account can still be found by somebody who knows how to
-- spell it. A two-character floor cannot reach a handle anyway — the username
-- rule is three characters and up.
--
-- Nothing else about the function changes. Who may appear, the ordering, the
-- exclusion of the caller and of moderation-hidden accounts, and the
-- requirement that a row have a handle to open, are all as they were.
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- The whole of this change. Enforced HERE rather than in one interface,
  -- because the browse it removes was reachable by anybody holding the
  -- publishable key, and a rule that lives in a React hook is a rule the next
  -- client does not have.
  if length(v_q) < 2 then
    return;
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
           lower(p.username) = v_q                       as exact,
           (lower(p.username) like v_q || '%'
            or lower(coalesce(p.display_name, '')) like v_q || '%') as starts
      from public.profiles p
     where p.user_id <> v_me
       and public.tdg_is_findable(p)
       -- A handle is the address of a profile page, so an account without one
       -- is a row with nowhere to go.
       and coalesce(trim(both from p.username), '') <> ''
       and (lower(p.username) like '%' || v_q || '%'
            or lower(coalesce(p.display_name, '')) like '%' || v_q || '%')
  )
  select h.uid, h.uname, h.dname,
         case when h.bio_ok then h.about end,
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
     lower(coalesce(h.dname, h.uname)),
     h.uid
   limit v_max;
end;
$$;

comment on function public.tdg_search_profiles(text, integer) is
  'Find one person on TDG by part of a name or handle. REQUIRES a query of at least two characters and answers nothing below that - an empty box used to list every account on the project, which is a membership list nobody asked for. Otherwise unchanged: accounts whose profile the caller may open, plus anyone they already have a standing with, plus an exact handle match, which is the door tdg_find_profile has always been. Moderation-hidden accounts never appear, neither does the caller, and neither does an account with no username.';

revoke all on function public.tdg_search_profiles(text, integer) from public;
grant execute on function public.tdg_search_profiles(text, integer) to authenticated;
