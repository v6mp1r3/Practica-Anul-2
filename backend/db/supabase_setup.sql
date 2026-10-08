-- EduSchedule: complete setup for the Supabase SQL Editor (schema + reference data).
-- Paste all of it and press Run. Generated from schema.sql and seed.sql in this folder.
-- It stops without changing anything if the public schema already contains tables.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public') then
    raise exception 'The public schema already has tables. This script is for an empty project.';
  end if;
end $$;

-- EduSchedule database schema
-- PostgreSQL 14+ (works on Supabase). Run once on an empty database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/schema.sql
-- Design: see docs/DATABASE.md. 41 tables, every table linked to the others by foreign keys.
-- Days are 0 (Monday) .. 6 (Sunday). slot_index points into time_slot.

-- EduSchedule database schema
-- PostgreSQL 14+ (works on Supabase). Run once on an empty database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/schema.sql
-- Design: see docs/DATABASE.md. 43 tables, every table linked to the others by foreign keys.
-- Days are 0 (Monday) .. 6 (Sunday). slot_index points into time_slot.

-- EduSchedule database schema
-- PostgreSQL 14+ (works on Supabase). Run once on an empty database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/schema.sql
-- Design: see docs/DATABASE.md. 43 tables, every table linked to the others by foreign keys.
-- Days are 0 (Monday) .. 6 (Sunday). slot_index points into time_slot.

-- EduSchedule database schema
-- PostgreSQL 14+ (works on Supabase). Run once on an empty database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/schema.sql
-- Design: Database_Design.pdf (next to the internship report). 43 tables, every table linked to the others by foreign keys.
-- Days are 0 (Monday) .. 6 (Sunday). slot_index points into time_slot.

-- EduSchedule database schema
-- PostgreSQL 14+ (works on Supabase). Run once on an empty database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/schema.sql
-- Design: Database_Design.pdf (next to the internship report). 45 tables, every table linked to the others by foreign keys.
-- Days are 0 (Monday) .. 6 (Sunday). slot_index points into time_slot.

-- EduSchedule database schema
-- PostgreSQL 14+ (works on Supabase). Run once on an empty database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/schema.sql
-- Design: Database_Design.pdf (next to the internship report). 45 tables, every table linked to the others by foreign keys.
-- Days are 0 (Monday) .. 6 (Sunday). slot_index points into time_slot.

begin;

-- ---------------------------------------------------------------- enums
create type study_cycle        as enum ('licenta', 'master');
create type study_form         as enum ('full', 'reduced', 'dual');
create type activity_type      as enum ('lecture', 'seminar', 'lab', 'project');
create type room_type          as enum ('lecture', 'seminar', 'lab');
create type parity             as enum ('weekly', 'odd', 'even');
create type study_language     as enum ('ro', 'ru', 'en', 'fr');
create type stream_origin      as enum ('predefined', 'auto');
create type audience_kind      as enum ('stream', 'group', 'subgroup');
create type evaluation_kind    as enum ('exam', 'atestari');
create type time_format        as enum ('24h', '12h');
create type midterm_mode       as enum ('inClass', 'separate');
create type consultation_mode  as enum ('dayBefore', 'sameDay');
create type slot_pref_kind     as enum ('unavailable', 'preferred', 'consultation');
create type timetable_status   as enum ('draft', 'published', 'variant');
create type change_kind        as enum ('room', 'teacher');
create type job_status         as enum ('running', 'done', 'failed');
create type exam_round         as enum ('midterm1', 'midterm2', 'session', 'remidterm1', 'remidterm2', 'reexam');
create type plan_status        as enum ('draft', 'published');
create type exam_event_kind    as enum ('exam', 'consultation');
create type user_role          as enum ('admin', 'teacher', 'student');
create type notification_kind  as enum ('welcome', 'published', 'unpublished', 'updated', 'availability', 'room-change', 'teacher-change');

-- keeps updated_at current
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- roots: faculty, semester
create table faculty (
  id    bigint generated always as identity primary key,
  code  varchar(16) not null unique,
  name  text not null
);

create table semester (
  id            bigint generated always as identity primary key,
  label         text not null unique,                       -- e.g. Toamna 2026/2027
  academic_year text not null,                              -- e.g. 2026/2027
  season        text not null check (season in ('autumn', 'spring')),
  is_current    boolean not null default false,
  unique (academic_year, season)
);
create unique index semester_one_current on semester (is_current) where is_current;

-- ---------------------------------------------------------------- settings of a semester
create table institution_settings (
  semester_id           bigint primary key references semester (id) on delete cascade,
  institution_name      text not null,
  working_days          smallint not null default 5 check (working_days between 5 and 7),
  lesson_minutes        smallint not null default 90 check (lesson_minutes > 0),
  time_format           time_format not null default '24h',
  week_parity           boolean not null default false,
  max_pairs_day_group   smallint not null default 4 check (max_pairs_day_group > 0),
  min_pairs_day_group   smallint not null default 2 check (min_pairs_day_group > 0),
  max_pairs_day_teacher smallint not null default 5 check (max_pairs_day_teacher > 0),
  consultation_required boolean not null default false,
  check (min_pairs_day_group <= max_pairs_day_group)
);

-- the daily pair grid, shared by all semesters
create table time_slot (
  slot_index smallint primary key check (slot_index >= 0),
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time)
);

create table form_rule (
  semester_id       bigint not null references semester (id) on delete cascade,
  study_form        study_form not null,
  max_pairs_per_day smallint not null check (max_pairs_per_day > 0),
  primary key (semester_id, study_form)
);

create table form_day (
  semester_id bigint not null,
  study_form  study_form not null,
  day         smallint not null check (day between 0 and 6),
  primary key (semester_id, study_form, day),
  foreign key (semester_id, study_form) references form_rule (semester_id, study_form) on delete cascade
);

create table year_shift (
  semester_id bigint not null references semester (id) on delete cascade,
  cycle       study_cycle not null,
  year        smallint not null check (year >= 1),
  first_slot  smallint not null references time_slot (slot_index),
  last_slot   smallint not null references time_slot (slot_index),
  primary key (semester_id, cycle, year),
  check (first_slot <= last_slot)
);

create table reduced_session (
  id          bigint generated always as identity primary key,
  semester_id bigint not null references semester (id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  check (end_date >= start_date)
);

-- ---------------------------------------------------------------- academic calendar (per semester and cycle)
create table academic_calendar (
  semester_id          bigint not null references semester (id) on delete cascade,
  cycle                study_cycle not null,
  semester_start       date not null check (extract(isodow from semester_start) = 1),  -- a Monday
  start_offset_weeks   smallint not null default 0 check (start_offset_weeks >= 0),
  midterm1_week        smallint not null check (midterm1_week > 0),
  midterm2_week        smallint not null check (midterm2_week > 0),
  midterm_span_weeks   smallint not null default 2 check (midterm_span_weeks > 0),
  retake1_week         smallint not null check (retake1_week > 0),
  retake2_week         smallint not null check (retake2_week > 0),
  midterm_mode         midterm_mode not null default 'inClass',
  midterm_minutes      smallint not null default 90 check (midterm_minutes > 0),
  exam_min_gap         smallint not null default 1 check (exam_min_gap >= 0),
  exam_from            time not null default '08:00',
  exam_to              time not null default '18:00',
  exam_minutes         smallint not null default 135 check (exam_minutes > 0),
  consultation_mode    consultation_mode not null default 'dayBefore',
  consultation_minutes smallint not null default 90 check (consultation_minutes > 0),
  reexam_from          time not null default '13:00',
  reexam_to            time not null default '19:00',
  reexam_minutes       smallint not null default 90 check (reexam_minutes > 0),
  primary key (semester_id, cycle),
  check (midterm1_week < midterm2_week),
  check (exam_to > exam_from),
  check (reexam_to > reexam_from)
);

create table calendar_day_rule (
  semester_id bigint not null,
  cycle       study_cycle not null,
  kind        text not null check (kind in ('exam', 'reduced_exam')),
  day         smallint not null check (day between 0 and 6),
  primary key (semester_id, cycle, kind, day),
  foreign key (semester_id, cycle) references academic_calendar (semester_id, cycle) on delete cascade
);

create table calendar_period (
  id          bigint generated always as identity primary key,
  semester_id bigint not null,
  cycle       study_cycle not null,
  kind        text not null check (kind in ('exam_session', 'reduced_exam_session', 'reexam_session', 'vacation')),
  name        text,                                         -- used for vacations
  start_date  date not null,
  end_date    date not null,
  check (end_date >= start_date),
  foreign key (semester_id, cycle) references academic_calendar (semester_id, cycle) on delete cascade
);

-- only the admin's changes to the computed holidays are stored
create table holiday_override (
  semester_id bigint not null,
  cycle       study_cycle not null,
  holiday_key text not null,                                -- e.g. '2026:winter'
  start_date  date,
  end_date    date,
  primary key (semester_id, cycle, holiday_key),
  check ((start_date is null) = (end_date is null)),        -- both NULL = holiday hidden
  check (end_date is null or end_date >= start_date),
  foreign key (semester_id, cycle) references academic_calendar (semester_id, cycle) on delete cascade
);

create table midterm_start_time (
  semester_id bigint not null,
  cycle       study_cycle not null,
  start_time  time not null,
  primary key (semester_id, cycle, start_time),
  foreign key (semester_id, cycle) references academic_calendar (semester_id, cycle) on delete cascade
);

-- ---------------------------------------------------------------- accounts
create table app_user (
  id                  bigint generated always as identity primary key,
  username            text not null unique,
  password_hash       text not null,                        -- bcrypt
  name                text not null,
  role                user_role not null default 'admin',
  faculty_id          bigint references faculty (id) on delete restrict,
  email               text unique,
  phone               text,
  avatar_url          text,
  email_notifications boolean not null default false,
  created_at          timestamptz not null default now(),
  check (role <> 'admin' or faculty_id is not null)
);

-- ---------------------------------------------------------------- people and rooms
create table teacher (
  id                 bigint generated always as identity primary key,
  name               text not null,
  title              text,
  department         text,
  faculty_id         bigint references faculty (id) on delete set null,   -- NULL = teaches across faculties
  email              text unique,
  max_pairs_per_week numeric(4, 1) not null check (max_pairs_per_week > 0)   -- planned load in pairs; an odd/even-week pair counts 0.5
);
create index teacher_faculty_idx on teacher (faculty_id);

create table teacher_activity_type (
  teacher_id    bigint not null references teacher (id) on delete cascade,
  activity_type activity_type not null,
  primary key (teacher_id, activity_type)
);

create table teacher_slot_pref (
  teacher_id bigint not null references teacher (id) on delete cascade,
  day        smallint not null check (day between 0 and 6),
  slot_index smallint not null references time_slot (slot_index),
  kind       slot_pref_kind not null,
  primary key (teacher_id, day, slot_index, kind)
);
create unique index teacher_one_consultation on teacher_slot_pref (teacher_id) where kind = 'consultation';

create table teacher_exam_unavailability (
  teacher_id bigint not null references teacher (id) on delete cascade,
  date       date not null,
  part       text not null check (part in ('day', 'am', 'pm')),  -- am = before 13:00, pm = from 13:00
  primary key (teacher_id, date, part)
);

create table room (
  id         bigint generated always as identity primary key,
  name       text not null,
  building   text not null,
  faculty_id bigint references faculty (id) on delete set null,       -- NULL = shared room
  capacity   smallint not null check (capacity >= 1),
  room_type  room_type not null,
  unique (building, name)
);
create index room_faculty_idx on room (faculty_id);

create table equipment (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create table room_equipment (
  room_id      bigint not null references room (id) on delete cascade,
  equipment_id bigint not null references equipment (id) on delete restrict,
  primary key (room_id, equipment_id)
);

-- ---------------------------------------------------------------- students and curriculum
create table student_group (
  id            bigint generated always as identity primary key,
  name          text not null unique check (name = upper(name)),      -- e.g. FAF-251
  program       text not null,
  faculty_id    bigint not null references faculty (id) on delete restrict,
  cycle         study_cycle not null default 'licenta',
  year          smallint not null check (year >= 1),
  program_years smallint not null,
  study_form    study_form not null default 'full',
  language      study_language not null default 'ro',                -- language of instruction
  size          smallint not null check (size >= 1),
  subgroups     smallint not null default 1 check (subgroups between 1 and 4),   -- 1 = not split
  check (year <= program_years),
  check ((cycle = 'licenta' and program_years between 3 and 6) or (cycle = 'master' and program_years between 1 and 2))
);
create index student_group_faculty_idx on student_group (faculty_id);

-- internships, final-year exam sessions, plagiarism checks and licence exams of particular groups
create table group_period (
  id          bigint generated always as identity primary key,
  semester_id bigint not null references semester (id) on delete cascade,
  kind        text not null check (kind in ('internship', 'examSession', 'plagiarism', 'licence')),
  start_date  date not null,
  end_date    date not null,
  check (end_date >= start_date)
);

create table group_period_group (
  period_id bigint not null references group_period (id) on delete cascade,
  group_id  bigint not null references student_group (id) on delete cascade,
  primary key (period_id, group_id)
);
create index group_period_group_idx on group_period_group (group_id);

create table subject (
  id            bigint generated always as identity primary key,
  code          text not null check (code = upper(code)),
  name          text not null,
  credits       numeric(4, 1) not null check (credits >= 0),
  year          smallint not null check (year between 1 and 6),
  semester      smallint not null default 1 check (semester in (1, 2)),   -- semester of the year
  faculty_id    bigint references faculty (id) on delete set null,    -- NULL = shared by all faculties
  cycle         study_cycle not null default 'licenta',
  language      study_language not null default 'ro',                -- language it is taught in (for the groups of that language)
  evaluation    evaluation_kind not null default 'exam',            -- kept in step with has_exam
  has_midterm1  boolean not null default true,                        -- assessment: Midterm 1, Midterm 2, Exam
  has_midterm2  boolean not null default true,
  has_exam      boolean not null default true,
  edge_of_day   boolean not null default false,                       -- first or last pair of the day (e.g. sport)
  lecture_pairs numeric(3, 1) not null default 0 check (lecture_pairs >= 0),   -- pairs per week, 0.5 = every other week
  seminar_pairs numeric(3, 1) not null default 0 check (seminar_pairs >= 0),
  lab_pairs     numeric(3, 1) not null default 0 check (lab_pairs >= 0)
);
create unique index subject_code_unique on subject (code, cycle, coalesce(faculty_id, 0), language);
create index subject_faculty_idx on subject (faculty_id);

-- A stream (torent) is the set of groups that attend one lecture together.
--  * auto:       built from the lecture itself. AM can have TI-261, TI-262, IA-261, IA-262 while PC has
--                TI-261, TI-262, SI-261, SI-262. One row per subject and member set (see get_or_create_stream).
--  * predefined: a fixed stream such as FAF, reused for every subject.
create table stream (
  id           bigint generated always as identity primary key,
  origin       stream_origin not null default 'auto',
  name         text,                                         -- required for predefined; auto streams get a generated label
  subject_id   bigint references subject (id) on delete cascade,      -- the lecture an auto stream belongs to
  faculty_id   bigint references faculty (id) on delete restrict,     -- owner of a predefined stream
  members_hash text not null default '',                     -- md5 of the member group ids, kept by trigger
  check (
    (origin = 'predefined' and subject_id is null     and name is not null and faculty_id is not null) or
    (origin = 'auto'       and subject_id is not null)
  ),
  -- one auto stream per subject and member set; checked at commit because members are added one by one
  constraint stream_subject_members_unique unique (subject_id, members_hash) deferrable initially deferred
);
create unique index stream_predefined_name on stream (faculty_id, name) where origin = 'predefined';

create table stream_group (
  stream_id bigint not null references stream (id) on delete cascade,
  group_id  bigint not null references student_group (id) on delete cascade,
  primary key (stream_id, group_id)
);
create index stream_group_group_idx on stream_group (group_id);

create function refresh_stream_hash() returns trigger language plpgsql as $$
declare sid bigint := coalesce(new.stream_id, old.stream_id);
begin
  update stream
     set members_hash = coalesce((select md5(string_agg(group_id::text, ',' order by group_id)) from stream_group where stream_id = sid), '')
   where id = sid;
  return null;
end $$;
create trigger stream_group_hash after insert or update or delete on stream_group
  for each row execute function refresh_stream_hash();

-- Finds the auto stream of a lecture for exactly these groups, or creates it. Returns the stream id.
create function get_or_create_stream(p_subject bigint, p_groups bigint[]) returns bigint language plpgsql as $$
declare
  ids  bigint[];
  h    text;
  sid  bigint;
begin
  select array_agg(g order by g) into ids from (select distinct unnest(p_groups) as g) x;
  if coalesce(array_length(ids, 1), 0) < 2 then
    raise exception 'a stream needs at least 2 groups; use a group audience for one group';
  end if;
  select md5(string_agg(g::text, ',' order by g)) into h from unnest(ids) g;
  select id into sid from stream where origin = 'auto' and subject_id = p_subject and members_hash = h;
  if sid is null then
    insert into stream (origin, subject_id, name)
      select 'auto', s.id, s.code || ': ' || (select string_agg(name, ', ' order by name) from student_group where id = any (ids))
      from subject s where s.id = p_subject
      returning id into sid;
    if sid is null then raise exception 'subject % does not exist', p_subject; end if;
    insert into stream_group (stream_id, group_id) select sid, unnest(ids);
  end if;
  return sid;
end $$;

-- Clusters: the year (Year 1..4) and the speciality within a year (FAF year 1, TI year 3...). They are made
-- automatically from the groups (trigger below): FAF-261 gives "year 1" and "FAF, year 1". A subject is tagged
-- with the clusters it belongs to (subject_cluster). A cluster is never deleted automatically, so tags stay when
-- the last group of a speciality is removed.
create table cluster (
  id         bigint generated always as identity primary key,
  cycle      study_cycle not null default 'licenta',
  year       smallint not null check (year >= 1),
  speciality text check (speciality is null or speciality = upper(speciality)),     -- NULL = the whole year
  kind       text generated always as (case when speciality is null then 'year' else 'speciality' end) stored
);
create unique index cluster_unique on cluster (cycle, year, coalesce(speciality, ''));

create table subject_cluster (
  subject_id bigint not null references subject (id) on delete cascade,
  cluster_id bigint not null references cluster (id) on delete cascade,
  primary key (subject_id, cluster_id)
);
create index subject_cluster_cluster_idx on subject_cluster (cluster_id);

-- FAF-261 -> FAF (the group name without its number)
create function speciality_of(group_name text) returns text language sql immutable as
  $$ select upper(regexp_replace(group_name, '-\d+$', '')) $$;

create function ensure_group_clusters() returns trigger language plpgsql as $$
begin
  insert into cluster (cycle, year, speciality)
  values (new.cycle, new.year, null), (new.cycle, new.year, speciality_of(new.name))
  on conflict (cycle, year, coalesce(speciality, '')) do nothing;
  return new;
end $$;
create trigger student_group_clusters after insert or update of name, year, cycle on student_group
  for each row execute function ensure_group_clusters();

create table room_preferred_subject (
  room_id    bigint not null references room (id) on delete cascade,
  subject_id bigint not null references subject (id) on delete cascade,
  primary key (room_id, subject_id)
);

create table room_preferred_group (
  room_id  bigint not null references room (id) on delete cascade,
  group_id bigint not null references student_group (id) on delete cascade,
  primary key (room_id, group_id)
);

-- teaching load: who teaches which activity of a subject to which audience
create table assignment (
  id                bigint generated always as identity primary key,
  subject_id        bigint not null references subject (id) on delete cascade,
  teacher_id        bigint not null references teacher (id) on delete cascade,
  activity_type     activity_type not null,
  audience_kind     audience_kind not null,
  stream_id         bigint references stream (id) on delete cascade,
  group_id          bigint references student_group (id) on delete cascade,
  subgroup_no       smallint check (subgroup_no between 1 and 4),
  pairs_per_week    numeric(3, 1) not null check (pairs_per_week >= 1),
  pairs_per_session numeric(3, 1) check (pairs_per_session > 0),      -- reduced-attendance groups
  parity            parity not null default 'weekly',
  room_type         room_type not null,
  check (
    (audience_kind = 'stream'   and stream_id is not null and group_id is null     and subgroup_no is null) or
    (audience_kind = 'group'    and group_id  is not null and stream_id is null    and subgroup_no is null) or
    (audience_kind = 'subgroup' and group_id  is not null and subgroup_no is not null and stream_id is null)
  )
);
create unique index assignment_unique on assignment
  (subject_id, activity_type, teacher_id, audience_kind, coalesce(stream_id, 0), coalesce(group_id, 0), coalesce(subgroup_no, 0));
create index assignment_teacher_idx on assignment (teacher_id);
create index assignment_group_idx   on assignment (group_id);
create index assignment_stream_idx  on assignment (stream_id);

-- an auto stream belongs to one subject; a predefined stream can be used by any subject
create function check_assignment_stream() returns trigger language plpgsql as $$
begin
  if new.stream_id is not null and not exists (
       select 1 from stream where id = new.stream_id and (origin = 'predefined' or subject_id = new.subject_id)) then
    raise exception 'stream % belongs to another subject', new.stream_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger assignment_stream_check before insert or update on assignment
  for each row execute function check_assignment_stream();

create table assignment_equipment (
  assignment_id bigint not null references assignment (id) on delete cascade,
  equipment_id  bigint not null references equipment (id) on delete restrict,
  primary key (assignment_id, equipment_id)
);

-- ---------------------------------------------------------------- timetables
create table timetable (
  id              bigint generated always as identity primary key,
  semester_id     bigint not null references semester (id) on delete restrict,
  name            text not null,
  status          timetable_status not null default 'draft',
  algorithm       text,
  score_hard      integer check (score_hard >= 0),
  score_soft      numeric(10, 2) check (score_soft >= 0),
  score_breakdown jsonb,                                              -- the nine penalty counters
  created_by      bigint references app_user (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index timetable_one_published on timetable (semester_id) where status = 'published';
create index timetable_semester_idx on timetable (semester_id, status);
create trigger timetable_updated before update on timetable for each row execute function set_updated_at();

create table timetable_group (
  timetable_id bigint not null references timetable (id) on delete cascade,
  group_id     bigint not null references student_group (id) on delete cascade,
  primary key (timetable_id, group_id)
);
create index timetable_group_group_idx on timetable_group (group_id);

create table lesson (
  id            bigint generated always as identity primary key,
  timetable_id  bigint not null references timetable (id) on delete cascade,
  assignment_id bigint not null references assignment (id) on delete cascade,
  day           smallint not null check (day between 0 and 6),
  slot_index    smallint not null references time_slot (slot_index),
  room_id       bigint not null references room (id) on delete restrict,
  parity        parity not null default 'weekly',
  locked        boolean not null default false,                       -- hand-edited, the solver keeps it
  lesson_date   date                                                  -- only for reduced-attendance sessions
);
create index lesson_timetable_idx  on lesson (timetable_id, day, slot_index);
create index lesson_room_idx       on lesson (room_id, day, slot_index);
create index lesson_assignment_idx on lesson (assignment_id);
-- No uniqueness rule on room + time: a draft may hold clashes, the editor shows them and the backend
-- validator (publish) refuses a timetable that has them.

create table schedule_change (
  id            bigint generated always as identity primary key,
  change_date   date not null,
  assignment_id bigint not null references assignment (id) on delete cascade,
  slot_index    smallint not null references time_slot (slot_index),
  kind          change_kind not null,
  from_room_id  bigint not null references room (id) on delete restrict,
  room_id       bigint references room (id) on delete restrict,       -- new room
  teacher_id    bigint references teacher (id) on delete restrict,    -- substitute teacher
  note          text,
  created_at    timestamptz not null default now(),
  unique (change_date, assignment_id, slot_index, kind),
  check (
    (kind = 'room'    and room_id is not null and room_id <> from_room_id and teacher_id is null) or
    (kind = 'teacher' and teacher_id is not null and room_id is null)
  )
);
create index schedule_change_date_idx on schedule_change (change_date);

create table generation_job (
  id          bigint generated always as identity primary key,
  created_by  bigint references app_user (id) on delete set null,
  status      job_status not null default 'running',
  progress    smallint not null default 0 check (progress between 0 and 100),
  params      jsonb not null,                                         -- group ids, variants, iterations, seed, base timetable
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  check (finished_at is null or finished_at >= started_at)
);

create table generation_job_timetable (
  job_id       bigint not null references generation_job (id) on delete cascade,
  timetable_id bigint not null references timetable (id) on delete cascade,
  primary key (job_id, timetable_id)
);

-- ---------------------------------------------------------------- exams and atestări
create table exam_plan (
  id          bigint generated always as identity primary key,
  semester_id bigint not null references semester (id) on delete cascade,
  faculty_id  bigint not null references faculty (id) on delete cascade,
  round       exam_round not null,
  status      plan_status not null default 'draft',
  updated_at  timestamptz not null default now(),
  unique (semester_id, faculty_id, round)
);
create trigger exam_plan_updated before update on exam_plan for each row execute function set_updated_at();

create table exam_event (
  id          bigint generated always as identity primary key,
  plan_id     bigint not null references exam_plan (id) on delete cascade,
  kind        exam_event_kind not null,
  subject_id  bigint not null references subject (id) on delete restrict,
  group_id    bigint not null references student_group (id) on delete restrict,
  teacher_id  bigint not null references teacher (id) on delete restrict,
  room_id     bigint not null references room (id) on delete restrict,
  event_date  date not null,
  start_time  time not null,
  end_time    time not null,
  lesson_id   bigint references lesson (id) on delete set null,       -- atestare held in a class
  subgroup_no smallint check (subgroup_no between 1 and 4),
  check (end_time > start_time)
);
create index exam_event_plan_idx    on exam_event (plan_id);
create index exam_event_room_idx    on exam_event (event_date, room_id);
create index exam_event_teacher_idx on exam_event (event_date, teacher_id);
create index exam_event_group_idx   on exam_event (event_date, group_id);

-- ---------------------------------------------------------------- notifications
create table notification (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       notification_kind,
  params     jsonb,
  title      text not null,
  body       text not null,
  roles      user_role[] not null default '{}'                        -- empty = everyone
);

create table notification_group (
  notification_id bigint not null references notification (id) on delete cascade,
  group_id        bigint not null references student_group (id) on delete cascade,
  primary key (notification_id, group_id)
);

create table notification_teacher (
  notification_id bigint not null references notification (id) on delete cascade,
  teacher_id      bigint not null references teacher (id) on delete cascade,
  primary key (notification_id, teacher_id)
);

create table notification_read (
  notification_id bigint not null references notification (id) on delete cascade,
  user_id         bigint not null references app_user (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ---------------------------------------------------------------- security
-- Only the backend talks to the database (it connects with a role that bypasses RLS).
-- Turning RLS on with no policies keeps Supabase's public API (anon / authenticated roles) locked out.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- The helper functions are for the backend only. Supabase grants EXECUTE on new functions to anon / authenticated,
-- which would expose them through its public API; take that away.
revoke execute on all functions in schema public from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on all functions in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on all functions in schema public from authenticated;
  end if;
end $$;

commit;

-- EduSchedule reference data: what the app needs before the dean's office adds anything.
-- Taken from the frontend (domain/utm.ts, data/seed.ts, domain/exams.ts). Run after schema.sql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/seed.sql

begin;

insert into faculty (code, name) values
  ('FCIM',  'Facultatea Calculatoare, Informatică și Microelectronică'),
  ('FET',   'Facultatea Electronică și Telecomunicații'),
  ('FEIE',  'Facultatea Energetică și Inginerie Electrică'),
  ('FIMIT', 'Facultatea Inginerie Mecanică, Industrială și Transporturi'),
  ('FUA',   'Facultatea Urbanism și Arhitectură'),
  ('FCG',   'Facultatea Construcții și Geodezie'),
  ('FD',    'Facultatea Design'),
  ('FIEB',  'Facultatea Inginerie Economică și Business'),
  ('FTA',   'Facultatea Tehnologia Alimentelor'),
  ('FSASM', 'Facultatea Științe Agricole, Silvice și ale Mediului'),
  ('FMV',   'Facultatea Medicină Veterinară'),
  ('FDR',   'Facultatea de Drept'),
  ('FEI',   'Facultatea de Economie și Inginerie'),
  ('FSE',   'Facultatea de Științe ale Educației');

insert into time_slot (slot_index, start_time, end_time) values
  (0, '08:00', '09:30'), (1, '09:45', '11:15'), (2, '11:30', '13:00'), (3, '13:30', '15:00'),
  (4, '15:15', '16:45'), (5, '17:00', '18:30'), (6, '18:45', '20:15');

insert into semester (label, academic_year, season, is_current)
values ('Toamna 2026/2027', '2026/2027', 'autumn', true);

-- everything below belongs to that semester
insert into institution_settings (semester_id, institution_name, working_days, lesson_minutes, time_format,
                                  week_parity, max_pairs_day_group, min_pairs_day_group, max_pairs_day_teacher, consultation_required)
select id, 'Universitatea Tehnică a Moldovei', 7, 90, '24h', true, 4, 2, 5, true from semester where is_current;

insert into form_rule (semester_id, study_form, max_pairs_per_day)
select s.id, v.f::study_form, v.m from semester s, (values ('full', 4), ('reduced', 6), ('dual', 4)) v (f, m) where s.is_current;

insert into form_day (semester_id, study_form, day)
select s.id, v.f::study_form, d
from semester s,
     (values ('full', array[0,1,2,3,4]), ('reduced', array[0,1,2,3,4,5,6]), ('dual', array[0,1,2,3,4])) v (f, days),
     unnest(v.days) d
where s.is_current;

-- licență: year 1 morning, year 2 midday, years 3+ after lunch. master's: evening.
insert into year_shift (semester_id, cycle, year, first_slot, last_slot)
select s.id, v.c::study_cycle, v.y, v.f, v.l
from semester s,
     (values ('licenta', 1, 0, 3), ('licenta', 2, 1, 4), ('licenta', 3, 3, 6), ('licenta', 4, 3, 6), ('licenta', 5, 3, 6), ('licenta', 6, 3, 6),
             ('master', 1, 4, 6), ('master', 2, 4, 6)) v (c, y, f, l)
where s.is_current;

insert into reduced_session (semester_id, start_date, end_date)
select s.id, v.a::date, v.b::date from semester s, (values ('2026-10-12', '2026-10-25'), ('2027-01-11', '2027-01-24')) v (a, b) where s.is_current;

insert into academic_calendar (semester_id, cycle, semester_start, start_offset_weeks, midterm1_week, midterm2_week, midterm_span_weeks,
                               retake1_week, retake2_week, midterm_mode, midterm_minutes, exam_min_gap, exam_from, exam_to, exam_minutes,
                               consultation_mode, consultation_minutes, reexam_from, reexam_to, reexam_minutes)
select id, 'licenta'::study_cycle, '2026-08-31'::date, 0, 7, 14, 2, 9, 15, 'inClass'::midterm_mode, 90, 1, '08:00'::time, '18:00'::time, 135, 'dayBefore'::consultation_mode, 90, '13:00'::time, '19:00'::time, 90
from semester where is_current
union all
select id, 'master'::study_cycle,  '2026-08-31'::date, 4, 6, 11, 2, 9, 13, 'inClass'::midterm_mode, 90, 1, '16:00'::time, '20:30'::time, 135, 'sameDay'::consultation_mode, 90, '16:00'::time, '20:30'::time, 90
from semester where is_current;

insert into calendar_day_rule (semester_id, cycle, kind, day)
select s.id, v.c::study_cycle, v.k, d
from semester s,
     (values ('licenta', 'exam', array[0,1,2,3,4]), ('licenta', 'reduced_exam', array[0,1,2,3,4,5,6]),
             ('master',  'exam', array[0,1,2,3,4,5]), ('master',  'reduced_exam', array[0,1,2,3,4,5,6])) v (c, k, days),
     unnest(v.days) d
where s.is_current;

insert into calendar_period (semester_id, cycle, kind, start_date, end_date)
select s.id, v.c::study_cycle, v.k, v.a::date, v.b::date
from semester s,
     (values ('licenta', 'exam_session',         '2026-12-14', '2026-12-26'),
             ('licenta', 'exam_session',         '2027-01-11', '2027-01-23'),
             ('licenta', 'reduced_exam_session', '2027-01-25', '2027-02-06'),
             ('licenta', 'reexam_session',       '2027-01-25', '2027-02-06'),
             ('master',  'exam_session',         '2027-01-11', '2027-01-30'),
             ('master',  'reduced_exam_session', '2027-01-25', '2027-02-06'),
             ('master',  'reexam_session',       '2027-02-01', '2027-02-06')) v (c, k, a, b)
where s.is_current;

insert into midterm_start_time (semester_id, cycle, start_time)
select s.id, c::study_cycle, t::time
from semester s, (values ('licenta'), ('master')) cy (c), (values ('15:15'), ('17:00'), ('18:45')) tt (t)
where s.is_current;

-- the year clusters that always exist (licență 1-4, master's 1-2); the others are made from the groups
insert into cluster (cycle, year)
select 'licenta'::study_cycle, y from generate_series(1, 4) y
union all
select 'master'::study_cycle, y from generate_series(1, 2) y
on conflict do nothing;

commit;

-- Result: should show 45 tables, 72 foreign keys, 45 with row level security, 14 faculties, 7 time slots.
select
  (select count(*) from pg_tables where schemaname = 'public')                                   as tables,
  (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public')                                              as foreign_keys,
  (select count(*) from pg_tables where schemaname = 'public' and rowsecurity)                   as tables_with_rls,
  (select count(*) from faculty)                                                                 as faculties,
  (select count(*) from time_slot)                                                               as time_slots;
