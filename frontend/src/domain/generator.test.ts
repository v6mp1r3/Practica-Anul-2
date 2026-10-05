import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { generateTimetable, scopeAssignments } from './generator';
import { DatasetIndex } from './indexes';
import type { Lesson } from './types';
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

describe('keeping other groups', () => {
  it('keeps another faculty’s pairs in place and avoids their rooms and teachers', async () => {
    const fcim = seedDataset.groups.filter((g) => g.faculty?.includes('Calculatoare')).map((g) => g.id);
    const fet = seedDataset.groups.filter((g) => g.faculty?.includes('Electronică')).map((g) => g.id);
    const first = await generateTimetable(seedDataset, { groupIds: fcim, seed: 5, iterations: 20 });
    const second = await generateTimetable(seedDataset, { groupIds: fet, seed: 6, iterations: 20, keep: first.lessons });
    for (const l of first.lessons) expect(second.lessons).toContainEqual(l);
    expect(findHardConflicts(seedDataset, second.lessons)).toEqual([]);
    expect(second.score.hard).toBe(0);
  });
});

describe('comfort rules', () => {
  it('leaves students without gaps and puts physical education first or last', async () => {
    const { score } = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 3, iterations: 250 });
    expect(score.breakdown.groupGaps).toBe(0);
    expect(score.breakdown.edgeMisses).toBe(0);
  });

  it('prefers the room marked "de dorit"', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: ['g1'], seed: 2, iterations: 40 });
    const pcLabs = lessons.filter(
      (l) => seedDataset.assignments.find((a) => a.id === l.assignmentId)?.subjectId === 'sub3' && l.roomId !== 'r1',
    );
    expect(pcLabs.some((l) => l.roomId === 'r8')).toBe(true);
  });
});

describe('parts of the day per year of study', () => {
  it('puts year 1 in the morning and years 3–4 after lunch', async () => {
    const idx = new DatasetIndex(seedDataset);
    const { lessons } = await generateTimetable(seedDataset, {
      groupIds: ['g1', 'g2', 'g3', 'g4', 'g13', 'g14'],
      seed: 5,
      iterations: 150,
    });
    const yearOf = (l: Lesson) => idx.groups.get(idx.cohorts(idx.assignmentOf(l)!.audience)[0].groupId)!.year;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const first = lessons.filter((l) => yearOf(l) === 1).map((l) => l.slot);
    const upper = lessons.filter((l) => yearOf(l) >= 3).map((l) => l.slot);
    expect(Math.max(...upper)).toBeGreaterThan(3);
    expect(avg(upper)).toBeGreaterThan(avg(first) + 1.5);
    // nearly everything inside its shift
    const outside = lessons.filter((l) => idx.shiftDistance(idx.assignmentOf(l)!, l.slot) > 0).length;
    expect(outside / lessons.length).toBeLessThan(0.1);
  });
});
