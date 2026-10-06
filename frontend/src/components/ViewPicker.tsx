import type { Dataset, Parity } from '../domain/types';
import type { FacultyView } from './FacultyFilter';
import type { ViewFilter, ViewKind } from '../domain/views';
import { useI18n } from '../i18n';
import { Segmented } from './ui';
import { Select } from './Select';

/** Group / teacher / room selector + odd/even week switch, shared by every timetable view. */
export function ViewPicker({
  dataset,
  view,
  onView,
  week,
  onWeek,
  kinds = ['group', 'teacher', 'room'],
  showWeek = true,
  limit,
  withStreams,
}: {
  dataset: Dataset;
  view: ViewFilter;
  onView: (v: ViewFilter) => void;
  week: Parity;
  onWeek: (w: Parity) => void;
  kinds?: ViewKind[];
  showWeek?: boolean;
  /** Only this faculty's groups and the teachers/rooms it uses. */
  limit?: FacultyView;
  /** Also offer streams in the group list (all their groups together). */
  withStreams?: boolean;
}) {
  const { t } = useI18n();
  const options = {
    group: dataset.groups.filter((g) => !limit || limit.groupIds.has(g.id)).map((g) => ({ id: g.id, name: g.name })),
    teacher: [...dataset.teachers]
      .filter((x) => !limit || limit.teacherIds.has(x.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => ({ id: x.id, name: x.name })),
    room: dataset.rooms.filter((r) => !limit || limit.roomIds.has(r.id)).map((r) => ({ id: r.id, name: `${r.name} (${r.capacity})` })),
  };
  const group = view.kind === 'group' ? dataset.groups.find((g) => g.id === view.id) : undefined;

  return (
    <div className="row wrap">
      {kinds.length > 1 && (
        <Segmented
          value={view.kind}
          onChange={(kind) => onView({ kind, id: options[kind][0]?.id ?? '' })}
          options={kinds.map((k) => ({ value: k, label: t(`view.${k}`) }))}
        />
      )}
      <Select
        className="select"
        style={{ width: 220 }}
        value={view.id}
        onChange={(e) => onView({ ...view, id: e.target.value, subgroup: null })}
        aria-label={t(`view.${view.kind}`)}
      >
        {view.kind === 'group' && withStreams ? (
          <>
            <optgroup label={t('groups.groups')}>
              {options.group.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('groups.streams')}>
              {dataset.streams
                .filter((st) => !limit || st.groupIds.some((g) => limit.groupIds.has(g)))
                .map((st) => (
                  <option key={st.id} value={`stream:${st.id}`}>
                    {st.name}
                  </option>
                ))}
            </optgroup>
          </>
        ) : (
          options[view.kind].map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))
        )}
      </Select>
      {group && group.subgroups > 1 && (
        <Select
          className="select"
          style={{ width: 150 }}
          value={view.subgroup ?? ''}
          onChange={(e) => onView({ ...view, subgroup: e.target.value ? Number(e.target.value) : null })}
          aria-label={t('groups.subgroups')}
        >
          <option value="">{t('view.allSubgroups')}</option>
          {Array.from({ length: group.subgroups }, (_, i) => (
            <option key={i} value={i + 1}>
              {t('assignments.kind.subgroup')} {i + 1}
            </option>
          ))}
        </Select>
      )}
      {showWeek && dataset.settings.weekParity && (
        <Segmented
          value={week}
          onChange={onWeek}
          options={[
            { value: 'weekly', label: t('tt.weekAll') },
            { value: 'odd', label: t('tt.weekOdd') },
            { value: 'even', label: t('tt.weekEven') },
          ]}
        />
      )}
    </div>
  );
}
