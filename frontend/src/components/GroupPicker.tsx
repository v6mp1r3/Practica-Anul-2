import { useMemo, useState } from 'react';
import { specialityOf } from '../domain/clusters';
import type { Group } from '../domain/types';
import { useI18n } from '../i18n';
import { fold } from './searchText';

/**
 * Pick the groups a class is for: by year, then by speciality, each group a button. A speciality or a year can be
 * ticked whole, and the search narrows what is shown (what is already chosen stays chosen).
 */
export function GroupPicker({ groups, value, onChange }: { groups: Group[]; value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  // years the user opened or closed; the others open when they hold a chosen group (or when the list is short)
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  const chosen = useMemo(() => new Set(value), [value]);
  const q = fold(query).trim();
  const shown = q ? groups.filter((g) => fold(g.name).includes(q) || fold(specialityOf(g.name)).includes(q)) : groups;

  const years = [...new Set(shown.map((g) => g.year))].sort((a, b) => a - b);
  const set = (ids: string[], on: boolean) => onChange(on ? [...new Set([...value, ...ids])] : value.filter((id) => !ids.includes(id)));
  const allOn = (ids: string[]) => ids.length > 0 && ids.every((id) => chosen.has(id));
  const isOpen = (y: number, inYear: Group[]) => q !== '' || (toggled[y] ?? (groups.length <= 30 || inYear.some((g) => chosen.has(g.id))));
  const setAllOpen = (open: boolean) => setToggled(Object.fromEntries(years.map((y) => [y, open])));
  const students = groups.filter((g) => chosen.has(g.id)).reduce((n, g) => n + g.size, 0);

  if (!groups.length) return <p className="small muted">{t('groupPicker.none')}</p>;
  return (
    <div className="group-picker">
      <div className="group-picker-bar">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('groupPicker.search')}
          aria-label={t('groupPicker.search')}
        />
        <span className="small muted">{t('groupPicker.summary', { n: value.length, s: students })}</span>
        <button type="button" className="btn ghost sm" onClick={() => setAllOpen(true)}>
          {t('groupPicker.expandAll')}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setAllOpen(false)}>
          {t('groupPicker.collapseAll')}
        </button>
        {value.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={() => onChange([])}>
            {t('groupPicker.clear')}
          </button>
        )}
      </div>
      {shown.length === 0 && <p className="small muted">{t('common.noResults')}</p>}
      {years.map((y) => {
        const inYear = shown.filter((g) => g.year === y);
        const specs = [...new Set(inYear.map((g) => specialityOf(g.name)))].sort((a, b) => a.localeCompare(b, 'ro'));
        const yearIds = inYear.map((g) => g.id);
        const open = isOpen(y, inYear);
        const picked = inYear.filter((g) => chosen.has(g.id)).length;
        return (
          <section key={y} className="group-year">
            <div className="group-year-head">
              <button
                type="button"
                className="group-year-toggle"
                aria-expanded={open}
                onClick={() => setToggled({ ...toggled, [y]: !open })}
              >
                <span className={`chev ${open ? 'open' : ''}`} aria-hidden="true">
                  ›
                </span>
                <strong>{t('clusters.year', { n: y })}</strong>
                <span className="small muted">
                  {picked > 0 ? `${picked}/` : ''}
                  {inYear.length}
                </span>
              </button>
              <button type="button" className="tag" aria-pressed={allOn(yearIds)} onClick={() => set(yearIds, !allOn(yearIds))}>
                {t('groupPicker.allYear')}
              </button>
            </div>
            {open &&
              specs.map((sp) => {
                const rowGroups = inYear.filter((g) => specialityOf(g.name) === sp);
                const ids = rowGroups.map((g) => g.id);
                return (
                  <div key={sp} className="tag-row">
                    <button
                      type="button"
                      className="tag-label group-spec"
                      aria-pressed={allOn(ids)}
                      title={t('groupPicker.allSpeciality', { name: sp })}
                      onClick={() => set(ids, !allOn(ids))}
                    >
                      {sp}
                    </button>
                    {/* the groups wrap next to the specialty, never under it */}
                    <span className="group-tags">
                      {rowGroups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className="tag"
                          aria-pressed={chosen.has(g.id)}
                          onClick={() => set([g.id], !chosen.has(g.id))}
                        >
                          {g.name.slice(sp.length + 1) || g.name}
                        </button>
                      ))}
                    </span>
                    {/* the whole specialty of this year at a click, like "Tot anul" */}
                    <button
                      type="button"
                      className="tag group-spec-all"
                      aria-pressed={allOn(ids)}
                      title={t('groupPicker.allSpeciality', { name: sp })}
                      onClick={() => set(ids, !allOn(ids))}
                    >
                      {t('groupPicker.allRow')}
                    </button>
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
