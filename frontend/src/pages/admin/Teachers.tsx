import { AvailabilityPicker } from '../../components/AvailabilityPicker';
import { CrudPage } from '../../components/CrudPage';
import { Field } from '../../components/ui';
import { parityWeight } from '../../domain/slots';
import type { ActivityType, Teacher } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';

const TYPES: ActivityType[] = ['lecture', 'seminar', 'lab'];

export default function Teachers() {
  const { t } = useI18n();
  const { dataset, index } = useDataset();

  const plannedLoad = (id: string) =>
    dataset.assignments.filter((a) => a.teacherId === id).reduce((n, a) => n + a.pairsPerWeek * parityWeight(a.parity), 0);

  return (
    <CrudPage
      collection="teachers"
      title={t('nav.teachers')}
      subtitle={t('teachers.subtitle')}
      items={dataset.teachers}
      itemLabel={(x) => x.name}
      searchText={(x) => `${x.name} ${x.department} ${x.email}`}
      wideForm
      columns={[
        {
          label: t('common.name'),
          render: (x) => (
            <div>
              <strong>{x.name}</strong>
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
      ]}
      newItem={(): Omit<Teacher, 'id'> => ({
        name: '',
        title: 'lect. univ.',
        department: '',
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
              <input className="input" type="number" min={1} value={d.maxPairsPerWeek} onChange={(e) => set({ maxPairsPerWeek: Number(e.target.value) || 0 })} />
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
        </div>
      )}
    />
  );
}
