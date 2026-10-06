import { FacultySelect, inFaculty, useAdminScope, useFacultyFilter } from '../../components/FacultyFilter';
import { CrudPage } from '../../components/CrudPage';
import { Field, PageHeader } from '../../components/ui';
import { STUDY_FORMS, type Group, type Stream, type StudyForm } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { Select } from '../../components/Select';

export default function Groups() {
  const { t } = useI18n();
  const { dataset, index } = useDataset();
  const scope = useAdminScope();
  const [faculty, setFaculty, locked] = useFacultyFilter(dataset);

  return (
    <div className="page">
      <PageHeader
        title={t('nav.groups')}
        subtitle={t('groups.subtitle')}
        actions={<FacultySelect dataset={dataset} value={faculty} onChange={setFaculty} locked={locked} />}
      />
      <div className="stack">
        <CrudPage
          embedded
          collection="groups"
          title={t('groups.groups')}
          items={dataset.groups.filter((x) => inFaculty(faculty, x.faculty))}
          itemLabel={(x) => x.name}
          searchText={(x) => `${x.name} ${x.program} ${x.faculty ?? ''}`}
          columns={[
            { label: t('groups.name'), render: (x) => <strong>{x.name}</strong> },
            { label: t('groups.program'), render: (x) => x.program },
            {
              label: t('groups.studyForm'),
              render: (x) => (
                <span className={`badge ${x.studyForm === 'full' ? '' : x.studyForm === 'reduced' ? 'warning' : 'primary'}`}>
                  {t(`form.${x.studyForm}`)}
                </span>
              ),
            },
            { label: t('groups.faculty'), render: (x) => <span className="small muted">{x.faculty || '—'}</span> },
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
            year: 1,
            programYears: 4,
            size: 25,
            subgroups: 2,
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
              <Field label={t('groups.studyForm')}>
                <Select className="select" value={d.studyForm} onChange={(e) => set({ studyForm: e.target.value as StudyForm })}>
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
              <Field label={t('groups.faculty')}>
                <Select className="select" value={d.faculty ?? ''} onChange={(e) => set({ faculty: e.target.value || undefined })}>
                  {!dataset.settings.faculties.length && <option value="">—</option>}
                  {dataset.settings.faculties.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
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
                  {[3, 4, 5, 6].map((n) => (
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

        <CrudPage
          embedded
          collection="streams"
          title={t('groups.streams')}
          items={dataset.streams.filter((x) => !faculty || x.groupIds.some((g) => index.groups.get(g)?.faculty === faculty))}
          itemLabel={(x) => x.name}
          searchText={(x) => `${x.name} ${x.groupIds.map((g) => index.groups.get(g)?.name).join(' ')}`}
          columns={[
            { label: t('groups.name'), render: (x) => <strong>{x.name}</strong> },
            {
              label: t('groups.groups'),
              render: (x) => (
                <div className="row wrap" style={{ gap: 4 }}>
                  {x.groupIds.map((g) => (
                    <span key={g} className="badge">
                      {index.groups.get(g)?.name}
                    </span>
                  ))}
                </div>
              ),
            },
            { label: t('groups.size'), render: (x) => index.audienceSize({ kind: 'stream', id: x.id }) },
          ]}
          newItem={(): Omit<Stream, 'id'> => ({ name: '', groupIds: [] })}
          validate={(d) => (!d.name.trim() ? t('groups.nameRequired') : d.groupIds.length < 2 ? t('groups.streamMin') : null)}
          renderForm={(d, set) => (
            <div className="stack">
              <Field label={t('groups.name')}>
                <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="FAF-25" autoFocus />
              </Field>
              <Field label={t('groups.groups')} hint={t('groups.streamHint')}>
                <div className="checks">
                  {dataset.groups.map((g) => (
                    <label key={g.id} className="check">
                      <input
                        type="checkbox"
                        checked={d.groupIds.includes(g.id)}
                        onChange={(e) => set({ groupIds: e.target.checked ? [...d.groupIds, g.id] : d.groupIds.filter((x) => x !== g.id) })}
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          )}
        />
      </div>
    </div>
  );
}
