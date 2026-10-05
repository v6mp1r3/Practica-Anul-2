import { useState } from 'react';
import { ChangesCard } from '../../components/ChangesCard';
import { MyTimetable } from '../../components/MyTimetable';
import { SessionTimetable } from '../../components/SessionTimetable';
import { Empty, PageHeader, Segmented } from '../../components/ui';
import type { Lesson } from '../../domain/types';
import { filterLessons } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useDataset } from '../../state/data';
import { downloadFile } from '../../utils/download';
import { timetableToIcs } from '../../utils/export';

const SUBGROUP_KEY = 'eduschedule:subgroup';
const GROUPS_KEY = 'eduschedule:groups';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export default function StudentHome() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { dataset, index, published } = useDataset();
  const group = user?.groupId ? index.groups.get(user.groupId) : undefined;
  const [subgroup, setSubgroupState] = useState<number | null>(() => load<number | null>(SUBGROUP_KEY, null));
  // Groups shown in the grid: the student's own group by default, others on demand
  const [shown, setShownState] = useState<string[]>(() => {
    const saved = load<string[]>(GROUPS_KEY, []).filter((id) => index.groups.has(id));
    return saved.length ? saved : group ? [group.id] : [];
  });

  if (!group) return <Empty />;

  const setSubgroup = (s: number | null) => {
    setSubgroupState(s);
    save(SUBGROUP_KEY, s);
  };
  const setShown = (ids: string[]) => {
    const next = ids.length ? ids : [group.id];
    setShownState(next);
    save(GROUPS_KEY, next);
  };
  const toggle = (id: string) => setShown(shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id]);

  const onlyMine = shown.length === 1 && shown[0] === group.id;
  const allIds = dataset.groups.map((g) => g.id);
  const everything = allIds.every((id) => shown.includes(id));

  const lessons: Lesson[] = [];
  if (published) {
    const seen = new Set<string>();
    for (const id of shown) {
      for (const l of filterLessons(index, published.lessons, { kind: 'group', id, subgroup: onlyMine ? subgroup : null })) {
        if (!seen.has(l.id)) {
          seen.add(l.id);
          lessons.push(l);
        }
      }
    }
  }

  const others = dataset.groups.filter((g) => g.id !== group.id).sort((a, b) => a.name.localeCompare(b.name));
  const sessions = group.studyForm === 'reduced' ? dataset.settings.reducedSessions : [];

  return (
    <div className="page">
      <PageHeader
        title={t('nav.timetable')}
        subtitle={`${group.name} · ${group.program} · ${t(`form.${group.studyForm}`)} · ${t('groups.year')} ${group.year}`}
        actions={
          <>
            {onlyMine && group.subgroups > 1 && (
              <Segmented
                value={String(subgroup ?? 0)}
                onChange={(v) => setSubgroup(Number(v) || null)}
                options={[
                  { value: '0', label: t('view.allSubgroups') },
                  ...Array.from({ length: group.subgroups }, (_, i) => ({
                    value: String(i + 1),
                    label: `${t('assignments.kind.subgroup')} ${i + 1}`,
                  })),
                ]}
              />
            )}
            {lessons.length > 0 && (
              <button
                className="btn"
                onClick={() => downloadFile(`orar-${group.name}.ics`, timetableToIcs(lessons, index, dataset.settings), 'text/calendar')}
              >
                {t('my.addToCalendar')}
              </button>
            )}
          </>
        }
      />

      {/* Which groups to show: own group, any others, or all */}
      <div className="row wrap" style={{ gap: 8, marginBottom: 18 }}>
        <span className="small muted">{t('student.showGroups')}</span>
        <div className="segmented" role="group" aria-label={t('student.showGroups')}>
          <button type="button" aria-pressed={!everything && shown.includes(group.id)} onClick={() => setShown([group.id])}>
            {t('student.myGroup')} · {group.name}
          </button>
          {others.map((g) => (
            <button key={g.id} type="button" aria-pressed={!everything && shown.includes(g.id)} onClick={() => toggle(g.id)}>
              {g.name}
            </button>
          ))}
          <button type="button" aria-pressed={everything} onClick={() => setShown(everything ? [group.id] : allIds)}>
            {t('common.all')}
          </button>
        </div>
      </div>

      {!published ? (
        <div className="card">
          <Empty>{t('tt.notPublished')}</Empty>
        </div>
      ) : (
        <div className="stack">
          <ChangesCard groupId={group.id} />
          {/* Reduced attendance: the full calendar of every session, not one week */}
          {sessions.length > 0 && shown.length === 1 && shown[0] === group.id ? (
            <SessionTimetable dataset={dataset} index={index} lessons={lessons} groupId={group.id} hide={['audience']} />
          ) : (
            <MyTimetable settings={dataset.settings} index={index} lessons={lessons} hide={shown.length === 1 ? ['audience'] : []} />
          )}
        </div>
      )}
    </div>
  );
}
