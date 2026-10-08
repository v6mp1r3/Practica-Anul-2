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
