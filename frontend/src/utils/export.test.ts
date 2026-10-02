import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { DatasetIndex } from '../domain/indexes';
import type { Lesson } from '../domain/types';
import { readCsvRows, timetableToCsv, timetableToIcs } from './export';

const idx = new DatasetIndex(seedDataset);
const lessons: Lesson[] = [
  { id: 'b', assignmentId: 'a1', day: 1, slot: 2, roomId: 'r1', parity: 'weekly' },
  { id: 'a', assignmentId: 'a6', day: 0, slot: 0, roomId: 'r2', parity: 'odd' },
];

describe('timetableToCsv', () => {
  it('writes a header and one sorted row per lesson', () => {
    const rows = readCsvRows(timetableToCsv(lessons, idx, seedDataset.settings));
    expect(rows[0][0]).toBe('Ziua');
    expect(rows).toHaveLength(3);
    expect(rows[1].slice(0, 4)).toEqual(['Luni', '1', '08:00', '09:30']);
    expect(rows[1][10]).toBe('impar');
    expect(rows[2][5]).toBe('Analiză matematică');
  });
});

describe('timetableToIcs', () => {
  it('creates weekly and biweekly recurring events', () => {
    const ics = timetableToIcs(lessons, idx, seedDataset.settings, new Date(2026, 8, 1));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20260901T113000'); // Tuesday 1 Sept, pair 3
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=8');
    expect(ics).toContain('DTSTART:20260914T080000'); // Mon 31 Aug is before the start → next odd Monday
  });
});
