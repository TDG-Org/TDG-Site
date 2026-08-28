-- DevFleet's badges move onto the shared table, and `devfleet_badges` goes.
--
-- Applied 2026-08-28.
--
-- ## What this finishes
--
-- `20260828090000_tdg_privacy_and_table_merges.sql` merged three tables into the
-- shared TDG family and deliberately left a fourth alone, saying so in its own
-- header: *"`devfleet_badges` is deliberately NOT merged: DevFleet reads it
-- directly and returns its row type out of `devfleet_badge_sync`, and that repo
-- was not part of this change."* This is that change, with the DevFleet repo
-- (`TDG-Org/DevFleet`) open beside it — the two edits land together, because
-- either one alone breaks the app.
--
-- `public.tdg_badges` has superseded this table since the day it was written,
-- and its own comment in Postgres said so out loud. It is keyed `(user_id, app)`
-- rather than `user_id`, so a second app wanting a ladder needs no migration —
-- the same move `tdg_streaks` made over `bea_streaks`. Today it holds `bea` and
-- `veditor` rows; after this it holds `devfleet` too, and `devfleet_badges` is
-- gone along with the writer that returned its row type.
--
-- ## Where `commits` landed, and why it could not go anywhere else
--
-- Four columns had to find a home. Three are the same word on both tables:
-- `epoch`, `contributions` and `earned`. The fourth, `commits`, is the only one
-- `tdg_badges` does not name — deliberately, because naming DevFleet's counters
-- in a shared schema is the thing that table exists to avoid.
--
-- **It becomes `measurements->>'commits'`, and that is not a filing decision —
-- it is the only slot that keeps the property `commits` was built to have.**
-- `supabase/sql/devfleet-badges.sql` in the DevFleet repo stated it plainly:
-- *"`commits` is the one figure that is NOT accumulated, because it is a
-- MEASUREMENT rather than a total ... A high-water mark, so a machine that
-- happens to have fewer repositories checked out cannot take a badge away."*
--
-- The two candidate slots do exactly opposite things with a smaller number:
--
--   * `contributions` is keyed by machine and **replaced** per machine on every
--     sync (`b.contributions || jsonb_build_object(p_machine, v_slot)`), then
--     SUMMED across machines on read. Filing `commits` there breaks the property
--     twice over: a laptop with half the repositories checked out lowers its own
--     slot on its next sync, and two machines holding the same repositories
--     would add their commits together and count every one of them twice.
--   * `measurements` is merged by `public.tdg_measure_max`, an element-wise
--     `greatest()`, and is NOT summed — which is `devfleet_badge_sync`'s
--     `commits = greatest(b.commits, ...)` arriving under a different name. The
--     high-water mark survives byte for byte, and it now survives for every app
--     rather than for this one column.
--
-- So the shape DevFleet reports becomes
-- `p_contribution => {openMs, activeMs, logbooks}`, `p_measurements =>
-- {commits}`, and nothing about what a badge means changes.
--
-- ## What must not move, and does not
--
--   * **No badge loses its date.** `earned` is carried across verbatim on the
--     insert path below, so every `badge id -> ISO date` pair is the byte it
--     already was. A re-stamped date is a badge quietly re-awarded, and the
--     dates in this project's one row go back to 2026-08-21.
--   * **No epoch is re-stamped.** `epoch` is copied from the row being retired,
--     never defaulted to `now()`. It is set once on insert on BOTH tables on
--     purpose, so nothing can make counting start earlier; a fresh `now()` here
--     would be the same failure wearing a migration's clothes, and it would
--     silently re-open the window the epoch exists to close.
--   * **No grant or policy is widened.** `tdg_badges` already carries the shape
--     this table had — `revoke all ... from anon, authenticated`, `grant select`
--     back, a SELECT-own policy and no write policy at all, and a writer closed
--     to `anon`. Nothing here touches any of that, which is why this file adds
--     no new class of advisor warning.
--
-- ## Order
--
-- The data moves first, then the function, then the table. `devfleet_badge_sync`
-- is dropped before `devfleet_badges` because it declares `returns
-- public.devfleet_badges`: the table's row type is in its signature, so dropping
-- the table first would need a `cascade` that takes the function with it
-- silently. Naming both is the same outcome said out loud.

-- --- 1 · Fold into any row that is somehow already there ----------------------
--
-- Measured on this project before applying: `devfleet_badges` holds ONE row and
-- `tdg_badges` holds no `devfleet` row at all, so this statement touches
-- nothing today and step 2 does the whole of the work. It is here because the
-- file has to be right when it is re-read, or run against a restored copy,
-- rather than only on the afternoon it was written.
--
-- Where a row DOES collide, the surviving row keeps its own `epoch` — untouched,
-- exactly as `tdg_badge_sync`'s own conflict branch leaves it. That is the
-- conservative direction as well as the consistent one: a `tdg_badges` epoch can
-- only be LATER than the DevFleet one it would replace, and later means fewer
-- commits count, never more.
update public.tdg_badges t
   set contributions = t.contributions || d.contributions,
       -- The same element-wise greatest() the live writer uses, so a fold and a
       -- sync cannot disagree about what a measurement is.
       measurements  = public.tdg_measure_max(t.measurements, jsonb_build_object('commits', d.commits)),
       -- EARLIEST wins, per badge. Both sides are real historical dates here, so
       -- neither `||` direction is right on its own — the first date a rung was
       -- reached is the one that means anything. `min()` over the text is a
       -- chronological min because both writers store the same ISO-8601 UTC
       -- shape (`toISOString()`), which sorts lexicographically.
       earned        = (
         select coalesce(jsonb_object_agg(k, to_jsonb(v)), '{}'::jsonb)
           from (
             select key as k, min(value) as v
               from (
                 select key, value from jsonb_each_text(t.earned)
                 union all
                 select key, value from jsonb_each_text(d.earned)
               ) both_sides
              group by key
           ) earliest
       ),
       updated_at    = now()
  from public.devfleet_badges d
 where t.user_id = d.user_id
   and t.app = 'devfleet';

-- --- 2 · Carry across every row that had no counterpart ----------------------
--
-- `epoch`, `earned`, `created_at` and `updated_at` are copied, not defaulted.
-- `published` is left to its own default: it is the Bible-Educator-shaped
-- snapshot `20260828090000` added and DevFleet has never written one.
insert into public.tdg_badges (
  user_id, app, epoch, contributions, measurements, earned, created_at, updated_at
)
select d.user_id,
       -- The same id `tdg_store_apps()` derives from `public.devfleet_entitlements`,
       -- so one account's DevFleet packs and DevFleet badges answer to one word.
       'devfleet',
       d.epoch,
       d.contributions,
       jsonb_build_object('commits', d.commits),
       d.earned,
       d.created_at,
       d.updated_at
  from public.devfleet_badges d
on conflict (user_id, app) do nothing;

-- --- 3 · Retire the writer, then the table -----------------------------------

drop function if exists public.devfleet_badge_sync(text, bigint, bigint, integer, integer, jsonb);

drop table if exists public.devfleet_badges;

-- --- 4 · Stop the shared table pointing at one that is gone -------------------
--
-- The old comment ended *"devfleet_badges is the older DevFleet-shaped table
-- that predates this one"*, which was the honest sentence right up until the
-- statement above. A comment naming a dropped relation is the exact drift this
-- project fixes rather than tolerates, so it is corrected in the same file that
-- made it wrong.
comment on table public.tdg_badges is
  'Badges for every TDG app, one row per (account, app). epoch is when counting started for that pairing — the later of the account existing and the app first being used by it — set once on insert so nothing can make counting start earlier. contributions maps a machine id to that machine''s accumulated counters SINCE its own baseline, absolute rather than incremental so a lost or repeated sync costs nothing; the account total is the sum across machines. measurements are high-water marks of things measured about the world rather than accumulated, so a machine seeing less cannot take a badge away — DevFleet''s commits is one. earned maps a badge id to the ISO date it was first reached. published is the snapshot an account has chosen to show publicly. Written only by tdg_badge_sync, which takes no target user and acts on auth.uid(); RLS grants the owner read-only access and no direct client writes. The DevFleet-shaped devfleet_badges that predated this table was merged into it and dropped on 2026-08-28.';
