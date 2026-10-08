import type { Day, Parity, Settings, SlotIndex, SlotKey } from './types';

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

/**
 * The days of the weekly timetable: those of the forms taught every week
 * (frecvență, dual), Monday–Friday by default. Frecvență redusă meets on
 * weekends too, but only in its sessions, by date (SessionTimetable).
 */
export function weekDays(settings: Pick<Settings, 'workingDays' | 'formDays'>): Day[] {
  const days = [...new Set([...(settings.formDays?.full ?? []), ...(settings.formDays?.dual ?? [])])]
    .filter((d) => d < settings.workingDays)
    .sort((a, b) => a - b);
  return days.length ? days : range(Math.min(settings.workingDays, 5));
}

/** Format a stored "HH:MM" time for display in the institution's time format. */
export function fmtTime(hhmm: string | undefined, format: '24h' | '12h' = '24h'): string {
  if (!hhmm) return '';
  if (format === '24h') return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Read a typed time back to "HH:MM": "8:05", "0805", "17.30", "5:30 pm", "5 PM".
 * Returns null when it isn't a valid time.
 */
export function parseTime(text: string): string | null {
  const m = text
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?:[:.\s]?(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.[0];
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm === 'p' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
