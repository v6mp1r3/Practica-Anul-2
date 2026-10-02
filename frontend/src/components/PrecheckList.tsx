import type { DatasetIndex } from '../domain/indexes';
import type { PrecheckIssue } from '../domain/precheck';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

export function PrecheckList({ issues, index, limit = 12 }: { issues: PrecheckIssue[]; index: DatasetIndex; limit?: number }) {
  const { t } = useI18n();
  if (!issues.length) {
    return (
      <div className="row" style={{ color: 'var(--success)' }}>
        <Icon name="check" />
        {t('precheck.ok')}
      </div>
    );
  }
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'hard' ? -1 : 1));
  const name = (i: PrecheckIssue) => {
    const a = index.assignments.get(i.subjectId);
    if (a) return `${index.subjects.get(a.subjectId)?.code} ${t(`activity.${a.type}`)} · ${index.audienceLabel(a.audience)}`;
    return index.teachers.get(i.subjectId)?.name ?? index.groups.get(i.subjectId)?.name ?? '?';
  };
  return (
    <div>
      {sorted.slice(0, limit).map((i, n) => (
        <div key={n} className={`issue ${i.severity === 'warning' ? 'warning' : ''}`} style={{ cursor: 'default' }}>
          <span className="dot" />
          <span>
            {t(`precheck.${i.kind}`, {
              ...i.vars,
              name: name(i),
              type: typeof i.vars.type === 'string' ? t(`activity.${i.vars.type}` as 'activity.lab') : '',
            })}
          </span>
        </div>
      ))}
      {sorted.length > limit && <div className="small muted" style={{ padding: 8 }}>+{sorted.length - limit}</div>}
    </div>
  );
}
