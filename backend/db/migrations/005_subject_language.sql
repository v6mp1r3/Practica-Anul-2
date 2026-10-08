-- 1. French as a fourth language of instruction (besides Romanian, Russian and English).
-- 2. A subject has a language too: AM taught in Russian is a separate subject from AM in Romanian, for the
--    Russian groups. Both can keep the code AM, so the language joins the unique code rule.
-- Safe to run again. (Run it on its own: a new enum value cannot be used in the same run that adds it.)

alter type study_language add value if not exists 'fr';

alter table subject add column if not exists language study_language not null default 'ro';

drop index if exists subject_code_unique;
create unique index subject_code_unique on subject (code, cycle, coalesce(faculty_id, 0), language);

-- Result: ro, ru, en, fr
select array_agg(e.enumlabel order by e.enumsortorder) as languages
from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'study_language';
