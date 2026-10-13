-- The stored conflicts and score of every timetable are worked out again when the data changes (a new
-- teaching load, a teacher's availability, ...). That new score must not look like an edit: updated_at now moves
-- only when the timetable's own fields change (the backend sets it itself when the pairs are saved). Safe to run again.

drop trigger if exists timetable_updated on timetable;
-- a new score after the data changed is not an edit of the timetable: only its own fields move updated_at
create trigger timetable_updated before update on timetable for each row
  when ((old.name, old.status, old.algorithm, old.semester_id) is distinct from (new.name, new.status, new.algorithm, new.semester_id))
  execute function set_updated_at();

select tgname from pg_trigger where tgrelid = 'timetable'::regclass and not tgisinternal;
