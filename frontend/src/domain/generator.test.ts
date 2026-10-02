import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { generateTimetable, scopeAssignments } from './generator';
import { findHardConflicts } from './validator';

const allGroups = seedDataset.groups.map((g) => g.id);

describe('generateTimetable', () => {
  it('builds a conflict-free timetable for the demo faculty', async () => {
    const { lessons, score } = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 1, iterations: 60 });
    expect(findHardConflicts(seedDataset, lessons)).toEqual([]);
    expect(score.hard).toBe(0);
  });

  it('is repeatable for the same seed', async () => {
    const a = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 7, iterations: 20 });
    const b = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 7, iterations: 20 });
    expect(a.lessons.map((l) => [l.assignmentId, l.day, l.slot, l.roomId])).toEqual(
      b.lessons.map((l) => [l.assignmentId, l.day, l.slot, l.roomId]),
    );
  });

  it('only schedules the selected groups', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: ['g5'], seed: 3, iterations: 10 });
    const scoped = new Set(scopeAssignments(seedDataset, ['g5']).map((a) => a.id));
    expect(lessons.every((l) => scoped.has(l.assignmentId))).toBe(true);
  });

  it('never moves locked lessons', async () => {
    const first = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 2, iterations: 5 });
    const locked = first.lessons.slice(0, 5).map((l) => ({ ...l, locked: true }));
    const { lessons } = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 9, iterations: 40, fixed: locked });
    for (const l of locked) expect(lessons).toContainEqual(l);
  });

  it('improves the soft score with more iterations', async () => {
    const quick = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 4, iterations: 0 });
    const long = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 4, iterations: 120 });
    expect(long.score.soft).toBeLessThanOrEqual(quick.score.soft);
  });
});
