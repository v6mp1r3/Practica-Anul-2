// Exam session, reexaminations and atestări (UTM regulation REG-85-OS ECTS and
// the academic calendar): one exam a day, at least `examMinGap` free days
// between two exams of a group, a consultation the day before (or just before),
// retakes in afternoon pairs after the session. Atestări 1 and 2 are held in
// the subject's own classes in teaching weeks 7 and 14.
import { parseDate, sessionDates, toDateString } from './changes';
import { holidaysOf, semesterStartOf } from './holidays';
import type { DatasetIndex } from './indexes';
import type { Rng } from './rng';
import type {
  ActivityType,
  Dataset,
  DateRange,
  Day,
  EvaluationSettings,
  ExamEvent,
  Lesson,
  MasterEvaluation,
  Room,
  StudyCycle,
} from './types';
import { paritiesOverlap } from './slots';
import { dayIndexOf } from './views';

export const DEFAULT_EVALUATION: EvaluationSettings = {
  semesterStart: '2026-08-31',
  midtermWeeks: [7, 14],
  // each atestare period lasts two weeks (7–8 and 14–15): one atestare a day per group
  midtermSpanWeeks: 2,
  // retakes of the atestări: a couple of weeks later, after classes
  midtermRetakeWeeks: [9, 15],
  midtermMode: 'inClass',
  midtermStartTimes: ['15:15', '17:00', '18:45'],
  midtermMinutes: 90,
  examSession: [
    { start: '2026-12-14', end: '2026-12-26' },
    { start: '2027-01-11', end: '2027-01-23' },
  ],
  reducedExamSession: [{ start: '2027-01-25', end: '2027-02-06' }],
  reexamSession: [{ start: '2027-01-25', end: '2027-02-06' }],
  // extra days off only — public holidays and breaks are computed every year (holidays.ts)
  vacations: [],
  // licență: exams and consultations on weekdays only (a Monday exam's consultation is on Friday)
  examDays: [0, 1, 2, 3, 4],
  // frecvență redusă: weekends too
  reducedExamDays: [0, 1, 2, 3, 4, 5, 6],
  // one day exam, one day off
  examMinGap: 1,
  examFrom: '08:00',
  examTo: '18:00',
  examMinutes: 135,
  consultation: 'dayBefore',
  consultationMinutes: 90,
  reexamFrom: '13:00',
  reexamTo: '19:00',
  reexamMinutes: 90,
};

/** Master's defaults (UTM master calendar): starts ~4 weeks later, evening hours, consultation just before. */
export const DEFAULT_MASTER: MasterEvaluation = {
  startOffsetWeeks: 4,
  // master weeks (from its own week 1): atestări 6–7 and 11–12, retakes 9 and 13 (before the winter break)
  midtermWeeks: [6, 11],
  midtermRetakeWeeks: [9, 13],
  examSession: [{ start: '2027-01-11', end: '2027-01-30' }],
  reexamSession: [{ start: '2027-02-01', end: '2027-02-06' }],
  examDays: [0, 1, 2, 3, 4, 5],
  examFrom: '16:00',
  examTo: '20:30',
  consultation: 'sameDay',
  reexamFrom: '16:00',
  reexamTo: '20:30',
};

/**
 * The evaluation settings, with `vacations` = every day off of the year (automatic + added).
 * Master's: licență's, with the master overrides on top (holidays are the same).
 */
export const evaluationOf = (ds: Dataset, cycle: StudyCycle = 'licenta'): EvaluationSettings => {
  const stored = { ...DEFAULT_EVALUATION, ...ds.settings.evaluation };
  // a new academic year starts by itself: its first week and its days off
  const ev = { ...stored, semesterStart: semesterStartOf(stored.semesterStart) };
  const lic = { ...ev, vacations: holidaysOf(ev) };
  if (cycle !== 'master') return lic;
  const { startOffsetWeeks = 4, ...m } = { ...DEFAULT_MASTER, ...ds.settings.masterEvaluation };
  return { ...lic, ...m, semesterStart: addDays(lic.semesterStart, 7 * startOffsetWeeks), vacations: lic.vacations };
};

/** The evaluation settings that apply to a group (its study cycle). */
export const evaluationForGroup = (ds: Dataset, idx: DatasetIndex, groupId: string) =>
  evaluationOf(ds, idx.groups.get(groupId)?.cycle ?? 'licenta');

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
/** Start times every half hour in [from, to] that still end by `to`. */
export function startTimesIn(from: string, to: string, minutes: number): string[] {
  const out: string[] = [];
  for (let m = toMin(from); m + minutes <= toMin(to); m += 30) out.push(toHHMM(m));
  return out;
}

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

/** Same students: same group, unless they are different subgroups. */
const sameStudents = (a: ExamEvent, b: ExamEvent) => a.groupId === b.groupId && !(a.subgroup && b.subgroup && a.subgroup !== b.subgroup);

/** Two events that can't happen at once: same teacher, room or students (one class shared by groups is fine). */
const clash = (a: ExamEvent, b: ExamEvent) =>
  overlaps(a, b) &&
  !(a.lessonId && a.lessonId === b.lessonId) &&
  (a.teacherId === b.teacherId || a.roomId === b.roomId || sameStudents(a, b));

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
  /** The published weekly timetable: exams prefer the rooms the subject is taught in. */
  classes: Lesson[] = [],
): ExamResult {
  const ev = evaluationOf(ds);
  const placed: ExamEvent[] = [];
  const warnings: ExamResult['warnings'] = [];
  const all = () => [...busy, ...placed];
  const free = (e: ExamEvent) => !all().some((o) => clash(o, e));

  // licență or master's: each group follows its own cycle's settings
  const cycleEv = { licenta: ev, master: evaluationOf(ds, 'master') };
  const rules = (gev: EvaluationSettings) => {
    const minutes = round === 'session' ? gev.examMinutes : gev.reexamMinutes;
    // any start inside the window — each exam its own time, not a fixed list
    const window =
      round === 'session' ? startTimesIn(gev.examFrom, gev.examTo, minutes) : startTimesIn(gev.reexamFrom, gev.reexamTo, minutes);
    return { minutes, window, minGap: gev.examMinGap };
  };

  // the teacher's exam-period availability (not the weekly one: there are no classes)
  const teacherFree = (teacherId: string, date: string, start: string, end: string) =>
    examAvailable(idx.teachers.get(teacherId)?.examUnavailable, date, start, end);
  // the rooms the group is taught the subject in come first (usually where the exam is held)
  const roomsFor = (size: number, groupId: string, subjectId: string): Room[] => {
    const taught = new Set(
      classes
        .filter((l) => {
          const a = idx.assignmentOf(l);
          return a?.subjectId === subjectId && idx.audienceTouchesGroup(a.audience, groupId);
        })
        .map((l) => l.roomId),
    );
    return ds.rooms
      .filter((r) => r.type !== 'lab' && !r.equipment.includes('sport') && r.capacity >= size)
      .sort((a, b) => Number(taught.has(b.id)) - Number(taught.has(a.id)) || a.capacity - b.capacity);
  };

  // groups with the most exams first; a little randomness between runs
  const order = rng.shuffle(groupIds).sort((a, b) => examSubjects(ds, idx, b).length - examSubjects(ds, idx, a).length);

  for (const groupId of order) {
    const group = idx.groups.get(groupId);
    if (!group) continue;
    const gev = cycleEv[group.cycle ?? 'licenta'];
    const { minutes, window, minGap } = rules(gev);
    const ranges = round === 'reexam' ? gev.reexamSession : group.studyForm === 'reduced' ? gev.reducedExamSession : gev.examSession;
    // frecvență: weekdays only; frecvență redusă may also use the weekend
    const days = group.studyForm === 'reduced' ? gev.reducedExamDays : gev.examDays;
    const dates = rangeDates(ranges, days, gev.vacations);
    const subjects = rng
      .shuffle(examSubjects(ds, idx, groupId))
      .sort((a, b) => (idx.subjects.get(b)?.credits ?? 0) - (idx.subjects.get(a)?.credits ?? 0));
    const size = idx.audienceSize({ kind: 'group', id: groupId });
    let last: string | null = null;

    subjects.forEach((subjectId) => {
      const teacherId = examinerOf(ds, idx, groupId, subjectId);
      if (!teacherId || !dates.length) {
        warnings.push({ groupId, subjectId, kind: 'unplaced' });
        return;
      }
      const rooms = roomsFor(size, groupId, subjectId);
      let done: ExamEvent | null = null;
      for (let gap = minGap; gap >= 0 && !done; gap--) {
        const earliest = last ? addDays(last, gap + 1) : dates[0];
        // one day exam, one day off: the earliest day after the free day(s)
        const candidates = dates.filter((d) => d >= earliest);
        for (const date of candidates) {
          for (const start of rng.shuffle(window)) {
            const end = toHHMM(toMin(start) + minutes);
            if (!teacherFree(teacherId, date, start, end)) continue;
            const room = rooms.find((r) =>
              free({ id: '', kind: 'exam', round, subjectId, groupId, teacherId, roomId: r.id, date, start, end }),
            );
            if (!room) continue;
            const exam: ExamEvent = { id: newId(), kind: 'exam', round, subjectId, groupId, teacherId, roomId: room.id, date, start, end };
            const consultation = consultationFor(
              gev,
              days,
              exam,
              rng,
              rooms,
              (e) => free(e) && !clash(e, exam) && teacherFree(teacherId, e.date, e.start, e.end),
            );
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

/** Is the teacher available to examine then? (exam-period availability: whole or half days) */
export function examAvailable(unavailable: string[] | undefined, date: string, start: string, end: string): boolean {
  if (!unavailable?.length) return true;
  if (unavailable.includes(date)) return false;
  const noon = 13 * 60;
  if (toMin(start) < noon && unavailable.includes(`${date}|am`)) return false;
  if (toMin(end) > noon && unavailable.includes(`${date}|pm`)) return false;
  return true;
}

/** The working day before (a Monday exam's consultation is on Friday), skipping holidays. */
function previousExamDay(ev: EvaluationSettings, days: Day[], date: string): string {
  let d = addDays(date, -1);
  for (let i = 0; i < 21 && (!days.includes(dayIndexOf(parseDate(d)) as Day) || vacationOn(ev, d)); i++) d = addDays(d, -1);
  return d;
}

/** The consultation before an exam: same teacher, its room if free. */
function consultationFor(
  ev: EvaluationSettings,
  days: Day[],
  exam: ExamEvent,
  rng: Rng,
  rooms: Room[],
  free: (e: ExamEvent) => boolean,
): ExamEvent | null {
  const sameDay = { date: exam.date, start: toHHMM(toMin(exam.start) - 60), minutes: 45 };
  const before = previousExamDay(ev, days, exam.date);
  // right after a holiday (or on request) the consultation is the same day, just before the exam
  // (a weekend in between is fine: Friday's consultation for a Monday exam)
  const tries =
    ev.consultation === 'sameDay' || daysBetween(before, exam.date) > 3
      ? [sameDay]
      : // any time in the exam hours of that day, different from one exam to the next
        rng
          .shuffle(startTimesIn(ev.examFrom, ev.examTo, ev.consultationMinutes))
          .map((start) => ({ date: before, start, minutes: ev.consultationMinutes }));
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
      if (!overlaps(a, b) || (a.lessonId && a.lessonId === b.lessonId)) continue;
      const what = a.teacherId === b.teacherId ? 'teacher' : a.roomId === b.roomId ? 'room' : sameStudents(a, b) ? 'group' : null;
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

type MidtermPick = { lesson: Lesson; date: string };

/** Teaching weeks of one atestare period (e.g. 7 and 8). */
export const midtermWeeksOf = (ev: EvaluationSettings, n: 1 | 2) =>
  Array.from({ length: Math.max(1, ev.midtermSpanWeeks) }, (_, i) => ev.midtermWeeks[n - 1] + i);

/** "7–8": the weeks of an atestare period, for labels. */
export const weeksLabel = (ev: EvaluationSettings, n: 1 | 2) => {
  const w = midtermWeeksOf(ev, n);
  return w.length > 1 ? `${w[0]}–${w[w.length - 1]}` : String(w[0]);
};

/** First and last day of an atestare period. */
export function midtermRange(ev: EvaluationSettings, n: 1 | 2): DateRange {
  const weeks = midtermWeeksOf(ev, n);
  return { start: teachingWeek(ev, weeks[0]).start, end: teachingWeek(ev, weeks[weeks.length - 1]).end };
}

/**
 * A group's atestări in class over the period: for each subject one of its own
 * classes (seminar, else lab, else lecture; a lab for each subgroup), so that no
 * student has two atestări on the same day. Falls back to a shared day only if
 * the classes leave no other choice.
 */
function groupMidterms(
  ds: Dataset,
  idx: DatasetIndex,
  lessons: Lesson[],
  groupId: string,
  n: 1 | 2,
  cache: Map<string, (MidtermPick & { subjectId: string })[]>,
): (MidtermPick & { subjectId: string })[] {
  const key = `${groupId}|${n}`;
  if (cache.has(key)) return cache.get(key)!;
  const ev = evaluationForGroup(ds, idx, groupId);
  const group = idx.groups.get(groupId);
  const views = group && group.subgroups > 1 ? Array.from({ length: group.subgroups }, (_, i) => i + 1) : [0];
  const mine = lessons.filter((l) => !l.date && idx.audienceTouchesGroup(idx.assignmentOf(l)!.audience, groupId));
  // one item per subject and audience (a lab per subgroup), with every date it could be held on
  const items: { subjectId: string; views: number[]; options: MidtermPick[] }[] = [];
  for (const subjectId of new Set(mine.map((l) => idx.assignmentOf(l)!.subjectId))) {
    const own = mine.filter((l) => idx.assignmentOf(l)!.subjectId === subjectId);
    const type = TYPE_ORDER.find((tp) => own.some((l) => idx.assignmentOf(l)!.type === tp));
    const byAudience = new Map<string, Lesson[]>();
    for (const l of own.filter((x) => idx.assignmentOf(x)!.type === type)) {
      const k = JSON.stringify(idx.assignmentOf(l)!.audience);
      byAudience.set(k, [...(byAudience.get(k) ?? []), l]);
    }
    for (const list of byAudience.values()) {
      const aud = idx.assignmentOf(list[0])!.audience;
      const options = midtermWeeksOf(ev, n)
        .flatMap((w) => {
          const start = teachingWeek(ev, w).start;
          const parity = w % 2 === 1 ? 'odd' : 'even';
          return list.filter((l) => l.parity === 'weekly' || l.parity === parity).map((l) => ({ lesson: l, date: addDays(start, l.day) }));
        })
        .filter((o) => !vacationOn(ev, o.date))
        .sort((a, b) => a.date.localeCompare(b.date) || a.lesson.slot - b.lesson.slot);
      // a whole-group seminar can fall back to the subject's lecture on another day (one atestare a day comes first)
      const fallback: MidtermPick[] = [];
      if (aud.kind !== 'subgroup' && type !== 'lecture') {
        const lectures = own.filter((l) => idx.assignmentOf(l)!.type === 'lecture');
        for (const w of midtermWeeksOf(ev, n)) {
          const start = teachingWeek(ev, w).start;
          const parity = w % 2 === 1 ? 'odd' : 'even';
          for (const l of lectures.filter((x) => x.parity === 'weekly' || x.parity === parity)) {
            const date = addDays(start, l.day);
            if (!vacationOn(ev, date)) fallback.push({ lesson: l, date });
          }
        }
      }
      if (options.length || fallback.length)
        items.push({ subjectId, views: aud.kind === 'subgroup' ? [aud.subgroup] : views, options: [...options, ...fallback] });
    }
  }
  // fewest choices first; backtrack so that no view gets two atestări on one date
  items.sort((a, b) => a.options.length - b.options.length);
  const taken = new Map<string, Set<number>>(); // date → views already sitting an atestare
  const chosen: (MidtermPick | null)[] = items.map(() => null);
  const fits = (i: number, o: MidtermPick) => !items[i].views.some((v) => taken.get(o.date)?.has(v));
  const mark = (i: number, o: MidtermPick, on: boolean) => {
    const set = taken.get(o.date) ?? new Set<number>();
    for (const v of items[i].views) on ? set.add(v) : set.delete(v);
    taken.set(o.date, set);
  };
  let steps = 0;
  const solve = (i: number): boolean => {
    if (i === items.length) return true;
    if (++steps > 20000) return false;
    for (const o of items[i].options) {
      if (!fits(i, o)) continue;
      mark(i, o, true);
      chosen[i] = o;
      if (solve(i + 1)) return true;
      mark(i, o, false);
      chosen[i] = null;
    }
    return false;
  };
  if (!solve(0)) {
    // no way to keep them all on separate days: place greedily, sharing a day only where needed
    taken.clear();
    items.forEach((it, i) => {
      const o = it.options.find((x) => fits(i, x)) ?? it.options[0];
      mark(i, o, true);
      chosen[i] = o;
    });
  }
  const out = items.map((it, i) => ({ ...chosen[i]!, subjectId: it.subjectId }));
  cache.set(key, out);
  return out;
}

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
  const cache = new Map<string, (MidtermPick & { subjectId: string })[]>();
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
        chosen = groupMidterms(ds, idx, lessons, groupId, n, cache).filter((m) => m.subjectId === subjectId);
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
 * Atestări timetable for teaching week 7 (or 14). Held in class: each subject's
 * atestare is its class that week, in that class's room (rooms can be changed
 * afterwards for exceptions). Held separately: after classes —
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
  /** Retake of the atestare: in its retake week, always after classes, in the retake hours. */
  retake = false,
): ExamResult {
  const round = retake ? (n === 1 ? 'remidterm1' : 'remidterm2') : n === 1 ? 'midterm1' : 'midterm2';
  // the period, days and hours of each study cycle (licență, master's)
  const makeCtx = (ev: EvaluationSettings) => {
    const weeks = retake ? [ev.midtermRetakeWeeks[n - 1]] : midtermWeeksOf(ev, n);
    const range = { start: teachingWeek(ev, weeks[0]).start, end: teachingWeek(ev, weeks[weeks.length - 1]).end };
    const parityOn = (date: string) => {
      const w =
        weeks.find((x) => {
          const r = teachingWeek(ev, x);
          return r.start <= date && date <= r.end;
        }) ?? weeks[0];
      return w % 2 === 1 ? 'odd' : 'even';
    };
    return {
      ev,
      parityOn,
      dates: sessionDates(range.start, range.end, ev.examDays).filter((d) => !vacationOn(ev, d)),
      times: retake ? startTimesIn(ev.reexamFrom, ev.reexamTo, ev.midtermMinutes) : ev.midtermStartTimes,
      // reduced attendance retakes its atestări in its exam session (weekends allowed)
      reducedDates: rangeDates(ev.reducedExamSession, ev.reducedExamDays, ev.vacations),
    };
  };
  const ctxs = { licenta: makeCtx(evaluationOf(ds)), master: makeCtx(evaluationOf(ds, 'master')) };
  const placed: ExamEvent[] = [];
  const warnings: ExamResult['warnings'] = [];
  const all = () => [...busy, ...placed];

  // what the weekly timetable already occupies on a date
  const classesAt = (date: string, start: string, end: string, parityOn: (d: string) => string) => {
    const day = dayIndexOf(parseDate(date));
    const parity = parityOn(date) as 'odd' | 'even';
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
    // held in the subject's own class (or a reduced-attendance group's session class): its time and room
    const reduced = idx.groups.get(groupId)?.studyForm === 'reduced';
    const { ev, parityOn, dates, times, reducedDates } = ctxs[idx.groups.get(groupId)?.cycle ?? 'licenta'];
    if (!retake && (ev.midtermMode === 'inClass' || reduced)) {
      for (const m of midtermsFor(ds, idx, classes, { groupId }).filter((x) => x.n === n)) {
        const a = idx.assignmentOf(m.lesson)!;
        const slot = ds.settings.slots[m.lesson.slot];
        placed.push({
          id: newId(),
          kind: 'exam',
          round,
          subjectId: a.subjectId,
          groupId,
          teacherId: a.teacherId,
          roomId: m.lesson.roomId,
          date: m.date,
          start: slot.start,
          end: slot.end,
          lessonId: m.lesson.id,
          subgroup: a.audience.kind === 'subgroup' ? a.audience.subgroup : undefined,
        });
      }
      continue;
    }
    const subjects = rng.shuffle(groupSubjects(ds, idx, groupId));
    const size = idx.audienceSize({ kind: 'group', id: groupId });
    subjects.forEach((subjectId, i) => {
      const teacherId = examinerOf(ds, idx, groupId, subjectId);
      if (!teacherId) return;
      // round-robin over the week's days, two a day at most
      const groupDates = reduced ? reducedDates : dates;
      const startAt = Math.floor((i * groupDates.length) / Math.max(1, subjects.length));
      const order = [...groupDates.slice(startAt), ...groupDates.slice(0, startAt)];
      for (const date of order) {
        // one atestare a day per group
        if (all().some((e) => e.groupId === groupId && e.date === date && e.round === round)) continue;
        for (const start of times) {
          const end = toHHMM(toMin(start) + ev.midtermMinutes);
          const taken = classesAt(date, start, end, parityOn);
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
