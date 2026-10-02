import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { generateTimetable } from './generator';
import { DatasetIndex } from './indexes';
import { precheck } from './precheck';
import type { Dataset, Lesson } from './types';
import { findHardConflicts } from './validator';

const idx = new DatasetIndex(seedDataset);
const allGroups = seedDataset.groups.map((g) => g.id);
const groupOf = (l: Lesson) => idx.cohorts(idx.assignmentOf(l)!.audience).map((c) => idx.groups.get(c.groupId)!);

describe('forms of study', () => {
  it('derives allowed days from the group form', () => {
    expect(idx.groupDays('g1')).toEqual([0, 1, 2, 3, 4]); // full-time
    expect(idx.groupDays('g8')).toEqual([5, 6]); // reduced attendance: weekend
    // a stream lecture shared by full-time and dual groups keeps the common days
    const streamLecture = seedDataset.assignments.find((a) => a.audience.kind === 'stream' && a.audience.id === 's4')!;
    expect(idx.allowedDays(streamLecture)).toEqual([0, 1, 2, 3, 4]);
  });

  it('has no blocking data problems with the extra forms', () => {
    expect(precheck(seedDataset).filter((i) => i.severity === 'hard')).toEqual([]);
  });

  it('generates every form together without conflicts and on the right days', async () => {
    const { lessons, score } = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 11, iterations: 60 });
    expect(score.hard).toBe(0);
    expect(findHardConflicts(seedDataset, lessons)).toEqual([]);
    for (const l of lessons) {
      for (const g of groupOf(l)) expect(idx.groupDays(g.id)).toContain(l.day);
    }
    expect(lessons.some((l) => groupOf(l).some((g) => g.studyForm === 'reduced'))).toBe(true);
  });

  it('can generate reduced attendance on its own, only at the weekend', async () => {
    const { lessons, score } = await generateTimetable(seedDataset, { groupIds: ['g8'], seed: 3, iterations: 30 });
    expect(score.hard).toBe(0);
    expect(lessons.length).toBe(7);
    expect(lessons.every((l) => l.day === 5 || l.day === 6)).toBe(true);
  });

  it('flags a pair placed on a day its form does not allow', () => {
    const reduced = seedDataset.assignments.find((a) => a.audience.kind === 'group' && a.audience.id === 'g8')!;
    const ds: Dataset = { ...seedDataset, assignments: [reduced] };
    const onMonday: Lesson = { id: 'x', assignmentId: reduced.id, day: 0, slot: 1, roomId: 'r1', parity: 'weekly' };
    expect(findHardConflicts(ds, [onMonday]).map((c) => c.kind)).toContain('wrong-day');
    expect(findHardConflicts(ds, [{ ...onMonday, day: 5 }]).map((c) => c.kind)).not.toContain('wrong-day');
  });
});
