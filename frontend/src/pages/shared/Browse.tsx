import { useState } from 'react';
import { Legend, TimetableGrid, type LessonField } from '../../components/TimetableGrid';
import { ViewPicker } from '../../components/ViewPicker';
import { Empty, PageHeader } from '../../components/ui';
import type { Parity } from '../../domain/types';
import { dayIndexOf, filterLessons, inWeek, type ViewFilter } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useDataset } from '../../state/data';

const HIDE: Record<ViewFilter['kind'], LessonField[]> = { group: [], teacher: ['teacher'], room: ['room'] };

/** The whole institution's published timetable, by group, teacher or room. */
export default function Browse() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { dataset, index, published } = useDataset();
  const [view, setView] = useState<ViewFilter>(() =>
    user?.groupId
      ? { kind: 'group', id: user.groupId }
      : user?.teacherId
        ? { kind: 'teacher', id: user.teacherId }
        : { kind: 'group', id: dataset.groups[0]?.id ?? '' },
  );
  const [week, setWeek] = useState<Parity>('weekly');

  const lessons = published ? filterLessons(index, published.lessons, view).filter((l) => inWeek(l, week)) : [];

  return (
    <div className="page">
      <PageHeader title={t('nav.browse')} subtitle={published ? `${published.name} · ${dataset.settings.semester}` : undefined} />
      {!published ? (
        <div className="card">
          <Empty>{t('tt.notPublished')}</Empty>
        </div>
      ) : (
        <div className="stack">
          <ViewPicker dataset={dataset} view={view} onView={setView} week={week} onWeek={setWeek} />
          <TimetableGrid
            settings={dataset.settings}
            index={index}
            lessons={lessons}
            hide={HIDE[view.kind]}
            today={dayIndexOf(new Date())}
          />
          <Legend />
        </div>
      )}
    </div>
  );
}
