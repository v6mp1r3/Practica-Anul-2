-- A subject no longer has a language. The copies of a subject that existed once per language (AM in Romanian,
-- Russian, English...) are merged into one, keeping the Romanian copy (else English, Russian, French), and what
-- pointed at the other copies (teaching loads, torents, exam events, preferred rooms, cluster tags) moves to it.
-- Run it in one transaction. Safe to run again.

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'subject' and column_name = 'language') then
    create temp table subject_keep on commit drop as
      select id, first_value(id) over (partition by code, cycle, coalesce(faculty_id, 0)
                                       order by array_position(array['ro', 'en', 'ru', 'fr'], language::text), id) as keep_id
      from subject;
    delete from subject_keep where id = keep_id;

    update stream set subject_id = k.keep_id from subject_keep k where stream.subject_id = k.id;
    update assignment set subject_id = k.keep_id from subject_keep k where assignment.subject_id = k.id;
    update exam_event set subject_id = k.keep_id from subject_keep k where exam_event.subject_id = k.id;
    insert into room_preferred_subject (room_id, subject_id)
      select r.room_id, k.keep_id from room_preferred_subject r join subject_keep k on k.id = r.subject_id on conflict do nothing;
    insert into subject_cluster (subject_id, cluster_id)
      select k.keep_id, s.cluster_id from subject_cluster s join subject_keep k on k.id = s.subject_id on conflict do nothing;
    delete from subject where id in (select id from subject_keep);

    drop index if exists subject_code_unique;
    alter table subject drop column language;
    create unique index subject_code_unique on subject (code, cycle, coalesce(faculty_id, 0));
  end if;
end $$;

select count(*) as subjects from subject;
