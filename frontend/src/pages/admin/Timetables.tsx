import { facultyGroupIds, useAdminScope } from '../../components/FacultyFilter';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { Empty, Loading, PageHeader } from '../../components/ui';
import type { Timetable } from '../../domain/types';
import { dateLocale, useI18n } from '../../i18n';
import { useData } from '../../state/data';
import { useToast } from '../../state/toast';
import { publishSafely, unpublishWithConfirm } from '../../utils/publish';
import { StatusBadge } from './Dashboard';
import { VariantComparison } from './Generate';

export default function Timetables() {
  const { t, lang } = useI18n();
  const { refresh } = useData();
  const toast = useToast();
  const [list, setList] = useState<Timetable[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  // Faculty administrators see the timetables that include their groups
  const scope = useAdminScope();
  const { dataset } = useData();
  const load = useCallback(
    () =>
      api.listTimetables().then((all) => {
        const mine = dataset ? facultyGroupIds(dataset, scope) : [];
        setList(scope ? all.filter((tt) => tt.groupIds.some((g) => mine.includes(g))) : all);
      }),
    [scope, dataset],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function duplicate(tt: Timetable) {
    const now = new Date().toISOString();
    await api.saveTimetable({
      ...tt,
      id: `tt${Date.now().toString(36)}`,
      name: `${tt.name} (${t('timetables.copy')})`,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    await load();
  }

  async function remove(tt: Timetable) {
    if (!confirm(t('common.confirmDelete', { name: tt.name }))) return;
    await api.deleteTimetable(tt.id);
    setSelected((s) => s.filter((x) => x !== tt.id));
    await load();
  }

  async function publish(tt: Timetable) {
    if (tt.score?.hard && !confirm(t('timetables.publishWithConflicts', { count: tt.score.hard }))) return;
    if (!(await publishSafely(tt.id, (count) => toast(t('timetables.clashOnPublish', { count }), 'error')))) return;
    await Promise.all([load(), refresh()]);
    toast(t('timetables.publishedToast', { name: tt.name }));
  }

  async function unpublish(tt: Timetable) {
    if (!(await unpublishWithConfirm(tt, scope || undefined, t))) return;
    await Promise.all([load(), refresh()]);
    toast(t('timetables.unpublishedToast'));
  }

  if (!list) return <Loading />;
  const compared = list.filter((x) => selected.includes(x.id));
  const fmt = (iso: string) => new Date(iso).toLocaleString(dateLocale(lang), { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="page">
      <PageHeader
        title={t('nav.timetables')}
        subtitle={t('timetables.subtitle')}
        actions={
          <Link className="btn primary" to="/admin/generate">
            <Icon name="zap" />
            {t('dashboard.generate')}
          </Link>
        }
      />
      <div className="stack">
        <div className="card">
          {list.length === 0 ? (
            <Empty>{t('timetables.empty')}</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} />
                    <th>{t('common.name')}</th>
                    <th>{t('timetables.status')}</th>
                    <th>{t('score.hard')}</th>
                    <th>{t('timetables.updated')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((tt) => (
                    <tr key={tt.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={t('timetables.compare')}
                          checked={selected.includes(tt.id)}
                          onChange={(e) => setSelected((s) => (e.target.checked ? [...s, tt.id] : s.filter((x) => x !== tt.id)))}
                        />
                      </td>
                      <td>
                        <Link to={`/admin/timetables/${tt.id}`}>
                          <strong>{tt.name}</strong>
                        </Link>
                        <div className="small muted">
                          {tt.lessons.length} · {tt.algorithm}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={tt.status} />
                      </td>
                      <td>
                        <span className={`badge ${tt.score?.hard ? 'danger' : 'success'}`}>{tt.score?.hard ?? '—'}</span>
                      </td>
                      <td className="small muted">{fmt(tt.updatedAt)}</td>
                      <td className="actions">
                        {tt.status !== 'published' ? (
                          <button className="btn sm" onClick={() => publish(tt)}>
                            {t('timetables.publish')}
                          </button>
                        ) : (
                          <button className="btn sm" onClick={() => unpublish(tt)}>
                            {t('timetables.unpublish')}
                          </button>
                        )}
                        <button
                          className="btn ghost sm icon"
                          onClick={() => duplicate(tt)}
                          title={t('timetables.duplicate')}
                          aria-label={t('timetables.duplicate')}
                        >
                          <Icon name="copy" size={15} />
                        </button>
                        <button className="btn ghost sm icon danger" onClick={() => remove(tt)} aria-label={t('common.delete')}>
                          <Icon name="trash" size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {compared.length > 1 ? (
          <div className="stack" style={{ gap: 10 }}>
            <h2>{t('generate.compare')}</h2>
            <VariantComparison variants={compared} />
          </div>
        ) : (
          list.length > 1 && <p className="small muted">{t('timetables.compareHint')}</p>
        )}
      </div>
    </div>
  );
}
