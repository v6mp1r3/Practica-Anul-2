import { CycleTabs, audienceInCycle, groupInCycle, useCycle } from '../../components/CycleTabs';
import { facultyGroupIds, useAdminScope } from '../../components/FacultyFilter';
import { useState } from 'react';
import { api } from '../../api';
import { CrudPage } from '../../components/CrudPage';
import { needsSplit } from '../../domain/rooms';
import { subjectForGroup } from '../../domain/specialty';
import { MultiSelect } from '../../components/MultiSelect';
import { LanguageTag, languageOf } from '../../components/Language';
import { useEquipment } from '../../components/useEquipment';
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
  // the same subject can be taught in several languages: then the list says which one
  const manyLanguages = new Set(cycleSubjects.map(languageOf)).size > 1;
  // a code used by several study plans (MD for FAF in year 1, for SI in year 2): the list names the plan
  const sharedCodes = new Set(cycleSubjects.filter((x, i) => cycleSubjects.findIndex((y) => y.code === x.code) !== i).map((x) => x.code));
  const planOf = (x: (typeof cycleSubjects)[number]) =>
    [x.specialties?.length ? x.specialties.join(', ') : null, `${t('groups.year')} ${x.year}`].filter(Boolean).join(', ');
  // the groups offered are those of the subject's year; this shows the other years too
  const [otherYears, setOtherYears] = useState(false);
  const groupsFor = (subjectId: string) => {
    const subject = index.subjects.get(subjectId);
    return visibleGroups.filter((g) => !subject || (subjectForGroup(subject, g) && (otherYears || g.year === subject.year)));
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
              <strong>{index.subjects.get(x.subjectId)?.code}</strong>
              <LanguageTag language={index.subjects.get(x.subjectId)?.language} />{' '}
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
        // a subject is taught to the groups of its language and specialties (AM in Russian to the Russian groups), in its year
        const formGroups = groupsFor(d.subjectId);
        const split = needsSplit(index, dataset.rooms, d);
        const setAudience = (aud: Audience) => set({ audience: aud });
        const subgroupsOf = (id: string) => index.groups.get(id)?.subgroups ?? 1;
        // a lecture's torent is chosen per subject, by its groups (an existing one is shown with its groups)
        const streamGroups = d.audience.kind === 'stream' ? (d.audience.groupIds ?? index.streams.get(d.audience.id)?.groupIds ?? []) : [];
        const setStreamGroups = (groupIds: string[]) => setAudience({ kind: 'stream', id: '', groupIds: [...new Set(groupIds)] });
        const predefined = dataset.streams
          .filter((st) => !st.subjectId && st.groupIds.some((g) => formGroups.some((v) => v.id === g)))
          .sort((a, b) => a.name.localeCompare(b.name));
        const groupYears = [...new Set(formGroups.map((g) => g.year))].sort();
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
                    const offered = groupsFor(e.target.value);
                    const fits = index.cohorts(d.audience).every((c) => offered.some((g) => g.id === c.groupId));
                    const first = offered[0]?.id ?? '';
                    // another language, specialty or year: the groups chosen so far don't take it
                    set({
                      subjectId: e.target.value,
                      ...(fits
                        ? {}
                        : {
                            audience:
                              d.audience.kind === 'stream'
                                ? { kind: 'stream', id: '', groupIds: [] }
                                : d.audience.kind === 'group'
                                  ? { kind: 'group', id: first }
                                  : { kind: 'subgroup', id: first, subgroup: 1 },
                          }),
                    });
                  }}
                >
                  {cycleSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                      {manyLanguages ? ` (${languageOf(s).toUpperCase()})` : ''}
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

            <Field label={t('assignments.audience')}>
              <div className="row wrap">
                <Segmented
                  value={d.audience.kind}
                  onChange={(kind) =>
                    setAudience(
                      kind === 'stream'
                        ? { kind, id: '', groupIds: [] }
                        : kind === 'group'
                          ? { kind, id: formGroups[0]?.id ?? '' }
                          : { kind, id: formGroups[0]?.id ?? '', subgroup: 1 },
                    )
                  }
                  options={[
                    { value: 'stream', label: t('assignments.kind.stream') },
                    { value: 'group', label: t('assignments.kind.group') },
                    // subgroups come by themselves (see the split note); kept only on a class already split
                    ...(d.audience.kind === 'subgroup' ? [{ value: 'subgroup' as const, label: t('assignments.kind.subgroup') }] : []),
                  ]}
                />
                {d.audience.kind !== 'stream' && (
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
              <label className="check small" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={otherYears} onChange={(e) => setOtherYears(e.target.checked)} />
                {t('assignments.otherYears', { year: index.subjects.get(d.subjectId)?.year ?? '' })}
              </label>
              {split && (
                <p className="small" style={{ margin: '8px 0 0', color: 'var(--warning)' }}>
                  {t('assignments.autoSplit', { size: split.size, largest: split.largest })}
                </p>
              )}
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
                        {formGroups
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
