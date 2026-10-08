import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { DatasetIndex } from '../domain/indexes';
import type { Lesson } from '../domain/types';
import { readCsvRows, timetableToCsv, timetableToCsvAllGroups, timetableToIcs } from './export';

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

describe('timetableToCsvAllGroups', () => {
  it('lists every group with its own classes, the group in the first column', () => {
    const groupIds = seedDataset.groups.map((g) => g.id);
    const rows = readCsvRows(timetableToCsvAllGroups(lessons, idx, seedDataset.settings, groupIds));
    expect(rows[0].slice(0, 2)).toEqual(['Grupa', 'Ziua']);
    // each row belongs to its group
    for (const r of rows.slice(1)) {
      const g = seedDataset.groups.find((x) => x.name === r[0])!;
      const l = lessons.find((x) => idx.subjects.get(idx.assignmentOf(x)!.subjectId)?.code === r[5])!;
      expect(idx.audienceTouchesGroup(idx.assignmentOf(l)!.audience, g.id)).toBe(true);
    }
    // a class shared by several groups is listed under each of them
    const perLesson = lessons.map((l) => groupIds.filter((g) => idx.audienceTouchesGroup(idx.assignmentOf(l)!.audience, g)).length);
    expect(rows).toHaveLength(1 + perLesson.reduce((a, b) => a + b, 0));
    // groups in name order
    const names = rows.slice(1).map((r) => r[0]);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ro', { numeric: true })));
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

describe('reduced-attendance session pairs', () => {
  const dated: Lesson = { id: 'd', assignmentId: 'a1', day: 2, slot: 1, roomId: 'r1', parity: 'weekly', date: '2026-10-14' };
  it('puts the date in the CSV', () => {
    const rows = readCsvRows(timetableToCsv([dated, ...lessons], idx, seedDataset.settings));
    expect(rows[0][11]).toBe('Data');
    expect(rows[3][11]).toBe('2026-10-14');
  });
  it('exports a single, non-recurring event', () => {
    const ics = timetableToIcs([dated], idx, seedDataset.settings, new Date(2026, 8, 1));
    expect(ics).toContain('DTSTART:20261014T094500');
    expect(ics).not.toContain('RRULE');
  });
});
