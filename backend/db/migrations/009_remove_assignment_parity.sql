-- A teaching load (assignment) no longer has a parity: its pairs are placed every week. The odd/even choice stays
-- on the placed pairs (lessons). The loads that were odd or even keep their number of pairs, now every week; a half
-- pair (1.5) is rounded up, as pairs are placed whole.
-- Safe to run again.

update assignment set pairs_per_week = ceil(pairs_per_week) where pairs_per_week <> floor(pairs_per_week);
alter table assignment drop column if exists parity;

select count(*) as assignments from assignment;
