import { FacultySelect, inFaculty, useFacultyFilter } from '../../components/FacultyFilter';
import { CrudPage } from '../../components/CrudPage';
import { TagInput } from '../../components/TagInput';
import { Field } from '../../components/ui';
import type { Room, RoomType } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';

const TYPES: RoomType[] = ['lecture', 'seminar', 'lab'];

export default function Rooms() {
  const { t } = useI18n();
  const { dataset } = useDataset();
  const [faculty, setFaculty] = useFacultyFilter(dataset);
  const knownEquipment = [
    ...new Set(dataset.rooms.flatMap((r) => r.equipment).concat(dataset.assignments.flatMap((a) => a.equipment))),
  ].sort();

  return (
    <CrudPage
      collection="rooms"
      title={t('nav.rooms')}
      subtitle={t('rooms.subtitle')}
      items={dataset.rooms.filter((x) => inFaculty(faculty, x.faculty))}
      headerActions={<FacultySelect dataset={dataset} value={faculty} onChange={setFaculty} />}
      itemLabel={(x) => x.name}
      searchText={(x) => `${x.name} ${x.building} ${x.equipment.join(' ')}`}
      columns={[
        { label: t('rooms.name'), render: (x) => <strong>{x.name}</strong> },
        { label: t('rooms.building'), render: (x) => x.building },
        { label: t('rooms.type'), render: (x) => <span className={`badge ${x.type}`}>{t(`roomType.${x.type}`)}</span> },
        { label: t('rooms.capacity'), render: (x) => x.capacity },
        { label: t('rooms.equipment'), render: (x) => <span className="small muted">{x.equipment.join(', ') || '—'}</span> },
      ]}
      newItem={(): Omit<Room, 'id'> => ({
        name: '',
        building: '',
        faculty: faculty || undefined,
        capacity: 30,
        type: 'seminar',
        equipment: [],
      })}
      validate={(d) => (!d.name.trim() ? t('rooms.nameRequired') : d.capacity < 1 ? t('rooms.capacityRequired') : null)}
      renderForm={(d, set) => (
        <div className="stack">
          <div className="form-grid">
            <Field label={t('rooms.name')}>
              <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="3-114" autoFocus />
            </Field>
            <Field label={t('groups.faculty')}>
              <select className="select" value={d.faculty ?? ''} onChange={(e) => set({ faculty: e.target.value || undefined })}>
                <option value="">—</option>
                {dataset.settings.faculties.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('rooms.building')}>
              <input className="input" value={d.building} onChange={(e) => set({ building: e.target.value })} />
            </Field>
            <Field label={t('rooms.type')}>
              <select className="select" value={d.type} onChange={(e) => set({ type: e.target.value as RoomType })}>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`roomType.${type}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('rooms.capacity')}>
              <input
                className="input"
                type="number"
                min={1}
                value={d.capacity}
                onChange={(e) => set({ capacity: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
          <Field label={t('rooms.equipment')} hint={t('rooms.equipmentHint')}>
            <TagInput value={d.equipment} onChange={(equipment) => set({ equipment })} suggestions={knownEquipment} />
          </Field>
        </div>
      )}
    />
  );
}
