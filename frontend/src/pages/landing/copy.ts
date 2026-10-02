// Landing page text in the three interface languages. Facts come from the
// internship report (Domain Analysis, §1.1 and §1.4).
import type { Lang } from '../../i18n';

export interface LandingCopy {
  nav: { features: string; how: string; roles: string; compare: string; login: string; open: string };
  hero: { title: string; text: string; cta: string; secondary: string; preview: string };
  statement: { before: string; word: string; after: string };
  how: { title: string; text: string; steps: { title: string; text: string }[] };
  features: { title: string; text: string; items: { title: string; text: string }[] };
  roles: { title: string; text: string; items: { role: string; title: string; text: string }[] };
  compare: {
    title: string;
    text: string;
    rows: { label: string; values: [string, string, string, string, string] }[];
  };
  engine: { title: string; text: string; points: { title: string; text: string }[] };
  cta: { title: string; text: string; button: string };
  footer: { project: string; team: string };
}

export const copy: Record<Lang, LandingCopy> = {
  ro: {
    nav: {
      features: 'Funcții',
      how: 'Cum funcționează',
      roles: 'Pentru cine',
      compare: 'Comparație',
      login: 'Intră',
      open: 'Deschide aplicația',
    },
    hero: {
      title: 'Orarul universității, fără conflicte.',
      text: 'EduSchedule construiește orarul pentru grupe, torente și subgrupe, ține cont de săptămânile pare și impare și îți propune mai multe variante. Tu alegi una, o ajustezi și o publici.',
      cta: 'Încearcă demo-ul',
      secondary: 'Cum funcționează',
      preview: 'Orarul grupei FAF-251, generat chiar acum în browser',
    },
    statement: { before: 'EduSchedule te ajută să le ', word: 'gestionezi', after: ' pe toate' },
    how: {
      title: 'Trei pași, de la date la orar publicat.',
      text: 'Datele de bază se introduc o singură dată. La fiecare semestru doar generezi, alegi și publici.',
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
      text: 'Nu un orar de școală adaptat, ci unul gândit pentru grupe academice, torente și laboratoare.',
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
    roles: {
      title: 'Trei roluri, un singur orar.',
      text: 'Fiecare vede exact ce îi trebuie.',
      items: [
        {
          role: 'Administrator',
          title: 'Creează și publică orarul',
          text: 'Introduce datele, verifică problemele, generează variante, alege una, o ajustează și o publică.',
        },
        {
          role: 'Profesor',
          title: 'Își vede orarul și sarcina',
          text: 'Câte perechi are, unde și cu cine, indică online când nu poate preda și își alege ora de consultații.',
        },
        {
          role: 'Student',
          title: 'Știe unde are pereche',
          text: 'Orarul grupei pe telefon, următoarea pereche, săli libere și profesori disponibili acum.',
        },
      ],
    },
    compare: {
      title: 'Cum se compară.',
      text: 'Soluțiile existente sunt fie făcute pentru școli, fie prea mari pentru o singură facultate.',
      rows: [
        { label: 'Cost', values: ['Gratuit', 'Licență + mentenanță', 'Plătit, pe module', 'Gratuit', 'Gratuit (planificat)'] },
        { label: 'Platformă', values: ['Desktop', 'Desktop și online', 'Desktop + WebUntis', 'Web, server propriu', 'Web'] },
        { label: 'Pentru', values: ['Școli și universități', 'Școli', 'Școli', 'Universități mari', 'Facultăți'] },
        {
          label: 'Instalare',
          values: ['Program desktop', 'Program sau cont online', 'Program desktop', 'Server Java și bază de date', 'Doar browser'],
        },
        {
          label: 'Săptămâni pare/impare',
          values: ['Cu artificii', 'Setare separată', 'Modul plătit', 'Șabloane de date', 'O singură întrebare'],
        },
      ],
    },
    engine: {
      title: 'Matematică solidă în spate.',
      text: 'Orarul universitar este o problemă NP-dificilă: nu poți verifica toate combinațiile. EduSchedule folosește metode recunoscute în cercetare.',
      points: [
        { title: 'CP-SAT', text: 'Programare cu constrângeri (Google OR-Tools): regulile obligatorii sunt respectate mereu.' },
        { title: 'Large Neighborhood Search', text: 'Îmbunătățește orarul pas cu pas, păstrând perechile fixate manual.' },
        { title: 'Penalizare transparentă', text: 'Fiecare variantă primește un scor din ferestre, perechi devreme și zile încărcate.' },
      ],
    },
    cta: { title: 'Vezi cum arată.', text: 'Intră cu un cont demo de administrator, profesor sau student.', button: 'Încearcă demo-ul' },
    footer: { project: 'Proiect de practică, Universitatea Tehnică a Moldovei', team: 'Echipa 1 · FAF-251' },
  },

  en: {
    nav: {
      features: 'Features',
      how: 'How it works',
      roles: 'Who it’s for',
      compare: 'Comparison',
      login: 'Sign in',
      open: 'Open the app',
    },
    hero: {
      title: 'Your university timetable, conflict-free.',
      text: 'EduSchedule builds the timetable for groups, streams and subgroups, handles odd and even weeks, and offers you several variants. You pick one, adjust it and publish it.',
      cta: 'Try the demo',
      secondary: 'How it works',
      preview: 'Group FAF-251’s timetable, generated right now in your browser',
    },
    statement: { before: 'EduSchedule helps you ', word: 'manage', after: ' them all' },
    how: {
      title: 'Three steps, from data to a published timetable.',
      text: 'Base data is entered once. Each semester you just generate, choose and publish.',
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
      text: 'Not a school timetable stretched to fit, but one designed for academic groups, streams and labs.',
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
    roles: {
      title: 'Three roles, one timetable.',
      text: 'Everyone sees exactly what they need.',
      items: [
        {
          role: 'Administrator',
          title: 'Builds and publishes the timetable',
          text: 'Enters the data, checks for problems, generates variants, picks one, adjusts it and publishes it.',
        },
        {
          role: 'Teacher',
          title: 'Sees their timetable and load',
          text: 'How many pairs, where and with whom; submits unavailable times online and picks a consultation hour.',
        },
        {
          role: 'Student',
          title: 'Knows where the next class is',
          text: 'The group timetable on a phone, the next pair, free rooms and teachers available right now.',
        },
      ],
    },
    compare: {
      title: 'How it compares.',
      text: 'Existing tools are either built for schools or too big for a single faculty.',
      rows: [
        { label: 'Cost', values: ['Free', 'Licence + maintenance', 'Paid, modular', 'Free', 'Free (planned)'] },
        { label: 'Platform', values: ['Desktop', 'Desktop and online', 'Desktop + WebUntis', 'Web, own server', 'Web'] },
        { label: 'Built for', values: ['Schools and universities', 'Schools', 'Schools', 'Large universities', 'Faculties'] },
        {
          label: 'Installation',
          values: ['Desktop program', 'Program or online account', 'Desktop program', 'Java server and database', 'Browser only'],
        },
        { label: 'Odd/even weeks', values: ['Workaround', 'Separate setting', 'Paid add-on', 'Date patterns', 'One question'] },
      ],
    },
    engine: {
      title: 'Solid maths underneath.',
      text: 'University timetabling is NP-hard: you cannot check every combination. EduSchedule uses methods established in research.',
      points: [
        { title: 'CP-SAT', text: 'Constraint programming (Google OR-Tools): hard rules are always respected.' },
        { title: 'Large Neighborhood Search', text: 'Improves the timetable step by step, keeping pairs locked by hand.' },
        { title: 'Transparent penalty', text: 'Each variant gets a score from gaps, early pairs and overloaded days.' },
      ],
    },
    cta: { title: 'See it for yourself.', text: 'Sign in with a demo administrator, teacher or student account.', button: 'Try the demo' },
    footer: { project: 'Internship project, Technical University of Moldova', team: 'Team 1 · FAF-251' },
  },

  ru: {
    nav: {
      features: 'Возможности',
      how: 'Как это работает',
      roles: 'Для кого',
      compare: 'Сравнение',
      login: 'Войти',
      open: 'Открыть приложение',
    },
    hero: {
      title: 'Расписание университета без конфликтов.',
      text: 'EduSchedule составляет расписание для групп, потоков и подгрупп, учитывает чётные и нечётные недели и предлагает несколько вариантов. Вы выбираете один, дорабатываете и публикуете.',
      cta: 'Попробовать демо',
      secondary: 'Как это работает',
      preview: 'Расписание группы FAF-251, созданное прямо сейчас в браузере',
    },
    statement: { before: 'EduSchedule помогает вам ', word: 'управлять', after: ' всем этим' },
    how: {
      title: 'Три шага от данных до опубликованного расписания.',
      text: 'Основные данные вводятся один раз. Каждый семестр вы только генерируете, выбираете и публикуете.',
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
      text: 'Не школьное расписание, подогнанное под вуз, а решение для академических групп, потоков и лабораторных.',
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
    roles: {
      title: 'Три роли, одно расписание.',
      text: 'Каждый видит ровно то, что ему нужно.',
      items: [
        {
          role: 'Администратор',
          title: 'Составляет и публикует расписание',
          text: 'Вводит данные, проверяет проблемы, генерирует варианты, выбирает один, дорабатывает и публикует.',
        },
        {
          role: 'Преподаватель',
          title: 'Видит своё расписание и нагрузку',
          text: 'Сколько пар, где и с кем; онлайн отмечает, когда не может вести занятия, и выбирает час консультаций.',
        },
        {
          role: 'Студент',
          title: 'Знает, где следующая пара',
          text: 'Расписание группы на телефоне, следующая пара, свободные аудитории и преподаватели, свободные сейчас.',
        },
      ],
    },
    compare: {
      title: 'Сравнение.',
      text: 'Существующие решения либо сделаны для школ, либо слишком велики для одного факультета.',
      rows: [
        { label: 'Стоимость', values: ['Бесплатно', 'Лицензия + поддержка', 'Платно, по модулям', 'Бесплатно', 'Бесплатно (планируется)'] },
        { label: 'Платформа', values: ['Десктоп', 'Десктоп и онлайн', 'Десктоп + WebUntis', 'Веб, свой сервер', 'Веб'] },
        { label: 'Для кого', values: ['Школы и вузы', 'Школы', 'Школы', 'Крупные вузы', 'Факультеты'] },
        {
          label: 'Установка',
          values: ['Десктоп-программа', 'Программа или онлайн-аккаунт', 'Десктоп-программа', 'Java-сервер и база данных', 'Только браузер'],
        },
        {
          label: 'Чётные/нечётные недели',
          values: ['Обходным путём', 'Отдельная настройка', 'Платный модуль', 'Шаблоны дат', 'Один вопрос'],
        },
      ],
    },
    engine: {
      title: 'Надёжная математика внутри.',
      text: 'Составление университетского расписания — NP-трудная задача: перебрать все комбинации невозможно. EduSchedule использует признанные в науке методы.',
      points: [
        { title: 'CP-SAT', text: 'Программирование в ограничениях (Google OR-Tools): обязательные правила соблюдаются всегда.' },
        { title: 'Large Neighborhood Search', text: 'Улучшает расписание шаг за шагом, сохраняя закреплённые вручную пары.' },
        { title: 'Прозрачный штраф', text: 'Каждый вариант получает оценку по окнам, ранним парам и перегруженным дням.' },
      ],
    },
    cta: {
      title: 'Посмотрите сами.',
      text: 'Войдите с демо-аккаунтом администратора, преподавателя или студента.',
      button: 'Попробовать демо',
    },
    footer: { project: 'Проект практики, Технический университет Молдовы', team: 'Команда 1 · FAF-251' },
  },
};
