import type { Day, Parity, SlotIndex, SlotKey } from './types';

export const slotKey = (day: Day, slot: SlotIndex): SlotKey => `${day}:${slot}`;

export function parseSlotKey(key: SlotKey): [Day, SlotIndex] {
  const [d, s] = key.split(':').map(Number);
  return [d, s];
}

/** Two lessons in the same slot only meet if their week patterns overlap. */
export function paritiesOverlap(a: Parity, b: Parity): boolean {
  return a === 'weekly' || b === 'weekly' || a === b;
}

/** Weight of one lesson in weekly load: a biweekly pair counts as half. */
export const parityWeight = (p: Parity) => (p === 'weekly' ? 1 : 0.5);

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
