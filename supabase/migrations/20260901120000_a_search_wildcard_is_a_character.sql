-- ═══════════════════════════════════════════════════════════════════════════
--  A search wildcard is a character
--
--  `tdg_search_profiles` refuses a query shorter than two characters so that
--  an empty box cannot list the membership (20260829010000). It then matched
--  with LIKE and never escaped the query — so `%%` is two characters, passes
--  the floor, and `like '%' || '%%' || '%'` matches every findable account.
--  Measured on the live project before this file, as an ordinary signed-in
--  account: 7 profiles; `%%` answered 5 rows, `__` answered 5 rows, and a real
--  fragment answered 1. Sweeping `a%` … `z%` walks the whole list, which is the
--  directory the previous migration was written to close.
--
--  The fix is the one LIKE has always needed: `%`, `_` and the escape
--  character itself are escaped in the query before it reaches a pattern, and
--  every LIKE carries an explicit `escape '\'` so the rule does not depend on
--  a session setting. The floor is still measured on the raw text, so `%%`
--  still passes it — and then matches nobody, because a literal `%%` is in no
--  handle. Everything else about the function is exactly as it was: the
--  caller's exclusion, moderation-hidden accounts, the handle requirement, the
--  ordering, and the cap.
--
--  Measured after applying, same account, same seven profiles: `%%` → 0,
--  `__` → 0, the real fragment → 1.
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
  v_me   uuid := auth.uid();
  v_q    text := lower(trim(both from replace(coalesce(p_q, ''), '@', '')));
  -- The same text with LIKE's three special characters made literal. Built
  -- from `v_q` AFTER the floor below is measured on `v_q`, so escaping never
  -- lets a one-character query through as a longer one.
  v_like text;
  v_max  integer := greatest(1, least(coalesce(p_limit, 24), 50));
begin
  if v_me is null then
    raise exception 'tdg: sign in first' using errcode = '28000';
  end if;

  if length(v_q) < 2 then
    return;
  end if;

  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

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
           (lower(p.username) like v_like || '%' escape '\'
            or lower(coalesce(p.display_name, '')) like v_like || '%' escape '\') as starts
      from public.profiles p
     where p.user_id <> v_me
       and public.tdg_is_findable(p)
       -- A handle is the address of a profile page, so an account without one
       -- is a row with nowhere to go.
       and coalesce(trim(both from p.username), '') <> ''
       and (lower(p.username) like '%' || v_like || '%' escape '\'
            or lower(coalesce(p.display_name, '')) like '%' || v_like || '%' escape '\')
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
  'Find one person on TDG by part of a name or handle. REQUIRES a query of at least two characters and answers nothing below that, and the query is matched LITERALLY - % and _ are characters in it, never wildcards, so a two-character wildcard cannot list the membership the floor exists to protect. Otherwise unchanged: accounts whose profile the caller may open, plus anyone they already have a standing with, plus an exact handle match, which is the door tdg_find_profile has always been. Moderation-hidden accounts never appear, neither does the caller, and neither does an account with no username.';

revoke all on function public.tdg_search_profiles(text, integer) from public;
grant execute on function public.tdg_search_profiles(text, integer) to authenticated;
