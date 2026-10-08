-- A subject can have an abbreviation, shown in the timetable instead of its code. Safe to run again.

alter table subject add column if not exists abbreviation text;
alter table subject drop constraint if exists subject_abbreviation_check;
alter table subject add constraint subject_abbreviation_check check (abbreviation is null or length(trim(abbreviation)) > 0);

select count(*) as subjects from subject;
