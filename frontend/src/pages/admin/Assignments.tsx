import { useState } from 'react';
import { CrudPage } from '../../components/CrudPage';
import { TagInput } from '../../components/TagInput';
import { Field, Segmented } from '../../components/ui';
import type { ActivityType, Assignment, Audience, Parity, RoomType } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';

const TYPES: ActivityType[] = ['lecture', 'seminar', 'lab'];
const PARITIES: Parity[] = ['weekly', 'odd', 'even'];

export default function Assignments() {
  const { t } = useI18n();
  const { dataset, index } = useDataset();
  const [groupFilter, setGroupFilter] = useState('');

  const items = groupFilter ? dataset.assignments.filter((a) => index.audienceTouchesGroup(a.audience, groupFilter)) : dataset.assignments;
  const equipment = [...new Set(dataset.rooms.flatMap((r) => r.equipment))].sort();

  return (
    <CrudPage
      collection="assignments"
      title={t('nav.assignments')}
      subtitle={t('assignments.subtitle')}
      items={items}
      itemLabel={(x) => `${index.subjects.get(x.subjectId)?.code} ${t(`activity.${x.type}`)} · ${index.audienceLabel(x.audience)}`}
      searchText={(x) =>
        `${index.subjects.get(x.subjectId)?.code} ${index.subjects.get(x.subjectId)?.name} ${index.teachers.get(x.teacherId)?.name} ${index.audienceLabel(x.audience)}`
      }
      headerActions={
        <select
          className="select pill"
          style={{ width: 180 }}
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          aria-label={t('assignments.filterGroup')}
        >
          <option value="">{t('assignments.allGroups')}</option>
          {dataset.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      }
      wideForm
      columns={[
        {
          label: t('assignments.subject'),
          render: (x) => (
            <div>
              <strong>{index.subjects.get(x.subjectId)?.code}</strong>{' '}
              <span className="small muted">{index.subjects.get(x.subjectId)?.name}</span>
            </div>
          ),
        },
        { label: t('assignments.type'), render: (x) => <span className={`badge ${x.type}`}>{t(`activity.${x.type}`)}</span> },
        {
          label: t('assignments.teacher'),
          render: (x) => {
            const teacher = index.teachers.get(x.teacherId);
            return (
              <span>
                {teacher?.name}
                {teacher && !teacher.activityTypes.includes(x.type) && (
                  <span className="badge warning" style={{ marginLeft: 6 }}>
                    !
                  </span>
                )}
              </span>
            );
          },
        },
        {
          label: t('assignments.audience'),
          render: (x) => (
            <span>
              {index.audienceLabel(x.audience)} <span className="small muted">({index.audienceSize(x.audience)})</span>
            </span>
          ),
        },
        { label: t('assignments.pairs'), render: (x) => x.pairsPerWeek },
        {
          label: t('assignments.parity'),
          render: (x) => (x.parity === 'weekly' ? '—' : <span className="badge">{t(`parity.${x.parity}`)}</span>),
        },
      ]}
      newItem={(): Omit<Assignment, 'id'> => ({
        subjectId: dataset.subjects[0]?.id ?? '',
        type: 'lecture',
        teacherId: dataset.teachers[0]?.id ?? '',
        audience: dataset.streams[0] ? { kind: 'stream', id: dataset.streams[0].id } : { kind: 'group', id: dataset.groups[0]?.id ?? '' },
        pairsPerWeek: 1,
        parity: 'weekly',
        roomType: 'lecture',
        equipment: [],
      })}
      validate={(d) =>
        !d.subjectId || !d.teacherId || !d.audience.id ? t('assignments.required') : d.pairsPerWeek < 1 ? t('assignments.pairsMin') : null
      }
      renderForm={(d, set) => {
        const teacher = index.teachers.get(d.teacherId);
        const setAudience = (aud: Audience) => set({ audience: aud });
        const subgroupsOf = (id: string) => index.groups.get(id)?.subgroups ?? 1;
        return (
          <div className="stack">
            <div className="form-grid">
              <Field label={t('assignments.subject')}>
                <select className="select" value={d.subjectId} onChange={(e) => set({ subjectId: e.target.value })}>
                  {dataset.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('assignments.type')}>
                <select
                  className="select"
                  value={d.type}
                  onChange={(e) => {
                    const type = e.target.value as ActivityType;
                    set({
                      type,
                      roomType: type as RoomType,
                      equipment: type === 'lab' && !d.equipment.length ? ['calculatoare'] : d.equipment,
                    });
                  }}
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`activity.${type}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t('assignments.teacher')}
                hint={teacher && !teacher.activityTypes.includes(d.type) ? t('assignments.teacherTypeWarning') : undefined}
              >
                <select className="select" value={d.teacherId} onChange={(e) => set({ teacherId: e.target.value })}>
                  {[...dataset.teachers]
                    .sort(
                      (a, b) =>
                        Number(b.activityTypes.includes(d.type)) - Number(a.activityTypes.includes(d.type)) || a.name.localeCompare(b.name),
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.activityTypes.includes(d.type) ? '' : ' *'}
                      </option>
                    ))}
                </select>
              </Field>
            </div>

            <Field label={t('assignments.audience')}>
              <div className="row wrap">
                <Segmented
                  value={d.audience.kind}
                  onChange={(kind) =>
                    setAudience(
                      kind === 'stream'
                        ? { kind, id: dataset.streams[0]?.id ?? '' }
                        : kind === 'group'
                          ? { kind, id: dataset.groups[0]?.id ?? '' }
                          : { kind, id: dataset.groups[0]?.id ?? '', subgroup: 1 },
                    )
                  }
                  options={[
                    { value: 'stream', label: t('assignments.kind.stream') },
                    { value: 'group', label: t('assignments.kind.group') },
                    { value: 'subgroup', label: t('assignments.kind.subgroup') },
                  ]}
                />
                <select
                  className="select"
                  style={{ width: 180 }}
                  value={d.audience.id}
                  onChange={(e) => setAudience({ ...d.audience, id: e.target.value } as Audience)}
                >
                  {(d.audience.kind === 'stream' ? dataset.streams : dataset.groups).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                {d.audience.kind === 'subgroup' && (
                  <select
                    className="select"
                    style={{ width: 90 }}
                    value={d.audience.subgroup}
                    onChange={(e) => setAudience({ ...d.audience, subgroup: Number(e.target.value) } as Audience)}
                  >
                    {Array.from({ length: subgroupsOf(d.audience.id) }, (_, i) => (
                      <option key={i} value={i + 1}>
                        /{i + 1}
                      </option>
                    ))}
                  </select>
                )}
                <span className="small muted">
                  {index.audienceSize(d.audience)} {t('groups.size').toLowerCase()}
                </span>
              </div>
            </Field>

            <div className="form-grid">
              <Field label={t('assignments.pairs')}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={10}
                  value={d.pairsPerWeek}
                  onChange={(e) => set({ pairsPerWeek: Number(e.target.value) || 0 })}
                />
              </Field>
              {dataset.settings.weekParity && (
                <Field label={t('assignments.parity')}>
                  <select className="select" value={d.parity} onChange={(e) => set({ parity: e.target.value as Parity })}>
                    {PARITIES.map((p) => (
                      <option key={p} value={p}>
                        {t(`parity.${p}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={t('assignments.roomType')}>
                <select className="select" value={d.roomType} onChange={(e) => set({ roomType: e.target.value as RoomType })}>
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`roomType.${type}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t('assignments.equipment')}>
              <TagInput value={d.equipment} onChange={(eq) => set({ equipment: eq })} suggestions={equipment} />
            </Field>
          </div>
        );
      }}
    />
  );
}
