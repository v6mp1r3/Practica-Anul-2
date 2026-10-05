import { useState } from 'react';
import { ChangesCard } from '../../components/ChangesCard';
import { Select } from '../../components/Select';
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
// one group at a time: the student's own, or another one they pick
const VIEW_KEY = 'eduschedule:viewGroup';

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
  const [viewId, setViewState] = useState<string>(() => {
    const saved = load<string | null>(VIEW_KEY, null);
    return saved && index.groups.has(saved) ? saved : (group?.id ?? '');
  });

  if (!group) return <Empty />;

  const setSubgroup = (s: number | null) => {
    setSubgroupState(s);
    save(SUBGROUP_KEY, s);
  };
  const setView = (id: string) => {
    setViewState(id);
    save(VIEW_KEY, id === group.id ? null : id);
  };
  const viewed = index.groups.get(viewId) ?? group;
  const mine = viewed.id === group.id;

  const lessons: Lesson[] = published
    ? filterLessons(index, published.lessons, { kind: 'group', id: viewed.id, subgroup: mine ? subgroup : null })
    : [];

  const others = dataset.groups.filter((g) => g.id !== group.id).sort((a, b) => a.name.localeCompare(b.name));
  const faculties = [...new Set(others.map((g) => g.faculty ?? ''))];
  const sessions = viewed.studyForm === 'reduced' ? dataset.settings.reducedSessions : [];

  return (
    <div className="page">
      <PageHeader
        title={t('nav.timetable')}
        subtitle={`${viewed.name} · ${viewed.program} · ${t(`form.${viewed.studyForm}`)} · ${t('groups.year')} ${viewed.year}`}
        actions={
          <>
            {mine && group.subgroups > 1 && (
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
                onClick={() => downloadFile(`orar-${viewed.name}.ics`, timetableToIcs(lessons, index, dataset.settings), 'text/calendar')}
              >
                {t('my.addToCalendar')}
              </button>
            )}
          </>
        }
      />

      {/* Whose timetable: your own group, or one other group — never several at once */}
      <div className="row wrap" style={{ gap: 8, marginBottom: 18 }}>
        <div className="segmented">
          <button type="button" aria-pressed={mine} onClick={() => setView(group.id)} style={{ whiteSpace: 'nowrap' }}>
            {t('student.myGroup')} · {group.name}
          </button>
        </div>
        <Select
          className="select pill"
          value={mine ? '' : viewed.id}
          onChange={(e) => setView(e.target.value || group.id)}
          aria-label={t('student.otherGroup')}
        >
          <option value="">{t('student.otherGroup')}</option>
          {faculties.map((f) => (
            <optgroup key={f} label={f || '—'}>
              {others
                .filter((g) => (g.faculty ?? '') === f)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {t('groups.year')} {g.year}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </div>

      {!published ? (
        <div className="card">
          <Empty>{t('tt.notPublished')}</Empty>
        </div>
      ) : (
        <div className="stack">
          <ChangesCard groupId={viewed.id} />
          {/* Reduced attendance: the full calendar of every session, not one week */}
          {sessions.length > 0 ? (
            <SessionTimetable dataset={dataset} index={index} lessons={lessons} groupId={viewed.id} hide={['audience']} />
          ) : (
            <MyTimetable settings={dataset.settings} index={index} lessons={lessons} hide={['audience']} />
          )}
        </div>
      )}
    </div>
  );
}
