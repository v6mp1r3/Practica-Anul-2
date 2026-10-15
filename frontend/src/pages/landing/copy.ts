// Landing page text in the three interface languages. Facts come from the
// internship report (Domain Analysis, §1.1 and §1.4).
import type { Lang } from '../../i18n';

export interface LandingCopy {
  /** scheduleShort: the same button on a narrow phone */
  nav: { login: string; open: string; schedule: string; scheduleShort: string };
  hero: { title: string; text: string; preview: string };
  features: { title: string; text: string; items: { title: string; text: string }[] };
  footer: { project: string; team: string };
}

export const copy: Record<Lang, LandingCopy> = {
  ro: {
    nav: {
      login: 'Administrare',
      open: 'Administrare',
      schedule: 'Vezi orarul',
      scheduleShort: 'Orarul',
    },
    hero: {
      title: 'Orarul universității, construit automat.',
      text: 'EduSchedule construiește orarul pentru grupe, torente și subgrupe, ține cont de săptămânile pare și impare și îți propune mai multe variante. Tu alegi una, o ajustezi și o publici.',
      preview: 'Orarul grupei FAF-251, generat chiar acum în browser',
    },
    features: {
      title: 'Făcut pentru cum lucrează o facultate.',
      text: 'Un orar gândit pentru universitate: grupe academice, torente și laboratoare.',
      items: [
        {
          title: 'Grupe, torente, subgrupe',
          text: 'Cursuri comune pentru mai multe grupe, seminare pe grupe și laboratoare pe subgrupe, în același orar.',
        },
        {
          title: 'Săptămâni pare și impare',
          text: 'O singură întrebare în configurare. Perechile la două săptămâni nu mai trebuie introduse de două ori.',
        },
        {
          title: 'Mai multe variante',
          text: 'Compari variantele una lângă alta: ferestre, perechi la 08:00, zile încărcate. Decizia rămâne a ta.',
        },
        {
          title: 'Conflicte detectate pe loc',
          text: 'Profesor, sală sau grupă ocupate de două ori, sală prea mică sau fără echipament: le vezi înainte de publicare.',
        },
        {
          title: 'Editare prin tragere',
          text: 'Muți o pereche cu mouse-ul și vezi imediat dacă locul e liber. Perechile fixate nu se mută la regenerare.',
        },
        {
          title: 'Import și export',
          text: 'Încarci planul de studii din CSV, exporți orarul în CSV, îl printezi sau îl adaugi în calendarul telefonului.',
        },
      ],
    },
    footer: { project: 'Proiect de practică, Universitatea Tehnică a Moldovei', team: 'Echipa 1 · FAF-251' },
  },

  en: {
    nav: {
      login: 'Administration',
      open: 'Administration',
      schedule: 'See the timetable',
      scheduleShort: 'Timetable',
    },
    hero: {
      title: 'Your university timetable, built automatically.',
      text: 'EduSchedule builds the timetable for groups, streams and subgroups, handles odd and even weeks, and offers you several variants. You pick one, adjust it and publish it.',
      preview: 'Group FAF-251’s timetable, generated right now in your browser',
    },
    features: {
      title: 'Built for how a faculty works.',
      text: 'A timetable designed for universities: academic groups, streams and labs.',
      items: [
        {
          title: 'Groups, streams, subgroups',
          text: 'Shared lectures for several groups, seminars per group and labs per subgroup, in one timetable.',
        },
        { title: 'Odd and even weeks', text: 'One question in the setup. Fortnightly pairs no longer have to be entered twice.' },
        { title: 'Several variants', text: 'Compare variants side by side: gaps, 08:00 pairs, overloaded days. The decision stays yours.' },
        {
          title: 'Instant conflict detection',
          text: 'A teacher, room or group booked twice, a room too small or missing equipment: you see it before publishing.',
        },
        {
          title: 'Drag-and-drop editing',
          text: 'Move a pair with the mouse and see at once whether the slot is free. Locked pairs stay put when regenerating.',
        },
        {
          title: 'Import and export',
          text: 'Upload the study plan as CSV, export the timetable as CSV, print it or add it to a phone calendar.',
        },
      ],
    },
    footer: { project: 'Internship project, Technical University of Moldova', team: 'Team 1 · FAF-251' },
  },

  ru: {
    nav: {
      login: 'Администрирование',
      open: 'Администрирование',
      schedule: 'Смотреть расписание',
      scheduleShort: 'Расписание',
    },
    hero: {
      title: 'Расписание университета, составленное автоматически.',
      text: 'EduSchedule составляет расписание для групп, потоков и подгрупп, учитывает чётные и нечётные недели и предлагает несколько вариантов. Вы выбираете один, дорабатываете и публикуете.',
      preview: 'Расписание группы FAF-251, созданное прямо сейчас в браузере',
    },
    features: {
      title: 'Сделано под то, как работает факультет.',
      text: 'Расписание, созданное для университета: академические группы, потоки и лабораторные.',
      items: [
        {
          title: 'Группы, потоки, подгруппы',
          text: 'Общие лекции для нескольких групп, семинары по группам и лабораторные по подгруппам в одном расписании.',
        },
        { title: 'Чётные и нечётные недели', text: 'Один вопрос при настройке. Пары раз в две недели больше не нужно вводить дважды.' },
        {
          title: 'Несколько вариантов',
          text: 'Сравнивайте варианты рядом: окна, пары в 08:00, перегруженные дни. Решение остаётся за вами.',
        },
        {
          title: 'Мгновенный поиск конфликтов',
          text: 'Преподаватель, аудитория или группа заняты дважды, аудитория мала или без оборудования — видно до публикации.',
        },
        {
          title: 'Редактирование перетаскиванием',
          text: 'Перетащите пару мышью и сразу увидите, свободно ли место. Закреплённые пары не сдвигаются при повторной генерации.',
        },
        {
          title: 'Импорт и экспорт',
          text: 'Загрузите учебный план из CSV, экспортируйте расписание в CSV, распечатайте или добавьте в календарь телефона.',
        },
      ],
    },
    footer: { project: 'Проект практики, Технический университет Молдовы', team: 'Команда 1 · FAF-251' },
  },
};
