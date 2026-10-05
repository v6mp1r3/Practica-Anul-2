// Data checks run before generation (report §1.4.4, point 4): they catch input
// that would make a good timetable impossible, so the admin fixes the data
// instead of wondering why the solver struggles.
import { DatasetIndex } from './indexes';
import { parityWeight, range, slotKey } from './slots';
import type { ActivityType, Dataset } from './types';

export type PrecheckKind =
  | 'no-room'
  | 'teacher-planned-overtime'
  | 'teacher-wrong-type'
  | 'teacher-too-unavailable'
  | 'plan-mismatch'
  | 'group-overloaded'
  | 'group-empty';

export interface PrecheckIssue {
  kind: PrecheckKind;
  severity: 'hard' | 'warning';
  /** Id of the teacher / group / assignment the issue is about. */
  subjectId: string;
  /** Extra values for the message (expected vs actual, subject code…). */
  vars: Record<string, string | number>;
}

const pairsField: Record<ActivityType, 'lecturePairs' | 'seminarPairs' | 'labPairs'> = {
  lecture: 'lecturePairs',
  seminar: 'seminarPairs',
  lab: 'labPairs',
};

export function precheck(ds: Dataset, idx = new DatasetIndex(ds)): PrecheckIssue[] {
  const out: PrecheckIssue[] = [];
  const totalSlots = ds.settings.workingDays * ds.settings.slots.length;

  for (const a of ds.assignments) {
    const size = idx.audienceSize(a.audience);
    const fits = ds.rooms.some((r) => r.capacity >= size && idx.roomFits(a, r) && idx.hasEquipment(a, r));
    if (!fits) out.push({ kind: 'no-room', severity: 'hard', subjectId: a.id, vars: { size } });
  }

  for (const t of ds.teachers) {
    // weekly load: reduced-attendance loads happen in sessions, not every week
    const mine = ds.assignments.filter((a) => a.teacherId === t.id && !idx.isReduced(a));
    if (!mine.length) continue;
    const load = mine.reduce((n, a) => n + a.pairsPerWeek * parityWeight(a.parity), 0);
    if (load > t.maxPairsPerWeek) {
      out.push({ kind: 'teacher-planned-overtime', severity: 'warning', subjectId: t.id, vars: { load, max: t.maxPairsPerWeek } });
    }
    const wrong = [...new Set(mine.filter((a) => !t.activityTypes.includes(a.type)).map((a) => a.type))];
    if (wrong.length) out.push({ kind: 'teacher-wrong-type', severity: 'warning', subjectId: t.id, vars: { types: wrong.join(', ') } });
    const available =
      totalSlots -
      t.unavailable.filter((k) => {
        const [d, s] = k.split(':').map(Number);
        return d < ds.settings.workingDays && s < ds.settings.slots.length;
      }).length;
    const lessons = mine.reduce((n, a) => n + a.pairsPerWeek, 0);
    if (available < lessons) {
      out.push({ kind: 'teacher-too-unavailable', severity: 'hard', subjectId: t.id, vars: { available, needed: lessons } });
    }
  }

  for (const g of ds.groups) {
    const touching = ds.assignments.filter((a) => idx.audienceTouchesGroup(a.audience, g.id));
    if (!touching.length) {
      out.push({ kind: 'group-empty', severity: 'warning', subjectId: g.id, vars: {} });
      continue;
    }

    // Compare against the study plan, per subject and activity type. Reduced
    // attendance has fewer contact hours by design, so it is not compared.
    const plan = ds.subjects.filter((x) => x.year === g.year && (!x.faculty || !g.faculty || x.faculty === g.faculty));
    for (const s of g.studyForm === 'reduced' ? [] : plan) {
      for (const type of ['lecture', 'seminar', 'lab'] as ActivityType[]) {
        const expected = s[pairsField[type]];
        const relevant = touching.filter((a) => a.subjectId === s.id && a.type === type);
        // Labs are per subgroup: every subgroup must receive the full amount
        const cohorts = type === 'lab' && g.subgroups > 1 ? range(g.subgroups).map((i) => i + 1) : [null];
        for (const sub of cohorts) {
          const got = relevant
            .filter((a) => sub === null || a.audience.kind !== 'subgroup' || a.audience.subgroup === sub)
            .reduce((n, a) => n + a.pairsPerWeek * parityWeight(a.parity), 0);
          if (got !== expected) {
            out.push({
              kind: 'plan-mismatch',
              severity: 'warning',
              subjectId: g.id,
              vars: { group: sub ? `${g.name}/${sub}` : g.name, subject: s.code, type, expected, got },
            });
          }
        }
      }
    }

    // Is the week physically big enough for this group? (sessions are checked separately)
    if (g.studyForm === 'reduced') continue;
    const views = g.subgroups > 1 ? range(g.subgroups).map((i) => i + 1) : [null];
    for (const sub of views) {
      const pairs = touching
        .filter((a) => sub === null || a.audience.kind !== 'subgroup' || a.audience.subgroup === sub)
        .reduce((n, a) => n + a.pairsPerWeek * parityWeight(a.parity), 0);
      const cap = idx.groupDays(g.id).length * idx.groupMaxPairs(g.id);
      if (pairs > cap) {
        out.push({ kind: 'group-overloaded', severity: 'hard', subjectId: g.id, vars: { pairs, cap } });
        break;
      }
    }
  }
  return out;
}

/** Number of free slots a teacher has (used in the availability editor). */
export function freeSlotCount(ds: Dataset, unavailable: string[]): number {
  let n = 0;
  for (const d of range(ds.settings.workingDays))
    for (const s of range(ds.settings.slots.length)) if (!unavailable.includes(slotKey(d, s))) n++;
  return n;
}
