-- A timetable draft may hold two lessons in the same room at the same time: the editor shows the clash and
-- the backend refuses to publish it. The unique index added by schema.sql / supabase_setup.sql blocked saving
-- such drafts, so remove it. Safe to run again.

drop index if exists lesson_room_weekly_unique;

select count(*) as room_time_indexes_left from pg_indexes where indexname = 'lesson_room_weekly_unique';   -- 0
