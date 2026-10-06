-- Smoke test for the schema. Needs schema.sql and seed.sql applied. Changes nothing: it rolls back at the end.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/smoke_test.sql
-- First a full chain of valid data, then bad rows that the database must reject.

begin;

-- ---- valid data: group, teacher, room, subject, assignment, timetable, lesson, change, exam, notification
insert into student_group (name, program, faculty_id, year, program_years, language, size, subgroups)
  select g.n, g.p, f.id, 2, 4, g.l::study_language, 28, 2
  from faculty f, (values ('FAF-251', 'Ingineria Software', 'ro'), ('FAF-252', 'Ingineria Software', 'ro'),
                          ('TI-261', 'Tehnologia Informației', 'ro'), ('IA-261', 'Inteligența Artificială', 'en'),
                          ('SI-261', 'Securitate Informatică', 'ru')) g (n, p, l)
  where f.code = 'FCIM';
insert into teacher (name, title, department, faculty_id, email, max_pairs_per_week)
  select 'Daniel Rusu', 'lect. univ.', 'Ingineria Software', id, 'daniel.rusu@example.md', 12 from faculty where code = 'FCIM';
insert into teacher (name, title, department, faculty_id, email, max_pairs_per_week)
  select 'Maria Ciobanu', 'conf. univ., dr.', 'Matematică', id, 'maria.ciobanu@example.md', 10 from faculty where code = 'FCIM';
insert into teacher_activity_type select id, 'lecture' from teacher where name = 'Daniel Rusu';
insert into teacher_slot_pref select id, 4, 4, 'unavailable' from teacher where name = 'Daniel Rusu';
insert into teacher_slot_pref select id, 2, 3, 'consultation' from teacher where name = 'Daniel Rusu';
insert into teacher_exam_unavailability select id, '2026-12-15', 'am' from teacher where name = 'Daniel Rusu';
insert into room (name, building, capacity, room_type) values ('3-404', 'Corp 3', 60, 'lecture'), ('3-405', 'Corp 3', 60, 'lecture');
insert into equipment (name) values ('proiector');
insert into room_equipment select r.id, e.id from room r, equipment e where r.name = '3-404';
insert into subject (code, name, credits, year, faculty_id, lecture_pairs, seminar_pairs)
  select 'PW', 'Programare Web', 5, 2, id, 1, 1 from faculty where code = 'FCIM';
insert into subject (code, name, credits, year, faculty_id, lecture_pairs)
  select v.c, v.n, 5, 2, f.id, 1 from faculty f, (values ('AM', 'Analiză Matematică'), ('PC', 'Programare Concurentă')) v (c, n) where f.code = 'FCIM';
-- predefined stream FAF, reused by every subject
insert into stream (origin, name, faculty_id) select 'predefined', 'FAF', id from faculty where code = 'FCIM';
insert into stream_group select st.id, g.id from stream st, student_group g where st.name = 'FAF' and g.name like 'FAF-%';
-- automatic streams: AM = FAF-251, FAF-252, TI-261, IA-261; PC = FAF-251, FAF-252, TI-261, SI-261
select get_or_create_stream((select id from subject where code = 'AM'), array(select id from student_group where name in ('FAF-251', 'FAF-252', 'TI-261', 'IA-261')));
select get_or_create_stream((select id from subject where code = 'PC'), array(select id from student_group where name in ('FAF-251', 'FAF-252', 'TI-261', 'SI-261')));
select get_or_create_stream((select id from subject where code = 'PW'), array(select id from student_group where name like 'FAF-%'));
insert into room_preferred_group select r.id, g.id from room r, student_group g where r.name = '3-404' and g.name = 'FAF-251';
insert into room_preferred_subject select r.id, s.id from room r, subject s where r.name = '3-404';
insert into assignment (subject_id, teacher_id, activity_type, audience_kind, group_id, subgroup_no, pairs_per_week, room_type)
  select s.id, t.id, 'lab', 'subgroup', g.id, 1, 1, 'lab' from subject s, teacher t, student_group g where t.name = 'Daniel Rusu' and s.code = 'PW' and g.name = 'FAF-251';
-- lecture of PW for its automatic stream; lectures of AM and PC for the predefined FAF stream
insert into assignment (subject_id, teacher_id, activity_type, audience_kind, stream_id, pairs_per_week, room_type)
  select s.id, t.id, 'lecture', 'stream', st.id, 1, 'lecture' from subject s join stream st on st.subject_id = s.id, teacher t
  where t.name = 'Daniel Rusu' and s.code = 'PW';
insert into assignment (subject_id, teacher_id, activity_type, audience_kind, stream_id, pairs_per_week, room_type)
  select s.id, t.id, 'lecture', 'stream', st.id, 1, 'lecture' from subject s, teacher t, stream st
  where t.name = 'Daniel Rusu' and s.code in ('AM', 'PC') and st.name = 'FAF';
insert into assignment_equipment select a.id, e.id from assignment a, equipment e, subject s where a.subject_id = s.id and s.code = 'PW' and a.audience_kind = 'stream';
insert into app_user (username, password_hash, name, faculty_id)
  select 'elena.popescu', '$2b$12$placeholderplaceholderplaceholderplaceholderplaceh', 'Elena Popescu', id from faculty where code = 'FCIM';
insert into timetable (semester_id, name, status, created_by, score_hard, score_soft, score_breakdown)
  select s.id, 'Orar toamna 2026', 'published', u.id, 0, 12.5, '{"teacherGaps": 3}' from semester s, app_user u where s.is_current;
insert into timetable_group select t.id, g.id from timetable t, student_group g;
insert into lesson (timetable_id, assignment_id, day, slot_index, room_id)
  select t.id, a.id, 1, 2, r.id from timetable t, assignment a, subject s, room r where a.subject_id = s.id and s.code = 'PW' and a.audience_kind = 'stream' and r.name = '3-404';
insert into schedule_change (change_date, assignment_id, slot_index, kind, from_room_id, room_id)
  select '2026-10-06', a.id, 2, 'room', r1.id, r2.id from assignment a, subject s, room r1, room r2 where a.subject_id = s.id and s.code = 'PW' and a.audience_kind = 'stream' and r1.name = '3-404' and r2.name = '3-405';
insert into generation_job (created_by, params) select id, '{"groupIds": [1], "variants": 3}' from app_user;
insert into generation_job_timetable select j.id, t.id from generation_job j, timetable t;
insert into exam_plan (semester_id, faculty_id, round)
  select s.id, f.id, 'session' from semester s, faculty f where s.is_current and f.code = 'FCIM';
insert into exam_event (plan_id, kind, subject_id, group_id, teacher_id, room_id, event_date, start_time, end_time, lesson_id)
  select p.id, 'exam', s.id, g.id, t.id, r.id, '2026-12-16', '10:00', '12:15', l.id
  from exam_plan p, subject s, student_group g, teacher t, room r, lesson l where t.name = 'Daniel Rusu' and r.name = '3-404';
insert into notification (kind, params, title, body, roles) values ('published', '{"name": "Orar toamna 2026"}', 'Orar publicat', 'A fost publicat un orar nou.', '{student,teacher}');
insert into notification_group select n.id, g.id from notification n, student_group g;
insert into notification_teacher select n.id, t.id from notification n, teacher t;
insert into notification_read select n.id, u.id from notification n, app_user u;

-- ---- seeded reference data is in place
do $$ begin
  assert (select count(*) from faculty) = 14, 'faculties';
  assert (select count(*) from time_slot) = 7, 'time slots';
  assert (select count(*) from academic_calendar) = 2, 'calendars';
  assert (select count(*) from year_shift) = 8, 'year shifts';
end $$;

-- ---- streams: one per lecture and member set, predefined ones shared
do $$
declare am bigint := (select id from subject where code = 'AM');
        a1 bigint; a2 bigint;
begin
  a1 := get_or_create_stream(am, array(select id from student_group where name in ('FAF-251', 'FAF-252', 'TI-261', 'IA-261')));
  a2 := get_or_create_stream(am, array(select id from student_group where name in ('IA-261', 'TI-261', 'FAF-252', 'FAF-251', 'FAF-251')));
  assert a1 = a2, 'the same lecture and groups must give the same stream';
  assert (select count(*) from stream where origin = 'auto' and subject_id = am) = 1, 'one auto stream for AM';
  assert (select count(distinct id) from stream where origin = 'auto') = 3, 'AM, PC and PW each have their own auto stream';
  assert (select count(distinct members_hash) from stream where origin = 'auto') = 3, 'AM, PC and PW streams have different groups';
  assert (select count(*) from stream_group where stream_id = a1) = 4, 'AM stream has 4 groups';
  assert (select name from stream where id = a1) like 'AM: %', 'auto stream gets a readable name';
  assert (select count(distinct subject_id) from assignment where stream_id = (select id from stream where name = 'FAF')) = 2, 'FAF is used by two subjects';
  assert (select language from student_group where name = 'IA-261') = 'en', 'group language';
  assert (select language from student_group where name = 'FAF-251') = 'ro', 'language defaults to ro';
end $$;

-- ---- bad data must be rejected
create function pg_temp.must_fail(label text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when check_violation or unique_violation or foreign_key_violation or not_null_violation or invalid_text_representation or raise_exception then
    return;   -- rejected, as it should be
  end;
  raise exception 'NOT REJECTED: %', label;
end $$;

select pg_temp.must_fail('group year above program_years',
  $q$ insert into student_group (name, program, faculty_id, year, program_years, size) select 'X-1', 'p', id, 5, 4, 20 from faculty limit 1 $q$);
select pg_temp.must_fail('group with 5 subgroups',
  $q$ insert into student_group (name, program, faculty_id, year, program_years, size, subgroups) select 'X-2', 'p', id, 1, 4, 20, 5 from faculty limit 1 $q$);
select pg_temp.must_fail('master with 4 program years',
  $q$ insert into student_group (name, program, faculty_id, cycle, year, program_years, size) select 'X-3', 'p', id, 'master', 1, 4, 20 from faculty limit 1 $q$);
select pg_temp.must_fail('lowercase group name',
  $q$ insert into student_group (name, program, faculty_id, year, program_years, size) select 'x-4', 'p', id, 1, 4, 20 from faculty limit 1 $q$);
select pg_temp.must_fail('room with zero capacity', $q$ insert into room (name, building, capacity, room_type) values ('Z', 'Corp 9', 0, 'lecture') $q$);
select pg_temp.must_fail('duplicate room name in a building', $q$ insert into room (name, building, capacity, room_type) values ('3-404', 'Corp 3', 30, 'lab') $q$);
select pg_temp.must_fail('slot ends before it starts', $q$ insert into time_slot values (9, '10:00', '09:00') $q$);
select pg_temp.must_fail('stream assignment that also sets a group',
  $q$ insert into assignment (subject_id, teacher_id, activity_type, audience_kind, stream_id, group_id, pairs_per_week, room_type)
      select s.id, t.id, 'lecture', 'stream', st.id, g.id, 1, 'lecture' from subject s, teacher t, stream st, student_group g limit 1 $q$);
select pg_temp.must_fail('lecture of PC given to the automatic stream of AM',
  $q$ insert into assignment (subject_id, teacher_id, activity_type, audience_kind, stream_id, pairs_per_week, room_type)
      select (select id from subject where code = 'PC'), t.id, 'lecture', 'stream', st.id, 1, 'lecture'
      from teacher t, stream st where t.name = 'Maria Ciobanu' and st.subject_id = (select id from subject where code = 'AM') $q$);
select pg_temp.must_fail('predefined stream tied to a subject',
  $q$ insert into stream (origin, name, faculty_id, subject_id) select 'predefined', 'X', f.id, s.id from faculty f, subject s limit 1 $q$);
select pg_temp.must_fail('predefined stream without a name', $q$ insert into stream (origin, faculty_id) select 'predefined', id from faculty limit 1 $q$);
select pg_temp.must_fail('automatic stream without a subject', $q$ insert into stream (origin, name) values ('auto', 'orfan') $q$);
select pg_temp.must_fail('two predefined streams with the same name', $q$ insert into stream (origin, name, faculty_id) select 'predefined', 'FAF', id from faculty where code = 'FCIM' $q$);
select pg_temp.must_fail('a stream of one group', $q$ select get_or_create_stream((select id from subject where code = 'AM'), array(select id from student_group where name = 'FAF-251')) $q$);
select pg_temp.must_fail('group with an unknown language', $q$ insert into student_group (name, program, faculty_id, year, program_years, language, size) select 'DE-1', 'p', id, 1, 4, 'de', 10 from faculty limit 1 $q$);
select pg_temp.must_fail('subgroup assignment without a subgroup number',
  $q$ insert into assignment (subject_id, teacher_id, activity_type, audience_kind, group_id, pairs_per_week, room_type)
      select s.id, t.id, 'lab', 'subgroup', g.id, 1, 'lab' from subject s, teacher t, student_group g limit 1 $q$);
select pg_temp.must_fail('the same assignment twice',
  $q$ insert into assignment (subject_id, teacher_id, activity_type, audience_kind, group_id, subgroup_no, pairs_per_week, room_type)
      select s.id, t.id, 'lab', 'subgroup', g.id, 1, 1, 'lab' from subject s, teacher t, student_group g where t.name = 'Daniel Rusu' $q$);
select pg_temp.must_fail('lesson in a room that does not exist',
  $q$ insert into lesson (timetable_id, assignment_id, day, slot_index, room_id) select t.id, a.id, 2, 1, -1 from timetable t, assignment a limit 1 $q$);
select pg_temp.must_fail('lesson on day 7', $q$ insert into lesson (timetable_id, assignment_id, day, slot_index, room_id) select t.id, a.id, 7, 1, r.id from timetable t, assignment a, room r limit 1 $q$);
select pg_temp.must_fail('lesson in a slot that is not in the grid', $q$ insert into lesson (timetable_id, assignment_id, day, slot_index, room_id) select t.id, a.id, 1, 9, r.id from timetable t, assignment a, room r limit 1 $q$);
select pg_temp.must_fail('two weekly lessons in one room at one time',
  $q$ insert into lesson (timetable_id, assignment_id, day, slot_index, room_id)
      select t.id, a.id, 1, 2, r.id from timetable t, assignment a, room r where a.audience_kind = 'subgroup' and r.name = '3-404' $q$);
select pg_temp.must_fail('second published timetable in a semester',
  $q$ insert into timetable (semester_id, name, status) select id, 'altul', 'published' from semester where is_current $q$);
select pg_temp.must_fail('room change without a new room',
  $q$ insert into schedule_change (change_date, assignment_id, slot_index, kind, from_room_id) select '2026-10-07', a.id, 1, 'room', r.id from assignment a, room r limit 1 $q$);
select pg_temp.must_fail('room change to the same room',
  $q$ insert into schedule_change (change_date, assignment_id, slot_index, kind, from_room_id, room_id) select '2026-10-07', a.id, 1, 'room', r.id, r.id from assignment a, room r limit 1 $q$);
select pg_temp.must_fail('teacher change that also sets a room',
  $q$ insert into schedule_change (change_date, assignment_id, slot_index, kind, from_room_id, room_id, teacher_id) select '2026-10-07', a.id, 1, 'teacher', r.id, r.id, t.id from assignment a, room r, teacher t limit 1 $q$);
select pg_temp.must_fail('two consultation slots for one teacher', $q$ insert into teacher_slot_pref select id, 3, 3, 'consultation' from teacher where name = 'Daniel Rusu' $q$);
select pg_temp.must_fail('admin without a faculty', $q$ insert into app_user (username, password_hash, name) values ('x', 'h', 'X') $q$);
select pg_temp.must_fail('semester start that is not a Monday',
  $q$ insert into academic_calendar (semester_id, cycle, semester_start, midterm1_week, midterm2_week, retake1_week, retake2_week)
      select id, 'licenta', '2026-09-01', 7, 14, 9, 15 from semester where is_current $q$);
select pg_temp.must_fail('exam that ends before it starts',
  $q$ insert into exam_event (plan_id, kind, subject_id, group_id, teacher_id, room_id, event_date, start_time, end_time)
      select p.id, 'exam', s.id, g.id, t.id, r.id, '2026-12-17', '12:00', '10:00' from exam_plan p, subject s, student_group g, teacher t, room r limit 1 $q$);
select pg_temp.must_fail('two exam plans for the same faculty and round',
  $q$ insert into exam_plan (semester_id, faculty_id, round) select s.id, f.id, 'session' from semester s, faculty f where s.is_current and f.code = 'FCIM' $q$);
select pg_temp.must_fail('holiday override with only one date', $q$ insert into holiday_override select semester_id, cycle, '2026:x', '2026-12-30', null from academic_calendar limit 1 $q$);
select pg_temp.must_fail('two current semesters', $q$ insert into semester (label, academic_year, season, is_current) values ('Primavara 2027', '2026/2027', 'spring', true) $q$);

-- ---- delete behaviour
select pg_temp.must_fail('deleting a room that lessons use', $q$ delete from room where name = '3-404' $q$);
select pg_temp.must_fail('deleting a teacher who has exam events', $q$ delete from teacher where name = 'Daniel Rusu' $q$);
delete from exam_event;
delete from teacher where name = 'Daniel Rusu';   -- cascades to assignments, lessons, changes
do $$ begin
  assert (select count(*) from assignment) = 0, 'assignments should be gone with their teacher';
  assert (select count(*) from lesson) = 0, 'lessons should be gone with their assignments';
  assert (select count(*) from schedule_change) = 0, 'changes should be gone with their assignments';
end $$;

select 'smoke test passed' as result;
rollback;
