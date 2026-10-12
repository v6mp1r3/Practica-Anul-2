// "Who/what is free when?" queries used by the student and teacher pages.
import type { DatasetIndex } from './indexes';
import { paritiesOverlap, slotKey } from './slots';
import type { Day, Lesson, Parity, Room, SlotIndex } from './types';

export function freeRooms(
  rooms: Room[],
  lessons: Lesson[],
  day: Day,
  slot: SlotIndex,
  week: Parity,
  opts: { minCapacity?: number; equipment?: string } = {},
): Room[] {
  const busy = new Set(
    lessons.filter((l) => !l.date && l.day === day && l.slot === slot && paritiesOverlap(l.parity, week)).map((l) => l.roomId),
  );
  return rooms
    .filter((r) => !busy.has(r.id) && r.capacity >= (opts.minCapacity ?? 0) && (!opts.equipment || r.equipment.includes(opts.equipment)))
    .sort((a, b) => a.capacity - b.capacity);
}

/** A pair on one date, as in Teacher.unavailableOn: "2026-10-19:2". */
export const dateSlotKey = (date: string, slot: SlotIndex) => `${date}:${slot}`;

export type TeacherSlotState = 'teaching' | 'unavailable' | 'consultation' | 'free';

export function teacherStateAt(
  idx: DatasetIndex,
  lessons: Lesson[],
  teacherId: string,
  day: Day,
  slot: SlotIndex,
  week: Parity,
  /** The actual date, when the grid shows a particular week: the teacher's one-off unavailability counts too. */
  date?: string,
): TeacherSlotState {
  const t = idx.teachers.get(teacherId);
  if (!t) return 'free';
  const k = slotKey(day, slot);
  if (t.consultation === k) return 'consultation';
  const teaching = lessons.some(
    (l) => !l.date && l.day === day && l.slot === slot && paritiesOverlap(l.parity, week) && idx.assignmentOf(l)?.teacherId === teacherId,
  );
  if (teaching) return 'teaching';
  if (t.unavailable.includes(k)) return 'unavailable';
  if (date && t.unavailableOn?.includes(dateSlotKey(date, slot))) return 'unavailable';
  return 'free';
}
