// Each administrator works on their own faculty only. Other faculties' records
// appear only where they meet this faculty: a teacher from another faculty who
// teaches our groups, or another faculty's room our classes use.
import type { Dataset, Lesson } from '../domain/types';
import type { DatasetIndex } from '../domain/indexes';
import { useAuth } from '../state/auth';
import { useI18n } from '../i18n';

/** The administrator's faculty ('' only for an account without one). */
export function useAdminScope(): string {
  const { user } = useAuth();
  return user?.role === 'admin' ? (user.faculty ?? '') : '';
}

/** Group ids of a faculty ('' = all groups). */
export const facultyGroupIds = (dataset: Dataset, faculty: string) =>
  dataset.groups.filter((g) => !faculty || g.faculty === faculty).map((g) => g.id);

export interface FacultyView {
  scope: string;
  /** Does a record with this faculty belong to the administrator's faculty? */
  own: (faculty?: string) => boolean;
  groupIds: Set<string>;
  /** Our teachers + other faculties' teachers who teach our groups. */
  teacherIds: Set<string>;
  /** Our rooms + other faculties' rooms our classes are placed in. */
  roomIds: Set<string>;
}

export function facultyView(dataset: Dataset, index: DatasetIndex, scope: string, lessons: Lesson[] = []): FacultyView {
  const own = (f?: string) => !scope || !f || f === scope;
  const groupIds = new Set(facultyGroupIds(dataset, scope));
  const ours = dataset.assignments.filter((a) => [...groupIds].some((g) => index.audienceTouchesGroup(a.audience, g)));
  const ourIds = new Set(ours.map((a) => a.id));
  const teacherIds = new Set([...dataset.teachers.filter((x) => own(x.faculty)).map((x) => x.id), ...ours.map((a) => a.teacherId)]);
  const roomIds = new Set([
    ...dataset.rooms.filter((r) => own(r.faculty)).map((r) => r.id),
    ...lessons.filter((l) => ourIds.has(l.assignmentId)).map((l) => l.roomId),
  ]);
  return { scope, own, groupIds, teacherIds, roomIds };
}

/** Small tag on a record that belongs to another faculty (read-only here). */
export function OtherFaculty({ faculty }: { faculty?: string }) {
  const { t } = useI18n();
  return (
    <span className="badge" title={faculty} style={{ marginLeft: 6 }}>
      {t('faculty.other')}
    </span>
  );
}
