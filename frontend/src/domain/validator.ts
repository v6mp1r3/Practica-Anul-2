// Conflict validator — the same hard constraints the solver must respect
// (report §2.1.3). Runs in the browser so the editor can show clashes live.
import { DatasetIndex } from './indexes';
import { paritiesOverlap, slotKey } from './slots';
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
        if (!paritiesOverlap(x.parity, y.parity)) continue;
        const ax = idx.assignmentOf(x);
        const ay = idx.assignmentOf(y);
        if (!ax || !ay) continue;
        const base = { severity: 'hard' as const, lessonIds: [x.id, y.id], day: x.day, slot: x.slot };
        if (ax.teacherId === ay.teacherId) out.push({ ...base, kind: 'teacher-clash', subjectId: ax.teacherId });
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
    const teacher = idx.teachers.get(a.teacherId);
    if (teacher?.unavailable.includes(slotKey(l.day, l.slot))) {
      out.push({ ...base, kind: 'teacher-unavailable', subjectId: teacher.id });
    }
    const room = idx.rooms.get(l.roomId);
    if (room) {
      if (room.capacity < idx.audienceSize(a.audience)) out.push({ ...base, kind: 'room-capacity', subjectId: room.id });
      if (!idx.roomFits(a, room)) out.push({ ...base, kind: 'room-type', subjectId: room.id });
      if (!idx.hasEquipment(a, room)) out.push({ ...base, kind: 'room-equipment', subjectId: room.id });
    }
  }

  // Every assignment gets exactly its required number of pairs
  const placed = new Map<string, string[]>();
  for (const l of lessons) placed.set(l.assignmentId, [...(placed.get(l.assignmentId) ?? []), l.id]);
  for (const a of ds.assignments) {
    const ids = placed.get(a.id) ?? [];
    if (ids.length < a.pairsPerWeek) out.push({ kind: 'hours-missing', severity: 'hard', lessonIds: ids, subjectId: a.id });
    if (ids.length > a.pairsPerWeek) out.push({ kind: 'hours-extra', severity: 'hard', lessonIds: ids, subjectId: a.id });
  }

  return out;
}
