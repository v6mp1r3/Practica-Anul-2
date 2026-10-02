import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { PrecheckList } from '../../components/PrecheckList';
import { PageHeader } from '../../components/ui';
import { precheck } from '../../domain/precheck';
import type { Timetable } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';

export function StatusBadge({ status }: { status: Timetable['status'] }) {
  const { t } = useI18n();
  const cls = status === 'published' ? 'success' : status === 'draft' ? 'primary' : '';
  return <span className={`badge ${cls}`}>{t(`timetables.status.${status}`)}</span>;
}

export default function Dashboard() {
  const { t } = useI18n();
  const { dataset, index, published } = useDataset();
  const [recent, setRecent] = useState<Timetable[]>([]);

  useEffect(() => {
    api.listTimetables().then((list) => setRecent(list.slice(0, 5)));
  }, []);

  const issues = useMemo(() => precheck(dataset, index), [dataset, index]);
  const pairs = dataset.assignments.reduce((n, a) => n + a.pairsPerWeek, 0);

  const stats = [
    { label: t('dashboard.teachers'), value: dataset.teachers.length, to: '/admin/teachers' },
    { label: t('dashboard.rooms'), value: dataset.rooms.length, to: '/admin/rooms' },
    { label: t('dashboard.groups'), value: dataset.groups.length, to: '/admin/groups' },
    { label: t('dashboard.pairs'), value: pairs, to: '/admin/assignments' },
  ];

  return (
    <div className="page">
      <PageHeader
        title={t('nav.dashboard')}
        subtitle={t('dashboard.subtitle', { faculty: dataset.settings.faculty, semester: dataset.settings.semester })}
        actions={
          <Link className="btn primary" to="/admin/generate">
            <Icon name="zap" />
            {t('dashboard.generate')}
          </Link>
        }
      />

      <div className="stack">
        <div className="stats">
          {stats.map((s) => (
            <Link key={s.label} to={s.to} className="card stat" style={{ color: 'inherit' }}>
              <div className="value">{s.value}</div>
              <div className="label">{s.label}</div>
            </Link>
          ))}
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <h2>{t('precheck.title')}</h2>
              <span className="spacer" />
              {issues.some((i) => i.severity === 'hard') && <span className="badge danger">{issues.filter((i) => i.severity === 'hard').length}</span>}
              {issues.some((i) => i.severity === 'warning') && <span className="badge warning">{issues.filter((i) => i.severity === 'warning').length}</span>}
            </div>
            <div className="card-body">
              <p className="small muted" style={{ marginBottom: 8 }}>
                {t('precheck.subtitle')}
              </p>
              <PrecheckList issues={issues} index={index} limit={8} />
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-header">
                <h2>{t('dashboard.published')}</h2>
              </div>
              <div className="card-body">
                {published ? (
                  <div className="row">
                    <div>
                      <strong>{published.name}</strong>
                      <div className="small muted">
                        {published.lessons.length} · {new Date(published.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="spacer" />
                    <Link className="btn sm" to={`/admin/timetables/${published.id}`}>
                      {t('dashboard.open')}
                    </Link>
                  </div>
                ) : (
                  <span className="muted">{t('dashboard.notPublished')}</span>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>{t('dashboard.recent')}</h2>
              </div>
              <div className="card-body">
                {recent.length === 0 ? (
                  <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                    {(['dashboard.step1', 'dashboard.step2', 'dashboard.step3', 'dashboard.step4', 'dashboard.step5'] as const).map((k) => (
                      <li key={k}>{t(k)}</li>
                    ))}
                  </ol>
                ) : (
                  <div className="stack" style={{ gap: 8 }}>
                    {recent.map((tt) => (
                      <Link key={tt.id} to={`/admin/timetables/${tt.id}`} className="row" style={{ color: 'inherit' }}>
                        <strong>{tt.name}</strong>
                        <StatusBadge status={tt.status} />
                        <span className="spacer" />
                        {tt.score && (
                          <span className="small muted">
                            {t('score.soft')}: {tt.score.soft}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
