-- Links app_user to Supabase Auth and makes one Auth user an EduSchedule admin.
-- Paste into the Supabase SQL Editor and Run. Safe to run again.
--
-- Change these two values if needed:
--   the Auth user id (Authentication > Users > the user's "User UID")
--   the faculty code the admin belongs to (an admin always has a faculty)

do $$
begin
  if not exists (select 1 from auth.users where id = '36fee7f0-5c1e-4a9d-a983-a9070a7104ad') then
    raise exception 'No Supabase Auth user with id 36fee7f0-5c1e-4a9d-a983-a9070a7104ad. Check it under Authentication > Users.';
  end if;
  if not exists (select 1 from faculty where code = 'FCIM') then
    raise exception 'Faculty FCIM does not exist. Run supabase_setup.sql first or use another faculty code.';
  end if;
end $$;

-- 1. an app user can be a Supabase Auth user (their password then lives in Supabase Auth, not here)
alter table app_user add column if not exists auth_user_id uuid unique references auth.users (id) on delete cascade;
alter table app_user alter column password_hash drop not null;
alter table app_user drop constraint if exists app_user_has_login;
alter table app_user add constraint app_user_has_login check (password_hash is not null or auth_user_id is not null);

-- 2. make that Auth user an admin of the faculty
insert into app_user (auth_user_id, username, name, email, role, faculty_id)
select u.id,
       coalesce(u.email, u.id::text),
       coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1), 'Admin'),
       u.email,
       'admin',
       f.id
from auth.users u, faculty f
where u.id = '36fee7f0-5c1e-4a9d-a983-a9070a7104ad' and f.code = 'FCIM'
on conflict (auth_user_id) do update set role = 'admin', faculty_id = excluded.faculty_id;

-- Result: one row, role = admin
select a.id, a.auth_user_id, a.username, a.name, a.role, f.code as faculty
from app_user a join faculty f on f.id = a.faculty_id
where a.auth_user_id = '36fee7f0-5c1e-4a9d-a983-a9070a7104ad';
