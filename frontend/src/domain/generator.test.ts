import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { dropExtra, generateTimetable, loadDrift, placeMissing, scopeAssignments, termSemester, timetableSemester } from './generator';
import { DatasetIndex } from './indexes';
import { ABSOLUTE_WEIGHT, SOFT_WEIGHTS, STRICT_WEIGHT, weightsFor } from './score';
import type { Dataset, Lesson } from './types';
import { scoreTimetable } from './score';
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

  it('follows an example timetable: its pairs stay where they were', async () => {
    const example = (await generateTimetable(seedDataset, { groupIds: allGroups, seed: 1, iterations: 30 })).lessons;
    const at = (l: Lesson) => `${l.assignmentId}|${l.date ?? l.day}|${l.slot}`;
    const before = new Set(example.map(at));
    const followed = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 99, iterations: 30, example });
    const fresh = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 99, iterations: 30 });
    const kept = (ls: Lesson[]) => ls.filter((l) => before.has(at(l))).length / ls.length;
    expect(kept(followed.lessons)).toBeGreaterThan(0.9);
    expect(kept(followed.lessons)).toBeGreaterThan(kept(fresh.lessons));
    expect(followed.score.hard).toBe(0);
  });

  it('only schedules the selected groups', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: ['g5'], seed: 3, iterations: 10 });
    const scoped = new Set(scopeAssignments(seedDataset, ['g5']).map((a) => a.id));
    expect(lessons.every((l) => scoped.has(l.assignmentId))).toBe(true);
  });

  it('only schedules the subjects of the chosen semester', async () => {
    const groupIds = ['g5'];
    const all = scopeAssignments(seedDataset, groupIds);
    const subject = seedDataset.subjects.find((s) => all.some((a) => a.subjectId === s.id))!;
    const ds: Dataset = {
      ...seedDataset,
      subjects: seedDataset.subjects.map((s) => (s.id === subject.id ? { ...s, semester: 2 } : s)),
    };
    const ids = (semester?: 1 | 2) => new Set(scopeAssignments(ds, groupIds, new DatasetIndex(ds), semester).map((a) => a.subjectId));
    expect(ids(2)).toEqual(new Set([subject.id]));
    expect(ids(1).has(subject.id)).toBe(false);
    expect(ids().has(subject.id)).toBe(true);
    const r = await generateTimetable(ds, { groupIds, seed: 1, iterations: 20, semester: 2 });
    const idx = new DatasetIndex(ds);
    expect(r.lessons.length).toBeGreaterThan(0);
    expect(r.lessons.every((l) => idx.assignmentOf(l)!.subjectId === subject.id)).toBe(true);
  });

  it('makes a comfort rule strict when it is switched off', async () => {
    expect(weightsFor({ allowThinDays: true })).toEqual(SOFT_WEIGHTS);
    // a day below the minimum is ruled out unless it is explicitly allowed
    expect(weightsFor().thinDays).toBe(ABSOLUTE_WEIGHT);
    // no gaps between students' pairs is absolute like the minimum; the other rules switched off are strict
    const w = weightsFor({ allowGroupGaps: false, allowTeacherGaps: false, allowThinDays: true });
    expect([w.groupGaps, w.teacherGaps, w.thinDays]).toEqual([ABSOLUTE_WEIGHT, STRICT_WEIGHT, SOFT_WEIGHTS.thinDays]);
    // the score saved with the timetable keeps the usual weights, so variants stay comparable
    const r = await generateTimetable(seedDataset, { groupIds: ['g5'], seed: 2, iterations: 20, rules: { allowGroupGaps: false } });
    expect(r.score.soft).toBe(scoreTimetable({ ...seedDataset, assignments: scopeAssignments(seedDataset, ['g5']) }, r.lessons).soft);
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
    const { score } = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 4, iterations: 250 });
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

describe('after the data changed', () => {
  it('places a new teaching load around the pairs already there, which stay put', async () => {
    const before = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 5, iterations: 20 });
    const base = seedDataset.assignments.find((a) => a.audience.kind === 'group' && a.type === 'seminar')!;
    const changed: Dataset = { ...seedDataset, assignments: [...seedDataset.assignments, { ...base, id: 'new', pairsPerWeek: 2 }] };
    expect(loadDrift(changed, before.lessons, allGroups).missing).toEqual([expect.objectContaining({ count: 2 })]);
    const after = placeMissing(changed, before.lessons, allGroups, 1);
    expect(after.placed).toBe(2);
    for (const l of before.lessons) expect(after.lessons).toContainEqual(l);
    expect(findHardConflicts(changed, after.lessons)).toEqual([]);
  });

  it('takes out the pairs a load no longer needs, never a locked one', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 5, iterations: 5 });
    const a = seedDataset.assignments.find((x) => x.pairsPerWeek === 2)!;
    const own = lessons.filter((l) => l.assignmentId === a.id);
    const locked = lessons.map((l) => (l.id === own[1].id ? { ...l, locked: true } : l));
    const fewer: Dataset = {
      ...seedDataset,
      assignments: seedDataset.assignments.map((x) => (x.id === a.id ? { ...x, pairsPerWeek: 1 } : x)),
    };
    const res = dropExtra(fewer, locked, allGroups);
    expect(res.removed).toBe(1);
    expect(res.lessons.filter((l) => l.assignmentId === a.id)).toEqual([expect.objectContaining({ id: own[1].id, locked: true })]);
  });
});

describe('odd and even weeks', () => {
  const groupIds = seedDataset.groups.map((g) => g.id);
  const loads = seedDataset.assignments.filter((a) => !new DatasetIndex(seedDataset).isReduced(a));

  it('places a half pair in odd or even weeks, and 1.5 as a weekly pair plus a half', async () => {
    const half = loads[0];
    const oneAndHalf = loads[1];
    const ds: Dataset = {
      ...seedDataset,
      assignments: seedDataset.assignments.map((a) =>
        a.id === half.id ? { ...a, pairsPerWeek: 0.5 } : a.id === oneAndHalf.id ? { ...a, pairsPerWeek: 1.5 } : a,
      ),
    };
    const { lessons } = await generateTimetable(ds, { groupIds, seed: 2, iterations: 30 });
    expect(findHardConflicts(ds, lessons)).toEqual([]);
    const parities = (id: string) =>
      lessons
        .filter((l) => l.assignmentId === id)
        .map((l) => l.parity)
        .sort();
    expect(['odd', 'even']).toContain(parities(half.id).join());
    expect(parities(oneAndHalf.id)).toHaveLength(2);
    expect(parities(oneAndHalf.id)).toContain('weekly');
  });

  it('makes a pair alternate: set it to odd weeks, then place the even-week pair elsewhere', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds, seed: 6, iterations: 10 });
    const one = lessons.find((l) => loads.some((a) => a.id === l.assignmentId && a.pairsPerWeek === 1))!;
    const odd = lessons.map((l) => (l.id === one.id ? { ...l, parity: 'odd' as const } : l));
    expect(loadDrift(seedDataset, odd, groupIds).missing).toEqual([
      expect.objectContaining({ count: 0.5, need: { odd: 0, even: 1, either: 0 } }),
    ]);
    const res = placeMissing(seedDataset, odd, groupIds, 3);
    expect(res.placed).toBe(0.5);
    expect(
      res.lessons
        .filter((l) => l.assignmentId === one.assignmentId)
        .map((l) => l.parity)
        .sort(),
    ).toEqual(['even', 'odd']);
    expect(findHardConflicts(seedDataset, res.lessons)).toEqual([]);
  });
});

describe('a timetable answers for one semester', () => {
  // the first load of g5 moves to semester 2: an autumn timetable no longer asks for it
  const groupIds = ['g5'];
  const subject = seedDataset.subjects.find((s) => scopeAssignments(seedDataset, groupIds).some((a) => a.subjectId === s.id))!;
  const ds: Dataset = { ...seedDataset, subjects: seedDataset.subjects.map((s) => (s.id === subject.id ? { ...s, semester: 2 } : s)) };

  it('is the semester most of its pairs belong to, the term’s when it has none', async () => {
    const idx = new DatasetIndex(ds);
    expect(termSemester(ds)).toBe(1);
    expect(termSemester({ ...ds, settings: { ...ds.settings, semester: 'Primăvara 2026/2027' } })).toBe(2);
    expect(timetableSemester(ds, [], idx)).toBe(1);
    const { lessons } = await generateTimetable(ds, { groupIds, seed: 1, iterations: 20, semester: 1 });
    expect(timetableSemester(ds, lessons, idx)).toBe(1);
    const spring = await generateTimetable(ds, { groupIds, seed: 1, iterations: 20, semester: 2 });
    expect(timetableSemester(ds, spring.lessons, idx)).toBe(2);
  });

  it('does not miss the loads of the other semester', async () => {
    const { lessons } = await generateTimetable(ds, { groupIds, seed: 1, iterations: 20, semester: 1 });
    const idx = new DatasetIndex(ds);
    expect(loadDrift(ds, lessons, groupIds, idx).missing).toEqual([]);
    // the spring subject is missing from an autumn timetable only when asked for explicitly
    expect(scopeAssignments(ds, groupIds, idx).some((a) => a.subjectId === subject.id)).toBe(true);
  });
});
