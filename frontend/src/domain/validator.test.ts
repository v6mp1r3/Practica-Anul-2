import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import type { Dataset, Lesson } from './types';
import { findHardConflicts } from './validator';

// A tiny dataset: two groups in one stream, one subgroup lab each.
const ds: Dataset = {
  ...seedDataset,
  assignments: [
    {
      id: 'lec',
      subjectId: 'sub1',
      type: 'lecture',
      teacherId: 't3',
      audience: { kind: 'stream', id: 's1' },
      pairsPerWeek: 1,
      parity: 'weekly',
      roomType: 'lecture',
      equipment: [],
    },
    {
      id: 'lab1',
      subjectId: 'sub3',
      type: 'lab',
      teacherId: 't1',
      audience: { kind: 'subgroup', id: 'g1', subgroup: 1 },
      pairsPerWeek: 1,
      parity: 'odd',
      roomType: 'lab',
      equipment: ['calculatoare'],
    },
    {
      id: 'lab2',
      subjectId: 'sub3',
      type: 'lab',
      teacherId: 't6',
      audience: { kind: 'subgroup', id: 'g1', subgroup: 2 },
      pairsPerWeek: 1,
      parity: 'weekly',
      roomType: 'lab',
      equipment: ['calculatoare'],
    },
  ],
};

const L = (id: string, assignmentId: string, day: number, slot: number, roomId: string, parity: Lesson['parity'] = 'weekly'): Lesson => ({
  id,
  assignmentId,
  day,
  slot,
  roomId,
  parity,
});

const kinds = (lessons: Lesson[]) =>
  findHardConflicts(ds, lessons)
    .map((c) => c.kind)
    .sort();

describe('findHardConflicts', () => {
  it('accepts a valid timetable', () => {
    expect(kinds([L('1', 'lec', 0, 1, 'r2'), L('2', 'lab1', 0, 2, 'r8', 'odd'), L('3', 'lab2', 0, 2, 'r9')])).toEqual([]);
  });

  it('lets two subgroups of the same group have labs at the same time', () => {
    expect(kinds([L('1', 'lec', 1, 1, 'r2'), L('2', 'lab1', 0, 2, 'r8', 'odd'), L('3', 'lab2', 0, 2, 'r9')])).toEqual([]);
  });

  it('flags a stream lecture overlapping a subgroup lab', () => {
    expect(kinds([L('1', 'lec', 0, 2, 'r2'), L('2', 'lab1', 0, 2, 'r8', 'odd'), L('3', 'lab2', 1, 2, 'r9')])).toEqual(['group-clash']);
  });

  it('flags a room used twice', () => {
    expect(kinds([L('1', 'lec', 0, 1, 'r2'), L('2', 'lab1', 0, 3, 'r8', 'odd'), L('3', 'lab2', 0, 3, 'r8')])).toEqual(['room-clash']);
  });

  it('does not flag odd and even lessons sharing a room', () => {
    const lessons = [L('1', 'lec', 0, 1, 'r2'), L('2', 'lab1', 0, 3, 'r8', 'odd'), L('3', 'lab2', 0, 3, 'r8', 'even')];
    expect(kinds(lessons)).toEqual([]);
  });

  it('flags teacher unavailability, room capacity and room type', () => {
    // t1 is unavailable on Friday pair 5; r8 (16 seats) is too small for the stream and is a lab
    expect(kinds([L('1', 'lec', 0, 1, 'r8'), L('2', 'lab1', 4, 4, 'r9', 'odd'), L('3', 'lab2', 0, 2, 'r9')])).toEqual([
      'room-capacity',
      'room-type',
      'teacher-unavailable',
    ]);
  });

  it('flags missing equipment', () => {
    expect(kinds([L('1', 'lec', 0, 1, 'r2'), L('2', 'lab1', 0, 2, 'r4', 'odd'), L('3', 'lab2', 0, 2, 'r9')])).toContain('room-equipment');
  });

  it('flags missing and extra hours', () => {
    expect(kinds([L('1', 'lec', 0, 1, 'r2'), L('1b', 'lec', 1, 1, 'r2'), L('3', 'lab2', 0, 2, 'r9')])).toEqual([
      'hours-extra',
      'hours-missing',
    ]);
  });
});
