import type { DatasetIndex } from './indexes';
import type { Assignment, Room } from './types';

// Where a room is, from its name: "3-114" is block 3, floor 1 (the first digit
// after the dash). UTM's exceptions: A-01…A-03 are on the first floor, D-01…D-04
// in the basement, and the short names (3-3, 5-1, 6-2) on the second floor.

/** -1 = basement, 0 = ground floor, then the floor number; null when the name does not say. */
export function floorOf(name: string): number | null {
  const n = name.trim().toUpperCase();
  if (/^A-0\d/.test(n)) return 1;
  if (/^D-0\d/.test(n)) return -1;
  const m = /^[^-]+-(\d+)/.exec(n);
  if (!m) return null;
  return m[1].length === 1 ? 2 : Number(m[1][0]);
}

/**
 * A class for one whole group that fits in none of the rooms it can use (e.g. a
 * group of 28 and the A0x labs with 14 seats) is held in two subgroups, one pair
 * each. If the group fits in a suitable room, it stays whole.
 */
export function needsSplit(
  idx: DatasetIndex,
  rooms: Room[],
  a: Pick<Assignment, 'audience' | 'roomType' | 'equipment'> & Partial<Assignment>,
): { size: number; largest: number } | null {
  if (a.audience.kind !== 'group') return null;
  const size = idx.audienceSize(a.audience);
  const caps = rooms.filter((r) => idx.roomFits(a as Assignment, r) && idx.hasEquipment(a as Assignment, r)).map((r) => r.capacity);
  if (!caps.length) return null;
  const largest = Math.max(...caps);
  return largest < size ? { size, largest } : null;
}
