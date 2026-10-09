-- A subject can be for some specialties only (the prefixes of the group names: FAF, TI, SI…). Two study plans can
-- share a code with a different year: MD in year 1 for FAF, in year 2 for SI. An empty list = every specialty.
-- The specialties join the unique code rule, so each plan keeps its own row. Safe to run again.

alter table subject add column if not exists specialties text[] not null default '{}';

drop index if exists subject_code_unique;
create unique index subject_code_unique on subject (code, cycle, coalesce(faculty_id, 0), language, specialties);
