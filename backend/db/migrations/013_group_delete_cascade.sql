-- Deleting a group removes it from the exam timetable too (before, exam events blocked the delete). Safe to run again.

alter table exam_event drop constraint if exists exam_event_group_id_fkey;
alter table exam_event add constraint exam_event_group_id_fkey foreign key (group_id) references student_group (id) on delete cascade;

select count(*) as exam_events from exam_event;
