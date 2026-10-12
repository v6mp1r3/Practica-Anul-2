-- Teachers sign in to set their own availability. Safe to run again.
--   app_user.teacher_id: the teacher a 'teacher' account belongs to (one account per teacher)
--   teacher_date_unavailability: pairs a teacher can't hold on one particular date (e.g. next Thursday,
--   pair 3), on top of the usual weekly availability; it does not change the timetable

alter table app_user add column if not exists teacher_id bigint references teacher (id) on delete cascade;
create unique index if not exists app_user_one_per_teacher on app_user (teacher_id) where teacher_id is not null;
alter table app_user drop constraint if exists app_user_teacher_check;
alter table app_user add constraint app_user_teacher_check check (role <> 'teacher' or teacher_id is not null);

create table if not exists teacher_date_unavailability (
  teacher_id bigint not null references teacher (id) on delete cascade,
  date       date not null,
  slot_index smallint not null references time_slot (slot_index),
  primary key (teacher_id, date, slot_index)
);

select count(*) as teacher_accounts from app_user where teacher_id is not null;
