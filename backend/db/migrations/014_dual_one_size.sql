-- A dual group has one number of students (the group's own size), not one per part. Safe to run again.

alter table group_dual drop column if exists size;

select g.name, g.size, d.position, d.name as part, d.program from group_dual d join student_group g on g.id = d.group_id order by g.name, d.position;
