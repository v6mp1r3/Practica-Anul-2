// The equipment a room can have and a class can need. A fixed list, so rooms
// and classes use the same words (stored under these names in the database).
import type { Room, RoomType } from './types';

export const EQUIPMENT = [
  { value: 'calculatoare', key: 'computers' },
  { value: 'proiector', key: 'projector' },
  { value: 'televizor', key: 'tv' },
  { value: 'tablă interactivă', key: 'smartboard' },
  { value: 'microfon', key: 'audio' },
  { value: 'videoconferință', key: 'video' },
  { value: 'echipament rețea', key: 'network' },
  { value: 'electronică', key: 'electronics' },
  { value: 'laborator fizică', key: 'physics' },
  { value: 'sport', key: 'sport' },
] as const;

export type EquipmentKey = (typeof EQUIPMENT)[number]['key'];

/** Equipment that turns a room into a laboratory. */
const LAB_EQUIPMENT: string[] = ['calculatoare', 'echipament rețea', 'electronică', 'laborator fizică'];

/**
 * A room has no fixed type any more: any room fits a lecture or a seminar if it
 * is big enough. The type is still stored, worked out from the room itself:
 * a laboratory by its equipment, a lecture hall by its size.
 */
export function roomTypeOf(room: Pick<Room, 'capacity' | 'equipment'>): RoomType {
  if (room.equipment.some((e) => LAB_EQUIPMENT.includes(e))) return 'lab';
  return room.capacity >= 60 ? 'lecture' : 'seminar';
}
