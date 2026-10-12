import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { freeRooms, teacherStateAt } from './availability';
import { DatasetIndex } from './indexes';
import type { Lesson } from './types';

const idx = new DatasetIndex(seedDataset);
const lessons: Lesson[] = [
  { id: 'x', assignmentId: 'a1', day: 0, slot: 1, roomId: 'r1', parity: 'weekly' }, // t3 in 3-114
  { id: 'y', assignmentId: 'a6', day: 0, slot: 2, roomId: 'r2', parity: 'odd' }, // t7 in 3-101, odd weeks
];

describe('freeRooms', () => {
  it('excludes busy rooms and respects filters', () => {
    const free = freeRooms(seedDataset.rooms, lessons, 0, 1, 'odd', { minCapacity: 100 });
    expect(free).toEqual([]);
    expect(freeRooms(seedDataset.rooms, lessons, 0, 2, 'even', { minCapacity: 70 }).map((r) => r.name)).toEqual([
      '3-101',
      '9-101',
      '3-114',
    ]);
    expect(freeRooms(seedDataset.rooms, lessons, 0, 2, 'odd', { minCapacity: 70 }).map((r) => r.name)).toEqual(['9-101', '3-114']);
    expect(
      freeRooms(seedDataset.rooms, [], 0, 0, 'weekly', { equipment: 'calculatoare' }).every((r) => r.equipment.includes('calculatoare')),
    ).toBe(true);
  });
});

describe('teacherStateAt', () => {
  it('reports teaching, unavailable and free', () => {
    expect(teacherStateAt(idx, lessons, 't3', 0, 1, 'weekly')).toBe('teaching');
    expect(teacherStateAt(idx, lessons, 't3', 4, 0, 'weekly')).toBe('unavailable'); // Fridays off
    expect(teacherStateAt(idx, lessons, 't3', 1, 1, 'weekly')).toBe('free');
    expect(teacherStateAt(idx, lessons, 't7', 0, 2, 'even')).toBe('free');
  });
});

describe('one-off unavailability (Teacher.unavailableOn)', () => {
  const ds = structuredClone(seedDataset);
  ds.teachers.find((t) => t.id === 't3')!.unavailableOn = ['2026-10-22:2'];
  const i = new DatasetIndex(ds);
  it('counts only on that date, not on the same weekday of other weeks', () => {
    expect(teacherStateAt(i, [], 't3', 3, 2, 'weekly', '2026-10-22')).toBe('unavailable');
    expect(teacherStateAt(i, [], 't3', 3, 2, 'weekly', '2026-10-29')).toBe('free');
    expect(teacherStateAt(i, [], 't3', 3, 2, 'weekly')).toBe('free');
  });
});
