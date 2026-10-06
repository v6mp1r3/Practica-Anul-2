import { useAdminScope } from '../../components/FacultyFilter';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type GenerateProgress } from '../../api';
import { Icon } from '../../components/Icon';
import { PrecheckList } from '../../components/PrecheckList';
import { Field, PageHeader, Segmented } from '../../components/ui';
import { precheck } from '../../domain/precheck';
import { SOFT_WEIGHTS } from '../../domain/score';
import { STUDY_FORMS, type ExamRound, type ScoreBreakdown, type StudyForm, type Timetable } from '../../domain/types';
import { evaluationOf } from '../../domain/exams';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import { Select } from '../../components/Select';

const EFFORT = { quick: 150, normal: 250, thorough: 700 } as const;
type Effort = keyof typeof EFFORT;

export function VariantComparison({ variants, onKeep }: { variants: Timetable[]; onKeep?: (t: Timetable) => void }) {
  const { t } = useI18n();
  const keys = Object.keys(SOFT_WEIGHTS) as (keyof ScoreBreakdown)[];
  const best = (get: (v: Timetable) => number) => Math.min(...variants.map(get));
  const bestSoft = best((v) => v.score?.soft ?? Infinity);

  return (
    <div className="table-wrap card">
      <table className="table">
        <thead>
          <tr>
            <th />
            {variants.map((v) => (
              <th key={v.id} style={{ textTransform: 'none', fontSize: 14, color: 'var(--text)' }}>
                {v.name} {v.score?.soft === bestSoft && <span className="badge success">{t('generate.best')}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('score.hard')}</td>
            {variants.map((v) => (
              <td key={v.id}>
                <span className={`badge ${v.score?.hard ? 'danger' : 'success'}`}>{v.score?.hard ?? '—'}</span>
              </td>
            ))}
          </tr>
          {keys.map((k) => {
            const b = best((v) => v.score?.breakdown[k] ?? Infinity);
            return (
              <tr key={k}>
                <td className="muted">{t(`score.${k}`)}</td>
                {variants.map((v) => (
                  <td key={v.id} style={{ fontWeight: v.score?.breakdown[k] === b ? 650 : 400 }}>
                    {v.score?.breakdown[k]}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr>
            <td />
            {variants.map((v) => (
              <td key={v.id}>
                <div className="row wrap">
                  <Link className="btn sm primary" to={`/admin/timetables/${v.id}`}>
                    {t('generate.open')}
                  </Link>
                  {onKeep && v.status === 'variant' && (
                    <button className="btn sm" onClick={() => onKeep(v)}>
                      {t('generate.keep')}
                    </button>
                  )}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Generate() {
  const { t } = useI18n();
  const { dataset, index } = useDataset();
  const toast = useToast();
  const navigate = useNavigate();
  // Faculty administrators generate only for their own faculty's groups
  const scope = useAdminScope();
  const scopeGroups = dataset.groups.filter((g) => !scope || g.faculty === scope);
  const [groupIds, setGroupIds] = useState<string[]>(scopeGroups.map((g) => g.id));
  const [form, setForm] = useState<'all' | StudyForm>('all');
  const [variants, setVariants] = useState(3);
  const [effort, setEffort] = useState<Effort>('normal');
  const [baseId, setBaseId] = useState('');
  const [drafts, setDrafts] = useState<Timetable[]>([]);
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [result, setResult] = useState<Timetable[]>([]);
  // what to generate: the weekly timetable, or atestări / exams / retakes
  const [what, setWhat] = useState<'timetable' | ExamRound>('timetable');
  const [examBusy, setExamBusy] = useState(false);
  const ev = evaluationOf(dataset);

  useEffect(() => {
    api.listTimetables().then((list) => {
      setDrafts(list.filter((x) => x.status !== 'variant' && x.lessons.some((l) => l.locked)));
      setResult(list.filter((x) => x.status === 'variant'));
    });
  }, []);

  const issues = useMemo(() => precheck(dataset, index), [dataset, index]);
  const hard = issues.filter((i) => i.severity === 'hard');
  const formGroups = scopeGroups.filter((g) => form === 'all' || g.studyForm === form);
  const years = [...new Set(formGroups.map((g) => g.year))].sort();
  const running = progress !== null;

  async function run() {
    setProgress({ variant: 0, progress: 0 });
    setResult([]);
    try {
      const out = await api.generate({ groupIds, variants, iterations: EFFORT[effort], baseTimetableId: baseId || undefined }, setProgress);
      setResult(out);
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setProgress(null);
    }
  }

  /** Atestări, exams or retakes: generated for the whole faculty, then checked and published in Evaluări. */
  async function runExams(round: ExamRound) {
    setExamBusy(true);
    try {
      const plan = await api.generateExamPlan(round);
      toast(t('exams.generatedToast', { count: plan.events.filter((e) => e.kind === 'exam').length || plan.events.length }));
      if (plan.warnings) toast(t('exams.unplacedToast', { count: plan.warnings }), 'error');
      navigate(`/admin/evaluations?round=${round}`);
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setExamBusy(false);
    }
  }

  async function keep(v: Timetable) {
    const saved = await api.saveTimetable({ ...v, status: 'draft' });
    toast(t('generate.kept', { name: saved.name }));
    navigate(`/admin/timetables/${saved.id}`);
  }

  const toggle = (ids: string[], on: boolean) =>
    setGroupIds((cur) => (on ? [...new Set([...cur, ...ids])] : cur.filter((x) => !ids.includes(x))));

  return (
    <div className="page">
      <PageHeader title={t('nav.generate')} subtitle={t('generate.subtitle')} />
      <div className="stack">
        <Segmented
          value={what}
          onChange={setWhat}
          options={[
            { value: 'timetable', label: t('generate.whatTimetable') },
            { value: 'midterm1', label: t('exams.midterm', { n: 1 }) },
            { value: 'midterm2', label: t('exams.midterm', { n: 2 }) },
            { value: 'session', label: t('exams.exams') },
            { value: 'reexam', label: t('exams.reexams') },
          ]}
        />
        {what !== 'timetable' ? (
          <div className="card">
            <div className="card-body stack">
              <p className="muted" style={{ margin: 0 }}>
                {what === 'session' || what === 'reexam'
                  ? t('exams.finalsNote')
                  : ev.midtermMode === 'separate'
                    ? t('exams.separateNote', { w1: ev.midtermWeeks[0], w2: ev.midtermWeeks[1] })
                    : t('exams.inClassNote', { w1: ev.midtermWeeks[0], w2: ev.midtermWeeks[1] })}
              </p>
              <p className="small muted" style={{ margin: 0 }}>
                {t('generate.examsHint')}
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => runExams(what)} disabled={examBusy}>
                  <Icon name="zap" />
                  {t('generate.run')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid-2">
              <div className="card">
                <div className="card-header">
                  <h2>{t('generate.settings')}</h2>
                </div>
                <div className="card-body stack">
                  <Field label={t('generate.form')}>
                    <Segmented
                      value={form}
                      onChange={(f) => {
                        setForm(f);
                        setGroupIds(scopeGroups.filter((g) => f === 'all' || g.studyForm === f).map((g) => g.id));
                      }}
                      options={[
                        { value: 'all', label: t('generate.allForms') },
                        ...STUDY_FORMS.filter((f) => dataset.groups.some((g) => g.studyForm === f)).map((f) => ({
                          value: f,
                          label: t(`form.${f}`),
                        })),
                      ]}
                    />
                  </Field>
                  <Field label={t('generate.groups')} hint={t('generate.groupsHint')}>
                    <div className="stack" style={{ gap: 8 }}>
                      {years.map((y) => {
                        const ids = formGroups.filter((g) => g.year === y).map((g) => g.id);
                        const all = ids.every((id) => groupIds.includes(id));
                        return (
                          <div key={y} className="row wrap">
                            <label className="check" style={{ minWidth: 90, fontWeight: 600 }}>
                              <input type="checkbox" checked={all} onChange={(e) => toggle(ids, e.target.checked)} />
                              {t('groups.year')} {y}
                            </label>
                            <div className="checks">
                              {ids.map((id) => (
                                <label key={id} className="check">
                                  <input type="checkbox" checked={groupIds.includes(id)} onChange={(e) => toggle([id], e.target.checked)} />
                                  {index.groups.get(id)?.name}
                                  {index.groups.get(id)?.studyForm !== 'full' && (
                                    <span className="small muted">({t(`form.${index.groups.get(id)?.studyForm ?? 'full'}`)})</span>
                                  )}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Field>
                  <div className="form-grid">
                    <Field label={t('generate.variants')}>
                      <Select className="select" value={variants} onChange={(e) => setVariants(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label={t('generate.effort')}>
                    <Segmented
                      value={effort}
                      onChange={setEffort}
                      options={[
                        { value: 'quick', label: t('generate.effort.quick') },
                        { value: 'normal', label: t('generate.effort.normal') },
                        { value: 'thorough', label: t('generate.effort.thorough') },
                      ]}
                    />
                  </Field>
                  {drafts.length > 0 && (
                    <Field label={t('generate.base')} hint={t('generate.baseHint')}>
                      <Select className="select" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
                        <option value="">—</option>
                        {drafts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({t('generate.lockedCount', { count: d.lessons.filter((l) => l.locked).length })})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <div className="row">
                    <button className="btn primary" onClick={run} disabled={running || groupIds.length === 0}>
                      <Icon name="zap" />
                      {t('generate.run')}
                    </button>
                    {hard.length > 0 && <span className="badge danger">{t('generate.hardWarning', { count: hard.length })}</span>}
                  </div>
                  {running && (
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="progress">
                        <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
                      </div>
                      <div className="small muted">
                        {t('generate.running', {
                          variant: String.fromCharCode(65 + progress.variant),
                          percent: Math.round(progress.progress * 100),
                        })}
                        {progress.best && ` · ${t('score.hard')}: ${progress.best.hard}`}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2>{t('precheck.title')}</h2>
                </div>
                <div className="card-body">
                  <PrecheckList issues={issues} index={index} limit={10} />
                </div>
              </div>
            </div>

            {result.length > 0 && (
              <div className="stack" style={{ gap: 10 }}>
                <div>
                  <h2>{t('generate.compare')}</h2>
                  <p className="muted small">{t('generate.compareHint')}</p>
                </div>
                <VariantComparison variants={result} onKeep={keep} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
