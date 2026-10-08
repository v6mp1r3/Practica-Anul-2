import { OtherFaculty, facultyView, useAdminScope } from '../../components/FacultyFilter';
import { AvailabilityPicker } from '../../components/AvailabilityPicker';
import { ExamAvailabilityPicker } from '../../components/ExamAvailabilityPicker';
import { CrudPage } from '../../components/CrudPage';
import { useState } from 'react';
import { Select } from '../../components/Select';
import { Field } from '../../components/ui';
import { parityWeight } from '../../domain/slots';
import type { ActivityType, Teacher } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';

const TYPES: ActivityType[] = ['lecture', 'seminar', 'lab', 'project'];

export default function Teachers() {
  const { t } = useI18n();
  const { dataset, index, published } = useDataset();
  const scope = useAdminScope();
  const view = facultyView(dataset, index, scope, published?.lessons);

  // sort A→Z / Z→A, filter by grad didactic, department and activity types
  const teachers = dataset.teachers.filter((x) => view.teacherIds.has(x.id));
  const [order, setOrder] = useState<'az' | 'za'>('az');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [activity, setActivity] = useState('');
  const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro'));
  const titles = distinct(teachers.map((x) => x.title));
  const departments = distinct(teachers.map((x) => x.department));
  const shown = teachers
    .filter(
      (x) =>
        (!title || x.title === title) &&
        (!department || x.department === department) &&
        (!activity || x.activityTypes.includes(activity as ActivityType)),
    )
    .sort((a, b) => (order === 'az' ? 1 : -1) * a.name.localeCompare(b.name, 'ro'));
  const filtering = !!(title || department || activity);

  const plannedLoad = (id: string) =>
    dataset.assignments.filter((a) => a.teacherId === id).reduce((n, a) => n + a.pairsPerWeek * parityWeight(a.parity), 0);

  return (
    <CrudPage
      collection="teachers"
      title={t('nav.teachers')}
      subtitle={t('teachers.subtitle')}
      // our teachers + other faculties' teachers who teach our groups (those are read-only here)
      items={shown}
      filters={
        <>
          <Select
            className="select pill"
            value={order}
            onChange={(e) => setOrder(e.target.value as 'az' | 'za')}
            aria-label={t('filters.sort')}
          >
            <option value="az">{t('filters.az')}</option>
            <option value="za">{t('filters.za')}</option>
          </Select>
          <Select className="select pill" value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t('teachers.title')}>
            <option value="">{t('teachers.allTitles')}</option>
            {titles.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
          <Select
            className="select pill"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-label={t('teachers.department')}
          >
            <option value="">{t('teachers.allDepartments')}</option>
            {departments.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
          <Select className="select pill" value={activity} onChange={(e) => setActivity(e.target.value)} aria-label={t('teachers.types')}>
            <option value="">{t('teachers.allTypes')}</option>
            {TYPES.map((a) => (
              <option key={a} value={a}>
                {t(`activity.${a}`)}
              </option>
            ))}
          </Select>
          {filtering && (
            <button
              className="btn ghost sm"
              onClick={() => {
                setTitle('');
                setDepartment('');
                setActivity('');
              }}
            >
              {t('filters.reset')}
            </button>
          )}
        </>
      }
      readOnly={(x) => !view.own(x.faculty)}
      itemLabel={(x) => x.name}
      searchText={(x) => `${x.name} ${x.department} ${x.email}`}
      wideForm
      columns={[
        {
          label: t('common.name'),
          render: (x) => (
            <div>
              <strong>{x.name}</strong>
              {!view.own(x.faculty) && <OtherFaculty faculty={x.faculty} />}
              <div className="small muted">{x.title}</div>
            </div>
          ),
        },
        { label: t('teachers.department'), render: (x) => x.department },
        {
          label: t('teachers.types'),
          render: (x) => (
            <div className="row wrap" style={{ gap: 4 }}>
              {x.activityTypes.map((a) => (
                <span key={a} className={`badge ${a}`}>
                  {t(`activity.${a}`)}
                </span>
              ))}
            </div>
          ),
        },
        {
          label: t('teachers.load'),
          render: (x) => {
            const load = plannedLoad(x.id);
            return (
              <span className={`badge ${load > x.maxPairsPerWeek ? 'danger' : ''}`}>
                {load} / {x.maxPairsPerWeek}
              </span>
            );
          },
        },
        { label: t('teachers.unavailable'), render: (x) => (x.unavailable.length ? x.unavailable.length : '—') },
        { label: t('examAvail.column'), render: (x) => (x.examUnavailable?.length ? x.examUnavailable.length : '—') },
      ]}
      newItem={(): Omit<Teacher, 'id'> => ({
        name: '',
        title: 'lect. univ.',
        department: '',
        faculty: scope || undefined,
        email: '',
        maxPairsPerWeek: 12,
        activityTypes: ['lecture', 'seminar'],
        unavailable: [],
        preferred: [],
      })}
      validate={(d) => (!d.name.trim() ? t('teachers.nameRequired') : d.activityTypes.length === 0 ? t('teachers.typeRequired') : null)}
      renderForm={(d, set) => (
        <div className="stack">
          <div className="form-grid">
            <Field label={t('common.name')}>
              <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
            </Field>
            <Field label={t('teachers.title')}>
              <input className="input" value={d.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label={t('teachers.department')}>
              <input className="input" value={d.department} onChange={(e) => set({ department: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label={t('teachers.maxPairs')} hint={t('teachers.maxPairsHint')}>
              <input
                className="input"
                type="number"
                min={0.5}
                step={0.5} // a pair held every other week counts half
                value={d.maxPairsPerWeek}
                onChange={(e) => set({ maxPairsPerWeek: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
          <Field label={t('teachers.types')}>
            <div className="checks">
              {TYPES.map((type) => (
                <label key={type} className="check">
                  <input
                    type="checkbox"
                    checked={d.activityTypes.includes(type)}
                    onChange={(e) =>
                      set({ activityTypes: e.target.checked ? [...d.activityTypes, type] : d.activityTypes.filter((x) => x !== type) })
                    }
                  />
                  {t(`activity.${type}`)}
                </label>
              ))}
            </div>
          </Field>
          <div>
            <h3 style={{ marginBottom: 4 }}>{t('nav.availability')}</h3>
            <p className="small muted" style={{ marginBottom: 8 }}>
              {t('teachers.availabilityHint')}
            </p>
            <AvailabilityPicker
              settings={dataset.settings}
              index={index}
              value={{ unavailable: d.unavailable, preferred: d.preferred, consultation: d.consultation }}
              onChange={(v) => set(v)}
            />
          </div>
          {/* separate: the exam period has no classes, so the weekly availability doesn't apply */}
          <div>
            <h3 style={{ marginBottom: 4 }}>{t('examAvail.title')}</h3>
            <p className="small muted" style={{ marginBottom: 8 }}>
              {t('examAvail.hint')}
            </p>
            <ExamAvailabilityPicker dataset={dataset} value={d.examUnavailable ?? []} onChange={(v) => set({ examUnavailable: v })} />
          </div>
        </div>
      )}
    />
  );
}
