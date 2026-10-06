import { useState } from 'react';
import { HolidaysCard } from '../../components/Holidays';
import { semesterOf } from '../../domain/holidays';
import { Legend, TimetableGrid, type LessonField } from '../../components/TimetableGrid';
import { SessionsSection, SessionTimetable } from '../../components/SessionTimetable';
import { ViewPicker } from '../../components/ViewPicker';
import { Empty, PageHeader } from '../../components/ui';
import type { Parity } from '../../domain/types';
import { dayIndexOf, filterLessons, inWeek, type ViewFilter } from '../../domain/views';
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

  // Reduced-attendance groups are shown session by session (real dates)
  const reducedGroup =
    view.kind === 'group' && index.groups.get(view.id)?.studyForm === 'reduced' && dataset.settings.reducedSessions.length > 0;
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
          <ViewPicker dataset={dataset} view={view} onView={setView} week={week} onWeek={setWeek} showWeek={!reducedGroup} limit={limit} />
          {reducedGroup ? (
            <SessionTimetable
              dataset={dataset}
              index={index}
              lessons={filterLessons(index, published.lessons, view)}
              groupId={view.id}
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
