import { CycleTabs, useCycle } from '../../components/CycleTabs';
import { useAdminScope } from '../../components/FacultyFilter';
import { useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { ClusterManager, ClusterPicker, useClusterLabel } from '../../components/ClusterPicker';
import { CrudPage } from '../../components/CrudPage';
import { Icon } from '../../components/Icon';
import { Field, Modal } from '../../components/ui';
import { deriveClusters, subjectInSpeciality } from '../../domain/clusters';
import { parseStudyPlan, STUDY_PLAN_TEMPLATE, type CsvResult } from '../../domain/csv';
import { STUDY_FORMS, type StudyCycle, type StudyForm, type Subject } from '../../domain/types';
import { Select } from '../../components/Select';
import { specialtyOf } from '../../domain/specialty';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import { downloadFile } from '../../utils/download';

/** The subject ends with an exam (older records only have `evaluation`). */
const hasExam = (x: { hasExam?: boolean; evaluation?: string }) => x.hasExam ?? x.evaluation !== 'atestari';

/** The evaluation filter: atestarea 1, atestarea 2, both, or the exam. */
function hasAssessment(x: Subject, what: string): boolean {
  const m1 = x.hasMidterm1 ?? true;
  const m2 = x.hasMidterm2 ?? true;
  if (what === 'm1') return m1;
  if (what === 'm2') return m2;
  if (what === 'both') return m1 && m2;
  return hasExam(x);
}

export default function Subjects() {
  const { t } = useI18n();
  const { dataset, index, refresh } = useDataset();
  const scope = useAdminScope();
  // licență | master's study plan
  const [cycle, setCycle] = useCycle();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CsvResult | null>(null);
  // clusters come with the dataset; an older server without them is covered by deriving them from the groups
  const clusters = useMemo(() => dataset.clusters ?? deriveClusters(dataset.groups), [dataset]);
  const clusterLabel = useClusterLabel();
  const clusterById = useMemo(() => new Map(clusters.map((c) => [c.id, c])), [clusters]);
  const [clusterFilter, setClusterFilter] = useState('');
  const [managing, setManaging] = useState(false);

  async function onFile(file: File) {
    setPreview(parseStudyPlan(await file.text()));
    if (fileRef.current) fileRef.current.value = '';
  }

  async function confirmImport() {
    if (!preview) return;
    await api.importSubjects(preview.subjects);
    await refresh();
    toast(t('subjects.imported', { count: preview.subjects.length }));
    setPreview(null);
  }

  // filters: specialty, year, evaluation, activity in the study plan
  const subjects = dataset.subjects.filter((x) => (!scope || !x.faculty || x.faculty === scope) && (x.cycle ?? 'licenta') === cycle);
  const [year, setYear] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [activity, setActivity] = useState('');
  const [specialty, setSpecialty] = useState('');
  // frecvență | frecvență redusă | dual: the forms of the groups a subject is taught to (its loads in
  // Sarcina didactică, or, before it has any, the groups of its clusters)
  const [form, setForm] = useState<'' | StudyForm>('');
  const formsOf = useMemo(() => {
    const formOf = (id: string) => index.groups.get(id)?.studyForm;
    const byLoads = new Map<string, Set<StudyForm>>();
    for (const a of dataset.assignments) {
      const set = byLoads.get(a.subjectId) ?? new Set<StudyForm>();
      for (const c of index.cohorts(a.audience)) {
        const f = formOf(c.groupId);
        if (f) set.add(f);
      }
      byLoads.set(a.subjectId, set);
    }
    return (x: Subject): Set<StudyForm> => {
      const loads = byLoads.get(x.id);
      if (loads?.size) return loads;
      const set = new Set<StudyForm>();
      for (const id of x.clusterIds ?? []) for (const g of clusterById.get(id)?.groupIds ?? []) formOf(g) && set.add(formOf(g)!);
      return set;
    };
  }, [dataset.assignments, index, clusterById]);
  // the faculty's specialties, from its group names (TI-251 → TI)
  const specialties = [...new Set(dataset.groups.filter((g) => !scope || g.faculty === scope).map((g) => specialtyOf(g.name)))].sort(
    (a, b) => a.localeCompare(b, 'ro'),
  );
  const years = [...new Set(subjects.map((x) => x.year))].sort((a, b) => a - b);
  const pairsOf = (x: Subject, a: string) => (a === 'lecture' ? x.lecturePairs : a === 'seminar' ? x.seminarPairs : x.labPairs);
  const shown = subjects.filter(
    (x) =>
      (!year || x.year === Number(year)) &&
      (!evaluation || hasAssessment(x, evaluation)) &&
      (!activity || pairsOf(x, activity) > 0) &&
      // a specialty's subjects: those tagged with it or with its whole year, and those for every specialty
      (!specialty || subjectInSpeciality(x.clusterIds, specialty, clusters)) &&
      (!clusterFilter || !!x.clusterIds?.includes(clusterFilter)) &&
      (!form || formsOf(x).has(form)),
  );
  const filtering = !!(year || evaluation || activity || specialty || form);

  const pairs = (n: number) => (n ? String(n).replace('.', ',') : '—');

  return (
    <>
      <CrudPage
        collection="subjects"
        title={t('nav.subjects')}
        subtitle={t('subjects.subtitle')}
        items={shown}
        filters={
          <>
            <Select
              className="select pill"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              aria-label={t('groups.prefix')}
            >
              <option value="">{t('groups.allPrefixes')}</option>
              {specialties.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
            <Select className="select pill" value={year} onChange={(e) => setYear(e.target.value)} aria-label={t('subjects.year')}>
              <option value="">{t('subjects.allYears')}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {t('groups.year')} {y}
                </option>
              ))}
            </Select>
            <Select
              className="select pill"
              value={evaluation}
              onChange={(e) => setEvaluation(e.target.value)}
              aria-label={t('subjects.evaluation')}
            >
              <option value="">{t('subjects.anyEvaluation')}</option>
              <option value="m1">{t('subjects.filter.m1')}</option>
              <option value="m2">{t('subjects.filter.m2')}</option>
              <option value="both">{t('subjects.filter.both')}</option>
              <option value="exam">{t('subjects.evaluation.exam')}</option>
            </Select>
            <Select className="select pill" value={activity} onChange={(e) => setActivity(e.target.value)} aria-label={t('teachers.types')}>
              <option value="">{t('subjects.anyActivity')}</option>
              {(['lecture', 'seminar', 'lab'] as const).map((a) => (
                <option key={a} value={a}>
                  {t('subjects.withActivity', { what: t(`activity.${a}`).toLowerCase() })}
                </option>
              ))}
            </Select>
            <Select
              className="select pill"
              value={form}
              onChange={(e) => setForm(e.target.value as '' | StudyForm)}
              aria-label={t('groups.studyForm')}
            >
              <option value="">{t('groups.allForms')}</option>
              {STUDY_FORMS.map((f) => (
                <option key={f} value={f}>
                  {t(`form.${f}`)}
                </option>
              ))}
            </Select>
            {filtering && (
              <button
                className="btn ghost sm"
                onClick={() => {
                  setForm('');
                  setYear('');
                  setEvaluation('');
                  setActivity('');
                  setSpecialty('');
                }}
              >
                {t('filters.reset')}
              </button>
            )}
          </>
        }
        itemLabel={(x) => `${x.code} — ${x.name}`}
        searchText={(x) => `${x.code} ${x.abbreviation ?? ''} ${x.name}`}
        // the cluster list changes width with its choice: keep the actions under the title
        stackedHeader
        headerActions={
          <>
            <CycleTabs
              value={cycle}
              onChange={(c) => {
                setCycle(c);
                setClusterFilter('');
              }}
            />
            <Select value={clusterFilter} onChange={(e) => setClusterFilter(e.target.value)} aria-label={t('subjects.clusters')}>
              <option value="">{t('subjects.allClusters')}</option>
              {clusters
                .filter((c) => (!c.cycle || c.cycle === cycle) && (c.kind === 'year' || c.kind === 'custom' || c.groupIds.length > 0))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {clusterLabel(c)}
                  </option>
                ))}
            </Select>
            <button className="btn" onClick={() => setManaging(true)}>
              <Icon name="plus" />
              {t('clusters.manage')}
            </button>
            <button className="btn" onClick={() => downloadFile('plan-de-studii.csv', STUDY_PLAN_TEMPLATE, 'text/csv')}>
              <Icon name="download" />
              {t('subjects.template')}
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" />
              {t('subjects.import')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </>
        }
        columns={[
          {
            label: t('subjects.code'),
            render: (x) => (
              <span>
                <strong>{x.code}</strong>
                {x.abbreviation && x.abbreviation !== x.code && <span className="small muted"> ({x.abbreviation})</span>}
                {x.cycle === 'master' && (
                  <span className="badge primary" style={{ marginLeft: 6 }}>
                    {t('cycle.master')}
                  </span>
                )}
              </span>
            ),
            width: 120,
          },
          { label: t('common.name'), render: (x) => x.name },
          { label: t('subjects.year'), render: (x) => x.year },
          {
            label: t('subjects.clusters'),
            render: (x) => {
              const tags = (x.clusterIds ?? []).map((id) => clusterById.get(id)).filter((c) => !!c);
              return tags.length ? (
                <span className="tag-list">
                  {tags.slice(0, 3).map((c) => (
                    <span key={c!.id} className="badge primary">
                      {clusterLabel(c!)}
                    </span>
                  ))}
                  {tags.length > 3 && <span className="small muted">+{tags.length - 3}</span>}
                </span>
              ) : (
                <span className="muted">—</span>
              );
            },
          },
          { label: 'ECTS', render: (x) => x.credits },
          { label: t('subjects.semester'), render: (x) => x.semester ?? 1 },
          {
            label: t('subjects.evaluation'),
            render: (x) => {
              const parts = [
                x.hasMidterm1 !== false && t('subjects.midterm1Short'),
                x.hasMidterm2 !== false && t('subjects.midterm2Short'),
                hasExam(x) && t('subjects.examShort'),
              ].filter(Boolean);
              return <span className="small">{parts.length ? parts.join(' · ') : '—'}</span>;
            },
          },
          {
            label: '',
            render: (x) =>
              x.edgeOfDay ? (
                <span className="badge warning" title={t('subjects.edgeOfDay')}>
                  {t('subjects.edgeShort')}
                </span>
              ) : null,
          },
          { label: t('activity.lecture'), render: (x) => pairs(x.lecturePairs) },
          { label: t('activity.seminar'), render: (x) => pairs(x.seminarPairs) },
          { label: t('activity.lab'), render: (x) => pairs(x.labPairs) },
        ]}
        newItem={(): Omit<Subject, 'id'> => ({
          cycle,
          code: '',
          name: '',
          faculty: scope || undefined,
          credits: 5,
          year: 1,
          semester: 1,
          hasMidterm1: true,
          hasMidterm2: true,
          hasExam: true,
          clusterIds: [],
          lecturePairs: 1,
          seminarPairs: 1,
          labPairs: 0,
        })}
        validate={(d) => (!d.code.trim() || !d.name.trim() ? t('subjects.required') : null)}
        renderForm={(d, set) => (
          <div className="stack">
            <div className="form-grid">
              <Field label={t('subjects.code')}>
                <input className="input" value={d.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} autoFocus />
              </Field>
              <Field label={t('subjects.abbreviation')} hint={t('subjects.abbreviationHint')}>
                <input
                  className="input"
                  value={d.abbreviation ?? ''}
                  placeholder={d.code}
                  maxLength={12}
                  onChange={(e) => set({ abbreviation: e.target.value })}
                />
              </Field>
              <Field label={t('common.name')}>
                <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label={t('subjects.cycle')}>
                <Select value={d.cycle ?? 'licenta'} onChange={(e) => set({ cycle: e.target.value as StudyCycle })}>
                  <option value="licenta">{t('cycle.licenta')}</option>
                  <option value="master">{t('cycle.master')}</option>
                </Select>
              </Field>
              <Field label={t('subjects.semester')}>
                <Select value={String(d.semester ?? 1)} onChange={(e) => set({ semester: Number(e.target.value) === 2 ? 2 : 1 })}>
                  <option value="1">{t('subjects.semesterN', { n: 1 })}</option>
                  <option value="2">{t('subjects.semesterN', { n: 2 })}</option>
                </Select>
              </Field>
              <Field label={t('subjects.evaluation')}>
                <div className="tag-row">
                  <button
                    type="button"
                    className="tag"
                    aria-pressed={d.hasMidterm1 !== false}
                    onClick={() => set({ hasMidterm1: d.hasMidterm1 === false })}
                  >
                    {t('subjects.midterm1')}
                  </button>
                  <button
                    type="button"
                    className="tag"
                    aria-pressed={d.hasMidterm2 !== false}
                    onClick={() => set({ hasMidterm2: d.hasMidterm2 === false })}
                  >
                    {t('subjects.midterm2')}
                  </button>
                  <button
                    type="button"
                    className="tag"
                    aria-pressed={hasExam(d)}
                    onClick={() => set({ hasExam: !hasExam(d), evaluation: hasExam(d) ? 'atestari' : 'exam' })}
                  >
                    {t('subjects.evaluation.exam')}
                  </button>
                </div>
              </Field>
              <Field label={t('subjects.year')}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={6}
                  value={d.year}
                  onChange={(e) => set({ year: Number(e.target.value) || 1 })}
                />
              </Field>
              <Field label="ECTS">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={d.credits}
                  onChange={(e) => set({ credits: Number(e.target.value) || 0 })}
                />
              </Field>
            </div>
            <Field label={t('subjects.clusters')} hint={t('subjects.clustersHint')}>
              <ClusterPicker
                clusters={clusters}
                cycle={d.cycle ?? 'licenta'}
                value={d.clusterIds ?? []}
                onChange={(ids) => set({ clusterIds: ids })}
              />
            </Field>
            <label className="row" style={{ gap: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!d.edgeOfDay} onChange={(e) => set({ edgeOfDay: e.target.checked || undefined })} />
              <span>
                <strong>{t('subjects.edgeOfDay')}</strong>
                <span className="small muted" style={{ display: 'block' }}>
                  {t('subjects.edgeOfDayHint')}
                </span>
              </span>
            </label>
            <div>
              <h3>{t('subjects.pairsPerWeek')}</h3>
              <p className="small muted" style={{ margin: '2px 0 8px' }}>
                {t('subjects.pairsHint')}
              </p>
              <div className="form-grid">
                {(['lecturePairs', 'seminarPairs', 'labPairs'] as const).map((k, i) => (
                  <Field key={k} label={t((['activity.lecture', 'activity.seminar', 'activity.lab'] as const)[i])}>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step={0.5}
                      value={d[k]}
                      onChange={(e) => set({ [k]: Number(e.target.value) || 0 })}
                    />
                  </Field>
                ))}
              </div>
            </div>
          </div>
        )}
      />

      {preview && (
        <Modal
          wide
          title={t('subjects.import')}
          onClose={() => setPreview(null)}
          footer={
            <>
              <button className="btn" onClick={() => setPreview(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" disabled={!preview.subjects.length} onClick={confirmImport}>
                {t('subjects.importCount', { count: preview.subjects.length })}
              </button>
            </>
          }
        >
          <div className="stack">
            {preview.errors.length > 0 && (
              <div className="badge danger" style={{ whiteSpace: 'normal' }}>
                {t('subjects.importErrors', { lines: preview.errors.map((e) => e.line).join(', ') })}
              </div>
            )}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('subjects.code')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('subjects.year')}</th>
                    <th>{t('activity.lecture')}</th>
                    <th>{t('activity.seminar')}</th>
                    <th>{t('activity.lab')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.subjects.map((s, i) => (
                    <tr key={i}>
                      <td>{s.code}</td>
                      <td>{s.name}</td>
                      <td>{s.year}</td>
                      <td>{pairs(s.lecturePairs)}</td>
                      <td>{pairs(s.seminarPairs)}</td>
                      <td>{pairs(s.labPairs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
      {managing && <ClusterManager dataset={dataset} onClose={() => setManaging(false)} />}
    </>
  );
}
