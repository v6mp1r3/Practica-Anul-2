import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type GenerateProgress } from '../../api';
import { Icon } from '../../components/Icon';
import { PrecheckList } from '../../components/PrecheckList';
import { Field, PageHeader, Segmented } from '../../components/ui';
import { precheck } from '../../domain/precheck';
import { SOFT_WEIGHTS } from '../../domain/score';
import { STUDY_FORMS, type ScoreBreakdown, type Timetable } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';

const EFFORT = { quick: 80, normal: 250, thorough: 700 } as const;
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
          <tr>
            <td>
              <strong>{t('score.soft')}</strong>
            </td>
            {variants.map((v) => (
              <td key={v.id}>
                <strong>{v.score?.soft}</strong>
              </td>
            ))}
          </tr>
          {keys.map((k) => {
            const b = best((v) => v.score?.breakdown[k] ?? Infinity);
            return (
              <tr key={k}>
                <td className="muted">
                  {t(`score.${k}`)} <span className="small">×{SOFT_WEIGHTS[k]}</span>
                </td>
                {variants.map((v) => (
                  <td key={v.id} style={{ fontWeight: v.score?.breakdown[k] === b ? 650 : 400 }}>
                    {v.score?.breakdown[k]}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr>
            <td className="muted small">{t('generate.algorithm')}</td>
            {variants.map((v) => (
              <td key={v.id} className="small muted">
                {v.algorithm}
              </td>
            ))}
          </tr>
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
  const [groupIds, setGroupIds] = useState<string[]>(dataset.groups.map((g) => g.id));
  const [variants, setVariants] = useState(3);
  const [effort, setEffort] = useState<Effort>('normal');
  const [seed, setSeed] = useState('');
  const [baseId, setBaseId] = useState('');
  const [drafts, setDrafts] = useState<Timetable[]>([]);
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [result, setResult] = useState<Timetable[]>([]);

  useEffect(() => {
    api.listTimetables().then((list) => {
      setDrafts(list.filter((x) => x.status !== 'variant' && x.lessons.some((l) => l.locked)));
      setResult(list.filter((x) => x.status === 'variant'));
    });
  }, []);

  const issues = useMemo(() => precheck(dataset, index), [dataset, index]);
  const hard = issues.filter((i) => i.severity === 'hard');
  const years = [...new Set(dataset.groups.map((g) => g.year))].sort();
  const running = progress !== null;

  async function run() {
    setProgress({ variant: 0, progress: 0 });
    setResult([]);
    try {
      const out = await api.generate(
        { groupIds, variants, iterations: EFFORT[effort], seed: seed ? Number(seed) : undefined, baseTimetableId: baseId || undefined },
        setProgress,
      );
      setResult(out);
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setProgress(null);
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
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <h2>{t('generate.settings')}</h2>
            </div>
            <div className="card-body stack">
              <Field label={t('generate.groups')} hint={t('generate.groupsHint')}>
                <div className="stack" style={{ gap: 8 }}>
                  {/* Select every group of one form of study at once, e.g. only reduced attendance */}
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="small muted">{t('generate.byForm')}:</span>
                    {STUDY_FORMS.filter((f) => dataset.groups.some((g) => g.studyForm === f)).map((f) => {
                      const ids = dataset.groups.filter((g) => g.studyForm === f).map((g) => g.id);
                      const on = ids.every((id) => groupIds.includes(id));
                      return (
                        <button
                          key={f}
                          type="button"
                          className={`badge ${on ? 'primary' : ''}`}
                          style={{ border: 'none', cursor: 'pointer' }}
                          onClick={() => toggle(ids, !on)}
                          aria-pressed={on}
                        >
                          {t(`form.${f}`)}
                        </button>
                      );
                    })}
                  </div>
                  {years.map((y) => {
                    const ids = dataset.groups.filter((g) => g.year === y).map((g) => g.id);
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
                  <select className="select" value={variants} onChange={(e) => setVariants(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('generate.seed')} hint={t('generate.seedHint')}>
                  <input className="input" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} />
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
                  <select className="select" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
                    <option value="">—</option>
                    {drafts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({t('generate.lockedCount', { count: d.lessons.filter((l) => l.locked).length })})
                      </option>
                    ))}
                  </select>
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
                    {progress.best && ` · ${t('score.hard')}: ${progress.best.hard} · ${t('score.soft')}: ${progress.best.soft}`}
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
      </div>
    </div>
  );
}
