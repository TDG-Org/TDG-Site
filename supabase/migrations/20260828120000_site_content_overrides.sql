-- ═══════════════════════════════════════════════════════════════════════════
--  Site content overrides · what the TDG site says about our own products,
--  editable from #/dev without a deploy.
--  Applied 2026-08-28 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS IS
--  One jsonb document holding what the site's Content tab has changed about
--  the app, tool and game cards: their order, whether each is shown at all,
--  its words, its cover, its access button, and its own page. Everything the
--  document does NOT mention still comes from `src/data/` in the site repo,
--  which stays the default and the fallback.
--
--  WHY IT IS A DOCUMENT AND NOT A SCHEMA
--  The thing being stored is the shape of `AppCard`, `ToolCard` and `AppPage`
--  in TypeScript — nested arrays of sections, each holding blocks of seven
--  different kinds. Modelling that as tables would put the same shape in two
--  places, in two languages, and every new block type would be a migration
--  before it could be a paragraph. The site validates what it reads and
--  ignores what it cannot understand (`src/content/README.md` says how), so a
--  document that arrives from a newer console than the page reading it
--  degrades to the built-in copy rather than to a blank card.
--
--  WHY THE READ IS GRANTED TO `anon`
--  This is the SECOND exception to `migrations/README.md`'s standing rule that
--  client grants go to `authenticated` and never to `anon`, and it clears the
--  same bar `tdg_public_stats()` does: no parameter, no `auth.uid()`, no
--  refusal to probe with, and a return value that names nobody. What comes
--  back is the text of a public marketing page, which every visitor is about
--  to be shown anyway. A site whose home page could only be read by somebody
--  signed in would not be a site.
--
--  It is deliberately ONE row and ONE verb. A function that took a key could
--  answer differently about different keys, and the moment a read can be
--  steered it stops being the flat, identity-free thing that earns the `anon`
--  grant.
--
--  WHY THE TABLE HAS NO POLICIES
--  RLS is on with no client policies at all, the same boundary as
--  `tdg_feedback` and `tdg_account_badges`: the two verbs below are the whole
--  surface, and the write one opens with `tdg_admin_uid()`. Publishing to the
--  public site is a developer action and it is audited like every other one.
--
--  WHY EVERY PUBLISH KEEPS THE ONE IT REPLACED
--  `tdg_site_content_history` is written by a trigger, so it cannot be
--  forgotten by a future writer. There is no undo anywhere else in this
--  console because everything else it changes is one person's account and is
--  visible to that person; this changes what every visitor reads, and a
--  paragraph deleted by a mis-click has no other copy. Kept to the last 50
--  versions, which is far more than the "put back what I just broke" this is
--  actually for.

begin;

-- ── 1 · the table ──────────────────────────────────────────────────────────
--  One row, forever. `key` exists so the row can be addressed by name rather
--  than by "the only one", and the CHECK keeps it that way: a second document
--  would be a second answer to "what does the site say", and the read verb
--  below takes no argument precisely so there can never be two.
create table if not exists public.tdg_site_content (
  key        text primary key check (key = 'site'),
  doc        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  --  The developer who published it. SET NULL rather than CASCADE: the words
  --  on the site do not stop being the words on the site when the person who
  --  wrote them closes their account.
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.tdg_site_content enable row level security;
revoke all on table public.tdg_site_content from public, anon, authenticated;

insert into public.tdg_site_content (key, doc)
values ('site', '{}'::jsonb)
on conflict (key) do nothing;

--  Every version this document has ever had, newest kept.
create table if not exists public.tdg_site_content_history (
  id       bigint generated always as identity primary key,
  doc      jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by uuid references auth.users (id) on delete set null
);

alter table public.tdg_site_content_history enable row level security;
revoke all on table public.tdg_site_content_history from public, anon, authenticated;

create index if not exists tdg_site_content_history_saved_at_idx
  on public.tdg_site_content_history (saved_at desc);


-- ── 2 · the history trigger ────────────────────────────────────────────────
--  The version being REPLACED is what gets kept, not the new one: that is the
--  copy that would otherwise be gone, and it is the one somebody putting
--  something back wants. A no-op publish (the same document again) writes
--  nothing, so the ring does not fill with fifty identical rows after a
--  session of pressing Publish on an unchanged page.
create or replace function public.tdg_site_content_keep_history()
returns trigger
language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if new.doc is not distinct from old.doc then
    return new;
  end if;

  insert into public.tdg_site_content_history (doc, saved_by)
  values (old.doc, old.updated_by);

  delete from public.tdg_site_content_history h
   where h.id not in (
     select h2.id from public.tdg_site_content_history h2
      order by h2.id desc
      limit 50
   );

  return new;
end;
$fn$;

drop trigger if exists tdg_site_content_history_t on public.tdg_site_content;
create trigger tdg_site_content_history_t
  before update on public.tdg_site_content
  for each row execute function public.tdg_site_content_keep_history();


-- ── 3 · the public read ────────────────────────────────────────────────────
--  What every visitor's browser asks for, once, on the way to painting the
--  home page. No parameter, no identity, no refusal: see the header for why
--  that is what earns the `anon` grant.
--
--  It answers `{}` rather than nothing when the row is somehow missing, so a
--  site reading it falls back to its built-in copy instead of to an error.
create or replace function public.tdg_site_content()
returns jsonb
language sql stable security definer set search_path to 'public'
as $fn$
  select coalesce((select c.doc from public.tdg_site_content c where c.key = 'site'),
                  '{}'::jsonb);
$fn$;


-- ── 4 · the developer's read ───────────────────────────────────────────────
--  The same document plus who published it and when, which the console prints
--  above the editor. Separate from the public read because it names a person,
--  and the moment a function can name somebody it belongs behind
--  `authenticated` with the guard inside it.
create or replace function public.tdg_admin_site_content()
returns table (
  doc             jsonb,
  updated_at      timestamptz,
  updated_by      uuid,
  updated_by_name text,
  versions        integer
)
language plpgsql stable security definer set search_path to 'public'
as $fn$
begin
  perform public.tdg_admin_uid();

  return query
  select c.doc,
         c.updated_at,
         c.updated_by,
         coalesce(nullif(btrim(p.display_name), ''), '@' || p.username, 'nobody yet'),
         (select count(*)::integer from public.tdg_site_content_history)
    from public.tdg_site_content c
    left join public.profiles p on p.user_id = c.updated_by
   where c.key = 'site';
end;
$fn$;


-- ── 5 · the write ──────────────────────────────────────────────────────────
--  Publishing. One verb, the whole document, because the thing being edited is
--  one document: a per-field write would need a path language, and a path
--  language over somebody else's jsonb is a way to write a shape nothing can
--  read.
--
--  `p_note` is one line for the audit trail — "hid Music Everything until the
--  demo lands" — because the log is the only place a publish explains itself.
create or replace function public.tdg_admin_site_content_set(
  p_doc  jsonb,
  p_note text default null
)
returns timestamptz
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_me   uuid := public.tdg_admin_uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_at   timestamptz;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'tdg: the site content has to be a JSON object'
      using errcode = '22023';
  end if;

  --  A ceiling, not a schema. The site validates the shape; this only stops a
  --  runaway paste from becoming a row every visitor has to download.
  if pg_column_size(p_doc) > 512000 then
    raise exception 'tdg: that content document is too large (limit 500 kB)'
      using errcode = '22023';
  end if;

  update public.tdg_site_content
     set doc = p_doc, updated_at = now(), updated_by = v_me
   where key = 'site'
  returning updated_at into v_at;

  if not found then
    insert into public.tdg_site_content (key, doc, updated_by)
    values ('site', p_doc, v_me)
    returning updated_at into v_at;
  end if;

  --  No target account: this changes a page, not a person. `tdg_admin_audit`
  --  already prints a null target as no name, which is the honest answer.
  perform public.tdg_admin_log(null::uuid, 'site-content-publish', v_note);

  return v_at;
end;
$fn$;


-- ── 6 · grants ─────────────────────────────────────────────────────────────
--  `anon` for the flat public read alone, for the reason in the header;
--  `authenticated` for the two that name a person or change one, both of which
--  refuse a non-developer from inside. The grant is not the boundary,
--  `tdg_admin_uid()` is.

revoke all on function
  public.tdg_site_content(),
  public.tdg_admin_site_content(),
  public.tdg_admin_site_content_set(jsonb, text),
  public.tdg_site_content_keep_history()
from public, anon, authenticated;

grant execute on function public.tdg_site_content() to anon, authenticated;

grant execute on function
  public.tdg_admin_site_content(),
  public.tdg_admin_site_content_set(jsonb, text)
to authenticated;

commit;
