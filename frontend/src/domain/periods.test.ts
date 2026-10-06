import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { evaluationOf, generateExams, generateMidterms, teachingWeek } from './exams';
import { generateTimetable } from './generator';
import { DatasetIndex } from './indexes';
import { groupMidtermWeek, teachingWeeksOf } from './periods';
import { createRng } from './rng';
import type { Dataset } from './types';

const ev = evaluationOf(seedDataset);
const w = (n: number) => teachingWeek(ev, n);
// FAF-241 (g5) on internship in weeks 1–4, FAF-221 (g14) with only 4 weeks of classes
const ds: Dataset = {
  ...seedDataset,
  settings: {
    ...seedDataset.settings,
    groupPeriods: [
      { id: 'p1', kind: 'internship', start: w(1).start, end: w(4).end, groupIds: ['g5'] },
      // final year: 4 weeks of classes, its own exam session in week 5, then the internship
      { id: 'p2', kind: 'examSession', start: w(5).start, end: w(5).end, groupIds: ['g14'] },
      { id: 'p3', kind: 'internship', start: w(6).start, end: w(15).end, groupIds: ['g14'] },
    ],
  },
};
const idx = new DatasetIndex(ds);

describe('internships (stagii de practică)', () => {
  it('moves the atestări to the weeks the group is at university, like the UTM calendar', () => {
    expect(teachingWeeksOf(ds, ev, 'g5')).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(groupMidtermWeek(ds, ev, 'g5', 1)).toBe(9); // practice weeks 1–4 → atestarea 1 in week 9
    expect(groupMidtermWeek(ds, ev, 'g5', 2)).toBe(14);
    expect(groupMidtermWeek(ds, ev, 'g14', 1)).toBe(3); // four weeks of classes → a single atestare
    expect(groupMidtermWeek(ds, ev, 'g14', 2)).toBeNull();
    expect(groupMidtermWeek(ds, ev, 'g1', 1)).toBe(7); // no internship: the usual weeks
  });

  it('puts no atestare or exam inside an internship, and uses a final year’s own session', async () => {
    const groups = ['g5', 'g14', 'g1'];
    const { lessons } = await generateTimetable(ds, { groupIds: groups, seed: 3, iterations: 30 });
    const m1 = generateMidterms(ds, idx, groups, 1, lessons, [], createRng(1)).events;
    const m2 = generateMidterms(ds, idx, groups, 2, lessons, [], createRng(1)).events;
    for (const e of m1.filter((x) => x.groupId === 'g5')) expect(e.date >= w(9).start).toBe(true);
    expect(m2.some((e) => e.groupId === 'g14')).toBe(false);
    const exams = generateExams(ds, idx, groups, 'session', [], createRng(2)).events.filter(
      (e) => e.groupId === 'g14' && e.kind === 'exam',
    );
    expect(exams.length).toBeGreaterThan(0);
    for (const e of exams) expect(e.date >= w(5).start && e.date <= w(5).end).toBe(true);
  });
});
