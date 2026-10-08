// Specialties are the prefixes of the group names (TI-251 → TI, FAF-232 → FAF).
// A subject can be for some of them only: two study plans can share a code with
// a different year (MD in year 1 for FAF, in year 2 for SI).
import type { Group, Language, Subject } from './types';

export const specialtyOf = (groupName: string) => groupName.split('-')[0].trim().toUpperCase();

/** Whether a subject is taught to a group: same language and, if it names specialties, one of them. */
export function subjectForGroup(subject: Pick<Subject, 'specialties' | 'language'>, group: Pick<Group, 'name' | 'language'>): boolean {
  const lang = (x: { language?: Language }) => x.language ?? 'ro';
  if (lang(subject) !== lang(group)) return false;
  return !subject.specialties?.length || subject.specialties.includes(specialtyOf(group.name));
}
