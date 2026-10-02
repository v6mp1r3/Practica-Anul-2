// Landing page text in the three interface languages. Facts come from the
// internship report (Domain Analysis, §1.1 and §1.4).
import type { Lang } from '../../i18n';

export interface LandingCopy {
  nav: { features: string; how: string; login: string; open: string };
  hero: { title: string; text: string; preview: string };
  statement: { before: string; word: string; after: string };
  reveal: string;
  how: { kicker: string; title: string; steps: { title: string; text: string }[] };
  features: { title: string; text: string; items: { title: string; text: string }[] };
  footer: { project: string; team: string };
}

export const copy: Record<Lang, LandingCopy> = {
  ro: {
    nav: {
      features: 'Funcții',
      how: 'Cum funcționează',
      login: 'Intră',
      open: 'Deschide aplicația',
    },
    hero: {
      title: 'Orarul universității, construit automat.',
      text: 'EduSchedule construiește orarul pentru grupe, torente și subgrupe, ține cont de săptămânile pare și impare și îți propune mai multe variante. Tu alegi una, o ajustezi și o publici.',
      preview: 'Orarul grupei FAF-251, generat chiar acum în browser',
    },
    statement: { before: 'EduSchedule te ajută să le ', word: 'gestionezi', after: ' pe toate' },
    reveal:
      'Un orar nu e greu din cauza orelor, ci din cauza conflictelor: o mutare mică strică trei grupe. EduSchedule le vede pe toate înaintea ta.',
    how: {
      kicker: 'Cum funcționează',
      title: 'Trei pași, de la date la orar publicat.',
      steps: [
        {
          title: 'Configurezi',
          text: 'Profesori, săli, grupe, torente și planul de studii. Fiecare câmp are o valoare implicită, așa că completezi doar ce diferă.',
        },
        {
          title: 'Generezi',
          text: 'EduSchedule creează mai multe variante care respectă toate regulile obligatorii și le compară după cât de comode sunt.',
        },
        {
          title: 'Publici',
          text: 'Ajustezi manual ce vrei, apoi publici. Profesorii și studenții văd orarul imediat și primesc notificări la fiecare schimbare.',
        },
      ],
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
      features: 'Features',
      how: 'How it works',
      login: 'Sign in',
      open: 'Open the app',
    },
    hero: {
      title: 'Your university timetable, built automatically.',
      text: 'EduSchedule builds the timetable for groups, streams and subgroups, handles odd and even weeks, and offers you several variants. You pick one, adjust it and publish it.',
      preview: 'Group FAF-251’s timetable, generated right now in your browser',
    },
    statement: { before: 'EduSchedule helps you ', word: 'manage', after: ' them all' },
    reveal:
      'A timetable isn’t hard because of the hours — it’s hard because of the conflicts: one small move breaks three groups. EduSchedule sees them all before you do.',
    how: {
      kicker: 'How it works',
      title: 'Three steps, from data to a published timetable.',
      steps: [
        {
          title: 'Set up',
          text: 'Teachers, rooms, groups, streams and the study plan. Every field has a default, so you only fill in what differs.',
        },
        {
          title: 'Generate',
          text: 'EduSchedule creates several variants that respect every hard rule and compares them by how comfortable they are.',
        },
        {
          title: 'Publish',
          text: 'Adjust anything by hand, then publish. Teachers and students see it instantly and are notified of every change.',
        },
      ],
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
      features: 'Возможности',
      how: 'Как это работает',
      login: 'Войти',
      open: 'Открыть приложение',
    },
    hero: {
      title: 'Расписание университета, составленное автоматически.',
      text: 'EduSchedule составляет расписание для групп, потоков и подгрупп, учитывает чётные и нечётные недели и предлагает несколько вариантов. Вы выбираете один, дорабатываете и публикуете.',
      preview: 'Расписание группы FAF-251, созданное прямо сейчас в браузере',
    },
    statement: { before: 'EduSchedule помогает вам ', word: 'управлять', after: ' всем этим' },
    reveal:
      'Расписание сложно не из-за часов, а из-за конфликтов: одна небольшая перестановка ломает три группы. EduSchedule видит их все раньше вас.',
    how: {
      kicker: 'Как это работает',
      title: 'Три шага от данных до опубликованного расписания.',
      steps: [
        {
          title: 'Настройка',
          text: 'Преподаватели, аудитории, группы, потоки и учебный план. У каждого поля есть значение по умолчанию, поэтому заполняется только то, что отличается.',
        },
        {
          title: 'Генерация',
          text: 'EduSchedule создаёт несколько вариантов, соблюдающих все обязательные правила, и сравнивает их по удобству.',
        },
        {
          title: 'Публикация',
          text: 'Дорабатываете вручную и публикуете. Преподаватели и студенты сразу видят расписание и получают уведомления об изменениях.',
        },
      ],
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
