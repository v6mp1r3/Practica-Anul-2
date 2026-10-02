// One-off schedule changes ("Modificări în orar"): which pairs happen on a
// given date, which rooms are free for a move, which teachers can substitute.
import { DatasetIndex } from './indexes';
import { paritiesOverlap, slotKey } from './slots';
import type { Dataset, Lesson, Room, ScheduleChange, Teacher } from './types';
import { dayIndexOf, inWeek, weekParityOf } from './views';

/** "YYYY-MM-DD" → local Date at midnight (avoids UTC shifts of `new Date(str)`). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Is the date inside one of the reduced-attendance sessions (or are there none)? */
export function inReducedSession(ds: Dataset, date: string): boolean {
  const sessions = ds.settings.reducedSessions ?? [];
  return sessions.length === 0 || sessions.some((s) => s.start <= date && date <= s.end);
}

/**
 * Pairs that take place on a date: right weekday, right week (with parity on),
 * and for reduced-attendance groups only inside one of their sessions.
 */
export function lessonsOnDate(ds: Dataset, lessons: Lesson[], date: string, idx = new DatasetIndex(ds)): Lesson[] {
  const d = parseDate(date);
  const day = dayIndexOf(d);
  if (day >= ds.settings.workingDays) return [];
  const week = ds.settings.weekParity ? weekParityOf(d) : 'weekly';
  const sessionDay = inReducedSession(ds, date);
  return lessons.filter((l) => {
    if (l.day !== day || !inWeek(l, week)) return false;
    if (sessionDay) return true;
    const a = idx.assignmentOf(l);
    return !a || !idx.cohorts(a.audience).some((c) => idx.groups.get(c.groupId)?.studyForm === 'reduced');
  });
}

/** The lesson a change refers to, on that date. */
export function lessonOfChange(ds: Dataset, lessons: Lesson[], c: ScheduleChange): Lesson | undefined {
  return lessonsOnDate(ds, lessons, c.date).find((l) => l.assignmentId === c.assignmentId && l.slot === c.slot);
}

/** Effective room and teacher of a lesson on a date, after the changes for that date. */
function effective(idx: DatasetIndex, lesson: Lesson, changes: ScheduleChange[]) {
  const mine = changes.filter((c) => c.assignmentId === lesson.assignmentId && c.slot === lesson.slot);
  const room = mine.find((c) => c.kind === 'room')?.roomId ?? lesson.roomId;
  const teacher = mine.find((c) => c.kind === 'teacher')?.teacherId ?? idx.assignmentOf(lesson)?.teacherId;
  return { room, teacher };
}

/** Rooms that fit the pair and are free at its slot on that date, smallest first. */
export function freeRoomsFor(
  ds: Dataset,
  idx: DatasetIndex,
  lessons: Lesson[],
  changes: ScheduleChange[],
  date: string,
  lesson: Lesson,
): Room[] {
  const a = idx.assignmentOf(lesson);
  if (!a) return [];
  const sameDay = changes.filter((c) => c.date === date);
  const others = lessonsOnDate(ds, lessons, date).filter(
    (l) => l.id !== lesson.id && l.slot === lesson.slot && paritiesOverlap(l.parity, lesson.parity),
  );
  const busy = new Set(others.map((l) => effective(idx, l, sameDay).room));
  const size = idx.audienceSize(a.audience);
  return ds.rooms
    .filter((r) => r.id !== lesson.roomId && !busy.has(r.id) && r.capacity >= size && idx.roomFits(a, r) && idx.hasEquipment(a, r))
    .sort((x, y) => x.capacity - y.capacity);
}

/**
 * Teachers who could take the pair: not teaching at that slot on that date and
 * not marked unavailable. Those who teach this activity type come first.
 */
export function freeTeachersFor(
  ds: Dataset,
  idx: DatasetIndex,
  lessons: Lesson[],
  changes: ScheduleChange[],
  date: string,
  lesson: Lesson,
): Teacher[] {
  const a = idx.assignmentOf(lesson);
  if (!a) return [];
  const sameDay = changes.filter((c) => c.date === date);
  const others = lessonsOnDate(ds, lessons, date).filter((l) => l.id !== lesson.id && l.slot === lesson.slot);
  const busy = new Set(others.map((l) => effective(idx, l, sameDay).teacher));
  const key = slotKey(lesson.day, lesson.slot);
  return ds.teachers
    .filter((t) => t.id !== a.teacherId && !busy.has(t.id) && !t.unavailable.includes(key))
    .sort((x, y) => Number(y.activityTypes.includes(a.type)) - Number(x.activityTypes.includes(a.type)) || x.name.localeCompare(y.name));
}

/** Changes from today onwards, soonest first, optionally only those touching a group or teacher. */
export function upcomingChanges(
  idx: DatasetIndex,
  changes: ScheduleChange[],
  today: Date,
  filter?: { groupId?: string; teacherId?: string },
): ScheduleChange[] {
  const from = toDateString(today);
  return changes
    .filter((c) => c.date >= from)
    .filter((c) => {
      if (!filter) return true;
      const a = idx.assignments.get(c.assignmentId);
      if (!a) return false;
      if (filter.groupId) return idx.audienceTouchesGroup(a.audience, filter.groupId);
      if (filter.teacherId) return a.teacherId === filter.teacherId || c.teacherId === filter.teacherId;
      return true;
    })
    .sort((x, y) => x.date.localeCompare(y.date) || x.slot - y.slot);
}
