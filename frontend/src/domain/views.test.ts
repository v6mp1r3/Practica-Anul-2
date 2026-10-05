import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { DatasetIndex } from './indexes';
import type { Lesson } from './types';
import { dayIndexOf, filterLessons, inWeek, weekParityOf } from './views';

const idx = new DatasetIndex(seedDataset);
// a1 = Year 1 AM lecture (stream "Anul I"); find a g1 subgroup-2 lab
const lab2 = seedDataset.assignments.find((a) => a.audience.kind === 'subgroup' && a.audience.id === 'g1' && a.audience.subgroup === 2)!;
const lessons: Lesson[] = [
  { id: 'x', assignmentId: 'a1', day: 0, slot: 0, roomId: 'r1', parity: 'weekly' },
  { id: 'y', assignmentId: lab2.id, day: 0, slot: 1, roomId: 'r8', parity: 'odd' },
];

describe('filterLessons', () => {
  it('includes stream lectures in a group view', () => {
    expect(filterLessons(idx, lessons, { kind: 'group', id: 'g3' }).map((l) => l.id)).toEqual(['x']);
  });
  it('filters by subgroup', () => {
    expect(filterLessons(idx, lessons, { kind: 'group', id: 'g1', subgroup: 1 }).map((l) => l.id)).toEqual(['x']);
    expect(filterLessons(idx, lessons, { kind: 'group', id: 'g1', subgroup: 2 }).map((l) => l.id)).toEqual(['x', 'y']);
  });
  it('filters by room and teacher', () => {
    expect(filterLessons(idx, lessons, { kind: 'room', id: 'r8' }).map((l) => l.id)).toEqual(['y']);
    expect(filterLessons(idx, lessons, { kind: 'teacher', id: 't3' }).map((l) => l.id)).toEqual(['x']);
  });
});

describe('week helpers', () => {
  it('shows odd lessons only in odd weeks', () => {
    expect(inWeek(lessons[1], 'odd')).toBe(true);
    expect(inWeek(lessons[1], 'even')).toBe(false);
    expect(inWeek(lessons[1], 'weekly')).toBe(true);
  });
  it('counts week parity from 1 September', () => {
    expect(weekParityOf(new Date(2026, 8, 2))).toBe('odd'); // first week
    expect(weekParityOf(new Date(2026, 8, 9))).toBe('even');
    expect(weekParityOf(new Date(2026, 8, 16))).toBe('odd');
  });
  it('uses Monday as day 0', () => {
    expect(dayIndexOf(new Date(2026, 9, 5))).toBe(0); // Mon 5 Oct 2026
    expect(dayIndexOf(new Date(2026, 9, 4))).toBe(6);
  });
});

describe('fmtTime', () => {
  it('shows 24-hour or 12-hour times', async () => {
    const { fmtTime } = await import('./slots');
    expect(fmtTime('17:06')).toBe('17:06');
    expect(fmtTime('17:06', '12h')).toBe('05:06 PM');
    expect(fmtTime('08:00', '12h')).toBe('08:00 AM');
    expect(fmtTime('12:30', '12h')).toBe('12:30 PM');
    expect(fmtTime('00:15', '12h')).toBe('12:15 AM');
  });
});
