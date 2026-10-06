import { OtherFaculty, facultyView, useAdminScope } from '../../components/FacultyFilter';
import { CrudPage } from '../../components/CrudPage';
import { TagInput } from '../../components/TagInput';
import { Field } from '../../components/ui';
import type { Room, RoomType } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { Select } from '../../components/Select';

const TYPES: RoomType[] = ['lecture', 'seminar', 'lab'];

export default function Rooms() {
  const { t } = useI18n();
  const { dataset, index, published } = useDataset();
  const scope = useAdminScope();
  const view = facultyView(dataset, index, scope, published?.lessons);
  const knownEquipment = [
    ...new Set(dataset.rooms.flatMap((r) => r.equipment).concat(dataset.assignments.flatMap((a) => a.equipment))),
  ].sort();

  return (
    <CrudPage
      collection="rooms"
      wideForm
      title={t('nav.rooms')}
      subtitle={t('rooms.subtitle')}
      // our rooms + other faculties' rooms our classes use (those are read-only here)
      items={dataset.rooms.filter((x) => view.roomIds.has(x.id))}
      readOnly={(x) => !view.own(x.faculty)}
      itemLabel={(x) => x.name}
      searchText={(x) => `${x.name} ${x.building} ${x.equipment.join(' ')}`}
      columns={[
        {
          label: t('rooms.name'),
          render: (x) => (
            <span>
              <strong>{x.name}</strong>
              {!view.own(x.faculty) && <OtherFaculty faculty={x.faculty} />}
            </span>
          ),
        },
        { label: t('rooms.building'), render: (x) => x.building },
        { label: t('rooms.type'), render: (x) => <span className={`badge ${x.type}`}>{t(`roomType.${x.type}`)}</span> },
        { label: t('rooms.capacity'), render: (x) => x.capacity },
        { label: t('rooms.equipment'), render: (x) => <span className="small muted">{x.equipment.join(', ') || '—'}</span> },
        {
          label: t('rooms.preferredCount'),
          render: (x) => {
            const names = [
              ...(x.preferredSubjectIds ?? []).map((id) => dataset.subjects.find((s) => s.id === id)?.code),
              ...(x.preferredGroupIds ?? []).map((id) => dataset.groups.find((g) => g.id === id)?.name),
            ].filter(Boolean);
            return <span className="small muted">{names.join(', ') || '—'}</span>;
          },
        },
      ]}
      newItem={(): Omit<Room, 'id'> => ({
        name: '',
        building: '',
        faculty: scope || undefined,
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
            <Field label={t('rooms.building')}>
              <input className="input" value={d.building} onChange={(e) => set({ building: e.target.value })} />
            </Field>
            <Field label={t('rooms.type')}>
              <Select className="select" value={d.type} onChange={(e) => set({ type: e.target.value as RoomType })}>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`roomType.${type}`)}
                  </option>
                ))}
              </Select>
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
          <div>
            <h3>{t('rooms.preferred')}</h3>
            <p className="small muted" style={{ margin: '2px 0 10px' }}>
              {t('rooms.preferredHint')}
            </p>
            <Field label={t('rooms.preferredSubjects')}>
              <div className="checks">
                {dataset.subjects
                  .filter((sub) => !d.faculty || !sub.faculty || sub.faculty === d.faculty)
                  .map((sub) => {
                    const list = d.preferredSubjectIds ?? [];
                    return (
                      <label key={sub.id} className="check" title={sub.name}>
                        <input
                          type="checkbox"
                          checked={list.includes(sub.id)}
                          onChange={(e) =>
                            set({ preferredSubjectIds: e.target.checked ? [...list, sub.id] : list.filter((x) => x !== sub.id) })
                          }
                        />
                        {sub.code}
                      </label>
                    );
                  })}
              </div>
            </Field>
            <div style={{ height: 12 }} />
            <Field label={t('rooms.preferredGroups')}>
              <div className="checks">
                {dataset.groups
                  .filter((g) => !d.faculty || !g.faculty || g.faculty === d.faculty)
                  .map((g) => {
                    const list = d.preferredGroupIds ?? [];
                    return (
                      <label key={g.id} className="check">
                        <input
                          type="checkbox"
                          checked={list.includes(g.id)}
                          onChange={(e) => set({ preferredGroupIds: e.target.checked ? [...list, g.id] : list.filter((x) => x !== g.id) })}
                        />
                        {g.name}
                      </label>
                    );
                  })}
              </div>
            </Field>
          </div>
        </div>
      )}
    />
  );
}
