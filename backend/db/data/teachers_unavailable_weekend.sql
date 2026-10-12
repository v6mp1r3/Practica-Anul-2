-- Every teacher is unavailable on Saturday and Sunday (every pair), as new teachers are by default.
-- A weekend pair a teacher had marked "preferred" becomes unavailable; a consultation hour on a weekend is kept.
-- Safe to run again.

delete from teacher_slot_pref where kind = 'preferred' and day in (5, 6);

insert into teacher_slot_pref (teacher_id, day, slot_index, kind)
select t.id, d.day, s.slot_index, 'unavailable'
from teacher t
cross join (values (5), (6)) as d (day)
cross join time_slot s
where not exists (select 1 from teacher_slot_pref c where c.teacher_id = t.id and c.day = d.day and c.slot_index = s.slot_index and c.kind = 'consultation')
on conflict do nothing;

select count(*) as teachers, count(*) filter (where n = 14) as with_the_whole_weekend
from (select t.id, count(p.*) as n from teacher t left join teacher_slot_pref p on p.teacher_id = t.id and p.day in (5, 6) and p.kind = 'unavailable' group by t.id) x;
