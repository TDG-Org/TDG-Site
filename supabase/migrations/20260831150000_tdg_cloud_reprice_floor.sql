--  ═══════════════════════════════════════════════════════════════════════
--  TDG Cloud reprice #2 — the margin floor rises to a dollar, everywhere.
--  ═══════════════════════════════════════════════════════════════════════
--
--  The morning's B2 numbers were profitable at 100% utilization but thin in
--  two cells (Standard annual +$0.87, Studio annual +$0.38). The owner's
--  rule is now: every plan, every cadence, clears MORE THAN A DOLLAR of
--  profit per month even for a subscriber storing every byte of quota — and
--  Studio must stop being a much better per-GB deal than Standard.
--
--  The set (worst case = 100% quota, after Stripe 2.9%+30¢ and 2% B2
--  overhead):
--
--    Standard 250 GB · $2.99/mo · $31.99/yr → +$1.07 / +$1.03  (a matched
--      pair — the annual discount is small ($3.89) precisely so the two
--      cadences carry the same margin)
--    Studio    2 TB · $19.99/mo · $219.99/yr → +$6.58 / +$5.24  (annual
--      saves $19.89 and keeps ~80% of the monthly margin)
--
--  Per-GB fairness between the tiers: Studio lands ~18% cheaper per GB than
--  Standard (0.98¢ vs 1.20¢ monthly) instead of the 39% it was — a normal
--  big-tier edge rather than a steal.
--
--  cloud-provision re-runs after this migration: Standard monthly is
--  untouched (same price id, same link), Standard annual and both Studio
--  cadences get new prices and new DEACTIVATED links, and the superseded
--  links are retired. The stale ids kept here are overwritten by that run.
update public.tdg_cloud_config
   set doc = jsonb_set(jsonb_set(jsonb_set(doc,
       '{plans,standard,annual_cents}',  '3199'),
       '{plans,studio,monthly_cents}',   '1999'),
       '{plans,studio,annual_cents}',    '21999'),
       updated_at = now();
