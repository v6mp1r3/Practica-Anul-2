-- 1. A fourth kind of pair: project (besides lecture, seminar and lab).
-- 2. A teacher's planned weekly load can have halves (a pair held every other week counts 0.5).
-- Run it before loading teachers that teach projects. Safe to run again.
-- (Run it on its own: a new enum value cannot be used in the same run that adds it.)

alter type activity_type add value if not exists 'project';

alter table teacher alter column max_pairs_per_week type numeric(4, 1);
alter table teacher drop constraint if exists teacher_max_pairs_per_week_check;
alter table teacher add constraint teacher_max_pairs_per_week_check check (max_pairs_per_week > 0);

-- Result (reads the catalog, so it does not use the new value yet): lecture, seminar, lab, project
select array_agg(e.enumlabel order by e.enumsortorder) as activity_types
from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'activity_type';
