// Faculty filter shared by the data pages (teachers, rooms, groups, subjects).
// The choice is remembered, so switching pages keeps the same faculty.
import { useState } from 'react';
import type { Dataset } from '../domain/types';
import { useI18n } from '../i18n';

const KEY = 'eduschedule:faculty';

export function useFacultyFilter(dataset: Dataset): [string, (f: string) => void] {
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
  return [faculty, set];
}

/** Items with no faculty are shared and stay visible under every filter. */
export const inFaculty = (faculty: string, itemFaculty?: string) => !faculty || !itemFaculty || itemFaculty === faculty;

export function FacultySelect({ dataset, value, onChange }: { dataset: Dataset; value: string; onChange: (f: string) => void }) {
  const { t } = useI18n();
  if (dataset.settings.faculties.length < 2) return null;
  return (
    <select
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
    </select>
  );
}
