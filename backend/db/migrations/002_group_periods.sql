-- Adds group periods (internships, final-year exam sessions, plagiarism checks, licence exams).
-- For a database that already ran supabase_setup.sql before these tables existed. Safe to run again.

create table if not exists group_period (
  id          bigint generated always as identity primary key,
  semester_id bigint not null references semester (id) on delete cascade,
  kind        text not null check (kind in ('internship', 'examSession', 'plagiarism', 'licence')),
  start_date  date not null,
  end_date    date not null,
  check (end_date >= start_date)
);

create table if not exists group_period_group (
  period_id bigint not null references group_period (id) on delete cascade,
  group_id  bigint not null references student_group (id) on delete cascade,
  primary key (period_id, group_id)
);
create index if not exists group_period_group_idx on group_period_group (group_id);

alter table group_period enable row level security;
alter table group_period_group enable row level security;

select count(*) as tables from pg_tables where schemaname = 'public';   -- 43 after both migrations
