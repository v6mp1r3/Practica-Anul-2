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
    expect(idx.groupDays('g8')).toEqual([0, 1, 2, 3, 4, 5, 6]); // reduced attendance: every day of its sessions
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

  it('schedules reduced attendance on real session dates, in blocks, without gaps', async () => {
    const { lessons, score } = await generateTimetable(seedDataset, { groupIds: ['g8'], seed: 3, iterations: 30 });
    expect(score.hard).toBe(0);
    // its own loads and the torent's lectures
    const perSession = seedDataset.assignments
      .filter((a) => idx.audienceTouchesGroup(a.audience, 'g8'))
      .reduce((n, a) => n + (a.pairsPerSession ?? 0), 0);
    expect(lessons.length).toBe(perSession * seedDataset.settings.reducedSessions.length);
    const inSession = (d: string) => seedDataset.settings.reducedSessions.some((x) => x.start <= d && d <= x.end);
    expect(lessons.every((l) => l.date && inSession(l.date))).toBe(true);
    // more than one weekday is used, and every date has its pairs back to back
    expect(new Set(lessons.map((l) => l.day)).size).toBeGreaterThan(2);
    const byDate = new Map<string, number[]>();
    for (const l of lessons) byDate.set(l.date!, [...(byDate.get(l.date!) ?? []), l.slot]);
    for (const slots of byDate.values()) expect(Math.max(...slots) - Math.min(...slots) + 1).toBe(slots.length);
    // spread over the whole session, not packed into its first week
    for (const x of seedDataset.settings.reducedSessions) {
      const mid = new Date(x.start);
      mid.setDate(mid.getDate() + 7);
      const second = mid.toISOString().slice(0, 10);
      expect([...byDate.keys()].some((d) => d >= second && d <= x.end)).toBe(true);
    }
  });

  it('keeps session pairs clear of full-time pairs that share a teacher or room', async () => {
    const all = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 8, iterations: 40 });
    expect(findHardConflicts(seedDataset, all.lessons)).toEqual([]);
  });

  it('flags a pair placed on a day its form does not allow', () => {
    const reduced = seedDataset.assignments.find((a) => a.audience.kind === 'group' && a.audience.id === 'g8')!;
    // an institution where reduced attendance only meets at the weekend
    const settings = { ...seedDataset.settings, formDays: { ...seedDataset.settings.formDays, reduced: [5, 6] } };
    const ds: Dataset = { ...seedDataset, settings, assignments: [reduced] };
    const onMonday: Lesson = { id: 'x', assignmentId: reduced.id, day: 0, slot: 1, roomId: 'r1', parity: 'weekly' };
    expect(findHardConflicts(ds, [onMonday]).map((c) => c.kind)).toContain('wrong-day');
    expect(findHardConflicts(ds, [{ ...onMonday, day: 5 }]).map((c) => c.kind)).not.toContain('wrong-day');
  });
});
