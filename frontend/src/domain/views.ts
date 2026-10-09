// Helpers to slice a timetable by group, teacher, room or day.
import type { DatasetIndex } from './indexes';
import { paritiesOverlap, weekDays } from './slots';
import type { Day, Lesson, Parity, Settings, SlotIndex, Stream } from './types';

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

/**
 * Torente to offer in a "view by torent" list: every lecture has its own torent, so the
 * same groups come up many times — keep one per set of groups, labelled by its groups
 * (or by a predefined torent's name, like FAF).
 */
export function streamChoices(
  groups: { id: string; name: string }[],
  streams: Stream[],
): { id: string; label: string; groupIds: string[] }[] {
  const nameOf = new Map(groups.map((g) => [g.id, g.name]));
  const byKey = new Map<string, Stream>();
  for (const st of streams) {
    const key = [...st.groupIds].sort().join(',');
    const have = byKey.get(key);
    if (!have || (have.subjectId && !st.subjectId)) byKey.set(key, st);
  }
  return [...byKey.values()]
    .map((st) => {
      const names = st.groupIds
        .map((g) => nameOf.get(g))
        .filter(Boolean)
        .join(', ');
      return { id: st.id, label: st.subjectId ? names : `${st.name} (${names})`, groupIds: st.groupIds };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The dates of the week of `now`, Monday to Sunday ("YYYY-MM-DD"). */
export function datesOfWeek(now = new Date()): string[] {
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayIndexOf(now));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return isoDate(d);
  });
}

/**
 * Frecvență redusă pairs (on session dates) that fall in the week of `now`, put on their weekday so a
 * weekly grid can show them next to the weekly pairs.
 */
export function sessionPairsThisWeek(lessons: Lesson[], now = new Date()): Lesson[] {
  const dates = new Set(datesOfWeek(now));
  return lessons.filter((l) => l.date && dates.has(l.date)).map((l) => ({ ...l, date: undefined, parity: 'weekly' as const }));
}

/** The weekdays of a weekly grid, plus Saturday and Sunday when there are frecvență redusă pairs (they use weekends). */
export function gridDays(settings: Pick<Settings, 'workingDays' | 'formDays'>, lessons: Lesson[]): Day[] {
  const days = weekDays(settings);
  if (!lessons.some((l) => l.date)) return days;
  return [...new Set([...days, ...(settings.formDays?.reduced ?? [5, 6])])].sort((a, b) => a - b) as Day[];
}
