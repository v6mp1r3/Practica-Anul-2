// Group periods of the academic calendar: internships (no classes, atestări or
// exams for those groups), a final year's own exam session, the plagiarism
// check (VP) and the licence exam (EL). Internships in the semester also move
// that group's atestări to the weeks it is at university (UTM calendar: practice
// in weeks 1–4 → atestări in weeks 9 and 14; four weeks of classes → one atestare).
import { teachingWeek } from './exams';
import type { Dataset, EvaluationSettings, GroupPeriod } from './types';

/** Teaching weeks of a semester. */
export const SEMESTER_WEEKS = 15;

export const periodsOf = (ds: Dataset, groupId: string, kind?: GroupPeriod['kind']): GroupPeriod[] =>
  (ds.settings.groupPeriods ?? []).filter((p) => p.groupIds.includes(groupId) && (!kind || p.kind === kind));

/** The internship a group is on at a date, if any. */
export const internshipOn = (ds: Dataset, groupId: string, date: string) =>
  periodsOf(ds, groupId, 'internship').find((p) => p.start <= date && date <= p.end);

/** The semester's teaching weeks the group has classes (not on internship or in its own exam session for most of the week). */
export function teachingWeeksOf(ds: Dataset, ev: EvaluationSettings, groupId: string): number[] {
  const internships = [...periodsOf(ds, groupId, 'internship'), ...periodsOf(ds, groupId, 'examSession')];
  return Array.from({ length: SEMESTER_WEEKS }, (_, i) => i + 1).filter((w) => {
    const { start } = teachingWeek(ev, w);
    let away = 0;
    for (let d = 0; d < 5; d++) {
      const day = new Date(`${start}T12:00:00`);
      day.setDate(day.getDate() + d);
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      if (internships.some((p) => p.start <= iso && iso <= p.end)) away++;
    }
    return away < 3;
  });
}

/**
 * The week atestarea `n` starts in for a group: the usual week, or — when an
 * internship takes part of the semester — at the same point of its own teaching
 * weeks. With fewer than 8 teaching weeks there is a single atestare (n = 2: none).
 */
export function groupMidtermWeek(ds: Dataset, ev: EvaluationSettings, groupId: string, n: 1 | 2): number | null {
  if (!periodsOf(ds, groupId, 'internship').length) return ev.midtermWeeks[n - 1];
  const weeks = teachingWeeksOf(ds, ev, groupId);
  if (weeks.length === SEMESTER_WEEKS) return ev.midtermWeeks[n - 1];
  if (!weeks.length) return null;
  if (weeks.length < 8) return n === 1 ? weeks[Math.max(0, weeks.length - 2)] : null;
  const at = n === 1 ? Math.round((weeks.length * ev.midtermWeeks[0]) / SEMESTER_WEEKS) - 1 : weeks.length - 2;
  return weeks[Math.min(weeks.length - 1, Math.max(0, at))];
}
