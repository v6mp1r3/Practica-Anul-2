-- A dual group ("AI-263 R-264") belongs to the speciality of each of its two groups (AI and R), not to a made-up
-- "AI-263 R" speciality. Safe to run again.

create or replace function ensure_group_clusters() returns trigger language plpgsql as $$
begin
  insert into cluster (kind, cycle, year, speciality, language, study_form)
  values ('year', new.cycle, new.year, null, null, null),
         ('language', null, null, null, new.language, null),
         ('form', null, null, null, null, new.study_form)
  on conflict do nothing;
  insert into cluster (kind, cycle, year, speciality, language, study_form)
  select 'speciality', new.cycle, new.year, speciality_of(w), null, null
  from regexp_split_to_table(trim(new.name), '\s+') w
  on conflict do nothing;
  return new;
end $$;

delete from cluster where kind = 'speciality' and speciality ~ '\s';
update student_group set name = name where name ~ '\s';

select kind, speciality, year from cluster where kind = 'speciality' and year = 1 order by speciality;
