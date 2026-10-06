import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import {
  evaluationForGroup,
  midtermRange,
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
    const regular = rangeDates(ev.examSession, ev.examDays, ev.vacations);
    expect(regular).not.toContain('2026-12-25'); // Christmas
    for (const e of exams.filter((x) => idx.groups.get(x.groupId)?.studyForm !== 'reduced')) expect(regular).toContain(e.date);
    expect(findExamProblems(seedDataset, events)).toEqual([]);
  });

  it('puts a consultation with the same teacher the day before each exam', () => {
    for (const e of exams) {
      const c = events.find((x) => x.kind === 'consultation' && x.groupId === e.groupId && x.subjectId === e.subjectId)!;
      expect(c.teacherId).toBe(e.teacherId);
      // the working day before (Saturday for a Monday exam), or just before it right after a holiday
      const gap = (new Date(e.date).getTime() - new Date(c.date).getTime()) / 86400000;
      if (gap === 0) expect(c.end <= e.start).toBe(true);
      else {
        // every day in between is a day without exams (weekend for frecvență) or a holiday
        for (let d = 1; d < gap; d++) {
          const between = new Date(new Date(c.date).getTime() + d * 86400000);
          const iso = between.toISOString().slice(0, 10);
          const days = idx.groups.get(e.groupId)?.studyForm === 'reduced' ? ev.reducedExamDays : ev.examDays;
          const off = !days.includes(((between.getDay() + 6) % 7) as never);
          expect(off || ev.vacations.some((v) => v.start <= iso && iso <= v.end)).toBe(true);
        }
      }
      // frecvență: no exams or consultations at the weekend
      if (idx.groups.get(e.groupId)?.studyForm !== 'reduced') {
        expect([0, 6]).not.toContain(new Date(c.date).getDay());
        expect([0, 6]).not.toContain(new Date(e.date).getDay());
      }
      expect(c.date).not.toBe('2026-12-25');
    }
  });

  it('retakes avoid the published session and use afternoon times', () => {
    const re = generateExams(seedDataset, idx, fcim, 'reexam', events, createRng(2));
    expect(findExamProblems(seedDataset, [...events, ...re.events]).filter((p) => p.kind === 'clash')).toEqual([]);
    for (const e of re.events.filter((x) => x.kind === 'exam')) {
      // each group in its own cycle's retake hours (master's: evening)
      const gev = evaluationForGroup(seedDataset, idx, e.groupId);
      expect(e.start >= gev.reexamFrom).toBe(true);
      expect(e.end <= gev.reexamTo).toBe(true);
    }
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
    const week7 = midtermRange(ev, 1); // weeks 7–8
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
    const separate = { ...seedDataset, settings: { ...seedDataset.settings, evaluation: { ...ev, midtermMode: 'separate' as const } } };
    const { events, warnings } = generateMidterms(separate, idx, fcim, 1, lessons, [], createRng(3));
    expect(warnings).toEqual([]);
    const week = midtermRange(ev, 1);
    // licență full-time groups (FR sits them in its sessions, master's in its own weeks)
    const reduced = (g: string) => idx.groups.get(g)?.studyForm === 'reduced';
    const regular = events.filter((e) => !reduced(e.groupId) && idx.groups.get(e.groupId)?.cycle !== 'master');
    expect(regular.every((e) => e.date >= week.start && e.date <= week.end && e.round === 'midterm1')).toBe(true);
    expect(findExamProblems(seedDataset, events)).toEqual([]);
    // never over one of the group's classes that week (week 7 odd, week 8 even)
    for (const e of events) {
      const day = (new Date(e.date).getDay() + 6) % 7;
      if (e.lessonId) continue; // held in a session class
      const parity = e.date <= teachingWeek(ev, 7).end ? 'odd' : 'even';
      const overlapping = lessons.filter(
        (l) =>
          !l.date &&
          l.day === day &&
          (l.parity === 'weekly' || l.parity === parity) &&
          idx.audienceTouchesGroup(idx.assignmentOf(l)!.audience, e.groupId) &&
          seedDataset.settings.slots[l.slot].start < e.end &&
          e.start < seedDataset.settings.slots[l.slot].end,
      );
      expect(overlapping).toEqual([]);
    }
    // FR keeps its atestări in its session classes
    expect(events.filter((e) => reduced(e.groupId)).every((e) => e.lessonId)).toBe(true);
  });
});

describe('atestări held in class', () => {
  it('turns each subject’s class of week 14 into an atestare, in its room and time', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: fcim, seed: 6, iterations: 40 });
    const { events } = generateMidterms(seedDataset, idx, fcim, 2, lessons, [], createRng(1));
    const week = midtermRange(ev, 2); // weeks 14–15
    expect(events.length).toBeGreaterThan(20);
    for (const e of events) {
      const l = lessons.find((x) => x.id === e.lessonId)!;
      expect(l.roomId).toBe(e.roomId);
      expect(seedDataset.settings.slots[l.slot].start).toBe(e.start);
      // FR (g8) sits its atestări in its own sessions; master's in its own weeks
      const own = idx.groups.get(e.groupId)?.cycle === 'master' ? midtermRange(evaluationOf(seedDataset, 'master'), 2) : week;
      if (idx.groups.get(e.groupId)?.studyForm !== 'reduced') expect(e.date >= own.start && e.date <= own.end).toBe(true);
    }
    // a stream lecture shared by groups, or both subgroups' labs, are not clashes
    expect(findExamProblems(seedDataset, events)).toEqual([]);
  });
});

describe('exam-period availability', () => {
  it('keeps exams and consultations off the days a teacher is unavailable', () => {
    const t3 = seedDataset.teachers.find((t) => t.id === 't3')!;
    const blocked = rangeDates(ev.examSession, ev.examDays, ev.vacations).slice(0, 8);
    const ds = { ...seedDataset, teachers: seedDataset.teachers.map((t) => (t.id === 't3' ? { ...t3, examUnavailable: blocked } : t)) };
    const { events } = generateExams(ds, new DatasetIndex(ds), fcim, 'session', [], createRng(4));
    const mine = events.filter((e) => e.teacherId === 't3');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some((e) => blocked.includes(e.date))).toBe(false);
  });
});

describe('one atestare a day, one exam every other day', () => {
  it('never gives a student two atestări on the same day', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: fcim, seed: 7, iterations: 40 });
    for (const n of [1, 2] as const) {
      const { events } = generateMidterms(seedDataset, idx, fcim, n, lessons, [], createRng(2));
      for (const g of fcim.filter((x) => idx.groups.get(x)?.studyForm !== 'reduced')) {
        const subgroups = idx.groups.get(g)!.subgroups;
        for (let sg = 1; sg <= subgroups; sg++) {
          const days = events.filter((e) => e.groupId === g && (!e.subgroup || e.subgroup === sg)).map((e) => e.date);
          expect(new Set(days).size).toBe(days.length);
        }
      }
    }
  });

  it('leaves exactly one free day between a group’s exams where it can', () => {
    const { events } = generateExams(seedDataset, idx, fcim, 'session', [], createRng(9));
    for (const g of fcim) {
      const dates = events
        .filter((e) => e.groupId === g && e.kind === 'exam')
        .map((e) => e.date)
        .sort();
      for (let i = 1; i < dates.length; i++) {
        const gap = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
        expect(gap).toBeGreaterThanOrEqual(2); // never two days in a row
      }
    }
  });
});

describe('master’s', () => {
  it('uses the master calendar: evening exams, consultation just before, its own atestare weeks', async () => {
    const mev = evaluationOf(seedDataset, 'master');
    expect(mev.semesterStart > ev.semesterStart).toBe(true); // starts later than licență
    const { events } = generateExams(seedDataset, idx, ['g15'], 'session', [], createRng(5));
    const exams = events.filter((e) => e.kind === 'exam');
    expect(exams.length).toBeGreaterThan(0);
    for (const e of exams) {
      expect(e.start >= mev.examFrom && e.end <= mev.examTo).toBe(true);
      const c = events.find((x) => x.kind === 'consultation' && x.subjectId === e.subjectId)!;
      expect(c.date).toBe(e.date); // same day, before the exam
      expect(c.end <= e.start).toBe(true);
    }
    const { lessons } = await generateTimetable(seedDataset, { groupIds: ['g15'], seed: 2, iterations: 30 });
    const mids = generateMidterms(seedDataset, idx, ['g15'], 1, lessons, [], createRng(1)).events;
    const r = midtermRange(mev, 1);
    expect(mids.length).toBeGreaterThan(0);
    for (const m of mids) expect(m.date >= r.start && m.date <= r.end).toBe(true);
    // evening classes (master's part of the day)
    for (const l of lessons.filter((x) => idx.audienceTouchesGroup(idx.assignmentOf(x)!.audience, 'g15')))
      expect(l.slot).toBeGreaterThanOrEqual(4);
  });
});
