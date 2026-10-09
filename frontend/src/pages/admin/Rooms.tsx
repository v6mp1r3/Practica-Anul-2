import { OtherFaculty, facultyView, useAdminScope } from '../../components/FacultyFilter';
import { CrudPage } from '../../components/CrudPage';
import { GroupPicker } from '../../components/GroupPicker';
import { MultiSelect } from '../../components/MultiSelect';
import { useEquipment } from '../../components/useEquipment';
import { Field } from '../../components/ui';
import { useState } from 'react';
import { RangeSlider } from '../../components/RangeSlider';
import { Select } from '../../components/Select';
import { roomTypeOf } from '../../domain/equipment';
import { floorOf } from '../../domain/rooms';
import type { Room } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';

export default function Rooms() {
  const { t } = useI18n();
  const { dataset, index, published } = useDataset();
  const scope = useAdminScope();
  const view = facultyView(dataset, index, scope, published?.lessons);
  const equipment = useEquipment();

  // filters: block, floor, seats, equipment, "de dorit"
  const rooms = dataset.rooms.filter((x) => view.roomIds.has(x.id));
  const [block, setBlock] = useState('');
  const [floor, setFloor] = useState('');
  const [seats, setSeats] = useState<[number, number] | null>(null);
  const [needs, setNeeds] = useState('');
  const [pref, setPref] = useState('');
  const blocks = [...new Set(rooms.map((r) => r.building).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro', { numeric: true }));
  const floors = [...new Set(rooms.map((r) => floorOf(r.name)).filter((f) => f !== null))].sort((a, b) => a - b);
  const floorName = (f: number) => (f < 0 ? t('rooms.basement') : f === 0 ? t('rooms.ground') : t('rooms.floorN', { n: f }));
  const capacities = rooms.map((r) => r.capacity);
  const minSeats = capacities.length ? Math.min(...capacities) : 0;
  const maxSeats = capacities.length ? Math.max(...capacities) : 0;
  const [lo, hi] = seats ?? [minSeats, maxSeats];
  const prefOf = (r: Room) => [
    ...(r.preferredSubjectIds ?? []).map((id) => `s:${id}`),
    ...(r.preferredGroupIds ?? []).map((id) => `g:${id}`),
  ];
  const shown = rooms.filter(
    (r) =>
      (!block || r.building === block) &&
      (!floor || floorOf(r.name) === Number(floor)) &&
      r.capacity >= lo &&
      r.capacity <= hi &&
      (!needs || r.equipment.includes(needs)) &&
      (!pref || (pref === 'any' ? prefOf(r).length > 0 : pref === 'none' ? prefOf(r).length === 0 : prefOf(r).includes(pref))),
  );
  const filtering = !!(block || floor || seats || needs || pref);
  const usedSubjects = dataset.subjects.filter((s) => rooms.some((r) => r.preferredSubjectIds?.includes(s.id)));
  const usedGroups = dataset.groups.filter((g) => rooms.some((r) => r.preferredGroupIds?.includes(g.id)));

  return (
    <CrudPage
      collection="rooms"
      wideForm
      title={t('nav.rooms')}
      subtitle={t('rooms.subtitle')}
      // our rooms + other faculties' rooms our classes use (those are read-only here)
      items={shown}
      filters={
        <>
          <Select className="select pill" value={block} onChange={(e) => setBlock(e.target.value)} aria-label={t('rooms.building')}>
            <option value="">{t('rooms.allBlocks')}</option>
            {blocks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
          <Select className="select pill" value={floor} onChange={(e) => setFloor(e.target.value)} aria-label={t('rooms.floor')}>
            <option value="">{t('rooms.allFloors')}</option>
            {floors.map((f) => (
              <option key={f} value={f}>
                {floorName(f)}
              </option>
            ))}
          </Select>
          {maxSeats > minSeats && (
            <RangeSlider min={minSeats} max={maxSeats} value={[lo, hi]} onChange={setSeats} label={t('rooms.capacity')} />
          )}
          <Select className="select pill" value={needs} onChange={(e) => setNeeds(e.target.value)} aria-label={t('rooms.equipment')}>
            <option value="">{t('rooms.anyEquipment')}</option>
            {equipment.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select className="select pill" value={pref} onChange={(e) => setPref(e.target.value)} aria-label={t('rooms.preferredCount')}>
            <option value="">{t('rooms.anyPreferred')}</option>
            <option value="any">{t('rooms.withPreferred')}</option>
            <option value="none">{t('rooms.noPreferred')}</option>
            {usedSubjects.length > 0 && (
              <optgroup label={t('rooms.preferredSubjects')}>
                {usedSubjects.map((s) => (
                  <option key={s.id} value={`s:${s.id}`}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            {usedGroups.length > 0 && (
              <optgroup label={t('rooms.preferredGroups')}>
                {usedGroups.map((g) => (
                  <option key={g.id} value={`g:${g.id}`}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
          {filtering && (
            <button
              className="btn ghost sm"
              onClick={() => {
                setBlock('');
                setFloor('');
                setSeats(null);
                setNeeds('');
                setPref('');
              }}
            >
              {t('filters.reset')}
            </button>
          )}
        </>
      }
      readOnly={(x) => !view.own(x.faculty)}
      itemLabel={(x) => x.name}
      searchText={(x) => `${x.name} ${x.building} ${equipment.list(x.equipment)}`}
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
        { label: t('rooms.capacity'), render: (x) => x.capacity },
        { label: t('rooms.equipment'), render: (x) => <span className="small muted">{equipment.list(x.equipment) || '—'}</span> },
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
            <Field label={t('rooms.capacity')}>
              <input
                className="input"
                type="number"
                min={1}
                value={d.capacity}
                onChange={(e) => {
                  const capacity = Number(e.target.value) || 0;
                  // no type to pick: any room fits a lecture or a seminar if it is big enough
                  set({ capacity, type: roomTypeOf({ capacity, equipment: d.equipment }) });
                }}
              />
            </Field>
          </div>
          <Field label={t('rooms.equipment')} hint={t('rooms.equipmentHint')}>
            <MultiSelect
              value={d.equipment}
              onChange={(eq) => set({ equipment: eq, type: roomTypeOf({ capacity: d.capacity, equipment: eq }) })}
              options={equipment.options}
              placeholder={t('equipment.placeholder')}
              aria-label={t('rooms.equipment')}
            />
          </Field>
          <div>
            <h3>{t('rooms.preferred')}</h3>
            <p className="small muted" style={{ margin: '2px 0 10px' }}>
              {t('rooms.preferredHint')}
            </p>
            <Field label={t('rooms.preferredSubjects')} hint={t('rooms.preferredSubjectsHint')}>
              <MultiSelect
                value={d.preferredSubjectIds ?? []}
                onChange={(ids) => set({ preferredSubjectIds: ids })}
                options={dataset.subjects
                  .filter((sub) => !d.faculty || !sub.faculty || sub.faculty === d.faculty)
                  .map((sub) => ({ value: sub.id, label: `${sub.code} — ${sub.name}`, short: sub.code }))}
                placeholder={t('rooms.pickSubjects')}
                aria-label={t('rooms.preferredSubjects')}
              />
            </Field>
            <div style={{ height: 12 }} />
            <Field label={t('rooms.preferredGroups')}>
              <GroupPicker
                groups={dataset.groups.filter((g) => !d.faculty || !g.faculty || g.faculty === d.faculty)}
                value={d.preferredGroupIds ?? []}
                onChange={(ids) => set({ preferredGroupIds: ids })}
              />
            </Field>
          </div>
        </div>
      )}
    />
  );
}
