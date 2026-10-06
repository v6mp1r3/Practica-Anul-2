// Helpers to slice a timetable by group, teacher, room or day.
import type { DatasetIndex } from './indexes';
import { paritiesOverlap } from './slots';
import type { Day, Lesson, Parity, SlotIndex } from './types';

export type ViewKind = 'group' | 'teacher' | 'room';

export interface ViewFilter {
  kind: ViewKind;
  id: string;
  /** Only for groups: show a single subgroup's week. */
  subgroup?: number | null;
}

export function filterLessons(idx: DatasetIndex, lessons: Lesson[], f: ViewFilter): Lesson[] {
  // "stream:<id>" stands for all the groups of a stream (e.g. FAF-251, FAF-252, FAF-253 together)
  const groupIds = f.kind === 'group' ? streamGroups(idx, f.id) : [];
  return lessons.filter((l) => {
    const a = idx.assignmentOf(l);
    if (!a) return false;
    if (f.kind === 'teacher') return a.teacherId === f.id;
    if (f.kind === 'room') return l.roomId === f.id;
    return idx
      .cohorts(a.audience)
      .some((c) => groupIds.includes(c.groupId) && (!f.subgroup || c.subgroup === null || c.subgroup === f.subgroup));
  });
}

/** The groups behind a group view id: the group itself, or every group of "stream:<id>". */
export function streamGroups(idx: DatasetIndex, id: string): string[] {
  return id.startsWith('stream:') ? (idx.streams.get(id.slice(7))?.groupIds ?? []) : [id];
}

/** Week filter: 'odd' shows weekly + odd lessons, 'even' weekly + even, 'weekly' shows everything. */
export const inWeek = (l: Lesson, week: Parity) => week === 'weekly' || paritiesOverlap(l.parity, week);

export function lessonsAt(lessons: Lesson[], day: Day, slot: SlotIndex): Lesson[] {
  return lessons.filter((l) => l.day === day && l.slot === slot);
}

/** Odd/even week of a date, counted from the semester start (1 Sept by default). */
export function weekParityOf(
  date: Date,
  semesterStart = new Date(date.getFullYear() - (date.getMonth() < 8 ? 1 : 0), 8, 1),
): 'odd' | 'even' {
  const monday = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const weeks = Math.floor((monday(date).getTime() - monday(semesterStart).getTime()) / (7 * 864e5));
  return weeks % 2 === 0 ? 'odd' : 'even';
}

/** Monday-based day index for a date (0 = Monday … 6 = Sunday). */
export const dayIndexOf = (date: Date) => (date.getDay() + 6) % 7;

/** Teacher load in pairs per week (biweekly pairs count as half). */
export function teacherLoad(idx: DatasetIndex, lessons: Lesson[], teacherId: string): number {
  return lessons.filter((l) => idx.assignmentOf(l)?.teacherId === teacherId).reduce((n, l) => n + (l.parity === 'weekly' ? 1 : 0.5), 0);
}
