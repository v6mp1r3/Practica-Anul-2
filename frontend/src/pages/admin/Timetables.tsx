import { facultyGroupIds, useAdminScope } from '../../components/FacultyFilter';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { ImportTimetable } from '../../components/ImportTimetable';
import { Empty, Loading, PageHeader } from '../../components/ui';
import { findExamProblems } from '../../domain/exams';
import type { ExamPlan, ExamRound, Timetable } from '../../domain/types';
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
  const [importing, setImporting] = useState(false);

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
          <>
            <button className="btn" onClick={() => setImporting(true)}>
              <Icon name="upload" />
              {t('import.button')}
            </button>
            <Link className="btn primary" to="/admin/generate">
              <Icon name="zap" />
              {t('dashboard.generate')}
            </Link>
          </>
        }
      />
      {importing && <ImportTimetable onClose={() => setImporting(false)} onSaved={() => load()} />}
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
                          {tt.lessons.length} {t('dash.pairs')}
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

        <EvaluationPlans />
      </div>
    </div>
  );
}

const ROUND_ORDER: ExamRound[] = ['midterm1', 'midterm2', 'session', 'remidterm1', 'remidterm2', 'reexam'];

/** Every atestări / final exams / retakes timetable of the faculty, drafts included. */
function EvaluationPlans() {
  const { t, lang } = useI18n();
  const { dataset, refresh } = useData();
  const toast = useToast();
  const [plans, setPlans] = useState<ExamPlan[] | null>(null);
  const load = useCallback(() => api.listExamPlans().then(setPlans), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!plans || !dataset) return null;

  const name = (r: ExamRound) =>
    r === 'midterm1' || r === 'midterm2'
      ? t('exams.midterm', { n: r === 'midterm1' ? 1 : 2 })
      : r === 'session'
        ? t('exams.exams')
        : r === 'reexam'
          ? t('exams.reexam')
          : t('exams.remidterm', { n: r === 'remidterm1' ? 1 : 2 });
  const fmt = (iso: string) => new Date(iso).toLocaleString(dateLocale(lang), { dateStyle: 'short', timeStyle: 'short' });
  const sorted = [...plans].sort((a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round));

  async function setStatus(p: ExamPlan, publish: boolean) {
    await (publish ? api.publishExamPlan(p.round) : api.unpublishExamPlan(p.round));
    await Promise.all([load(), refresh()]);
    toast(t(publish ? 'exams.publishedToast' : 'exams.unpublishedToast'));
  }
  async function remove(p: ExamPlan) {
    if (!confirm(t('common.confirmDelete', { name: name(p.round) }))) return;
    await api.deleteExamPlan(p.round);
    await Promise.all([load(), refresh()]);
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <h2>{t('timetables.evaluations')}</h2>
      <div className="card">
        {sorted.length === 0 ? (
          <Empty>{t('timetables.noEvaluations')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('timetables.status')}</th>
                  <th>{t('score.hard')}</th>
                  <th>{t('timetables.updated')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const problems = findExamProblems(dataset, p.events).length;
                  return (
                    <tr key={p.round}>
                      <td>
                        <Link to={`/admin/evaluations?round=${p.round}`}>
                          <strong>{name(p.round)}</strong>
                        </Link>
                        <div className="small muted">
                          {p.events.filter((e) => e.kind === 'exam').length} · {dataset.settings.semester}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${p.status === 'published' ? 'success' : 'primary'}`}>{t(`exams.status.${p.status}`)}</span>
                      </td>
                      <td>
                        <span className={`badge ${problems ? 'danger' : 'success'}`}>{problems}</span>
                      </td>
                      <td className="small muted">{fmt(p.updatedAt)}</td>
                      <td className="actions">
                        {p.status === 'published' ? (
                          <button className="btn sm" onClick={() => setStatus(p, false)}>
                            {t('exams.unpublish')}
                          </button>
                        ) : (
                          <button className="btn sm" onClick={() => setStatus(p, true)} disabled={!p.events.length}>
                            {t('exams.publish')}
                          </button>
                        )}
                        <button className="btn ghost sm icon danger" onClick={() => remove(p)} aria-label={t('common.delete')}>
                          <Icon name="trash" size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
