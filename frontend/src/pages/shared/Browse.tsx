import { CycleTabs, groupInCycle, useCycle } from '../../components/CycleTabs';
import { useEffect, useState } from 'react';
import { HolidaysCard } from '../../components/Holidays';
import { semesterOf } from '../../domain/holidays';
import { Legend, TimetableGrid, type LessonField } from '../../components/TimetableGrid';
import { SessionsSection, SessionTimetable } from '../../components/SessionTimetable';
import { ViewPicker } from '../../components/ViewPicker';
import { Empty, PageHeader } from '../../components/ui';
import type { Parity, StudyCycle } from '../../domain/types';
import { dayIndexOf, filterLessons, inWeek, streamGroups, type ViewFilter } from '../../domain/views';
import { useI18n } from '../../i18n';
import { facultyView, useAdminScope } from '../../components/FacultyFilter';
import { useDataset } from '../../state/data';

const HIDE: Record<ViewFilter['kind'], LessonField[]> = { group: [], teacher: ['teacher'], room: ['room'] };

/** The whole institution's published timetable, by group, teacher or room. */
export default function Browse() {
  const { t } = useI18n();
  const { dataset, index, published } = useDataset();
  // an administrator sees their own faculty (and the teachers/rooms it shares)
  const scope = useAdminScope();
  const limit = scope ? facultyView(dataset, index, scope, published?.lessons) : undefined;
  const [view, setView] = useState<ViewFilter>(() => ({
    kind: 'group',
    id: dataset.groups.find((g) => !limit || limit.groupIds.has(g.id))?.id ?? '',
  }));
  const [week, setWeek] = useState<Parity>('weekly');
  // licență | master's: the group list shows that cycle
  const [cycle, setCycle] = useCycle();
  // start on a group of the remembered cycle
  useEffect(() => {
    if (view.kind === 'group' && !view.id.startsWith('stream:') && !groupInCycle(index.groups.get(view.id), cycle)) changeCycle(cycle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const changeCycle = (c: StudyCycle) => {
    setCycle(c);
    if (view.kind === 'group') {
      const first = dataset.groups.find((g) => groupInCycle(g, c) && (!limit || limit.groupIds.has(g.id)));
      setView({ kind: 'group', id: first?.id ?? '' });
    }
  };

  // Reduced-attendance groups are shown session by session (real dates)
  // (a torent of reduced-attendance groups: the dates × groups table)
  const viewGroups = view.kind === 'group' ? streamGroups(index, view.id) : [];
  const reducedGroup =
    viewGroups.length > 0 &&
    viewGroups.every((g) => index.groups.get(g)?.studyForm === 'reduced') &&
    dataset.settings.reducedSessions.length > 0;
  const lessons = published ? filterLessons(index, published.lessons, view).filter((l) => inWeek(l, week)) : [];

  return (
    <div className="page">
      <PageHeader
        title={t('nav.browse')}
        subtitle={published ? `${published.name} · ${semesterOf(dataset.settings.semester)}` : undefined}
      />
      {!published ? (
        <div className="card">
          <Empty>{t('tt.notPublished')}</Empty>
        </div>
      ) : (
        <div className="stack">
          <CycleTabs value={cycle} onChange={changeCycle} />
          <ViewPicker
            dataset={dataset}
            view={view}
            onView={setView}
            week={week}
            onWeek={setWeek}
            showWeek={!reducedGroup}
            limit={limit}
            withStreams
            cycle={cycle}
          />
          {reducedGroup ? (
            <SessionTimetable
              dataset={dataset}
              index={index}
              lessons={filterLessons(index, published.lessons, view)}
              groupId={viewGroups.length === 1 ? view.id : undefined}
              groupIds={viewGroups}
              hide={HIDE[view.kind]}
            />
          ) : (
            <>
              <TimetableGrid
                settings={dataset.settings}
                index={index}
                lessons={lessons}
                hide={HIDE[view.kind]}
                today={dayIndexOf(new Date())}
              />
              <SessionsSection
                dataset={dataset}
                index={index}
                lessons={filterLessons(index, published.lessons, view)}
                hide={HIDE[view.kind]}
              />
            </>
          )}
          <Legend />
          <HolidaysCard dataset={dataset} />
        </div>
      )}
    </div>
  );
}
