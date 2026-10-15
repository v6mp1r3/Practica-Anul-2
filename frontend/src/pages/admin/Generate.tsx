import { CycleTabs, groupInCycle, useCycle } from '../../components/CycleTabs';
import { weeksLabel } from '../../domain/exams';
import { useAdminScope } from '../../components/FacultyFilter';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type GenerateProgress } from '../../api';
import { Icon } from '../../components/Icon';
import { PrecheckList } from '../../components/PrecheckList';
import { GroupPicker } from '../../components/GroupPicker';
import { Field, PageHeader, Segmented, Switch } from '../../components/ui';
import { precheck } from '../../domain/precheck';
import { SOFT_WEIGHTS } from '../../domain/score';
import { RoundPicker } from '../../components/RoundPicker';
import { STUDY_FORMS, type ExamRound, type GenerationRules, type ScoreBreakdown, type StudyForm, type Timetable } from '../../domain/types';
import { evaluationOf } from '../../domain/exams';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import { Select } from '../../components/Select';
import { loadRules, saveRules } from '../../utils/generationRules';

/** The comfort rules that can be made strict, in the order shown: the rule, and the score line it is judged by. */
const RULES: { rule: keyof GenerationRules; key: keyof ScoreBreakdown }[] = [
  { rule: 'allowGroupGaps', key: 'groupGaps' },
  { rule: 'allowTeacherGaps', key: 'teacherGaps' },
  { rule: 'allowThinDays', key: 'thinDays' },
  { rule: 'allowOverload', key: 'dayOverload' },
  { rule: 'allowEdgeMisses', key: 'edgeMisses' },
];
const HARD_RULES = [
  'generate.rulesHard1',
  'generate.rulesHard2',
  'generate.rulesHard3',
  'generate.rulesHard4',
  'generate.rulesHard5',
] as const;

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
  // licență | master's: generate one cycle at a time (the other keeps its published pairs)
  const [cycle, setCycle] = useCycle();
  const scopeGroups = dataset.groups.filter((g) => (!scope || g.faculty === scope) && groupInCycle(g, cycle));
  // nothing is chosen at first: the administrator picks the groups to generate for
  const [groupIds, setGroupIds] = useState<string[]>([]);
  useEffect(() => {
    setGroupIds([]);
  }, [cycle, scope]);
  const [form, setForm] = useState<'all' | StudyForm>('all');
  // semester of the year to generate for: the one the settings are on (autumn → 1, spring → 2)
  const [semester, setSemester] = useState<1 | 2>(dataset.settings.semester.startsWith('Primăvara') ? 2 : 1);
  // comfort rules: what the administrator chose last time (all allowed except days below the minimum, until changed)
  const [rules, setRules] = useState(loadRules);
  useEffect(() => saveRules(rules), [rules]);
  const [variants, setVariants] = useState(3);
  const [effort, setEffort] = useState<Effort>('normal');
  const [baseId, setBaseId] = useState('');
  const [drafts, setDrafts] = useState<Timetable[]>([]);
  // a timetable to follow (e.g. one just imported: Orare → Importă orar sends ?example=id)
  const [params] = useSearchParams();
  const [exampleId, setExampleId] = useState(params.get('example') ?? '');
  const [examples, setExamples] = useState<Timetable[]>([]);
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [result, setResult] = useState<Timetable[]>([]);
  // what to generate: the weekly timetable, or atestări / exams / retakes
  const [what, setWhat] = useState<'timetable' | ExamRound>('timetable');
  const [examBusy, setExamBusy] = useState(false);
  const ev = evaluationOf(dataset);

  useEffect(() => {
    api
      .listTimetables()
      .then((list) => {
        setDrafts(list.filter((x) => x.status !== 'variant' && x.lessons.some((l) => l.locked)));
        setExamples(list.filter((x) => x.status !== 'variant' && x.lessons.length > 0));
        setResult(list.filter((x) => x.status === 'variant'));
      })
      .catch(() => toast(t('common.error'), 'error'));
  }, []);

  const issues = useMemo(() => precheck(dataset, index), [dataset, index]);
  const hard = issues.filter((i) => i.severity === 'hard');
  const formGroups = scopeGroups.filter((g) => form === 'all' || g.studyForm === form);
  const running = progress !== null;

  async function run() {
    setProgress({ variant: 0, progress: 0 });
    setResult([]);
    try {
      const out = await api.generate(
        {
          groupIds,
          variants,
          semester,
          rules,
          iterations: EFFORT[effort],
          baseTimetableId: baseId || undefined,
          exampleTimetableId: exampleId || undefined,
        },
        setProgress,
      );
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
    try {
      const saved = await api.saveTimetable({ ...v, status: 'draft' });
      toast(t('generate.kept', { name: saved.name }));
      navigate(`/admin/timetables/${saved.id}`);
    } catch {
      toast(t('common.error'), 'error');
    }
  }

  return (
    <div className="page">
      <PageHeader title={t('nav.generate')} subtitle={t('generate.subtitle')} />
      <div className="stack">
        <div className="row wrap" style={{ gap: 8 }}>
          <CycleTabs value={cycle} onChange={setCycle} />
          <RoundPicker value={what} onChange={setWhat} before={[{ value: 'timetable' as const, label: t('generate.whatTimetable') }]} />
        </div>
        {what !== 'timetable' ? (
          <div className="card">
            <div className="card-body stack">
              <p className="muted" style={{ margin: 0 }}>
                {what === 'session' || what === 'reexam'
                  ? t('exams.finalsNote')
                  : what === 'remidterm1' || what === 'remidterm2'
                    ? t('exams.retakeNote', { w: ev.midtermRetakeWeeks[what === 'remidterm1' ? 0 : 1] })
                    : ev.midtermMode === 'separate'
                      ? t('exams.separateNote', { w1: weeksLabel(ev, 1), w2: weeksLabel(ev, 2) })
                      : t('exams.inClassNote', { w1: weeksLabel(ev, 1), w2: weeksLabel(ev, 2) })}
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
                        // keep only the chosen groups of that form of study
                        setGroupIds((cur) => cur.filter((id) => f === 'all' || index.groups.get(id)?.studyForm === f));
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
                  <Field label={t('generate.semester')} hint={t('generate.semesterHint')}>
                    <Segmented
                      value={String(semester)}
                      onChange={(v) => setSemester(v === '2' ? 2 : 1)}
                      options={[
                        { value: '1', label: t('generate.semester1') },
                        { value: '2', label: t('generate.semester2') },
                      ]}
                    />
                  </Field>
                  <Field label={t('generate.groups')} hint={t('generate.groupsHint')}>
                    {/* by year, then a row per specialty (TI, FAF…): a whole specialty or year at a click, with search */}
                    <GroupPicker groups={formGroups} value={groupIds} onChange={setGroupIds} />
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
                  {examples.length > 0 && (
                    <Field label={t('generate.example')} hint={t('generate.exampleHint')}>
                      <Select className="select" value={exampleId} onChange={(e) => setExampleId(e.target.value)}>
                        <option value="">{t('generate.noExample')}</option>
                        {examples.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name} ({x.lessons.length} {t('dash.pairs')})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
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

              <div className="stack">
                <div className="card">
                  <div className="card-header">
                    <h2>{t('generate.rules')}</h2>
                  </div>
                  <div className="card-body stack">
                    <p className="muted small">{t('generate.rulesHint')}</p>
                    <div className="stack" style={{ gap: 6 }}>
                      <strong className="small">{t('generate.rulesHard')}</strong>
                      {HARD_RULES.map((key) => (
                        <div key={key} className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
                          <Icon name="lock" />
                          <span>{t(key)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="stack" style={{ gap: 10 }}>
                      <strong className="small">{t('generate.rulesSoft')}</strong>
                      {RULES.map(({ rule, key }) => (
                        <div key={rule} className="row" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                          <div>
                            <div>{t(`generate.${rule}`)}</div>
                            <div className="small muted">
                              {t(
                                rules[rule]
                                  ? 'generate.ruleFlexible'
                                  : rule === 'allowThinDays'
                                    ? 'generate.ruleAbsolute'
                                    : 'generate.ruleStrict',
                                { weight: SOFT_WEIGHTS[key] },
                              )}
                            </div>
                          </div>
                          <Switch checked={rules[rule]} onChange={(v) => setRules({ ...rules, [rule]: v })} label={t(`generate.${rule}`)} />
                        </div>
                      ))}
                      <p className="small muted">{t('generate.rulesOther')}</p>
                    </div>
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
