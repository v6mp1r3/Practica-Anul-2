import type { Dataset, Parity } from '../domain/types';
import type { ViewFilter, ViewKind } from '../domain/views';
import { useI18n } from '../i18n';
import { Segmented } from './ui';

/** Group / teacher / room selector + odd/even week switch, shared by every timetable view. */
export function ViewPicker({
  dataset,
  view,
  onView,
  week,
  onWeek,
  kinds = ['group', 'teacher', 'room'],
}: {
  dataset: Dataset;
  view: ViewFilter;
  onView: (v: ViewFilter) => void;
  week: Parity;
  onWeek: (w: Parity) => void;
  kinds?: ViewKind[];
}) {
  const { t } = useI18n();
  const options = {
    group: dataset.groups.map((g) => ({ id: g.id, name: g.name })),
    teacher: [...dataset.teachers].sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ id: x.id, name: x.name })),
    room: dataset.rooms.map((r) => ({ id: r.id, name: `${r.name} (${r.capacity})` })),
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
      <select
        className="select"
        style={{ width: 220 }}
        value={view.id}
        onChange={(e) => onView({ ...view, id: e.target.value, subgroup: null })}
        aria-label={t(`view.${view.kind}`)}
      >
        {options[view.kind].map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {group && group.subgroups > 1 && (
        <select
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
        </select>
      )}
      {dataset.settings.weekParity && (
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
