// Soft constraints (report §2.1.3) turned into a weighted penalty, plus the
// warnings the dean's office sees before publishing (overtime, consultation…).
import { DatasetIndex, type Cohort } from './indexes';
import { parityWeight, range } from './slots';
import type { Conflict, Dataset, Lesson, Parity, Score, ScoreBreakdown } from './types';
import { findHardConflicts } from './validator';

export const SOFT_WEIGHTS: Record<keyof ScoreBreakdown, number> = {
  teacherGaps: 3,
  groupGaps: 4,
  earlyStarts: 1,
  dayOverload: 5,
  unevenDays: 1,
  preferenceMisses: 1,
};

/** The weeks we need to look at: one if parity is off, odd + even otherwise. */
const weeksFor = (ds: Dataset): Parity[] => (ds.settings.weekParity ? ['odd', 'even'] : ['weekly']);
const inWeek = (l: Lesson, week: Parity) => week === 'weekly' || l.parity === 'weekly' || l.parity === week;

/** Empty pairs between the first and last occupied pair of a day. */
export function gapsInDay(slots: number[]): number {
  if (slots.length < 2) return 0;
  const sorted = [...new Set(slots)].sort((a, b) => a - b);
  return sorted[sorted.length - 1] - sorted[0] + 1 - sorted.length;
}

/** All (group, subgroup) views — a student experiences their group plus their subgroup. */
function studentViews(ds: Dataset): Cohort[] {
  return ds.groups.flatMap((g): Cohort[] =>
    g.subgroups > 1 ? range(g.subgroups).map((s) => ({ groupId: g.id, subgroup: s + 1 })) : [{ groupId: g.id, subgroup: null }],
  );
}

function lessonHitsView(idx: DatasetIndex, l: Lesson, view: Cohort): boolean {
  const a = idx.assignmentOf(l);
  if (!a) return false;
  return idx
    .cohorts(a.audience)
    .some((c) => c.groupId === view.groupId && (c.subgroup === null || view.subgroup === null || c.subgroup === view.subgroup));
}

export function scoreTimetable(ds: Dataset, lessons: Lesson[], idx = new DatasetIndex(ds)): Score {
  const b: ScoreBreakdown = { teacherGaps: 0, groupGaps: 0, earlyStarts: 0, dayOverload: 0, unevenDays: 0, preferenceMisses: 0 };
  const weeks = weeksFor(ds);
  const weekShare = 1 / weeks.length;
  const days = range(ds.settings.workingDays);

  // Teachers: gaps and preferred periods
  const byTeacher = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const t = idx.assignmentOf(l)?.teacherId;
    if (t) byTeacher.set(t, [...(byTeacher.get(t) ?? []), l]);
  }
  for (const [tid, tl] of byTeacher) {
    for (const week of weeks) {
      for (const d of days) b.teacherGaps += weekShare * gapsInDay(tl.filter((l) => l.day === d && inWeek(l, week)).map((l) => l.slot));
    }
    const pref = idx.teachers.get(tid)?.preferred ?? [];
    if (pref.length) b.preferenceMisses += tl.filter((l) => !pref.includes(`${l.day}:${l.slot}`)).length * 0.5;
  }

  // Students: gaps, overloaded days, unbalanced week — over the group's own days
  for (const view of studentViews(ds)) {
    const vl = lessons.filter((l) => lessonHitsView(idx, l, view));
    if (!vl.length) continue;
    const groupDays = idx.groupDays(view.groupId);
    for (const week of weeks) {
      const perDay = groupDays.map((d) => vl.filter((l) => l.day === d && inWeek(l, week)).map((l) => l.slot));
      for (const slots of perDay) {
        b.groupGaps += weekShare * gapsInDay(slots);
        b.dayOverload += weekShare * Math.max(0, new Set(slots).size - ds.settings.maxPairsPerDayGroup);
      }
      const loads = perDay.map((s) => new Set(s).size);
      const avg = loads.reduce((x, y) => x + y, 0) / loads.length;
      b.unevenDays += weekShare * loads.reduce((x, y) => x + Math.abs(y - avg), 0);
    }
  }

  // 08:00 classes have ~10 points lower attendance (report, ref. [9])
  b.earlyStarts = lessons.filter((l) => l.slot === 0).reduce((n, l) => n + parityWeight(l.parity), 0);

  for (const k of Object.keys(b) as (keyof ScoreBreakdown)[]) b[k] = Math.round(b[k] * 10) / 10;
  const soft = Math.round((Object.keys(b) as (keyof ScoreBreakdown)[]).reduce((s, k) => s + b[k] * SOFT_WEIGHTS[k], 0) * 10) / 10;
  return { hard: findHardConflicts(ds, lessons, idx).length, soft, breakdown: b };
}

/** Things worth fixing before publishing, but that don't make the timetable invalid. */
export function findWarnings(ds: Dataset, lessons: Lesson[], idx = new DatasetIndex(ds)): Conflict[] {
  const out: Conflict[] = [];
  const days = range(ds.settings.workingDays);
  const weeks = weeksFor(ds);

  for (const t of ds.teachers) {
    const tl = lessons.filter((l) => idx.assignmentOf(l)?.teacherId === t.id);
    if (!tl.length) continue;
    const load = tl.reduce((n, l) => n + parityWeight(l.parity), 0);
    if (load > t.maxPairsPerWeek)
      out.push({ kind: 'teacher-overtime', severity: 'warning', lessonIds: tl.map((l) => l.id), subjectId: t.id });
    for (const d of days) {
      for (const week of weeks) {
        const dl = tl.filter((l) => l.day === d && inWeek(l, week));
        if (new Set(dl.map((l) => l.slot)).size > ds.settings.maxPairsPerDayTeacher) {
          out.push({ kind: 'teacher-day-overload', severity: 'warning', lessonIds: dl.map((l) => l.id), subjectId: t.id, day: d });
          break;
        }
      }
    }
    if (ds.settings.consultationRequired && !t.consultation) {
      out.push({ kind: 'no-consultation', severity: 'warning', lessonIds: [], subjectId: t.id });
    }
  }

  for (const g of ds.groups) {
    const gl = lessons.filter((l) => {
      const a = idx.assignmentOf(l);
      return a && a.audience.kind !== 'subgroup' && idx.audienceTouchesGroup(a.audience, g.id);
    });
    const all = lessons.filter((l) => {
      const a = idx.assignmentOf(l);
      return a && idx.audienceTouchesGroup(a.audience, g.id);
    });
    if (!all.length) continue;
    for (const d of idx.groupDays(g.id)) {
      const count = new Set(all.filter((l) => l.day === d).map((l) => l.slot)).size;
      const whole = new Set(gl.filter((l) => l.day === d).map((l) => l.slot)).size;
      if (whole > ds.settings.maxPairsPerDayGroup) {
        out.push({
          kind: 'group-day-overload',
          severity: 'warning',
          lessonIds: gl.filter((l) => l.day === d).map((l) => l.id),
          subjectId: g.id,
          day: d,
        });
      }
      if (count > 0 && count < ds.settings.minPairsPerDayGroup) {
        out.push({
          kind: 'group-day-underload',
          severity: 'warning',
          lessonIds: all.filter((l) => l.day === d).map((l) => l.id),
          subjectId: g.id,
          day: d,
        });
      }
    }
  }
  return out;
}
