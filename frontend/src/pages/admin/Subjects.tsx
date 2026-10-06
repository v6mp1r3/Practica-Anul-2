import { useAdminScope } from '../../components/FacultyFilter';
import { useRef, useState } from 'react';
import { api } from '../../api';
import { CrudPage } from '../../components/CrudPage';
import { Icon } from '../../components/Icon';
import { Field, Modal } from '../../components/ui';
import { parseStudyPlan, STUDY_PLAN_TEMPLATE, type CsvResult } from '../../domain/csv';
import type { Subject, StudyCycle } from '../../domain/types';
import { Select } from '../../components/Select';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import { downloadFile } from '../../utils/download';

export default function Subjects() {
  const { t } = useI18n();
  const { dataset, refresh } = useDataset();
  const scope = useAdminScope();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CsvResult | null>(null);

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

  const pairs = (n: number) => (n ? String(n).replace('.', ',') : '—');

  return (
    <>
      <CrudPage
        collection="subjects"
        title={t('nav.subjects')}
        subtitle={t('subjects.subtitle')}
        items={dataset.subjects.filter((x) => !scope || !x.faculty || x.faculty === scope)}
        itemLabel={(x) => `${x.code} — ${x.name}`}
        searchText={(x) => `${x.code} ${x.name}`}
        headerActions={
          <>
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
          { label: 'ECTS', render: (x) => x.credits },
          {
            label: t('subjects.evaluation'),
            render: (x) => <span className="small">{t(`subjects.evaluation.${x.evaluation ?? 'exam'}`)}</span>,
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
          code: '',
          name: '',
          faculty: scope || undefined,
          credits: 5,
          year: 1,
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
              <Field label={t('common.name')}>
                <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label={t('subjects.cycle')}>
                <Select value={d.cycle ?? 'licenta'} onChange={(e) => set({ cycle: e.target.value as StudyCycle })}>
                  <option value="licenta">{t('cycle.licenta')}</option>
                  <option value="master">{t('cycle.master')}</option>
                </Select>
              </Field>
              <Field label={t('subjects.evaluation')}>
                <Select value={d.evaluation ?? 'exam'} onChange={(e) => set({ evaluation: e.target.value as 'exam' | 'atestari' })}>
                  <option value="exam">{t('subjects.evaluation.exam')}</option>
                  <option value="atestari">{t('subjects.evaluation.atestari')}</option>
                </Select>
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
    </>
  );
}
