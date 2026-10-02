// Demo data modelled on a small FCIM-like faculty. All people are fictional.
import type {
  ActivityType,
  Assignment,
  Audience,
  Dataset,
  Group,
  Notification,
  Room,
  Settings,
  Stream,
  Subject,
  Teacher,
  User,
} from '../domain/types';

const FCIM = 'Facultatea Calculatoare, Informatică și Microelectronică';
const FET = 'Facultatea Electronică și Telecomunicații';

export const seedSettings: Settings = {
  institutionName: 'Universitatea Tehnică a Moldovei',
  faculties: [
    'Facultatea Calculatoare, Informatică și Microelectronică',
    'Facultatea Electronică și Telecomunicații',
    'Facultatea Inginerie Mecanică, Industrială și Transporturi',
  ],
  semester: 'Toamna 2026/2027',
  workingDays: 7,
  formDays: {
    full: [0, 1, 2, 3, 4],
    reduced: [5, 6],
    dual: [0, 1, 2, 3, 4],
  },
  formMaxPairs: { full: 4, reduced: 6, dual: 4 },
  reducedSessions: [
    { start: '2026-10-03', end: '2026-10-04' },
    { start: '2026-11-07', end: '2026-11-08' },
    { start: '2026-12-05', end: '2026-12-06' },
  ],
  lessonMinutes: 90,
  slots: [
    { start: '08:00', end: '09:30' },
    { start: '09:45', end: '11:15' },
    { start: '11:30', end: '13:00' },
    { start: '13:30', end: '15:00' },
    { start: '15:15', end: '16:45' },
    { start: '17:00', end: '18:30' },
    { start: '18:45', end: '20:15' },
  ],
  weekParity: true,
  maxPairsPerDayGroup: 4,
  minPairsPerDayGroup: 2,
  maxPairsPerDayTeacher: 5,
  consultationRequired: true,
};

const t = (
  id: string,
  name: string,
  title: string,
  department: string,
  maxPairsPerWeek: number,
  activityTypes: ActivityType[],
  unavailable: Teacher['unavailable'] = [],
  preferred: Teacher['preferred'] = [],
): Teacher => ({
  id,
  name,
  title,
  department,
  email: `${name.split(' ')[0].toLowerCase()}.${name.split(' ')[1].toLowerCase()}@fcim.example.md`.normalize('NFD').replace(/[̀-ͯ]/g, ''),
  maxPairsPerWeek,
  activityTypes,
  unavailable,
  preferred,
});

export const seedTeachers: Teacher[] = [
  t(
    't1',
    'Daniel Rusu',
    'lect. univ.',
    'Ingineria Software',
    12,
    ['lecture', 'seminar', 'lab'],
    ['4:4', '4:5', '4:6'],
    ['1:1', '1:2', '3:1', '3:2'],
  ),
  t('t2', 'Maria Ciobanu', 'conf. univ., dr.', 'Matematică', 10, ['lecture', 'seminar'], ['0:0', '2:0']),
  t('t3', 'Ion Botnaru', 'prof. univ., dr.', 'Matematică', 8, ['lecture'], ['4:0', '4:1', '4:2', '4:3', '4:4', '4:5', '4:6']),
  t('t4', 'Natalia Cojocaru', 'lect. univ.', 'Matematică', 12, ['seminar']),
  t('t5', 'Victor Lungu', 'conf. univ., dr.', 'Ingineria Software', 10, ['lecture', 'lab']),
  t('t6', 'Sergiu Popa', 'asist. univ.', 'Ingineria Software', 14, ['lab', 'seminar']),
  t('t7', 'Tatiana Munteanu', 'conf. univ., dr.', 'Calculatoare', 10, ['lecture', 'lab'], ['0:5', '0:6', '1:5', '1:6']),
  t('t8', 'Andrei Cebotari', 'asist. univ.', 'Calculatoare', 14, ['lab']),
  t('t9', 'Irina Rotaru', 'lect. univ.', 'Limbi Străine', 12, ['seminar'], [], ['0:1', '1:1', '2:1']),
  t('t10', 'Mihai Bodrug', 'conf. univ., dr.', 'Informatică', 10, ['lecture', 'seminar', 'lab']),
  t('t11', 'Olga Țurcanu', 'lect. univ.', 'Informatică', 12, ['lab', 'seminar']),
  t('t12', 'Vasile Ursu', 'prof. univ., dr.', 'Calculatoare', 8, ['lecture'], ['2:0', '2:1', '2:2', '2:3', '2:4', '2:5', '2:6']),
  t('t13', 'Cristina Moraru', 'asist. univ.', 'Calculatoare', 14, ['lab', 'seminar']),
  t('t14', 'Alexandru Gaina', 'lect. univ.', 'Matematică', 12, ['seminar', 'lecture']),
  // FET
  t('t15', 'Valeriu Ceban', 'conf. univ., dr.', 'Electronică', 10, ['lecture', 'seminar']),
  t('t16', 'Petru Cazac', 'lect. univ.', 'Fizică', 12, ['lecture', 'lab']),
  t('t17', 'Galina Melnic', 'conf. univ., dr.', 'Matematică', 8, ['lecture'], ['3:0', '3:1']),
  t('t18', 'Svetlana Ungureanu', 'lect. univ.', 'Matematică', 12, ['seminar']),
  t('t19', 'Dumitru Vrabie', 'asist. univ.', 'Telecomunicații', 14, ['lab']),
];

export const seedRooms: Room[] = [
  { id: 'r1', name: '3-114', building: 'Blocul 3', capacity: 150, type: 'lecture', equipment: ['proiector', 'microfon'] },
  { id: 'r2', name: '3-101', building: 'Blocul 3', capacity: 80, type: 'lecture', equipment: ['proiector'] },
  { id: 'r3', name: '3-205', building: 'Blocul 3', capacity: 60, type: 'lecture', equipment: ['proiector'] },
  { id: 'r4', name: '3-212', building: 'Blocul 3', capacity: 30, type: 'seminar', equipment: ['tablă'] },
  { id: 'r5', name: '3-213', building: 'Blocul 3', capacity: 30, type: 'seminar', equipment: ['tablă', 'proiector'] },
  { id: 'r6', name: '3-301', building: 'Blocul 3', capacity: 32, type: 'seminar', equipment: ['tablă'] },
  { id: 'r7', name: '1-201', building: 'Blocul 1', capacity: 30, type: 'seminar', equipment: ['tablă'] },
  { id: 'r8', name: '3-404', building: 'Blocul 3', capacity: 16, type: 'lab', equipment: ['calculatoare'] },
  { id: 'r9', name: '3-405', building: 'Blocul 3', capacity: 16, type: 'lab', equipment: ['calculatoare'] },
  { id: 'r10', name: '3-406', building: 'Blocul 3', capacity: 16, type: 'lab', equipment: ['calculatoare', 'echipament rețea'] },
  { id: 'r11', name: '3-505', building: 'Blocul 3', capacity: 14, type: 'lab', equipment: ['calculatoare', 'electronică'] },
  // FET building
  { id: 'r12', name: '9-101', building: 'Blocul 9', capacity: 90, type: 'lecture', equipment: ['proiector'] },
  { id: 'r13', name: '9-205', building: 'Blocul 9', capacity: 30, type: 'seminar', equipment: ['tablă'] },
  { id: 'r14', name: '9-310', building: 'Blocul 9', capacity: 16, type: 'lab', equipment: ['electronică'] },
  { id: 'r15', name: '9-311', building: 'Blocul 9', capacity: 14, type: 'lab', equipment: ['laborator fizică'] },
];

export const seedGroups: Group[] = [
  { id: 'g1', name: 'FAF-251', program: 'Ingineria Software', faculty: FCIM, studyForm: 'full', year: 1, size: 24, subgroups: 2 },
  { id: 'g2', name: 'FAF-252', program: 'Ingineria Software', faculty: FCIM, studyForm: 'full', year: 1, size: 22, subgroups: 2 },
  { id: 'g3', name: 'TI-251', program: 'Tehnologia Informației', faculty: FCIM, studyForm: 'full', year: 1, size: 28, subgroups: 2 },
  { id: 'g4', name: 'TI-252', program: 'Tehnologia Informației', faculty: FCIM, studyForm: 'full', year: 1, size: 26, subgroups: 2 },
  { id: 'g5', name: 'FAF-241', program: 'Ingineria Software', faculty: FCIM, studyForm: 'full', year: 2, size: 25, subgroups: 2 },
  { id: 'g6', name: 'FAF-242', program: 'Ingineria Software', faculty: FCIM, studyForm: 'full', year: 2, size: 23, subgroups: 2 },
  { id: 'g7', name: 'CR-241', program: 'Calculatoare și Rețele', faculty: FCIM, studyForm: 'full', year: 2, size: 20, subgroups: 2 },
  // Reduced attendance: weekend sessions, fewer contact hours
  { id: 'g8', name: 'TI-251FR', program: 'Tehnologia Informației', faculty: FCIM, studyForm: 'reduced', year: 1, size: 16, subgroups: 1 },
  // Dual: attends the year-2 lectures with the full-time groups
  // FET (Electronică și Telecomunicații) — group codes are illustrative
  { id: 'g10', name: 'TLC-251', program: 'Telecomunicații', faculty: FET, studyForm: 'full', year: 1, size: 22, subgroups: 2 },
  { id: 'g11', name: 'TLC-252', program: 'Telecomunicații', faculty: FET, studyForm: 'full', year: 1, size: 20, subgroups: 2 },
  { id: 'g12', name: 'ELE-251', program: 'Electronică', faculty: FET, studyForm: 'full', year: 1, size: 18, subgroups: 2 },
  { id: 'g9', name: 'FAF-241D', program: 'Ingineria Software', faculty: FCIM, studyForm: 'dual', year: 2, size: 15, subgroups: 1 },
];

export const seedStreams: Stream[] = [
  { id: 's1', name: 'FAF-25', groupIds: ['g1', 'g2'] },
  { id: 's2', name: 'TI-25', groupIds: ['g3', 'g4'] },
  { id: 's3', name: 'Anul I', groupIds: ['g1', 'g2', 'g3', 'g4'] },
  { id: 's4', name: 'Anul II', groupIds: ['g5', 'g6', 'g7', 'g9'] },
  { id: 's5', name: 'FET Anul I', groupIds: ['g10', 'g11', 'g12'] },
];

export const seedSubjects: Subject[] = [
  { id: 'sub1', code: 'AM', name: 'Analiză matematică', credits: 6, year: 1, faculty: FCIM, lecturePairs: 2, seminarPairs: 1, labPairs: 0 },
  { id: 'sub2', code: 'AL', name: 'Algebră liniară', credits: 5, year: 1, faculty: FCIM, lecturePairs: 1, seminarPairs: 1, labPairs: 0 },
  {
    id: 'sub3',
    code: 'PC',
    name: 'Programarea calculatoarelor',
    credits: 6,
    year: 1,
    faculty: FCIM,
    lecturePairs: 1,
    seminarPairs: 0,
    labPairs: 2,
  },
  {
    id: 'sub4',
    code: 'MD',
    name: 'Matematică discretă',
    credits: 5,
    year: 1,
    faculty: FCIM,
    lecturePairs: 1,
    seminarPairs: 0.5,
    labPairs: 0,
  },
  {
    id: 'sub5',
    code: 'AC',
    name: 'Arhitectura calculatoarelor',
    credits: 4,
    year: 1,
    faculty: FCIM,
    lecturePairs: 0.5,
    seminarPairs: 0,
    labPairs: 0.5,
  },
  { id: 'sub6', code: 'LE', name: 'Limba engleză', credits: 2, year: 1, faculty: FCIM, lecturePairs: 0, seminarPairs: 1, labPairs: 0 },
  {
    id: 'sub7',
    code: 'SDA',
    name: 'Structuri de date și algoritmi',
    credits: 6,
    year: 2,
    faculty: FCIM,
    lecturePairs: 1,
    seminarPairs: 0,
    labPairs: 1,
  },
  { id: 'sub8', code: 'BD', name: 'Baze de date', credits: 5, year: 2, faculty: FCIM, lecturePairs: 1, seminarPairs: 0, labPairs: 1 },
  {
    id: 'sub9',
    code: 'POO',
    name: 'Programare orientată pe obiecte',
    credits: 5,
    year: 2,
    lecturePairs: 1,
    seminarPairs: 0,
    labPairs: 0.5,
  },
  {
    id: 'sub10',
    code: 'PS',
    name: 'Probabilități și statistică',
    credits: 4,
    year: 2,
    faculty: FCIM,
    lecturePairs: 1,
    seminarPairs: 1,
    labPairs: 0,
  },
  {
    id: 'sub12',
    code: 'MI',
    name: 'Matematică pentru ingineri',
    credits: 6,
    year: 1,
    faculty: FET,
    lecturePairs: 2,
    seminarPairs: 1,
    labPairs: 0,
  },
  { id: 'sub13', code: 'FIZ', name: 'Fizică', credits: 5, year: 1, faculty: FET, lecturePairs: 1, seminarPairs: 0, labPairs: 1 },
  {
    id: 'sub14',
    code: 'BE',
    name: 'Bazele electrotehnicii',
    credits: 6,
    year: 1,
    faculty: FET,
    lecturePairs: 1,
    seminarPairs: 1,
    labPairs: 1,
  },
  {
    id: 'sub11',
    code: 'RC',
    name: 'Rețele de calculatoare',
    credits: 4,
    year: 2,
    faculty: FCIM,
    lecturePairs: 1,
    seminarPairs: 0,
    labPairs: 1,
  },
];

let nextAssignment = 1;
function a(
  subjectId: string,
  type: ActivityType,
  teacherId: string,
  audience: Audience,
  pairsPerWeek = 1,
  parity: Assignment['parity'] = 'weekly',
  equipment: string[] = [],
): Assignment {
  return {
    id: `a${nextAssignment++}`,
    subjectId,
    type,
    teacherId,
    audience,
    pairsPerWeek,
    parity,
    roomType: type,
    equipment: type === 'lab' && equipment.length === 0 ? ['calculatoare'] : equipment,
  };
}

const stream = (id: string): Audience => ({ kind: 'stream', id });
const group = (id: string): Audience => ({ kind: 'group', id });
const sub = (id: string, n: number): Audience => ({ kind: 'subgroup', id, subgroup: n });

export const seedAssignments: Assignment[] = [
  // Year 1 — shared lectures for the whole year
  a('sub1', 'lecture', 't3', stream('s3'), 2),
  a('sub2', 'lecture', 't2', stream('s3')),
  a('sub4', 'lecture', 't14', stream('s3')),
  // Year 1 — lectures per programme stream
  a('sub3', 'lecture', 't5', stream('s1')),
  a('sub3', 'lecture', 't10', stream('s2')),
  a('sub5', 'lecture', 't7', stream('s1'), 1, 'odd'),
  a('sub5', 'lecture', 't7', stream('s2'), 1, 'even'),
  // Year 1 — seminars per group
  ...['g1', 'g2', 'g3', 'g4'].flatMap((g, i) => [
    a('sub1', 'seminar', i < 2 ? 't4' : 't2', group(g)),
    a('sub2', 'seminar', i < 2 ? 't14' : 't4', group(g)),
    a('sub4', 'seminar', 't4', group(g), 1, i % 2 === 0 ? 'odd' : 'even'),
    a('sub6', 'seminar', 't9', group(g)),
  ]),
  // Year 1 — labs per subgroup
  ...['g1', 'g2'].flatMap((g) => [
    a('sub3', 'lab', 't1', sub(g, 1), 2),
    a('sub3', 'lab', 't6', sub(g, 2), 2),
    a('sub5', 'lab', 't8', sub(g, 1), 1, 'odd'),
    a('sub5', 'lab', 't8', sub(g, 2), 1, 'even'),
  ]),
  ...['g3', 'g4'].flatMap((g) => [
    a('sub3', 'lab', 't11', sub(g, 1), 2),
    a('sub3', 'lab', 't6', sub(g, 2), 2),
    a('sub5', 'lab', 't13', sub(g, 1), 1, 'odd'),
    a('sub5', 'lab', 't13', sub(g, 2), 1, 'even'),
  ]),
  // Year 2
  a('sub7', 'lecture', 't1', stream('s4')),
  a('sub8', 'lecture', 't10', stream('s4')),
  a('sub9', 'lecture', 't5', stream('s4')),
  a('sub10', 'lecture', 't3', stream('s4')),
  a('sub11', 'lecture', 't12', stream('s4')),
  ...['g5', 'g6', 'g7'].flatMap((g) => [
    a('sub10', 'seminar', 't14', group(g)),
    a('sub7', 'lab', 't6', sub(g, 1)),
    a('sub7', 'lab', 't1', sub(g, 2)),
    a('sub8', 'lab', 't11', sub(g, 1)),
    a('sub8', 'lab', 't11', sub(g, 2)),
    a('sub9', 'lab', 't13', sub(g, 1), 1, 'odd'),
    a('sub9', 'lab', 't13', sub(g, 2), 1, 'even'),
    a('sub11', 'lab', 't8', sub(g, 1), 1, 'weekly', ['calculatoare', 'echipament rețea']),
    a('sub11', 'lab', 't8', sub(g, 2), 1, 'weekly', ['calculatoare', 'echipament rețea']),
  ]),
  // FET year 1 — shared lectures, seminars per group, labs per subgroup
  a('sub12', 'lecture', 't17', stream('s5'), 2),
  a('sub13', 'lecture', 't16', stream('s5')),
  a('sub14', 'lecture', 't15', stream('s5')),
  ...['g10', 'g11', 'g12'].flatMap((g) => [
    a('sub12', 'seminar', 't18', group(g)),
    a('sub14', 'seminar', 't15', group(g)),
    a('sub13', 'lab', 't16', sub(g, 1), 1, 'weekly', ['laborator fizică']),
    a('sub13', 'lab', 't16', sub(g, 2), 1, 'weekly', ['laborator fizică']),
    a('sub14', 'lab', 't19', sub(g, 1), 1, 'weekly', ['electronică']),
    a('sub14', 'lab', 't19', sub(g, 2), 1, 'weekly', ['electronică']),
  ]),
  // Reduced attendance (TI-251FR) — Saturday/Sunday
  a('sub1', 'lecture', 't2', group('g8')),
  a('sub1', 'seminar', 't4', group('g8')),
  a('sub3', 'lecture', 't10', group('g8')),
  a('sub3', 'lab', 't11', group('g8'), 2),
  a('sub4', 'lecture', 't14', group('g8')),
  a('sub6', 'seminar', 't9', group('g8')),
  // Dual (FAF-241D) — lectures come from the "Anul II" stream
  a('sub10', 'seminar', 't14', group('g9')),
  a('sub7', 'lab', 't6', group('g9')),
  a('sub8', 'lab', 't1', group('g9')),
  a('sub9', 'lab', 't13', group('g9'), 1, 'odd'),
  a('sub11', 'lab', 't8', group('g9'), 1, 'weekly', ['calculatoare', 'echipament rețea']),
];

export const seedDataset: Dataset = {
  settings: seedSettings,
  teachers: seedTeachers,
  rooms: seedRooms,
  groups: seedGroups,
  streams: seedStreams,
  subjects: seedSubjects,
  assignments: seedAssignments,
};

/** Demo accounts — password for all of them is "demo". */
export const seedUsers: User[] = [
  { id: 'u1', username: 'elena.popescu', name: 'Elena Popescu', role: 'admin' },
  { id: 'u2', username: 'daniel.rusu', name: 'Daniel Rusu', role: 'teacher', teacherId: 't1' },
  { id: 'u3', username: 'alex.marin', name: 'Alex Marin', role: 'student', groupId: 'g1' },
];

export const seedNotifications: Notification[] = [
  {
    id: 'n1',
    createdAt: '2026-09-28T09:00:00.000Z',
    kind: 'welcome',
    title: 'Bine ați venit în EduSchedule',
    body: 'Orarul pentru semestrul de toamnă va fi publicat aici.',
    roles: [],
  },
];
