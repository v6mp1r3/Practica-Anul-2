import { CycleTabs, audienceInCycle, groupInCycle, useCycle } from '../../components/CycleTabs';
import { facultyGroupIds, useAdminScope } from '../../components/FacultyFilter';
import { useMemo, useState } from 'react';
import { api } from '../../api';
import { CrudPage } from '../../components/CrudPage';
import { needsSplit } from '../../domain/rooms';
import { GroupPicker } from '../../components/GroupPicker';
import { useClusterLabel } from '../../components/ClusterPicker';
import { deriveClusters, groupsForSubject } from '../../domain/clusters';
import { MultiSelect } from '../../components/MultiSelect';
import { useEquipment } from '../../components/useEquipment';
import { Field } from '../../components/ui';
import type { ActivityType, Assignment, Audience, RoomType } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { Select } from '../../components/Select';

const TYPES: ActivityType[] = ['lecture', 'seminar', 'lab', 'project'];

export default function Assignments() {
  const { t } = useI18n();
  const { dataset, index } = useDataset();
  const [groupFilter, setGroupFilter] = useState('');

  // Faculty administrators see only the teaching load of their faculty's groups
  const scope = useAdminScope();
  const scopeGroups = facultyGroupIds(dataset, scope);
  // licență | master's
  const [cycle, setCycle] = useCycle();
  const visibleGroups = dataset.groups.filter((g) => scopeGroups.includes(g.id) && groupInCycle(g, cycle));
  // the form offers this cycle's subjects, groups and streams
  const cycleSubjects = dataset.subjects.filter((x) => (x.cycle ?? 'licenta') === cycle);
  // a code used by several study plans (MD for FAF in year 1, for SI in year 2): the list names the plan
  const sharedCodes = new Set(cycleSubjects.filter((x, i) => cycleSubjects.findIndex((y) => y.code === x.code) !== i).map((x) => x.code));
  const planOf = (x: (typeof cycleSubjects)[number]) => `${t('groups.year')} ${x.year}`;
  // the groups offered for a subject follow its tags: "Year 1" is not for a group of year 2
  const clusters = useMemo(() => dataset.clusters ?? deriveClusters(dataset.groups), [dataset]);
  const clusterLabel = useClusterLabel();
  const groupsFor = (subjectId: string) => {
    const subject = index.subjects.get(subjectId);
    return subject ? groupsForSubject(subject, visibleGroups, clusters) : visibleGroups;
  };
  const inScope = dataset.assignments.filter(
    (a) => (!scope || scopeGroups.some((g) => index.audienceTouchesGroup(a.audience, g))) && audienceInCycle(index, a.audience, cycle),
  );
  const items = groupFilter ? inScope.filter((a) => index.audienceTouchesGroup(a.audience, groupFilter)) : inScope;
  const equipment = useEquipment();

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
        <>
          <CycleTabs value={cycle} onChange={setCycle} />
          <Select
            className="select pill"
            style={{ width: 180 }}
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            aria-label={t('assignments.filterGroup')}
          >
            <option value="">{t('assignments.allGroups')}</option>
            {visibleGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </>
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
        {
          label: t('assignments.pairs'),
          render: (x) =>
            index.isReduced(x) ? (
              <span>
                {x.pairsPerSession ?? x.pairsPerWeek} <span className="small muted">{t('assignments.perSession')}</span>
              </span>
            ) : (
              x.pairsPerWeek
            ),
        },
      ]}
      newItem={(): Omit<Assignment, 'id'> => ({
        subjectId: cycleSubjects[0]?.id ?? '',
        type: 'lecture',
        teacherId: dataset.teachers[0]?.id ?? '',
        audience: { kind: 'group', id: '' },
        pairsPerWeek: 1,
        roomType: 'lecture',
        equipment: [],
      })}
      // a group that fits in none of the rooms its class can use is split in two: one pair per subgroup
      onSave={async ({ id, ...d }) => {
        const split = needsSplit(index, dataset.rooms, d);
        if (!split || d.audience.kind !== 'group') {
          await (id ? api.update('assignments', { ...d, id }) : api.create('assignments', d));
          return;
        }
        const group = index.groups.get(d.audience.id)!;
        if (group.subgroups < 2) await api.update('groups', { ...group, subgroups: 2 });
        const half = (n: number): Omit<Assignment, 'id'> => ({ ...d, audience: { kind: 'subgroup', id: group.id, subgroup: n } });
        await (id ? api.update('assignments', { ...half(1), id }) : api.create('assignments', half(1)));
        await api.create('assignments', half(2));
      }}
      validate={(d) =>
        !d.subjectId ||
        !d.teacherId ||
        (d.audience.kind === 'stream' ? !d.audience.id && (d.audience.groupIds?.length ?? 0) < 2 : !d.audience.id)
          ? d.audience.kind === 'stream'
            ? t('assignments.streamMin')
            : t('assignments.required')
          : (index.isReduced(d) ? (d.pairsPerSession ?? d.pairsPerWeek) : d.pairsPerWeek) < 1
            ? t('assignments.pairsMin')
            : null
      }
      renderForm={(d, set) => {
        const teacher = index.teachers.get(d.teacherId);
        // the groups this subject can be given to, from its tags
        const formGroups = groupsFor(d.subjectId);
        const split = needsSplit(index, dataset.rooms, d);
        const setAudience = (aud: Audience) => set({ audience: aud });
        const subgroupsOf = (id: string) => index.groups.get(id)?.subgroups ?? 1;
        // no torent to define: the groups chosen here have the class together; one group is just that group
        const chosen = d.audience.kind === 'subgroup' ? [] : index.cohorts(d.audience).map((c) => c.groupId);
        const audienceOf = (ids: string[]): Audience =>
          ids.length >= 2 ? { kind: 'stream', id: '', groupIds: ids } : { kind: 'group', id: ids[0] ?? '' };
        const subjectTags = (index.subjects.get(d.subjectId)?.clusterIds ?? [])
          .map((id) => clusters.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c);
        // reduced attendance is counted per session, not per week (no odd/even weeks either)
        const reduced = index.isReduced(d);
        return (
          <div className="stack">
            <div className="form-grid">
              <Field label={t('assignments.subject')}>
                <Select
                  className="select"
                  value={d.subjectId}
                  onChange={(e) => {
                    // the groups chosen so far that the new subject is not for are dropped
                    const offered = groupsFor(e.target.value);
                    const kept = chosen.filter((id) => offered.some((g) => g.id === id));
                    set({ subjectId: e.target.value, ...(d.audience.kind === 'subgroup' ? {} : { audience: audienceOf(kept) }) });
                  }}
                >
                  {cycleSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                      {sharedCodes.has(s.code) ? ` · ${planOf(s)}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('assignments.type')}>
                <Select
                  className="select"
                  value={d.type}
                  onChange={(e) => {
                    const type = e.target.value as ActivityType;
                    set({
                      type,
                      // rooms have no fixed type: only a lab needs a laboratory, any other class an ordinary room
                      roomType: (type === 'project' ? 'seminar' : type) as RoomType,
                      equipment: type === 'lab' && !d.equipment.length ? ['calculatoare'] : d.equipment,
                    });
                  }}
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`activity.${type}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('assignments.teacher')}
                hint={teacher && !teacher.activityTypes.includes(d.type) ? t('assignments.teacherTypeWarning') : undefined}
              >
                <Select className="select" value={d.teacherId} onChange={(e) => set({ teacherId: e.target.value })}>
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
                </Select>
              </Field>
            </div>

            <Field label={t('assignments.audience')} hint={t('assignments.groupsHint')}>
              {subjectTags.length > 0 && (
                <p className="small muted" style={{ margin: '0 0 8px' }}>
                  {t('assignments.groupsLimited', { tags: subjectTags.map(clusterLabel).join(', ') })}
                </p>
              )}
              {d.audience.kind === 'subgroup' ? (
                // a class already split in subgroups keeps its group and subgroup
                <div className="row wrap">
                  <Select
                    className="select"
                    style={{ width: 180 }}
                    value={d.audience.id}
                    onChange={(e) => setAudience({ ...d.audience, id: e.target.value } as Audience)}
                  >
                    {formGroups.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                  <Select
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
                  </Select>
                </div>
              ) : (
                <GroupPicker groups={formGroups} value={chosen} onChange={(ids) => setAudience(audienceOf(ids))} />
              )}
              {split && (
                <p className="small" style={{ margin: '8px 0 0', color: 'var(--warning)' }}>
                  {t('assignments.autoSplit', { size: split.size, largest: split.largest })}
                </p>
              )}
            </Field>

            <div className="form-grid">
              {reduced ? (
                <Field label={t('assignments.pairsSession')} hint={t('assignments.pairsSessionHint')}>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={30}
                    value={d.pairsPerSession ?? d.pairsPerWeek}
                    onChange={(e) => set({ pairsPerSession: Number(e.target.value) || 0 })}
                  />
                </Field>
              ) : (
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
              )}
            </div>
            <Field label={t('assignments.equipment')} hint={t('assignments.equipmentHint')}>
              <MultiSelect
                value={d.equipment}
                onChange={(eq) => set({ equipment: eq })}
                options={equipment.options}
                placeholder={t('equipment.placeholder')}
                aria-label={t('assignments.equipment')}
              />
            </Field>
          </div>
        );
      }}
    />
  );
}
