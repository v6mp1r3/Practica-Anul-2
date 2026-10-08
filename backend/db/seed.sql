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
