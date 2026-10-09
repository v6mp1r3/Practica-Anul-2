import { CycleTabs, groupInCycle, useCycle } from '../../components/CycleTabs';
import { useAdminScope } from '../../components/FacultyFilter';
import { ClusterManager, useClusterLabel } from '../../components/ClusterPicker';
import { CrudPage } from '../../components/CrudPage';
import { Empty, Field, PageHeader } from '../../components/ui';
import { STUDY_FORMS, type Group, type StudyCycle, type StudyForm } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { Select } from '../../components/Select';
import { LanguageField, LanguageTag, languageOf } from '../../components/Language';
import { useState } from 'react';
import { specialtyOf as prefixOf } from '../../domain/specialty';

const SHOWN_GROUPS = 8;

export default function Groups() {
  const { t } = useI18n();
  const { dataset } = useDataset();
  const scope = useAdminScope();
  const faculty = scope;
  // licență | master's
  const [cycle, setCycle] = useCycle();
  const mine = (g: { cycle?: StudyCycle }) => groupInCycle(g, cycle);
  const [language, setLanguage] = useState('');
  // the specialty prefix of a group's name: TI-251 → TI, FAF-232 → FAF
  const [prefix, setPrefix] = useState('');
  // frecvență | frecvență redusă | dual
  const [form, setForm] = useState<'' | StudyForm>('');
  const ourGroups = dataset.groups.filter((x) => (!faculty || x.faculty === faculty) && mine(x));
  const prefixes = [...new Set(ourGroups.map((g) => prefixOf(g.name)))].sort((a, b) => a.localeCompare(b, 'ro'));
  // the clusters (year, speciality, language, form of study, own) with the groups of this faculty and cycle in them
  const { clusters: all = [] } = dataset;
  const clusterLabel = useClusterLabel();
  const [managing, setManaging] = useState(false);
  // clusters whose groups are all shown
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const visible = new Set(ourGroups.map((g) => g.id));
  const clusters = all
    .map((c) => ({ c, groups: c.groupIds.filter((id) => visible.has(id)) }))
    .filter(({ c, groups }) => groups.length > 0 || c.kind === 'custom');
  const groupName = (id: string) => dataset.groups.find((g) => g.id === id)?.name ?? id;

  return (
    <div className="page">
      <PageHeader title={t('nav.groups')} subtitle={t('groups.subtitle')} actions={<CycleTabs value={cycle} onChange={setCycle} />} />
      <div className="stack">
        <CrudPage
          embedded
          collection="groups"
          title={t('groups.groups')}
          items={ourGroups.filter(
            (x) => (!prefix || prefixOf(x.name) === prefix) && (!language || languageOf(x) === language) && (!form || x.studyForm === form),
          )}
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
            // never set by hand: a class splits the group by itself when no suitable room is big enough (Sarcina didactică)
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
            </div>
          )}
        />

        {/* clusters follow the groups; the own ones are made here */}
        <section className="card">
          <div className="card-header">
            <h2>{t('clusters.title')}</h2>
            <span className="spacer" />
            <span className="small muted">{clusters.length}</span>
            <button className="btn" onClick={() => setManaging(true)}>
              {t('clusters.manage')}
            </button>
          </div>
          <p className="small muted" style={{ margin: 0, padding: '0 22px 8px' }}>
            {t('clusters.hint')}
          </p>
          {clusters.length === 0 ? (
            <Empty />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('clusters.title')}</th>
                    <th>{t('clusters.type')}</th>
                    <th>{t('groups.groups')}</th>
                    <th>{t('groups.size')}</th>
                  </tr>
                </thead>
                <tbody>
                  {clusters.map(({ c, groups }) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{clusterLabel(c)}</strong>
                      </td>
                      <td className="small">{t(`clusters.kind.${c.kind}`)}</td>
                      <td>
                        {/* a few groups, the rest behind "+N" (a whole year is dozens) */}
                        <div className="row wrap" style={{ gap: 4 }}>
                          {(expanded.has(c.id) ? groups : groups.slice(0, SHOWN_GROUPS)).map((id) => (
                            <span key={id} className="badge">
                              {groupName(id)}
                            </span>
                          ))}
                          {groups.length > SHOWN_GROUPS && (
                            <button type="button" className="btn ghost sm more-groups" onClick={() => toggleExpanded(c.id)}>
                              {expanded.has(c.id) ? t('clusters.less') : `+${groups.length - SHOWN_GROUPS}`}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{groups.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {managing && <ClusterManager dataset={dataset} onClose={() => setManaging(false)} />}
      </div>
    </div>
  );
}
