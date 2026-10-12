-- A dual group holds its two parts (name, program, size) itself instead of pointing at other groups.
-- Dual groups made with the old form are converted: the parts are copied from the groups they pointed at,
-- and a second dual made of the same two groups (in the other order) is removed. Safe to run again.

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'group_dual' and column_name = 'member_id') then
    create temp table old_dual on commit drop as
      select d.group_id, array_agg(m.name order by m.name) as names, array_agg(m.program order by m.name) as programs, array_agg(m.size order by m.name) as sizes
      from group_dual d join student_group m on m.id = d.member_id group by d.group_id having count(*) = 2;
    delete from student_group where id in (
      select group_id from (select group_id, row_number() over (partition by names order by group_id) as n from old_dual) x where n > 1);
    drop table group_dual;
    create table group_dual (
      group_id bigint not null references student_group (id) on delete cascade,
      position smallint not null check (position in (1, 2)),
      name     text not null check (name = upper(trim(name)) and name <> ''),
      program  text not null default '',
      size     smallint not null check (size >= 1),
      primary key (group_id, position)
    );
    insert into group_dual (group_id, position, name, program, size)
      select o.group_id, p, o.names[p], o.programs[p], o.sizes[p] from old_dual o, generate_series(1, 2) p
      where exists (select 1 from student_group g where g.id = o.group_id);
    update student_group g set name = o.names[1] || ' ' || o.names[2] from old_dual o where o.group_id = g.id;
  elsif not exists (select 1 from information_schema.tables where table_name = 'group_dual') then
    create table group_dual (
      group_id bigint not null references student_group (id) on delete cascade,
      position smallint not null check (position in (1, 2)),
      name     text not null check (name = upper(trim(name)) and name <> ''),
      program  text not null default '',
      size     smallint not null check (size >= 1),
      primary key (group_id, position)
    );
  end if;
end $$;
-- the same name can't be a part of two dual groups
create unique index if not exists group_dual_name_unique on group_dual (name);
alter table group_dual enable row level security;

select g.name, d.position, d.name as part from group_dual d join student_group g on g.id = d.group_id order by g.name, d.position;
