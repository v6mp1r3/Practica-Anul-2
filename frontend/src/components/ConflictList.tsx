import type { DatasetIndex } from '../domain/indexes';
import type { Conflict } from '../domain/types';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

/** Human name of whatever the conflict is about. */
export function conflictSubject(c: Conflict, idx: DatasetIndex, activity: (type: string) => string): string {
  if (c.kind.startsWith('teacher') || c.kind === 'no-consultation') return idx.teachers.get(c.subjectId)?.name ?? '?';
  if (c.kind.startsWith('room')) return idx.rooms.get(c.subjectId)?.name ?? '?';
  if (c.kind.startsWith('group')) return idx.groups.get(c.subjectId)?.name ?? '?';
  const a = idx.assignments.get(c.subjectId);
  if (!a) return '?';
  return `${idx.subjects.get(a.subjectId)?.code} ${activity(a.type)} · ${idx.audienceLabel(a.audience)}`;
}

export function ConflictList({
  conflicts,
  index,
  onSelect,
  selected,
  limit = 50,
}: {
  conflicts: Conflict[];
  index: DatasetIndex;
  onSelect?: (c: Conflict) => void;
  selected?: Conflict | null;
  limit?: number;
}) {
  const { t } = useI18n();
  if (!conflicts.length) {
    return (
      <div className="row" style={{ color: 'var(--success)', padding: 8 }}>
        <Icon name="check" />
        {t('conflict.none')}
      </div>
    );
  }
  const where = (c: Conflict) =>
    c.day !== undefined && c.slot !== undefined ? ` — ${t(`dayShort.${c.day}` as 'dayShort.0')}, ${t('tt.pair').toLowerCase()} ${c.slot + 1}` : '';

  return (
    <div>
      {conflicts.slice(0, limit).map((c, i) => (
        <div
          key={i}
          className={`issue ${c.severity === 'warning' ? 'warning' : ''}`}
          onClick={() => onSelect?.(c)}
          style={selected === c ? { background: 'var(--surface-2)' } : undefined}
        >
          <span className="dot" />
          <span>
            {t(`conflict.${c.kind}`, { name: conflictSubject(c, index, (x) => t(`activity.${x}` as 'activity.lab')) })}
            <span className="muted small">{where(c)}</span>
          </span>
        </div>
      ))}
      {conflicts.length > limit && <div className="small muted" style={{ padding: 8 }}>+{conflicts.length - limit}</div>}
    </div>
  );
}
