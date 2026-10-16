// Conflict validator — the same hard constraints the solver must respect
// (report §2.1.3). Runs in the browser so the editor can show clashes live.
import { DatasetIndex, teacherIdsOf, unavailableIn } from './indexes';
import { weekOf } from './views';
import { halvesOf, weekCounts, weekExcess, weekNeed } from './weeks';
import { lessonsOverlap } from './overlap';
import { slotKey } from './slots';
import type { Conflict, Dataset, Lesson } from './types';

export function groupBySlot(lessons: Lesson[]): Map<string, Lesson[]> {
  const map = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const k = slotKey(l.day, l.slot);
    const list = map.get(k);
    if (list) list.push(l);
    else map.set(k, [l]);
  }
  return map;
}

/** Hard constraint violations: the timetable is invalid while any exist. */
export function findHardConflicts(ds: Dataset, lessons: Lesson[], idx = new DatasetIndex(ds)): Conflict[] {
  const out: Conflict[] = [];
  const { settings } = ds;

  // Pairwise clashes inside the same slot
  for (const slotLessons of groupBySlot(lessons).values()) {
    for (let i = 0; i < slotLessons.length; i++) {
      for (let j = i + 1; j < slotLessons.length; j++) {
        const x = slotLessons[i];
        const y = slotLessons[j];
        if (!lessonsOverlap(x, y)) continue;
        const ax = idx.assignmentOf(x);
        const ay = idx.assignmentOf(y);
        if (!ax || !ay) continue;
        const base = { severity: 'hard' as const, lessonIds: [x.id, y.id], day: x.day, slot: x.slot };
        const shared = teacherIdsOf(ax).find((t) => teacherIdsOf(ay).includes(t));
        if (shared) out.push({ ...base, kind: 'teacher-clash', subjectId: shared });
        if (x.roomId === y.roomId) out.push({ ...base, kind: 'room-clash', subjectId: x.roomId });
        if (idx.audiencesOverlap(ax.audience, ay.audience)) {
          out.push({ ...base, kind: 'group-clash', subjectId: idx.cohorts(ax.audience)[0]?.groupId ?? '' });
        }
      }
    }
  }

  // Per-lesson checks
  for (const l of lessons) {
    const a = idx.assignmentOf(l);
    if (!a) continue;
    const base = { severity: 'hard' as const, lessonIds: [l.id], day: l.day, slot: l.slot };
    if (l.day < 0 || l.day >= settings.workingDays || l.slot < 0 || l.slot >= settings.slots.length) {
      out.push({ ...base, kind: 'outside-hours', subjectId: a.id });
    }
    if (l.day < settings.workingDays && !idx.allowedDays(a).includes(l.day)) {
      out.push({ ...base, kind: 'wrong-day', subjectId: a.id });
    }
    for (const tid of teacherIdsOf(a)) {
      const teacher = idx.teachers.get(tid);
      if (teacher && unavailableIn(teacher, weekOf(settings, l)).has(slotKey(l.day, l.slot))) {
        out.push({ ...base, kind: 'teacher-unavailable', subjectId: teacher.id });
      }
    }
    const room = idx.rooms.get(l.roomId);
    if (room) {
      if (room.capacity < idx.audienceSize(a.audience)) out.push({ ...base, kind: 'room-capacity', subjectId: room.id });
      // a class with mandatory rooms is only checked against them (any type of room will do)
      if (idx.requiredRoomIds(a).size) {
        if (!idx.requiredRoomIds(a).has(room.id)) out.push({ ...base, kind: 'room-required', subjectId: room.id });
      } else if (!idx.roomFits(a, room)) out.push({ ...base, kind: 'room-type', subjectId: room.id });
      if (!idx.hasEquipment(a, room)) out.push({ ...base, kind: 'room-equipment', subjectId: room.id });
    }
  }

  // Every assignment gets exactly its required number of pairs; a weekly load in odd and in even weeks alike
  const placed = new Map<string, Lesson[]>();
  for (const l of lessons) placed.set(l.assignmentId, [...(placed.get(l.assignmentId) ?? []), l]);
  for (const a of ds.assignments) {
    const own = placed.get(a.id) ?? [];
    const base = { severity: 'hard' as const, lessonIds: own.map((l) => l.id), subjectId: a.id };
    if (idx.isReduced(a)) {
      const need = idx.requiredPairs(a);
      if (own.length < need) out.push({ ...base, kind: 'hours-missing' });
      if (own.length > need) out.push({ ...base, kind: 'hours-extra' });
      continue;
    }
    const weekly = own.filter((l) => !l.date);
    if (weekExcess(a.pairsPerWeek, weekly)) out.push({ ...base, kind: 'hours-extra' });
    else if (halvesOf(weekNeed(a.pairsPerWeek, weekly))) {
      const [odd, even] = weekCounts(weekly);
      // the right number of pairs, all in one kind of week: odd weeks have more and even weeks fewer
      out.push({ ...base, kind: odd + even >= Math.round(2 * a.pairsPerWeek) ? 'hours-uneven' : 'hours-missing' });
    }
  }

  return out;
}
