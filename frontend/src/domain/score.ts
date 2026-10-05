// Soft constraints (report §2.1.3) turned into a weighted penalty, plus the
// warnings the dean's office sees before publishing (overtime, consultation…).
import { DatasetIndex, type Cohort } from './indexes';
import { parityWeight, range } from './slots';
import type { Conflict, Dataset, Lesson, Parity, Score, ScoreBreakdown } from './types';
import { findHardConflicts } from './validator';

export const SOFT_WEIGHTS: Record<keyof ScoreBreakdown, number> = {
  teacherGaps: 3,
  // students should have no gaps between pairs — the heaviest comfort rule
  groupGaps: 12,
  earlyStarts: 1,
  dayOverload: 5,
  unevenDays: 1,
  preferenceMisses: 1,
  roomMisses: 2,
  edgeMisses: 8,
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
  const b: ScoreBreakdown = {
    teacherGaps: 0,
    groupGaps: 0,
    earlyStarts: 0,
    dayOverload: 0,
    unevenDays: 0,
    preferenceMisses: 0,
    roomMisses: 0,
    edgeMisses: 0,
  };
  const weeks = weeksFor(ds);
  const weekShare = 1 / weeks.length;
  const days = range(ds.settings.workingDays);
  const all = lessons;
  // weekly rules look at the repeating week; dated (session) pairs are scored per date below
  lessons = lessons.filter((l) => !l.date);

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
      // "first or last pair only" subjects: must sit at an end of the group's day
      for (const d of groupDays) {
        const dl = vl.filter((l) => l.day === d && inWeek(l, week));
        if (!dl.length) continue;
        const lo = Math.min(...dl.map((l) => l.slot));
        const hi = Math.max(...dl.map((l) => l.slot));
        for (const l of dl) {
          const subj = idx.subjects.get(idx.assignmentOf(l)?.subjectId ?? '');
          if (subj?.edgeOfDay && l.slot !== lo && l.slot !== hi) b.edgeMisses += weekShare;
        }
      }
      for (const slots of perDay) {
        b.groupGaps += weekShare * gapsInDay(slots);
        b.dayOverload += weekShare * Math.max(0, new Set(slots).size - idx.groupMaxPairs(view.groupId));
      }
      const loads = perDay.map((s) => new Set(s).size);
      const avg = loads.reduce((x, y) => x + y, 0) / loads.length;
      b.unevenDays += weekShare * loads.reduce((x, y) => x + Math.abs(y - avg), 0);
    }
  }

  // Session pairs (reduced attendance): no gaps within each date
  const byGroupDate = new Map<string, number[]>();
  for (const l of all) {
    if (!l.date) continue;
    for (const c of idx.cohorts(idx.assignmentOf(l)?.audience ?? { kind: 'group', id: '' })) {
      const k = `${c.groupId}|${l.date}`;
      byGroupDate.set(k, [...(byGroupDate.get(k) ?? []), l.slot]);
    }
  }
  for (const slots of byGroupDate.values()) b.groupGaps += gapsInDay(slots);

  // Pairs outside their preferred ("de dorit") rooms
  for (const l of all) {
    const a = idx.assignmentOf(l);
    if (!a) continue;
    const pref = idx.preferredRooms(a);
    if (pref.length && !pref.some((r) => r.id === l.roomId)) b.roomMisses += parityWeight(l.parity);
  }

  // 08:00 classes have ~10 points lower attendance (report, ref. [9])
  b.earlyStarts = lessons.filter((l) => l.slot === 0).reduce((n, l) => n + parityWeight(l.parity), 0);

  for (const k of Object.keys(b) as (keyof ScoreBreakdown)[]) b[k] = Math.round(b[k] * 10) / 10;
  const soft = Math.round((Object.keys(b) as (keyof ScoreBreakdown)[]).reduce((s, k) => s + b[k] * SOFT_WEIGHTS[k], 0) * 10) / 10;
  return { hard: findHardConflicts(ds, all, idx).length, soft, breakdown: b };
}

/** Things worth fixing before publishing, but that don't make the timetable invalid. */
export function findWarnings(ds: Dataset, lessons: Lesson[], idx = new DatasetIndex(ds)): Conflict[] {
  const out: Conflict[] = [];
  const days = range(ds.settings.workingDays);
  const weeks = weeksFor(ds);

  for (const t of ds.teachers) {
    const tl = lessons.filter((l) => !l.date && idx.assignmentOf(l)?.teacherId === t.id);
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
    if (g.studyForm === 'reduced') continue; // session dates, not a weekly pattern
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
      // gaps, per subgroup view and week
      const views = g.subgroups > 1 ? range(g.subgroups).map((i) => i + 1) : [null];
      const gapLessons = new Set<string>();
      const edgeLessons = new Set<string>();
      for (const sub of views) {
        for (const week of weeks) {
          const dl = all.filter((l) => {
            const a = idx.assignmentOf(l)!;
            const hits = idx
              .cohorts(a.audience)
              .some((c) => c.groupId === g.id && (c.subgroup === null || sub === null || c.subgroup === sub));
            return hits && l.day === d && inWeek(l, week);
          });
          if (gapsInDay(dl.map((l) => l.slot)) > 0) dl.forEach((l) => gapLessons.add(l.id));
          if (dl.length) {
            const lo = Math.min(...dl.map((l) => l.slot));
            const hi = Math.max(...dl.map((l) => l.slot));
            for (const l of dl) {
              const subj = idx.subjects.get(idx.assignmentOf(l)!.subjectId);
              if (subj?.edgeOfDay && l.slot !== lo && l.slot !== hi) edgeLessons.add(l.id);
            }
          }
        }
      }
      if (gapLessons.size) out.push({ kind: 'group-gap', severity: 'warning', lessonIds: [...gapLessons], subjectId: g.id, day: d });
      if (edgeLessons.size) out.push({ kind: 'edge-of-day', severity: 'warning', lessonIds: [...edgeLessons], subjectId: g.id, day: d });
      const count = new Set(all.filter((l) => l.day === d).map((l) => l.slot)).size;
      const whole = new Set(gl.filter((l) => l.day === d).map((l) => l.slot)).size;
      if (whole > idx.groupMaxPairs(g.id)) {
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
