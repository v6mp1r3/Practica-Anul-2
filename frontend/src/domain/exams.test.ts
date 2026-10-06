import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import {
  evaluationOf,
  examSubjects,
  findExamProblems,
  generateExams,
  generateMidterms,
  midtermsFor,
  rangeDates,
  teachingWeek,
} from './exams';
import { generateTimetable } from './generator';
import { DatasetIndex } from './indexes';
import { createRng } from './rng';

const idx = new DatasetIndex(seedDataset);
const ev = evaluationOf(seedDataset);
const fcim = seedDataset.groups.filter((g) => g.faculty?.includes('Calculatoare')).map((g) => g.id);

describe('exam session', () => {
  const { events, warnings } = generateExams(seedDataset, idx, fcim, 'session', [], createRng(1));
  const exams = events.filter((e) => e.kind === 'exam');

  it('gives every group an exam for each exam subject, none for atestări-only subjects', () => {
    expect(warnings.filter((w) => w.kind === 'unplaced')).toEqual([]);
    for (const g of fcim) {
      const subjects = examSubjects(seedDataset, idx, g);
      expect(
        exams
          .filter((e) => e.groupId === g)
          .map((e) => e.subjectId)
          .sort(),
      ).toEqual([...subjects].sort());
      expect(subjects).not.toContain('sub6'); // English ends with atestări
    }
  });

  it('keeps exams inside the session, with the free days between them and no clashes', () => {
    const regular = rangeDates(ev.examSession, ev.examDays);
    for (const e of exams.filter((x) => idx.groups.get(x.groupId)?.studyForm !== 'reduced')) expect(regular).toContain(e.date);
    expect(findExamProblems(seedDataset, events)).toEqual([]);
  });

  it('puts a consultation with the same teacher the day before each exam', () => {
    for (const e of exams) {
      const c = events.find((x) => x.kind === 'consultation' && x.groupId === e.groupId && x.subjectId === e.subjectId)!;
      expect(c.teacherId).toBe(e.teacherId);
      const before = new Date(e.date);
      before.setDate(before.getDate() - 1);
      expect(c.date).toBe(before.toISOString().slice(0, 10));
    }
  });

  it('retakes avoid the published session and use afternoon times', () => {
    const re = generateExams(seedDataset, idx, fcim, 'reexam', events, createRng(2));
    expect(findExamProblems(seedDataset, [...events, ...re.events]).filter((p) => p.kind === 'clash')).toEqual([]);
    for (const e of re.events.filter((x) => x.kind === 'exam')) expect(ev.reexamStartTimes).toContain(e.start);
  });
});

describe('atestări', () => {
  it('uses teaching weeks 7 and 14 from the semester start', () => {
    expect(teachingWeek(ev, 7)).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(teachingWeek(ev, 14)).toEqual({ start: '2026-11-30', end: '2026-12-06' });
  });

  it('places each subject’s atestare in its own seminar or lab of those weeks', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: ['g1', 'g8'], seed: 4, iterations: 30 });
    const list = midtermsFor(seedDataset, idx, lessons, { groupId: 'g1' });
    const week7 = teachingWeek(ev, 7);
    const first = list.filter((m) => m.n === 1);
    expect(first.length).toBeGreaterThan(3);
    for (const m of first) {
      expect(m.date >= week7.start && m.date <= week7.end).toBe(true);
      expect(new Date(m.date).getDay()).toBe((m.lesson.day + 1) % 7);
    }
    // AM has a seminar: its atestare is not in the lecture
    expect(
      first.filter((m) => idx.assignmentOf(m.lesson)!.subjectId === 'sub1').every((m) => idx.assignmentOf(m.lesson)!.type === 'seminar'),
    ).toBe(true);
    // reduced attendance: inside its sessions
    const fr = midtermsFor(seedDataset, idx, lessons, { groupId: 'g8' });
    expect(fr.length).toBeGreaterThan(0);
    for (const m of fr) expect(seedDataset.settings.reducedSessions[m.n - 1].start <= m.date).toBe(true);
  });
});

describe('separate atestări timetable', () => {
  it('fits every subject into week 7 after classes, without clashes', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: fcim, seed: 5, iterations: 40 });
    const { events, warnings } = generateMidterms(seedDataset, idx, fcim, 1, lessons, [], createRng(3));
    expect(warnings).toEqual([]);
    const week = teachingWeek(ev, 7);
    expect(events.every((e) => e.date >= week.start && e.date <= week.end && e.round === 'midterm1')).toBe(true);
    expect(findExamProblems(seedDataset, events)).toEqual([]);
    // never over one of the group's classes that week (week 7 = odd)
    for (const e of events) {
      const day = (new Date(e.date).getDay() + 6) % 7;
      const overlapping = lessons.filter(
        (l) =>
          !l.date &&
          l.day === day &&
          l.parity !== 'even' &&
          idx.audienceTouchesGroup(idx.assignmentOf(l)!.audience, e.groupId) &&
          seedDataset.settings.slots[l.slot].start < e.end &&
          e.start < seedDataset.settings.slots[l.slot].end,
      );
      expect(overlapping).toEqual([]);
    }
    // FR keeps its atestări in the session classes
    expect(events.some((e) => e.groupId === 'g8')).toBe(false);
  });
});
