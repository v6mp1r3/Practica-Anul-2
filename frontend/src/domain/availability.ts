// "Who/what is free when?" queries used by the student and teacher pages.
import type { DatasetIndex } from './indexes';
import { paritiesOverlap, slotKey } from './slots';
import type { Day, Lesson, Parity, Room, RoomType, SlotIndex } from './types';

export function freeRooms(
  rooms: Room[],
  lessons: Lesson[],
  day: Day,
  slot: SlotIndex,
  week: Parity,
  opts: { minCapacity?: number; type?: RoomType | '' } = {},
): Room[] {
  const busy = new Set(lessons.filter((l) => l.day === day && l.slot === slot && paritiesOverlap(l.parity, week)).map((l) => l.roomId));
  return rooms
    .filter((r) => !busy.has(r.id) && r.capacity >= (opts.minCapacity ?? 0) && (!opts.type || r.type === opts.type))
    .sort((a, b) => a.capacity - b.capacity);
}

export type TeacherSlotState = 'teaching' | 'unavailable' | 'consultation' | 'free';

export function teacherStateAt(
  idx: DatasetIndex,
  lessons: Lesson[],
  teacherId: string,
  day: Day,
  slot: SlotIndex,
  week: Parity,
): TeacherSlotState {
  const t = idx.teachers.get(teacherId);
  if (!t) return 'free';
  const k = slotKey(day, slot);
  if (t.consultation === k) return 'consultation';
  const teaching = lessons.some(
    (l) => l.day === day && l.slot === slot && paritiesOverlap(l.parity, week) && idx.assignmentOf(l)?.teacherId === teacherId,
  );
  if (teaching) return 'teaching';
  if (t.unavailable.includes(k)) return 'unavailable';
  return 'free';
}
