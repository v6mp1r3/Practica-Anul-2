-- A project can be held by several teachers at once: the assignment keeps its main teacher (teacher_id) and lists
-- the others here. They are busy in the same pairs as the main teacher. Safe to run again.

create table if not exists assignment_co_teacher (
  assignment_id bigint not null references assignment (id) on delete cascade,
  teacher_id    bigint not null references teacher (id) on delete cascade,
  primary key (assignment_id, teacher_id)
);
create index if not exists assignment_co_teacher_teacher_idx on assignment_co_teacher (teacher_id);
alter table assignment_co_teacher enable row level security;

select count(*) as co_teachers from assignment_co_teacher;
