-- Clusters: the year (Year 1..4) and the speciality within a year (FAF year 1, TI year 3...), made automatically
-- from the groups, and the tags that link subjects to them. Safe to run again.

create table if not exists cluster (
  id         bigint generated always as identity primary key,
  cycle      study_cycle not null default 'licenta',
  year       smallint not null check (year >= 1),
  speciality text check (speciality is null or speciality = upper(speciality)),
  kind       text generated always as (case when speciality is null then 'year' else 'speciality' end) stored
);
create unique index if not exists cluster_unique on cluster (cycle, year, coalesce(speciality, ''));

create table if not exists subject_cluster (
  subject_id bigint not null references subject (id) on delete cascade,
  cluster_id bigint not null references cluster (id) on delete cascade,
  primary key (subject_id, cluster_id)
);
create index if not exists subject_cluster_cluster_idx on subject_cluster (cluster_id);

create or replace function speciality_of(group_name text) returns text language sql immutable as
  $$ select upper(regexp_replace(group_name, '-\d+$', '')) $$;

create or replace function ensure_group_clusters() returns trigger language plpgsql as $$
begin
  insert into cluster (cycle, year, speciality)
  values (new.cycle, new.year, null), (new.cycle, new.year, speciality_of(new.name))
  on conflict (cycle, year, coalesce(speciality, '')) do nothing;
  return new;
end $$;

drop trigger if exists student_group_clusters on student_group;
create trigger student_group_clusters after insert or update of name, year, cycle on student_group
  for each row execute function ensure_group_clusters();

-- the clusters of the groups that exist now, and the years that always exist
insert into cluster (cycle, year, speciality)
select cycle, year, null::text from student_group
union
select cycle, year, speciality_of(name) from student_group
union
select 'licenta'::study_cycle, y, null::text from generate_series(1, 4) y
union
select 'master'::study_cycle, y, null::text from generate_series(1, 2) y
on conflict do nothing;

-- only the backend reads these tables
alter table cluster enable row level security;
alter table subject_cluster enable row level security;
revoke execute on function speciality_of(text), ensure_group_clusters() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function speciality_of(text), ensure_group_clusters() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function speciality_of(text), ensure_group_clusters() from authenticated;
  end if;
end $$;

select kind, cycle, count(*) as clusters from cluster group by kind, cycle order by cycle, kind;
