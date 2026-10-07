-- Teachers of FCIM, 2026/2027, with their planned weekly load.
-- Sources: profesori_FCIM.xlsx (188 rows, 187 teachers) and the timetable on
-- https://fcim.utm.md/orar-sectia-zi-2/ (read in October 2026, 2144 entries of years I-IV).
-- Where the two disagree, the website's version is used. Only the teachers and the kinds of pairs they
-- teach. No teaching loads (assignments).
--
-- name, title:  the website's. Where the website has no title for a teacher (Rusu Felicia) the Excel's is kept.
-- kinds of pairs: those the timetable shows the teacher holding ("Proiect" is its own kind).
-- max_pairs_per_week: the pairs the teacher has per week in the timetable, counted once per distinct day and
--   pair (a lecture shared by several groups is one pair). A pair held every other week counts 0.5.
-- Email and department are in neither source: left empty.
--
-- Where the website's version replaced the Excel's:
--   Names (8), Excel -> website:
--     Ababii Victir -> Ababii Victor
--     Bîtcă Ernest -> Bîtca Ernest
--     Braga Mihail -> Braga Mihai
--     Fistic Cristofor -> Fiștic Cristofor
--     Găidău Mihai -> Gaidău Mihai
--     Scripca Lina -> Scripcă Lina
--     Șișianu Serghiu -> Șișianu Sergiu
--     Veleșcu L. -> Mihail-Veleșcu Lilia
--   Titles (2), Excel -> website:
--     Chirev Pavel: 'lect. univ.' -> 'lect. univ., dr.'
--     Zbancă A.: 'asist. univ.' -> 'conf. univ.'
--   Kinds of pairs (13), Excel -> timetable:
--     Bobicev Victoria: lab, lecture -> lecture, seminar, lab
--     Bonta Eugen: seminar -> seminar, lab
--     Bucicovschi Evghenii: lab -> seminar, lab
--     Buza Dina: seminar -> seminar, lab
--     Cărbune Viorel: lecture, seminar -> lecture
--     Cazac Marin: seminar -> seminar, project
--     Ciobanu Radu: lab, lecture -> lecture, seminar, lab
--     Grosu Olga: seminar -> seminar, lab
--     Istrati Daniela: lecture, seminar -> lecture
--     Lupan Cristian: lab -> lecture, seminar, lab
--     Plămădeală Constantin: seminar -> lecture, seminar
--     Railean Serghei: lab, lecture -> lecture, seminar, lab
--     Saranciuc Dorian: lab, lecture -> lecture, seminar, lab
--   "Litra Dinu" is on two rows of the Excel: one teacher.
--   Not added (they are in the timetable, not in the Excel): Bulai Rodica (lect. univ., 4 pairs), Ciutac Ștefănița (asist. univ., 3 pairs), Istrati Daniel (asist. univ., 8.5 pairs).
--
-- Run backend/db/migrations/004_project_activity_and_half_pairs.sql first (it adds the kind "project" and halves
-- of pairs), in a run of its own. Needs the faculty FCIM (seed.sql).
-- Safe to run twice, and safe on a database that already has some of these teachers (entered by hand, for
-- example): a teacher of FCIM with the same name (ignoring capitals, spaces and diacritics) is not added again,
-- and nothing already in the database is changed. To load a teacher again with new numbers, delete it first.

begin;

with src (name, title, load, types) as (values
  ('Ababii Nicolai', 'conf. univ., dr.', 1, array['lecture']),
  ('Ababii Victor', 'conf. univ., dr.', 4.5, array['lecture', 'seminar']),
  ('Ahramenco Denis', 'asist. univ.', 3, array['lecture', 'seminar']),
  ('Alcaz A.', 'asist. univ.', 8, array['seminar']),
  ('Andrievschi-Bagrin Veronica', 'asist. univ.', 1.5, array['lecture']),
  ('Antohi Ionel', 'asist. univ.', 1, array['lecture']),
  ('Astafi Valentina', 'asist. univ.', 10, array['seminar', 'lab']),
  ('Balamatiuc Eduard', 'asist. univ.', 3, array['seminar']),
  ('Barbaroș Vasile', 'lect. univ.', 2, array['lecture', 'seminar']),
  ('Barcari Dina', 'lect. univ., dr.', 4, array['lecture', 'seminar']),
  ('Belaia Diana', 'asist. univ.', 3, array['seminar']),
  ('Beriozchin Evghenii', 'asist. univ.', 4.5, array['lecture', 'seminar']),
  ('Bernat Oxana', 'asist. univ.', 3, array['lab']),
  ('Beșliu Victor', 'prof. univ., dr.', 8, array['lecture', 'seminar']),
  ('Bîrcă Felix', 'asist. univ.', 1, array['seminar']),
  ('Bîrnaz Adrian', 'asist. univ.', 14, array['seminar', 'lab']),
  ('Bîtca Ernest', 'asist. univ.', 4, array['lecture', 'seminar']),
  ('Blajă Valeriu', 'conf. univ., dr.', 3.5, array['lecture', 'seminar']),
  ('Bobicev Victoria', 'conf. univ., dr.', 5, array['lecture', 'seminar', 'lab']),
  ('Bobu Victor', 'lect. univ.', 1, array['lecture']),
  ('Bodoga Cristina', 'asist. univ.', 5, array['seminar']),
  ('Bogaci Elena', 'asist. univ.', 3, array['seminar']),
  ('Bolea Petru', 'asist. univ.', 4, array['lecture', 'lab']),
  ('Bolun Ion', 'prof. univ., dr. hab.', 2, array['lecture']),
  ('Bonta Eugen', 'asist. univ.', 10.5, array['seminar', 'lab']),
  ('Bostan Viorel', 'prof. univ., dr. hab.', 4, array['lecture']),
  ('Braga Mihai', 'conf. univ., dr.', 7, array['lecture', 'seminar']),
  ('Bragarenco Andrei', 'lect. univ., dr.', 8, array['lecture', 'seminar']),
  ('Braniște Rodica', 'asist. univ.', 9, array['lecture', 'seminar', 'lab']),
  ('Brînză Mihai', 'asist. univ.', 9.5, array['lecture', 'seminar', 'lab']),
  ('Brînzan Leon', 'asist. univ.', 7, array['lecture', 'seminar']),
  ('Bucicovschi Evghenii', 'asist. univ.', 4.5, array['seminar', 'lab']),
  ('Bulai Iurie', 'lect. univ., dr.', 2, array['lecture']),
  ('Bumbu Tudor', 'lect. univ., dr.', 2.5, array['lecture']),
  ('Bunescu Mihai', 'asist. univ.', 3.5, array['seminar']),
  ('Burlacu Natalia', 'conf. univ., dr.', 4.5, array['lecture', 'seminar']),
  ('Buza Dina', 'asist. univ.', 10, array['seminar', 'lab']),
  ('Buzdugan Artur', 'prof. univ., dr. hab.', 5.5, array['lecture', 'seminar']),
  ('Calmîcov Igor', 'conf. univ., dr.', 2, array['lecture', 'lab']),
  ('Cantir L.', 'asist. univ.', 3, array['seminar']),
  ('Capitan Patricia', 'asist. univ.', 1, array['project']),
  ('Cara Alexandr', 'asist. univ.', 1.5, array['seminar']),
  ('Caraus A.', 'asist. univ.', 1.5, array['seminar']),
  ('Cărbune Natalia', 'asist. univ.', 13, array['seminar']),
  ('Cărbune Viorel', 'conf. univ., dr.', 2, array['lecture']),
  ('Catruc Mariana', 'asist. univ.', 8, array['lecture', 'seminar']),
  ('Cazac Artiom', 'asist. univ.', 6, array['lecture', 'seminar', 'lab']),
  ('Cazac Marin', 'lect. univ.', 3, array['seminar', 'project']),
  ('Cazacu Constantin', 'asist. univ.', 1, array['project']),
  ('Cebotari Daria', 'asist. univ.', 3, array['seminar']),
  ('Cernei Irina', 'asist. univ.', 9, array['lecture', 'seminar']),
  ('Chichioi Iuliana', 'asist. univ.', 2.5, array['seminar']),
  ('Chirev Pavel', 'lect. univ., dr.', 4, array['lecture']),
  ('Chiriac Maxim', 'asist. univ.', 17, array['seminar', 'lab']),
  ('Chistol Maxim', 'conf. univ.', 10, array['seminar']),
  ('Ciobanu Radu', 'conf. univ., dr.', 2.5, array['lecture', 'seminar', 'lab']),
  ('Ciorbă Dumitru', 'conf. univ., dr.', 1.5, array['lecture']),
  ('Cojocaru Svetlana', 'asist. univ.', 4, array['seminar']),
  ('Cojocaru Victor', 'conf. univ., dr.', 3, array['lecture', 'seminar']),
  ('Cojuhari Elena', 'conf. univ., dr.', 9.5, array['lecture', 'seminar']),
  ('Colesnic Victor', 'asist. univ.', 9.5, array['seminar']),
  ('Condrea Elena', 'conf. univ.', 2.5, array['lecture', 'seminar']),
  ('Costaș Ana', 'conf. univ.', 9.5, array['lecture', 'seminar']),
  ('Cozari Ana', 'conf. univ.', 1, array['seminar']),
  ('Crețu Vasilii', 'conf. univ., dr.', 12, array['lecture', 'seminar']),
  ('Croitor Elena', 'lect. univ.', 1, array['lecture']),
  ('Cuciurcă A.', 'conf. univ.', 3, array['seminar']),
  ('Danilov Iurie', 'asist. univ.', 6.5, array['lecture', 'seminar']),
  ('Litra Dinu', 'asist. univ.', 19, array['seminar', 'lab']),
  ('Dohotaru Leonid', 'conf. univ., dr.', 6, array['lecture', 'seminar']),
  ('Duca Ludmila', 'asist. univ.', 2.5, array['seminar']),
  ('Duca Mihail', 'asist. univ.', 8, array['lecture', 'seminar']),
  ('Dumitrașcu Marius', 'asist. univ.', 7, array['lecture', 'seminar']),
  ('Dutova L.', 'asist. univ.', 11, array['seminar']),
  ('Falico Nicolae', 'conf. univ., dr.', 6.5, array['lecture', 'seminar']),
  ('Fiodorov Ion', 'conf. univ., dr.', 2, array['lecture']),
  ('Fiștic Cristofor', 'asist. univ.', 8.5, array['seminar']),
  ('Flocea Dominic', 'asist. univ.', 8, array['lecture', 'seminar']),
  ('Gaidău Mihai', 'asist. univ.', 4.5, array['seminar']),
  ('Galcenco Boris', 'lect. univ.', 2, array['lecture']),
  ('Ganea Ion', 'lect. univ., dr.', 10, array['lecture', 'seminar', 'lab']),
  ('Gavrilița Mihail', 'asist. univ.', 4, array['lecture', 'project']),
  ('Gîncu Silviu', 'conf. univ., dr.', 1, array['lecture']),
  ('Gogoi Elena', 'conf. univ., dr.', 4.5, array['lecture', 'seminar']),
  ('Golban Elena', 'asist. univ.', 6, array['seminar', 'lab']),
  ('Gonceari Cristian', 'asist. univ.', 2, array['seminar']),
  ('Gorceag Gheorghe', 'lect. univ.', 3, array['lecture', 'seminar']),
  ('Grama Alexandru', 'asist. univ.', 1.5, array['seminar']),
  ('Graur Elena', 'asist. univ.', 1.5, array['lecture', 'project']),
  ('Grosu Olga', 'asist. univ.', 2, array['seminar', 'lab']),
  ('Gutium Sergiu', 'asist. univ.', 2, array['lab']),
  ('Hodinitu Elena', 'asist. univ.', 10, array['seminar']),
  ('Iachina Elena', 'asist. univ.', 1, array['seminar']),
  ('Istrati Daniela', 'conf. univ., dr.', 1, array['lecture']),
  ('Ivanov Iurie', 'conf. univ.', 1, array['lecture']),
  ('Izvoreanu Bartolomeu', 'conf. univ., dr.', 5.5, array['lecture', 'seminar', 'lab']),
  ('Kapusteanschi Maxim', 'asist. univ.', 7, array['seminar', 'lab']),
  ('Kulev Mihail', 'conf. univ., dr.', 3.5, array['lecture', 'seminar']),
  ('Leah Arcadie', 'asist. univ.', 19, array['seminar']),
  ('Lungu Iulian', 'asist. univ.', 3, array['seminar']),
  ('Lupan Cristian', 'asist. univ.', 8, array['lecture', 'seminar', 'lab']),
  ('Lupan Oleg', 'prof. univ., dr. hab.', 5, array['lecture', 'seminar']),
  ('Maftei Vitalie', 'asist. univ.', 4, array['lecture', 'seminar']),
  ('Magariu Nicolae', 'conf. univ., dr.', 14.5, array['lecture', 'seminar', 'lab']),
  ('Maistru Rodica', 'conf. univ., dr.', 2, array['lecture']),
  ('Macheev Nichita', 'asist. univ.', 3, array['seminar']),
  ('Malîi Antonela', 'asist. univ.', 1, array['project']),
  ('Mandaji Elena', 'conf. univ.', 7, array['seminar']),
  ('Martîniuc Alexei', 'asist. univ.', 2, array['lab']),
  ('Maslova Tatiana', 'asist. univ.', 4, array['lab']),
  ('Melnic Vladimir', 'lect. univ., dr.', 3, array['lecture', 'lab']),
  ('Metlinschi Pavel', 'asist. univ.', 6, array['seminar', 'lab']),
  ('Mîrzac Veaceslav', 'conf. univ.', 2.5, array['seminar']),
  ('Mititelu Vitalie', 'asist. univ.', 8, array['seminar']),
  ('Moraru Dumitru', 'lect. univ., dr.', 4.5, array['lecture']),
  ('Moraru Victor', 'conf. univ., dr.', 2.5, array['lecture', 'seminar']),
  ('Munteanu Eugeniu', 'lect. univ., dr.', 2, array['lecture', 'seminar']),
  ('Munteanu Maxim', 'asist. univ.', 8, array['seminar']),
  ('Munteanu Silvia', 'asist. univ.', 8.5, array['lecture', 'seminar']),
  ('Musteață Mihail', 'asist. univ.', 3, array['seminar']),
  ('Negritu Ghenadie', 'conf. univ.', 10, array['lecture', 'seminar']),
  ('Negru Nicolae', 'asist. univ.', 3, array['seminar']),
  ('Nicolai Felicia', 'asist. univ.', 10.5, array['seminar']),
  ('Nicora Serghei', 'asist. univ.', 3.5, array['seminar']),
  ('Orlov Victor', 'conf. univ.', 10.5, array['lecture', 'seminar']),
  ('Oșovschi Mariana', 'asist. univ.', 11, array['lecture', 'seminar']),
  ('Ovcearenco Oleg', 'asist. univ.', 4.5, array['seminar', 'lab']),
  ('Palamarciuc Nadejda', 'asist. univ.', 10, array['lecture', 'seminar', 'lab']),
  ('Pascari Sergiu', 'asist. univ.', 4, array['seminar', 'lab']),
  ('Paslari Marina', 'asist. univ.', 3, array['seminar']),
  ('Perebinos Mihail', 'conf. univ., dr.', 2.5, array['lecture', 'lab']),
  ('Perevoznic Vladislav', 'asist. univ.', 6, array['seminar']),
  ('Pilețchi Natalia', 'conf. univ.', 1.5, array['lab']),
  ('Pîrțac Constantin', 'conf. univ.', 3.5, array['lecture', 'seminar']),
  ('Plămădeală Constantin', 'lect. univ., dr.', 6.5, array['lecture', 'seminar']),
  ('Pocaznoi Ion', 'conf. univ., dr.', 2, array['lecture']),
  ('Polișciuc Vlad', 'asist. univ.', 3.5, array['seminar']),
  ('Popușoi Anatolie', 'conf. univ.', 2, array['seminar']),
  ('Poștaru Andrei', 'lect. univ., dr.', 2.5, array['lecture', 'seminar']),
  ('Postica Vasile', 'conf. univ., dr.', 2.5, array['lecture']),
  ('Postovan Dumitru', 'lect. univ., dr.', 4, array['lecture']),
  ('Pricop Victor', 'conf. univ.', 14, array['lecture', 'seminar']),
  ('Prodius Cristian', 'asist. univ.', 9, array['seminar']),
  ('Pușcașu Ala', 'asist. univ.', 10, array['seminar']),
  ('Railean Serghei', 'conf. univ., dr.', 7, array['lecture', 'seminar', 'lab']),
  ('Reițman Patricia', 'asist. univ.', 5, array['seminar']),
  ('Repeșcu Vadim', 'conf. univ.', 3, array['lecture', 'seminar']),
  ('Reșetnicov Maxim', 'asist. univ.', 4.5, array['seminar']),
  ('Roșca Neonil', 'asist. univ.', 2.5, array['lecture', 'seminar']),
  ('Rotari Augustina', 'asist. univ.', 4, array['seminar']),
  ('Rotaru Lilia', 'asist. univ.', 11, array['lecture', 'seminar', 'lab']),
  ('Russu Pavlina', 'conf. univ.', 8, array['seminar']),
  ('Rusu Felicia', 'asist. univ.', 1, array['seminar']),
  ('Rusu Mariana', 'lect. univ., dr.', 9, array['lecture', 'seminar']),
  ('Rusu Spiridon', 'conf. univ.', 4, array['lecture', 'seminar']),
  ('Rusu Viorel', 'asist. univ.', 5.5, array['seminar']),
  ('Saranciuc Dorian', 'asist. univ.', 8.5, array['lecture', 'seminar', 'lab']),
  ('Scorohodova Tatiana', 'asist. univ.', 7, array['lecture', 'seminar']),
  ('Scripcă Lina', 'asist. univ.', 3, array['seminar']),
  ('Seniușin Anton', 'asist. univ.', 8, array['seminar', 'lab']),
  ('Sereacov Alexandr', 'asist. univ.', 2, array['lecture']),
  ('Șișianu Ala', 'asist. univ.', 11, array['seminar']),
  ('Șișianu Sergiu', 'conf. univ., dr. hab.', 1, array['lecture']),
  ('Șova M.', 'asist. univ.', 8.5, array['seminar']),
  ('Spatari Andrei', 'asist. univ.', 6, array['seminar', 'lab']),
  ('Stanciu Liuba', 'asist. univ.', 7.5, array['seminar']),
  ('Strucova Tatiana', 'asist. univ.', 2.5, array['lab']),
  ('Strună Vadim', 'asist. univ.', 6.5, array['lecture', 'seminar']),
  ('Subbotchin Vsevolod', 'asist. univ.', 3.5, array['seminar']),
  ('Sudacevschi Viorica', 'conf. univ., dr.', 2, array['lecture']),
  ('Tintiuc Corina', 'asist. univ.', 10.5, array['seminar']),
  ('Toma Olga', 'asist. univ.', 9.5, array['seminar', 'lab']),
  ('Trofim Viorel', 'prof. univ., dr. hab.', 5, array['lecture', 'lab']),
  ('Trubca Dmitrii', 'asist. univ.', 1, array['project']),
  ('Țugulea Valeriu', 'asist. univ.', 5, array['lecture', 'lab']),
  ('Tutunaru Vladina', 'asist. univ.', 12, array['seminar', 'lab']),
  ('Ursu Adriana', 'asist. univ.', 5, array['seminar']),
  ('Vacaraș O.', 'conf. univ.', 7.5, array['lecture', 'seminar']),
  ('Mihail-Veleșcu Lilia', 'asist. univ.', 11, array['seminar']),
  ('Verghizova Olga', 'asist. univ.', 3.5, array['seminar']),
  ('Verjbițki Valeri', 'asist. univ.', 13.5, array['lecture', 'lab']),
  ('Vornicescu Nadina', 'asist. univ.', 6.5, array['seminar']),
  ('Zaica Maia', 'asist. univ.', 15, array['seminar']),
  ('Zalamai Victor', 'conf. univ.', 2, array['seminar']),
  ('Zaleșciuc Maxim', 'asist. univ.', 3, array['seminar']),
  ('Zbancă A.', 'conf. univ.', 10, array['lecture', 'seminar']),
  ('Zgureanu Aureliu', 'conf. univ., dr.', 4.5, array['lecture'])
), added as (
  insert into teacher (name, title, faculty_id, max_pairs_per_week)
  select s.name, s.title, f.id, s.load
  from src s
  cross join faculty f
  where f.code = 'FCIM'
    -- a teacher already in FCIM (same name, ignoring capitals, spaces and diacritics: Bitca = Bîtca) is left as it is
    and not exists (
      select 1 from teacher t
      where t.faculty_id = f.id
        and btrim(regexp_replace(lower(translate(t.name, 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststaaistst')), '\s+', ' ', 'g'))
          = btrim(regexp_replace(lower(translate(s.name, 'ăâîșțşţĂÂÎȘȚŞŢ', 'aaiststaaistst')), '\s+', ' ', 'g'))
    )
  returning id, name
)
insert into teacher_activity_type (teacher_id, activity_type)
select a.id, cast(k as activity_type)
from added a
join src s on s.name = a.name
cross join unnest(s.types) as k;

commit;

-- Check: the teachers of FCIM, their planned loads, and how many teach each kind of pair.
select count(*) as teachers_fcim, sum(max_pairs_per_week) as planned_pairs_in_total
from teacher t join faculty f on f.id = t.faculty_id where f.code = 'FCIM';
select activity_type, count(*) as teachers
from teacher_activity_type tat join teacher t on t.id = tat.teacher_id join faculty f on f.id = t.faculty_id
where f.code = 'FCIM' group by activity_type order by activity_type;
