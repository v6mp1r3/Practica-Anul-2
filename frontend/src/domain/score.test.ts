import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { findWarnings, gapsInDay, scoreTimetable } from './score';
import type { Dataset, Lesson } from './types';

const ds: Dataset = {
  ...seedDataset,
  settings: { ...seedDataset.settings, weekParity: false },
  assignments: [
    {
      id: 'x',
      subjectId: 'sub1',
      type: 'seminar',
      teacherId: 't4',
      audience: { kind: 'group', id: 'g1' },
      pairsPerWeek: 2,
      parity: 'weekly',
      roomType: 'seminar',
      equipment: [],
    },
  ],
};

describe('gapsInDay', () => {
  it('counts empty pairs between lessons', () => {
    expect(gapsInDay([])).toBe(0);
    expect(gapsInDay([3])).toBe(0);
    expect(gapsInDay([1, 2])).toBe(0);
    expect(gapsInDay([0, 3])).toBe(2);
    expect(gapsInDay([4, 0, 2])).toBe(2);
  });
});

describe('scoreTimetable', () => {
  const at = (slots: [number, number][]): Lesson[] =>
    slots.map(([day, slot], i) => ({ id: `l${i}`, assignmentId: 'x', day, slot, roomId: 'r4', parity: 'weekly' }));

  it('prefers back-to-back pairs over a gap', () => {
    const compact = scoreTimetable(
      ds,
      at([
        [0, 1],
        [0, 2],
      ]),
    );
    const gappy = scoreTimetable(
      ds,
      at([
        [0, 1],
        [0, 4],
      ]),
    );
    expect(compact.hard).toBe(0);
    expect(gappy.breakdown.teacherGaps).toBe(2);
    expect(gappy.soft).toBeGreaterThan(compact.soft);
  });

  it('penalises 08:00 starts when years have no shifts', () => {
    expect(
      scoreTimetable(
        { ...ds, settings: { ...ds.settings, yearShifts: [] } },
        at([
          [0, 0],
          [1, 1],
        ]),
      ).breakdown.earlyStarts,
    ).toBe(1);
  });

  it('keeps each year of study in its part of the day', () => {
    // g1 is year 1: pairs 1–4; pair 7 is three pairs past its shift
    expect(scoreTimetable(ds, at([[0, 0]])).breakdown.shiftMisses).toBe(0);
    expect(scoreTimetable(ds, at([[0, 6]])).breakdown.shiftMisses).toBe(3);
  });
});

describe('findWarnings', () => {
  it('reports a missing consultation hour', () => {
    const w = findWarnings(ds, [{ id: 'l', assignmentId: 'x', day: 0, slot: 1, roomId: 'r4', parity: 'weekly' }]);
    expect(w.some((c) => c.kind === 'no-consultation' && c.subjectId === 't4')).toBe(true);
  });

  it('reports a day with a single pair', () => {
    const w = findWarnings(ds, [
      { id: 'a', assignmentId: 'x', day: 0, slot: 1, roomId: 'r4', parity: 'weekly' },
      { id: 'b', assignmentId: 'x', day: 2, slot: 1, roomId: 'r4', parity: 'weekly' },
    ]);
    expect(w.filter((c) => c.kind === 'group-day-underload')).toHaveLength(2);
  });
});
