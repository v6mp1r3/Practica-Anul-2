// "Other groups" picker for students: a pill that opens a searchable checklist,
// grouped by faculty — scales to any number of groups, unlike one chip per group.
import { useEffect, useRef, useState } from 'react';
import type { Group } from '../domain/types';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

export function GroupMultiPicker({
  groups,
  selected,
  onToggle,
  active,
}: {
  groups: Group[];
  selected: string[];
  onToggle: (id: string) => void;
  /** Highlight the pill (other groups are being shown). */
  active: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const count = groups.filter((g) => selected.includes(g.id)).length;
  const match = groups.filter((g) => `${g.name} ${g.program}`.toLowerCase().includes(q.trim().toLowerCase()));
  const faculties = [...new Set(match.map((g) => g.faculty ?? ''))];

  return (
    <div className="group-picker" ref={box}>
      <button type="button" aria-pressed={active} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {t('student.otherGroups')}
        {count > 0 && <span className="group-picker-count">{count}</span>}
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div className="select-menu group-picker-menu" role="listbox" aria-multiselectable>
          <label className="search-line" style={{ width: '100%', marginBottom: 6 }}>
            <Icon name="search" size={15} />
            <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} />
          </label>
          {faculties.map((f) => (
            <div key={f}>
              {faculties.length > 1 && <div className="select-group">{f || '—'}</div>}
              {match
                .filter((g) => (g.faculty ?? '') === f)
                .map((g) => (
                  <label key={g.id} className={`select-option ${selected.includes(g.id) ? 'chosen' : ''}`}>
                    <input type="checkbox" checked={selected.includes(g.id)} onChange={() => onToggle(g.id)} />
                    <span>{g.name}</span>
                    <span className="small muted" style={{ flex: 'none' }}>
                      {t('groups.year')} {g.year}
                    </span>
                  </label>
                ))}
            </div>
          ))}
          {!match.length && <div className="select-option muted">{t('common.empty')}</div>}
        </div>
      )}
    </div>
  );
}
