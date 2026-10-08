-- Subjects get the semester of the year and the assessment they have (Midterm 1, Midterm 2, Exam; all by default).
-- Safe to run again.

alter table subject add column if not exists semester smallint not null default 1 check (semester in (1, 2));
alter table subject add column if not exists has_midterm1 boolean not null default true;
alter table subject add column if not exists has_midterm2 boolean not null default true;
alter table subject add column if not exists has_exam boolean not null default true;

-- the old "midterms only" subjects have no exam
update subject set has_exam = false where evaluation = 'atestari' and has_exam;

select count(*) filter (where has_exam) as with_exam, count(*) filter (where not has_exam) as without_exam from subject;
