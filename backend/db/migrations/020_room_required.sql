-- Rooms can be mandatory for subjects and groups ("obligatoriu în această sală"), next to the preferred ones:
-- their classes are held in that room and no other. Safe to run again.

create table if not exists room_required_subject (
  room_id    bigint not null references room (id) on delete cascade,
  subject_id bigint not null references subject (id) on delete cascade,
  primary key (room_id, subject_id)
);

create table if not exists room_required_group (
  room_id  bigint not null references room (id) on delete cascade,
  group_id bigint not null references student_group (id) on delete cascade,
  primary key (room_id, group_id)
);
alter table room_required_subject enable row level security;
alter table room_required_group enable row level security;

select (select count(*) from room_required_subject) as subjects, (select count(*) from room_required_group) as groups;
