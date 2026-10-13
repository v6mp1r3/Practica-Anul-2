-- A teacher can be unavailable in odd weeks only or in even weeks only, besides every week. The rows there are
-- stay "every week". Only unavailability has a week; preferred pairs and the consultation hour are every week.
-- Safe to run again.

alter table teacher_slot_pref add column if not exists parity parity not null default 'weekly';
alter table teacher_slot_pref drop constraint if exists teacher_slot_pref_weekly_unless_unavailable;
alter table teacher_slot_pref add constraint teacher_slot_pref_weekly_unless_unavailable check (parity = 'weekly' or kind = 'unavailable');
alter table teacher_slot_pref drop constraint if exists teacher_slot_pref_pkey;
alter table teacher_slot_pref add primary key (teacher_id, day, slot_index, kind, parity);

select parity, count(*) from teacher_slot_pref group by parity;
