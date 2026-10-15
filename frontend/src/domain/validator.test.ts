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
      roomType: 'lecture',
      equipment: [],
    },
    {
      id: 'lab1',
      subjectId: 'sub3',
      type: 'lab',
      teacherId: 't1',
      audience: { kind: 'subgroup', id: 'g1', subgroup: 1 },
      // every other week: the odd-week pair below is all of it
      pairsPerWeek: 0.5,
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
    // lab2 alternates: even weeks Monday pair 4, odd weeks Tuesday pair 4 (still one pair per week)
    const lessons = [
      L('1', 'lec', 0, 1, 'r2'),
      L('2', 'lab1', 0, 3, 'r8', 'odd'),
      L('3', 'lab2', 0, 3, 'r8', 'even'),
      L('4', 'lab2', 1, 3, 'r9', 'odd'),
    ];
    expect(kinds(lessons)).toEqual([]);
  });

  it('counts pairs week by week: half pairs, alternating pairs, and an uneven split', () => {
    const rest = [L('1', 'lec', 0, 1, 'r2'), L('2', 'lab1', 0, 2, 'r8', 'odd')];
    // a load of 1 alternating between two times is complete
    expect(kinds([...rest, L('3', 'lab2', 0, 3, 'r9', 'odd'), L('4', 'lab2', 1, 3, 'r9', 'even')])).toEqual([]);
    // one pair every other week is half of it
    expect(kinds([...rest, L('3', 'lab2', 0, 3, 'r9', 'even')])).toEqual(['hours-missing']);
    // two odd-week pairs: one pair per week in total, but none in even weeks
    expect(kinds([...rest, L('3', 'lab2', 0, 3, 'r9', 'odd'), L('4', 'lab2', 1, 3, 'r9', 'odd')])).toEqual(['hours-uneven']);
    // a weekly pair for a load of 0.5 is too much
    expect(kinds([L('1', 'lec', 0, 1, 'r2'), L('2', 'lab1', 0, 2, 'r8'), L('3', 'lab2', 0, 3, 'r9')])).toEqual(['hours-extra']);
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

  it('keeps every teacher of a project busy, not only the main one', () => {
    // t6 holds the project of g3 together with t3, who also gives the stream lecture
    const withProject: Dataset = {
      ...ds,
      assignments: [
        ...ds.assignments,
        {
          id: 'proj',
          subjectId: 'sub1',
          type: 'project',
          teacherId: 't6',
          coTeacherIds: ['t3'],
          audience: { kind: 'group', id: 'g3' },
          pairsPerWeek: 1,
          roomType: 'seminar',
          equipment: [],
        },
      ],
    };
    const at = (slot: number) => [
      L('1', 'lec', 0, 1, 'r2'),
      L('2', 'lab1', 0, 2, 'r8', 'odd'),
      L('3', 'lab2', 0, 2, 'r9'),
      L('4', 'proj', 0, slot, 'r4'),
    ];
    const conflicts = (lessons: Lesson[]) => findHardConflicts(withProject, lessons);
    expect(conflicts(at(3))).toEqual([]);
    expect(conflicts(at(1))).toEqual([expect.objectContaining({ kind: 'teacher-clash', subjectId: 't3' })]);
  });

  it('checks a teacher who is off in one kind of week only against the weeks a pair runs in', () => {
    // t3 (the stream lecture) can't come on Wednesdays, pair 2, in odd weeks only
    const offOdd: Dataset = {
      ...ds,
      teachers: ds.teachers.map((x) => (x.id === 't3' ? { ...x, unavailable: [], unavailableOdd: ['2:1'] } : x)),
    };
    const at = (parity: Lesson['parity']) =>
      findHardConflicts(offOdd, [L('1', 'lec', 2, 1, 'r2', parity), L('2', 'lab1', 0, 2, 'r8', 'odd'), L('3', 'lab2', 0, 2, 'r9')])
        .map((c) => c.kind)
        .filter((k) => k === 'teacher-unavailable');
    expect(at('weekly')).toEqual(['teacher-unavailable']); // every week includes the odd ones
    expect(at('odd')).toEqual(['teacher-unavailable']);
    expect(at('even')).toEqual([]);
  });
});
