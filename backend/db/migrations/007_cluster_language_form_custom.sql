-- Clusters by language and by form of study (frecvență, frecvență redusă), made from the groups, and custom clusters
-- made by an administrator. Safe to run again.

alter table cluster drop constraint if exists cluster_kind_check;
alter table cluster drop constraint if exists cluster_name_check;
alter table cluster drop constraint if exists cluster_shape_check;
drop index if exists cluster_unique_language;
drop index if exists cluster_unique_form;
drop index if exists cluster_unique;
-- kind was a generated column; it becomes an ordinary one (the new kinds cannot be worked out from the other columns)
do $$
begin
  if exists (select 1 from pg_attribute where attrelid = 'cluster'::regclass and attname = 'kind' and attgenerated <> '') then
    alter table cluster drop column kind;
  end if;
end $$;
alter table cluster add column if not exists kind text;
update cluster set kind = case when speciality is null then 'year' else 'speciality' end where kind is null;
alter table cluster alter column kind set not null;
alter table cluster add column if not exists language study_language;
alter table cluster add column if not exists study_form study_form;
alter table cluster add column if not exists name text;
alter table cluster alter column cycle drop not null;
alter table cluster alter column cycle drop default;
alter table cluster alter column year drop not null;
alter table cluster add constraint cluster_kind_check check (kind in ('year', 'speciality', 'language', 'form', 'custom'));
alter table cluster add constraint cluster_name_check check (name is null or length(trim(name)) > 0);
alter table cluster add constraint cluster_shape_check check (case kind
    when 'year'       then cycle is not null and year is not null and speciality is null and language is null and study_form is null and name is null
    when 'speciality' then cycle is not null and year is not null and speciality is not null and language is null and study_form is null and name is null
    when 'language'   then language is not null and cycle is null and year is null and speciality is null and study_form is null and name is null
    when 'form'       then study_form is not null and cycle is null and year is null and speciality is null and language is null and name is null
    else name is not null and cycle is null and year is null and speciality is null and language is null and study_form is null end);
create unique index cluster_unique on cluster (cycle, year, coalesce(speciality, '')) where kind in ('year', 'speciality');
create unique index cluster_unique_language on cluster (language) where kind = 'language';
create unique index cluster_unique_form on cluster (study_form) where kind = 'form';
create unique index if not exists cluster_custom_name on cluster (lower(trim(name))) where kind = 'custom';

create table if not exists cluster_group (
  cluster_id bigint not null references cluster (id) on delete cascade,
  group_id   bigint not null references student_group (id) on delete cascade,
  primary key (cluster_id, group_id)
);
create index if not exists cluster_group_group_idx on cluster_group (group_id);
alter table cluster_group enable row level security;

create or replace function ensure_group_clusters() returns trigger language plpgsql as $$
begin
  insert into cluster (kind, cycle, year, speciality, language, study_form)
  values ('year', new.cycle, new.year, null, null, null),
         ('speciality', new.cycle, new.year, speciality_of(new.name), null, null),
         ('language', null, null, null, new.language, null),
         ('form', null, null, null, null, new.study_form)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists student_group_clusters on student_group;
create trigger student_group_clusters after insert or update of name, year, cycle, language, study_form on student_group
  for each row execute function ensure_group_clusters();

insert into cluster (kind, language) select 'language', l from unnest(enum_range(null::study_language)) l on conflict do nothing;
insert into cluster (kind, study_form) select 'form', f from unnest(enum_range(null::study_form)) f on conflict do nothing;

select kind, count(*) as clusters from cluster group by kind order by kind;
