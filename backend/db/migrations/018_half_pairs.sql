-- A teaching load can have half pairs again: 0.5 is one pair every other week (odd or even), 1.5 is one every
-- week plus one every other week. Pairs per week go in halves. Safe to run again.

alter table assignment drop constraint if exists assignment_pairs_per_week_check;
alter table assignment add constraint assignment_pairs_per_week_check
  check (pairs_per_week >= 0.5 and pairs_per_week * 2 = floor(pairs_per_week * 2));

select count(*) filter (where pairs_per_week <> floor(pairs_per_week)) as half_pair_loads, count(*) as loads from assignment;
