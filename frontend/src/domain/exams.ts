// Exam session, reexaminations and atestări (UTM regulation REG-85-OS ECTS and
// the academic calendar): one exam a day, at least `examMinGap` free days
// between two exams of a group, a consultation the day before (or just before),
// retakes in afternoon pairs after the session. Atestări 1 and 2 are held in
// the subject's own classes in teaching weeks 7 and 14.
import { parseDate, sessionDates, toDateString } from './changes';
import type { DatasetIndex } from './indexes';
import type { Rng } from './rng';
import type { ActivityType, Dataset, DateRange, Day, EvaluationSettings, ExamEvent, Lesson, Room } from './types';
import { paritiesOverlap, slotKey } from './slots';
import { dayIndexOf } from './views';

export const DEFAULT_EVALUATION: EvaluationSettings = {
  semesterStart: '2026-08-31',
  midtermWeeks: [7, 14],
  midtermMode: 'inClass',
  midtermStartTimes: ['15:15', '17:00', '18:45'],
  midtermMinutes: 90,
  examSession: [
    { start: '2026-12-14', end: '2026-12-26' },
    { start: '2027-01-11', end: '2027-01-23' },
  ],
  reducedExamSession: [{ start: '2027-01-25', end: '2027-02-06' }],
  reexamSession: [{ start: '2027-01-25', end: '2027-02-06' }],
  // UTM's breaks (as in the 2025-26 calendar) and Moldova's public holidays, 2026-27
  vacations: [
    { name: 'Crăciunul (stil nou)', start: '2026-12-25', end: '2026-12-25' },
    { name: 'Vacanța de iarnă', start: '2026-12-28', end: '2027-01-10' },
    { name: 'Ziua Internațională a Femeii', start: '2027-03-08', end: '2027-03-08' },
    { name: 'Ziua Muncii', start: '2027-05-01', end: '2027-05-01' },
    { name: 'Vacanța de Paște', start: '2027-05-03', end: '2027-05-08' },
    { name: 'Ziua Victoriei', start: '2027-05-09', end: '2027-05-09' },
    { name: 'Paștele Blajinilor', start: '2027-05-10', end: '2027-05-10' },
    { name: 'Ziua Ocrotirii Copiilor', start: '2027-06-01', end: '2027-06-01' },
    { name: 'Vacanța de vară', start: '2027-07-01', end: '2027-08-31' },
  ],
  examDays: [0, 1, 2, 3, 4, 5],
  examMinGap: 2,
  examStartTimes: ['09:00', '12:00'],
  examMinutes: 135,
  consultation: 'dayBefore',
  consultationTime: '10:00',
  consultationMinutes: 90,
  reexamStartTimes: ['13:30', '15:15', '17:00'],
  reexamMinutes: 90,
};

export const evaluationOf = (ds: Dataset): EvaluationSettings => ({ ...DEFAULT_EVALUATION, ...ds.settings.evaluation });

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const addDays = (date: string, n: number) => {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateString(d);
};
const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);

/** The holiday a date falls in, if any. */
export const vacationOn = (ev: EvaluationSettings, date: string) => ev.vacations.find((v) => v.start <= date && date <= v.end);

/** Every allowed date of the given ranges, sorted, without holidays. */
export function rangeDates(ranges: DateRange[], days: Day[], vacations: EvaluationSettings['vacations'] = []): string[] {
  return [...new Set(ranges.flatMap((r) => sessionDates(r.start, r.end, days)))]
    .filter((d) => !vacations.some((v) => v.start <= d && d <= v.end))
    .sort();
}

/** Subjects a group ends with an exam (from its teaching loads). */
export function examSubjects(ds: Dataset, idx: DatasetIndex, groupId: string): string[] {
  const ids = new Set(ds.assignments.filter((a) => idx.audienceTouchesGroup(a.audience, groupId)).map((a) => a.subjectId));
  return [...ids].filter((id) => (idx.subjects.get(id)?.evaluation ?? 'exam') === 'exam');
}

/** Who examines: the lecturer of the group, else whoever teaches it the subject. */
export function examinerOf(ds: Dataset, idx: DatasetIndex, groupId: string, subjectId: string): string | undefined {
  const loads = ds.assignments.filter((a) => a.subjectId === subjectId && idx.audienceTouchesGroup(a.audience, groupId));
  const order: ActivityType[] = ['lecture', 'seminar', 'lab'];
  return loads.sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type))[0]?.teacherId;
}

const overlaps = (a: { date: string; start: string; end: string }, b: { date: string; start: string; end: string }) =>
  a.date === b.date && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);

/** Two events that can't happen at once: same teacher, room or group. */
const clash = (a: ExamEvent, b: ExamEvent) =>
  overlaps(a, b) && (a.teacherId === b.teacherId || a.roomId === b.roomId || a.groupId === b.groupId);

let counter = 0;
const newId = () => `E${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface ExamResult {
  events: ExamEvent[];
  /** Exams that could not be placed, or placed with fewer free days than required. */
  warnings: { groupId: string; subjectId: string; kind: 'unplaced' | 'tight' }[];
}

/**
 * Place the exams (or retakes) of the given groups with their consultations.
 * `busy` = events already fixed (other faculties' published exams, the other round).
 */
export function generateExams(
  ds: Dataset,
  idx: DatasetIndex,
  groupIds: string[],
  round: 'session' | 'reexam',
  busy: ExamEvent[],
  rng: Rng,
): ExamResult {
  const ev = evaluationOf(ds);
  const placed: ExamEvent[] = [];
  const warnings: ExamResult['warnings'] = [];
  const all = () => [...busy, ...placed];
  const free = (e: ExamEvent) => !all().some((o) => clash(o, e));

  const times = round === 'session' ? ev.examStartTimes : ev.reexamStartTimes;
  const minutes = round === 'session' ? ev.examMinutes : ev.reexamMinutes;
  const minGap = round === 'session' ? ev.examMinGap : Math.min(1, ev.examMinGap);

  // the teacher's weekly "unavailable" pairs also hold during the session
  const teacherFree = (teacherId: string, date: string, start: string, end: string) => {
    const t = idx.teachers.get(teacherId);
    if (!t?.unavailable.length) return true;
    const day = dayIndexOf(parseDate(date));
    return !ds.settings.slots.some(
      (s, i) => t.unavailable.includes(slotKey(day, i)) && toMin(s.start) < toMin(end) && toMin(start) < toMin(s.end),
    );
  };
  const roomsFor = (size: number): Room[] =>
    ds.rooms
      .filter((r) => r.type !== 'lab' && !r.equipment.includes('sport') && r.capacity >= size)
      .sort((a, b) => a.capacity - b.capacity);

  // groups with the most exams first; a little randomness between runs
  const order = rng.shuffle(groupIds).sort((a, b) => examSubjects(ds, idx, b).length - examSubjects(ds, idx, a).length);

  for (const groupId of order) {
    const group = idx.groups.get(groupId);
    if (!group) continue;
    const ranges = round === 'reexam' ? ev.reexamSession : group.studyForm === 'reduced' ? ev.reducedExamSession : ev.examSession;
    const dates = rangeDates(ranges, ev.examDays, ev.vacations);
    const subjects = rng
      .shuffle(examSubjects(ds, idx, groupId))
      .sort((a, b) => (idx.subjects.get(b)?.credits ?? 0) - (idx.subjects.get(a)?.credits ?? 0));
    const rooms = roomsFor(idx.audienceSize({ kind: 'group', id: groupId }));
    let last: string | null = null;

    subjects.forEach((subjectId, i) => {
      const teacherId = examinerOf(ds, idx, groupId, subjectId);
      if (!teacherId || !dates.length) {
        warnings.push({ groupId, subjectId, kind: 'unplaced' });
        return;
      }
      // spread the exams evenly over the session
      // (leaving room after the last one, so a late exam still has its free days)
      const target = Math.floor((i * dates.length) / subjects.length);
      let done: ExamEvent | null = null;
      for (let gap = minGap; gap >= 0 && !done; gap--) {
        const earliest = last ? addDays(last, gap + 1) : dates[0];
        const candidates = dates.filter((d) => d >= earliest);
        // try from the target date onwards, then the earlier ones
        const fromTarget = [...candidates.filter((d) => d >= dates[target]), ...candidates.filter((d) => d < dates[target])];
        for (const date of fromTarget) {
          for (const start of times) {
            const end = toHHMM(toMin(start) + minutes);
            if (!teacherFree(teacherId, date, start, end)) continue;
            const room = rooms.find((r) =>
              free({ id: '', kind: 'exam', round, subjectId, groupId, teacherId, roomId: r.id, date, start, end }),
            );
            if (!room) continue;
            const exam: ExamEvent = { id: newId(), kind: 'exam', round, subjectId, groupId, teacherId, roomId: room.id, date, start, end };
            const consultation = consultationFor(ev, exam, rooms, (e) => free(e) && !clash(e, exam));
            if (!consultation) continue;
            done = exam;
            placed.push(exam, consultation);
            break;
          }
          if (done) break;
        }
        if (done && gap < minGap) warnings.push({ groupId, subjectId, kind: 'tight' });
      }
      if (done) last = (done as ExamEvent).date;
      else warnings.push({ groupId, subjectId, kind: 'unplaced' });
    });
  }
  return { events: placed, warnings };
}

/** The day before, skipping days without exams (a Monday exam gets its consultation on Saturday). */
function previousExamDay(ev: EvaluationSettings, date: string): string {
  let d = addDays(date, -1);
  for (let i = 0; i < 21 && (!ev.examDays.includes(dayIndexOf(parseDate(d)) as Day) || vacationOn(ev, d)); i++) d = addDays(d, -1);
  return d;
}

/** The consultation before an exam: same teacher, its room if free. */
function consultationFor(ev: EvaluationSettings, exam: ExamEvent, rooms: Room[], free: (e: ExamEvent) => boolean): ExamEvent | null {
  const sameDay = { date: exam.date, start: toHHMM(toMin(exam.start) - 60), minutes: 45 };
  const before = previousExamDay(ev, exam.date);
  // right after a holiday (or on request) the consultation is the same day, just before the exam
  const tries =
    ev.consultation === 'sameDay' || daysBetween(before, exam.date) > 2
      ? [sameDay]
      : [ev.consultationTime, '12:00', '14:00', '16:00'].map((start) => ({ date: before, start, minutes: ev.consultationMinutes }));
  for (const t of tries) {
    const end = toHHMM(toMin(t.start) + t.minutes);
    for (const roomId of [exam.roomId, ...rooms.map((r) => r.id).filter((id) => id !== exam.roomId)]) {
      const e: ExamEvent = { ...exam, id: newId(), kind: 'consultation', roomId, date: t.date, start: t.start, end };
      if (free(e)) return e;
    }
  }
  return null;
}

export type ExamProblem =
  | { kind: 'clash'; ids: [string, string]; what: 'teacher' | 'room' | 'group' }
  | { kind: 'gap'; groupId: string; ids: [string, string]; days: number };

/** Clashes between events, and exams of a group closer than the minimum gap. */
export function findExamProblems(ds: Dataset, events: ExamEvent[]): ExamProblem[] {
  const ev = evaluationOf(ds);
  const out: ExamProblem[] = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (!overlaps(a, b)) continue;
      const what = a.teacherId === b.teacherId ? 'teacher' : a.roomId === b.roomId ? 'room' : a.groupId === b.groupId ? 'group' : null;
      if (what) out.push({ kind: 'clash', ids: [a.id, b.id], what });
    }
  }
  const byGroup = new Map<string, ExamEvent[]>();
  for (const e of events) if (e.kind === 'exam' && e.round === 'session') byGroup.set(e.groupId, [...(byGroup.get(e.groupId) ?? []), e]);
  for (const [groupId, list] of byGroup) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sorted.length; i++) {
      const days = daysBetween(sorted[i - 1].date, sorted[i].date) - 1;
      if (days < ev.examMinGap) out.push({ kind: 'gap', groupId, ids: [sorted[i - 1].id, sorted[i].id], days });
    }
  }
  return out;
}

/** Monday–Sunday dates of a teaching week (week 1 starts on semesterStart's Monday). */
export function teachingWeek(ev: EvaluationSettings, week: number): DateRange {
  const d = parseDate(ev.semesterStart);
  d.setDate(d.getDate() - dayIndexOf(d) + (week - 1) * 7);
  const start = toDateString(d);
  return { start, end: addDays(start, 6) };
}

export interface Midterm {
  n: 1 | 2;
  date: string;
  lesson: Lesson;
}

const TYPE_ORDER: ActivityType[] = ['seminar', 'lab', 'lecture'];

/**
 * Atestări held in the subject's own classes: in teaching weeks 7 and 14, the
 * group's first seminar (else lab, else lecture) of each subject. Reduced
 * attendance: atestarea N is the last session-N pair of the subject.
 */
export function midtermsFor(
  ds: Dataset,
  idx: DatasetIndex,
  lessons: Lesson[],
  who: { groupId: string } | { teacherId: string },
): Midterm[] {
  const ev = evaluationOf(ds);
  const out = new Map<string, Midterm>();
  const groupsOf = (l: Lesson) => idx.cohorts(idx.assignmentOf(l)!.audience).map((c) => c.groupId);
  const pairs = new Set<string>(); // subject|group the atestare is needed for
  for (const l of lessons) {
    const a = idx.assignmentOf(l);
    if (!a) continue;
    if ('teacherId' in who && a.teacherId !== who.teacherId) continue;
    for (const g of groupsOf(l)) if (!('groupId' in who) || g === who.groupId) pairs.add(`${a.subjectId}|${g}`);
  }

  for (const key of pairs) {
    const [subjectId, groupId] = key.split('|');
    const own = lessons.filter((l) => idx.assignmentOf(l)?.subjectId === subjectId && groupsOf(l).includes(groupId));
    const reduced = idx.groups.get(groupId)?.studyForm === 'reduced';
    ([1, 2] as const).forEach((n) => {
      let chosen: { lesson: Lesson; date: string }[] = [];
      if (reduced) {
        const range = ds.settings.reducedSessions[n - 1];
        const dated = own.filter((l) => l.date && range && l.date >= range.start && l.date <= range.end);
        const lastDate = dated
          .map((l) => l.date!)
          .sort()
          .pop();
        chosen = dated
          .filter((l) => l.date === lastDate)
          .slice(-1)
          .map((l) => ({ lesson: l, date: l.date! }));
      } else {
        const week = teachingWeek(ev, ev.midtermWeeks[n - 1]);
        const parity = ev.midtermWeeks[n - 1] % 2 === 1 ? 'odd' : 'even';
        const inWeek = own.filter((l) => !l.date && (l.parity === 'weekly' || l.parity === parity));
        const type = TYPE_ORDER.find((tp) => inWeek.some((l) => idx.assignmentOf(l)!.type === tp));
        // one per audience (e.g. a lab for each subgroup), the earliest in the week
        const best = new Map<string, Lesson>();
        for (const l of inWeek.filter((x) => idx.assignmentOf(x)!.type === type).sort((x, y) => x.day - y.day || x.slot - y.slot)) {
          const k = JSON.stringify(idx.assignmentOf(l)!.audience);
          if (!best.has(k)) best.set(k, l);
        }
        chosen = [...best.values()].map((l) => ({ lesson: l, date: addDays(week.start, l.day) }));
      }
      for (const c of chosen) {
        if (vacationOn(ev, c.date)) continue; // no class on a holiday
        if ('teacherId' in who && idx.assignmentOf(c.lesson)?.teacherId !== who.teacherId) continue;
        out.set(`${n}|${c.lesson.id}|${c.date}`, { n, date: c.date, lesson: c.lesson });
      }
    });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.lesson.slot - b.lesson.slot);
}

/** Subjects a group has (every subject gets its atestări). */
const groupSubjects = (ds: Dataset, idx: DatasetIndex, groupId: string) => [
  ...new Set(ds.assignments.filter((a) => idx.audienceTouchesGroup(a.audience, groupId)).map((a) => a.subjectId)),
];

/**
 * Separate atestări timetable: in teaching week 7 (or 14), after classes —
 * never over a class of the group, the teacher or the room (any faculty), at
 * most two atestări a day per group. Reduced-attendance groups keep theirs in
 * the session classes.
 */
export function generateMidterms(
  ds: Dataset,
  idx: DatasetIndex,
  groupIds: string[],
  n: 1 | 2,
  classes: Lesson[],
  busy: ExamEvent[],
  rng: Rng,
): ExamResult {
  const ev = evaluationOf(ds);
  const round = n === 1 ? 'midterm1' : 'midterm2';
  const week = teachingWeek(ev, ev.midtermWeeks[n - 1]);
  const parity = ev.midtermWeeks[n - 1] % 2 === 1 ? 'odd' : 'even';
  const dates = sessionDates(week.start, week.end, ev.examDays).filter((d) => !vacationOn(ev, d));
  const placed: ExamEvent[] = [];
  const warnings: ExamResult['warnings'] = [];
  const all = () => [...busy, ...placed];

  // what the weekly timetable already occupies on a date
  const classesAt = (date: string, start: string, end: string) => {
    const day = dayIndexOf(parseDate(date));
    return classes.filter((l) => {
      if (l.date || l.day !== day || !paritiesOverlap(l.parity, parity)) return false;
      const s = ds.settings.slots[l.slot];
      return !!s && toMin(s.start) < toMin(end) && toMin(start) < toMin(s.end);
    });
  };
  const rooms = (size: number) =>
    ds.rooms
      .filter((r) => r.type !== 'lab' && !r.equipment.includes('sport') && r.capacity >= size)
      .sort((a, b) => a.capacity - b.capacity);

  for (const groupId of rng.shuffle(groupIds)) {
    if (idx.groups.get(groupId)?.studyForm === 'reduced') continue;
    const subjects = rng.shuffle(groupSubjects(ds, idx, groupId));
    const size = idx.audienceSize({ kind: 'group', id: groupId });
    subjects.forEach((subjectId, i) => {
      const teacherId = examinerOf(ds, idx, groupId, subjectId);
      if (!teacherId) return;
      // round-robin over the week's days, two a day at most
      const startAt = Math.floor((i * dates.length) / Math.max(1, subjects.length));
      const order = [...dates.slice(startAt), ...dates.slice(0, startAt)];
      for (const date of order) {
        if (all().filter((e) => e.groupId === groupId && e.date === date).length >= 2) continue;
        for (const start of ev.midtermStartTimes) {
          const end = toHHMM(toMin(start) + ev.midtermMinutes);
          const taken = classesAt(date, start, end);
          if (
            taken.some(
              (l) => idx.audienceTouchesGroup(idx.assignmentOf(l)!.audience, groupId) || idx.assignmentOf(l)!.teacherId === teacherId,
            )
          )
            continue;
          const room = rooms(size).find(
            (r) =>
              !taken.some((l) => l.roomId === r.id) &&
              !all().some((o) => clash(o, { id: '', kind: 'exam', round, subjectId, groupId, teacherId, roomId: r.id, date, start, end })),
          );
          if (!room) continue;
          placed.push({ id: newId(), kind: 'exam', round, subjectId, groupId, teacherId, roomId: room.id, date, start, end });
          return;
        }
      }
      warnings.push({ groupId, subjectId, kind: 'unplaced' });
    });
  }
  return { events: placed, warnings };
}
