import { CycleTabs, groupInCycle, useCycle } from '../../components/CycleTabs';
import { useAdminScope } from '../../components/FacultyFilter';
import { CrudPage } from '../../components/CrudPage';
import { Empty, Field, PageHeader } from '../../components/ui';
import { STUDY_FORMS, type Group, type StudyCycle, type StudyForm } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { Select } from '../../components/Select';
import { LanguageField, LanguageTag, languageOf } from '../../components/Language';
import { useState } from 'react';

export default function Groups() {
  const { t } = useI18n();
  const { dataset, index } = useDataset();
  const scope = useAdminScope();
  const faculty = scope;
  // licență | master's
  const [cycle, setCycle] = useCycle();
  const mine = (g: { cycle?: StudyCycle }) => groupInCycle(g, cycle);
  const [language, setLanguage] = useState('');
  // the specialty prefix of a group's name: TI-251 → TI, FAF-232 → FAF
  const [prefix, setPrefix] = useState('');
  const prefixOf = (name: string) => name.split('-')[0].trim().toUpperCase();
  const ourGroups = dataset.groups.filter((x) => (!faculty || x.faculty === faculty) && mine(x));
  const prefixes = [...new Set(ourGroups.map((g) => prefixOf(g.name)))].sort((a, b) => a.localeCompare(b, 'ro'));
  // each lecture taught to several groups: its subject's torent
  const subjectStreams = dataset.assignments
    .filter(
      (a) =>
        a.audience.kind === 'stream' &&
        index.cohorts(a.audience).some((c) => {
          const g = index.groups.get(c.groupId);
          return !!g && (!faculty || g.faculty === faculty) && mine(g);
        }),
    )
    .sort((a, b) => (index.subjects.get(a.subjectId)?.code ?? '').localeCompare(index.subjects.get(b.subjectId)?.code ?? ''));

  return (
    <div className="page">
      <PageHeader title={t('nav.groups')} subtitle={t('groups.subtitle')} actions={<CycleTabs value={cycle} onChange={setCycle} />} />
      <div className="stack">
        <CrudPage
          embedded
          collection="groups"
          title={t('groups.groups')}
          items={ourGroups.filter((x) => (!prefix || prefixOf(x.name) === prefix) && (!language || languageOf(x) === language))}
          filters={
            <>
              <Select className="select pill" value={prefix} onChange={(e) => setPrefix(e.target.value)} aria-label={t('groups.prefix')}>
                <option value="">{t('groups.allPrefixes')}</option>
                {prefixes.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </Select>
              <Select
                className="select pill"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label={t('language.label')}
              >
                <option value="">{t('language.all')}</option>
                {(['ro', 'ru', 'en', 'fr'] as const).map((l) => (
                  <option key={l} value={l}>
                    {t(`language.${l}`)}
                  </option>
                ))}
              </Select>
            </>
          }
          itemLabel={(x) => x.name}
          searchText={(x) => `${x.name} ${x.program} ${x.faculty ?? ''}`}
          columns={[
            {
              label: t('groups.name'),
              render: (x) => (
                <span>
                  <strong>{x.name}</strong>
                  <LanguageTag language={x.language} />
                  {x.cycle === 'master' && (
                    <span className="badge primary" style={{ marginLeft: 6 }}>
                      {t('cycle.master')}
                    </span>
                  )}
                </span>
              ),
            },
            { label: t('groups.program'), render: (x) => x.program },
            {
              label: t('groups.studyForm'),
              render: (x) => (
                <span className={`badge ${x.studyForm === 'full' ? '' : x.studyForm === 'reduced' ? 'warning' : 'primary'}`}>
                  {t(`form.${x.studyForm}`)}
                </span>
              ),
            },
            {
              label: t('groups.year'),
              render: (x) => (
                <span>
                  {x.year}
                  {x.programYears && <span className="small muted"> / {x.programYears}</span>}
                </span>
              ),
            },
            { label: t('groups.size'), render: (x) => x.size },
            {
              label: t('groups.subgroups'),
              render: (x) => (x.subgroups > 1 ? `${x.subgroups} × ${Math.ceil(x.size / x.subgroups)}` : '—'),
            },
          ]}
          newItem={(): Omit<Group, 'id'> => ({
            name: '',
            program: '',
            studyForm: 'full',
            language: 'ro',
            year: 1,
            // the cycle being shown (master's lasts 2 years)
            cycle,
            programYears: cycle === 'master' ? 2 : 4,
            size: 25,
            // not split by default: subgroups are only for small rooms (e.g. A01)
            subgroups: 1,
            // new groups go to the administrator's own faculty
            faculty: scope || dataset.settings.faculties[0],
          })}
          validate={(d) =>
            !d.name.trim()
              ? t('groups.nameRequired')
              : d.size < 1
                ? t('groups.sizeRequired')
                : d.programYears && d.year > d.programYears
                  ? t('groups.yearOver')
                  : // every group belongs to a faculty, whose administrator schedules it
                    dataset.settings.faculties.length && !d.faculty
                    ? t('groups.facultyRequired')
                    : null
          }
          renderForm={(d, set) => (
            <div className="form-grid">
              <Field label={t('groups.name')}>
                <input
                  className="input"
                  value={d.name}
                  onChange={(e) => set({ name: e.target.value.toUpperCase() })}
                  placeholder="FAF-251"
                  autoFocus
                />
              </Field>
              <Field label={t('groups.cycle')}>
                <Select
                  className="select"
                  value={d.cycle ?? 'licenta'}
                  onChange={(e) => {
                    // master's lasts 2 years, licență 4 by default
                    const cycle = e.target.value as StudyCycle;
                    const programYears = cycle === 'master' ? 2 : 4;
                    set({ cycle, programYears, year: Math.min(d.year, programYears) });
                  }}
                >
                  <option value="licenta">{t('cycle.licenta')}</option>
                  <option value="master">{t('cycle.master')}</option>
                </Select>
              </Field>
              <LanguageField value={d.language} onChange={(language) => set({ language })} label={t('language.label')} />
              <Field label={t('groups.studyForm')}>
                <Select
                  className="select"
                  value={d.studyForm}
                  onChange={(e) =>
                    set({
                      studyForm: e.target.value as StudyForm,
                      // frecvență redusă licență lasts 5 years
                      ...(d.cycle !== 'master' ? { programYears: e.target.value === 'reduced' ? 5 : 4 } : {}),
                    })
                  }
                >
                  {STUDY_FORMS.map((f) => (
                    <option key={f} value={f}>
                      {t(`form.${f}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('groups.program')}>
                <input className="input" value={d.program} onChange={(e) => set({ program: e.target.value })} />
              </Field>
              <Field label={t('groups.programYears')}>
                <Select
                  className="select"
                  value={d.programYears ?? 4}
                  onChange={(e) => {
                    const programYears = Number(e.target.value);
                    set({ programYears, year: Math.min(d.year, programYears) });
                  }}
                >
                  {(d.cycle === 'master' ? [1, 2] : [3, 4, 5, 6]).map((n) => (
                    <option key={n} value={n}>
                      {t('groups.yearsN', { n })}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('groups.year')}>
                <Select className="select" value={d.year} onChange={(e) => set({ year: Number(e.target.value) })}>
                  {Array.from({ length: d.programYears ?? 6 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('groups.size')}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={d.size}
                  onChange={(e) => set({ size: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label={t('groups.subgroups')} hint={t('groups.subgroupsHint')}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={4}
                  value={d.subgroups}
                  onChange={(e) => set({ subgroups: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Field>
            </div>
          )}
        />

        {/* torente are defined per subject: each lecture's groups (set in Sarcina didactică) */}
        <section className="card">
          <div className="card-header">
            <h2>{t('groups.streams')}</h2>
            <span className="spacer" />
            <span className="small muted">{subjectStreams.length}</span>
          </div>
          <p className="small muted" style={{ margin: 0, padding: '0 22px 8px' }}>
            {t('groups.streamsPerSubject')}
          </p>
          {subjectStreams.length === 0 ? (
            <Empty />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('assignments.subject')}</th>
                    <th>{t('assignments.teacher')}</th>
                    <th>{t('groups.groups')}</th>
                    <th>{t('groups.size')}</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectStreams.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{index.subjects.get(a.subjectId)?.code}</strong>{' '}
                        <span className="small muted">{index.subjects.get(a.subjectId)?.name}</span>
                      </td>
                      <td className="small">{index.teachers.get(a.teacherId)?.name}</td>
                      <td>
                        <div className="row wrap" style={{ gap: 4 }}>
                          {index.cohorts(a.audience).map((c) => (
                            <span key={c.groupId} className="badge">
                              {index.groups.get(c.groupId)?.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{index.audienceSize(a.audience)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
