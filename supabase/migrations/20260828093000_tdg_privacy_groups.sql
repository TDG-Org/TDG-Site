-- ===========================================================================
-- tdg_privacy_groups() — the headings the privacy list is written under.
--
-- Applied 2026-08-28, minutes after
-- `20260828090000_tdg_privacy_and_table_merges.sql`.
--
-- The catalogue already carried a `group` on every control, and the interface
-- had nothing to CALL those groups. Deriving a heading from the id would have
-- printed `Visibility` / `Page` / `Contact`, which are three category names
-- rather than three questions, and the whole reason these are grouped is that
-- each group answers a different one.
--
-- So the heading is data, in SQL, for the reason every other vocabulary on
-- this project is (`tdg_badge_catalog()`, `tdg_feedback_kinds()`): every TDG
-- app groups the same controls under the same words without either of them
-- writing the words down, and a new group added tomorrow arrives with its
-- heading attached.
--
-- A SEPARATE function rather than two more columns on `tdg_privacy_catalog()`.
-- Widening that one means dropping and recreating it, and `tdg_can_view`,
-- `tdg_my_privacy`, `tdg_set_privacy` and `tdg_set_privacy_many` all depend on
-- it — a `drop ... cascade` to add a line of copy. This is additive, and an
-- app that never asks is unaffected.
--
-- The interface must still give an unknown group a face: a group id here that
-- the site has not been taught to read gets a heading made from its id rather
-- than having its controls dropped (AGENTS.md rule 17). That is the site's
-- job, not this file's.
-- ===========================================================================

create or replace function public.tdg_privacy_groups()
returns table (id text, label text, blurb text, sort integer)
language sql
immutable
set search_path to 'public'
as $$
  select * from (values
    ('visibility', 'Who Can Find You',
     'The switch above all the others. With your profile closed, nothing below it is shown to anybody.', 10),
    ('page',       'What Your Page Shows',
     'Each of these is only ever shown to somebody who can already open your profile.', 20),
    ('contact',    'Who Can Reach You',
     'Not about what people can see. About what people can do.', 30)
  ) as g (id, label, blurb, sort);
$$;

comment on function public.tdg_privacy_groups() is
  'The heading and the line of copy each tdg_privacy_catalog() group is written under. Separate from the catalogue because widening that one would mean dropping every function that depends on it to add a line of prose.';

revoke all on function public.tdg_privacy_groups() from public;
grant execute on function public.tdg_privacy_groups() to authenticated;
