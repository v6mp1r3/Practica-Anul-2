import { CycleTabs, audienceInCycle, groupInCycle, useCycle } from '../../components/CycleTabs';
import { facultyGroupIds, useAdminScope } from '../../components/FacultyFilter';
import { useState } from 'react';
import { CrudPage } from '../../components/CrudPage';
import { TagInput } from '../../components/TagInput';
import { Field, Segmented } from '../../components/ui';
import type { ActivityType, Assignment, Audience, Parity, RoomType } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { Select } from '../../components/Select';

const TYPES: ActivityType[] = ['lecture', 'seminar', 'lab', 'project'];
const PARITIES: Parity[] = ['weekly', 'odd', 'even'];

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
  const inScope = dataset.assignments.filter(
    (a) => (!scope || scopeGroups.some((g) => index.audienceTouchesGroup(a.audience, g))) && audienceInCycle(index, a.audience, cycle),
  );
  const items = groupFilter ? inScope.filter((a) => index.audienceTouchesGroup(a.audience, groupFilter)) : inScope;
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
        {
          label: t('assignments.parity'),
          render: (x) => (x.parity === 'weekly' || index.isReduced(x) ? '—' : <span className="badge">{t(`parity.${x.parity}`)}</span>),
        },
      ]}
      newItem={(): Omit<Assignment, 'id'> => ({
        subjectId: cycleSubjects[0]?.id ?? '',
        type: 'lecture',
        teacherId: dataset.teachers[0]?.id ?? '',
        audience: { kind: 'stream', id: '', groupIds: [] },
        pairsPerWeek: 1,
        parity: 'weekly',
        roomType: 'lecture',
        equipment: [],
      })}
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
        const setAudience = (aud: Audience) => set({ audience: aud });
        const subgroupsOf = (id: string) => index.groups.get(id)?.subgroups ?? 1;
        // a lecture's torent is chosen per subject, by its groups (an existing one is shown with its groups)
        const streamGroups = d.audience.kind === 'stream' ? (d.audience.groupIds ?? index.streams.get(d.audience.id)?.groupIds ?? []) : [];
        const setStreamGroups = (groupIds: string[]) => setAudience({ kind: 'stream', id: '', groupIds: [...new Set(groupIds)] });
        const predefined = dataset.streams
          .filter((st) => !st.subjectId && st.groupIds.some((g) => visibleGroups.some((v) => v.id === g)))
          .sort((a, b) => a.name.localeCompare(b.name));
        const groupYears = [...new Set(visibleGroups.map((g) => g.year))].sort();
        // reduced attendance is counted per session, not per week (no odd/even weeks either)
        const reduced = index.isReduced(d);
        return (
          <div className="stack">
            <div className="form-grid">
              <Field label={t('assignments.subject')}>
                <Select className="select" value={d.subjectId} onChange={(e) => set({ subjectId: e.target.value })}>
                  {cycleSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
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
                      roomType: (type === 'project' ? 'seminar' : type) as RoomType, // project hours use ordinary rooms
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

            <Field label={t('assignments.audience')}>
              <div className="row wrap">
                <Segmented
                  value={d.audience.kind}
                  onChange={(kind) =>
                    setAudience(
                      kind === 'stream'
                        ? { kind, id: '', groupIds: [] }
                        : kind === 'group'
                          ? { kind, id: visibleGroups[0]?.id ?? '' }
                          : { kind, id: visibleGroups[0]?.id ?? '', subgroup: 1 },
                    )
                  }
                  options={[
                    { value: 'stream', label: t('assignments.kind.stream') },
                    { value: 'group', label: t('assignments.kind.group') },
                    { value: 'subgroup', label: t('assignments.kind.subgroup') },
                  ]}
                />
                {d.audience.kind !== 'stream' && (
                  <Select
                    className="select"
                    style={{ width: 180 }}
                    value={d.audience.id}
                    onChange={(e) => setAudience({ ...d.audience, id: e.target.value } as Audience)}
                  >
                    {visibleGroups.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                )}
                {d.audience.kind === 'subgroup' && (
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
                )}
                <span className="small muted">
                  {index.audienceSize(d.audience)} {t('groups.size').toLowerCase()}
                </span>
              </div>
              {/* the torent of this subject's lecture: tick the groups that attend it together */}
              {d.audience.kind === 'stream' && (
                <div className="stream-picker">
                  {predefined.length > 0 && (
                    <div className="row wrap" style={{ gap: 6 }}>
                      <span className="small muted">{t('assignments.streamFrom')}</span>
                      {predefined.map((st) => (
                        <button key={st.id} type="button" className="btn ghost sm" onClick={() => setStreamGroups(st.groupIds)}>
                          {st.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {groupYears.map((y) => (
                    <div key={y} className="row wrap" style={{ gap: 8 }}>
                      <strong className="small" style={{ minWidth: 60 }}>
                        {t('groups.year')} {y}
                      </strong>
                      <div className="checks">
                        {visibleGroups
                          .filter((g) => g.year === y)
                          .map((g) => (
                            <label key={g.id} className="check">
                              <input
                                type="checkbox"
                                checked={streamGroups.includes(g.id)}
                                onChange={(e) =>
                                  setStreamGroups(e.target.checked ? [...streamGroups, g.id] : streamGroups.filter((x) => x !== g.id))
                                }
                              />
                              {g.name}
                            </label>
                          ))}
                      </div>
                    </div>
                  ))}
                  {streamGroups.length < 2 && <span className="small muted">{t('assignments.streamMin')}</span>}
                </div>
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
                    onChange={(e) => set({ pairsPerSession: Number(e.target.value) || 0, parity: 'weekly' })}
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
              {dataset.settings.weekParity && !reduced && (
                <Field label={t('assignments.parity')}>
                  <Select className="select" value={d.parity} onChange={(e) => set({ parity: e.target.value as Parity })}>
                    {PARITIES.map((p) => (
                      <option key={p} value={p}>
                        {t(`parity.${p}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label={t('assignments.roomType')}>
                <Select className="select" value={d.roomType} onChange={(e) => set({ roomType: e.target.value as RoomType })}>
                  {(['lecture', 'seminar', 'lab'] as RoomType[]).map((type) => (
                    <option key={type} value={type}>
                      {t(`roomType.${type}`)}
                    </option>
                  ))}
                </Select>
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
