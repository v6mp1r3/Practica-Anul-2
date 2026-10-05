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

/** Format a stored "HH:MM" time for display in the institution's time format. */
export function fmtTime(hhmm: string | undefined, format: '24h' | '12h' = '24h'): string {
  if (!hhmm) return '';
  if (format === '24h') return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
