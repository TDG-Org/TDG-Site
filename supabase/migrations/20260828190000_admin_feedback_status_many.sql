-- ═══════════════════════════════════════════════════════════════════════════
--  Marking feedback read in one go
--  Applied 2026-08-28 to project ddbksawvchsauiuiwvrl (tdg-core).
-- ═══════════════════════════════════════════════════════════════════════════
--
--  WHAT THIS IS
--  `tdg_admin_feedback_set_status_many`, the bulk sibling of
--  `tdg_admin_feedback_set_status`. The console's Feedback tab can now select
--  reports and act on all of them — most often "mark every unread one read
--  after I have copied them into a Claude session" — and doing that one report
--  at a time was one round trip, one row lock and one audit line EACH. Forty
--  reports meant forty of everything and a list that re-read forty times.
--
--  WHY IT IS A NEW VERB AND NOT A WIDER OLD ONE
--  `tdg_admin_feedback_set_status(bigint, text)` is called from the report
--  dialog, where the id is singular and the message it writes names the exact
--  transition — `#142: new → resolved`. That line is worth keeping. Widening
--  its signature would have made every existing caller pass an array to say one
--  thing, and would have cost the specific audit line for the specific case.
--
--  WHAT IT AUDITS
--  ONE row, naming the count and the ids it actually changed: forty audit lines
--  saying the same thing at the same second is a log nobody can read past. Ids
--  that were already in the target status are skipped and are not in the line,
--  because "changed" and "asked about" are different facts and the log should
--  carry the first.
--
--  WHAT IT DOES NOT DO
--  It does not take a filter. The client sends the exact ids it is looking at,
--  so what gets written is what was on screen — a server-side "mark everything
--  matching X" would act on rows the developer never saw, including any that
--  arrived between the page loading and the button being pressed.

begin;

create or replace function public.tdg_admin_feedback_set_status_many(
  p_ids    bigint[],
  p_status text
)
returns integer
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_me      uuid := public.tdg_admin_uid();
  v_status  text := lower(btrim(coalesce(p_status, '')));
  v_ids     bigint[];
  v_changed bigint[];
  v_n       integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'tdg: no reports named' using errcode = '22023';
  end if;
  if not (v_status = any (public.tdg_feedback_statuses())) then
    raise exception 'tdg: unknown feedback status' using errcode = '22023';
  end if;
  --  A ceiling, not a rule about what is sensible. The console's own read is
  --  capped well below this; the number is here so a malformed array cannot
  --  become an unbounded update.
  if array_length(p_ids, 1) > 2000 then
    raise exception 'tdg: too many reports at once (limit 2000)' using errcode = '22023';
  end if;

  --  Deduplicated and sorted, so the same lock order is taken every time and
  --  two developers pressing this at once cannot deadlock on each other.
  select array_agg(distinct x order by x) into v_ids from unnest(p_ids) as x;

  with locked as (
    select f.id
      from public.tdg_feedback f
     where f.id = any (v_ids)
       and f.status is distinct from v_status
     order by f.id
       for update
  ),
  done as (
    update public.tdg_feedback f
       set status = v_status, updated_at = now()
      from locked l
     where f.id = l.id
    returning f.id
  )
  select coalesce(array_agg(id order by id), '{}'::bigint[]) into v_changed from done;

  v_n := coalesce(array_length(v_changed, 1), 0);
  if v_n = 0 then
    return 0;
  end if;

  --  No target account: this is one action over many people's reports, and
  --  `tdg_admin_audit` prints a null target as no name, which is the honest
  --  answer. The ids are in the detail so the line is still traceable.
  perform public.tdg_admin_log(
    null::uuid,
    'feedback-status-many',
    v_n || ' → ' || v_status || ': #' || array_to_string(v_changed, ' #'));

  perform v_me;
  return v_n;
end;
$fn$;

revoke all on function public.tdg_admin_feedback_set_status_many(bigint[], text)
  from public, anon, authenticated;
grant execute on function public.tdg_admin_feedback_set_status_many(bigint[], text)
  to authenticated;

commit;
