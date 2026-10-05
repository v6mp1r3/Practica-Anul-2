// Faculty filter shared by the data pages (teachers, rooms, groups, subjects).
// The choice is remembered, so switching pages keeps the same faculty.
import { useState } from 'react';
import type { Dataset } from '../domain/types';
import { useI18n } from '../i18n';
import { useAuth } from '../state/auth';
import { Select } from './Select';

const KEY = 'eduschedule:faculty';

/** The faculty a faculty administrator is limited to ('' = whole institution). */
export function useAdminScope(): string {
  const { user } = useAuth();
  return user?.role === 'admin' ? (user.faculty ?? '') : '';
}

/** Group ids of a faculty ('' = all groups). */
export const facultyGroupIds = (dataset: Dataset, faculty: string) =>
  dataset.groups.filter((g) => !faculty || g.faculty === faculty).map((g) => g.id);

/** [faculty, setFaculty, locked] — locked for faculty administrators. */
export function useFacultyFilter(dataset: Dataset): [string, (f: string) => void, boolean] {
  const scope = useAdminScope();
  const [faculty, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY) ?? '';
      return dataset.settings.faculties.includes(saved) ? saved : '';
    } catch {
      return '';
    }
  });
  const set = (f: string) => {
    setState(f);
    try {
      localStorage.setItem(KEY, f);
    } catch {
      /* ignore */
    }
  };
  return scope ? [scope, () => {}, true] : [faculty, set, false];
}

/** Items with no faculty are shared and stay visible under every filter. */
export const inFaculty = (faculty: string, itemFaculty?: string) => !faculty || !itemFaculty || itemFaculty === faculty;

export function FacultySelect({
  dataset,
  value,
  onChange,
  locked,
}: {
  dataset: Dataset;
  value: string;
  onChange: (f: string) => void;
  locked?: boolean;
}) {
  const { t } = useI18n();
  if (locked)
    return (
      <span className="badge primary" style={{ padding: '7px 14px', fontSize: 13 }}>
        {value}
      </span>
    );
  if (dataset.settings.faculties.length < 2) return null;
  return (
    <Select
      className="select pill"
      style={{ maxWidth: 280 }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t('groups.faculty')}
    >
      <option value="">{t('faculty.all')}</option>
      {dataset.settings.faculties.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </Select>
  );
}
