import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChangesCard } from '../../components/ChangesCard';
import { MyTimetable } from '../../components/MyTimetable';
import { Legend, TimetableGrid, type LessonField } from '../../components/TimetableGrid';
import { ViewPicker } from '../../components/ViewPicker';
import { Empty, PageHeader } from '../../components/ui';
import { parseSlotKey } from '../../domain/slots';
import type { ActivityType, Parity } from '../../domain/types';
import { dayIndexOf, filterLessons, inWeek, teacherLoad, type ViewFilter } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useDataset } from '../../state/data';
import { downloadFile } from '../../utils/download';
import { timetableToIcs } from '../../utils/export';

export default function TeacherHome() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { dataset, index, published } = useDataset();
  const teacher = user?.teacherId ? index.teachers.get(user.teacherId) : undefined;
  // One "Orar" page: the teacher's own timetable by default, any group/teacher/room on demand
  const [view, setView] = useState<ViewFilter>({ kind: 'teacher', id: teacher?.id ?? '' });
  const [week, setWeek] = useState<Parity>('weekly');

  if (!teacher) return <Empty />;
  const isMine = view.kind === 'teacher' && view.id === teacher.id;
  const HIDE: Record<ViewFilter['kind'], LessonField[]> = { group: [], teacher: ['teacher'], room: ['room'] };
  const mine = published ? filterLessons(index, published.lessons, { kind: 'teacher', id: teacher.id }) : [];
  const load = published ? teacherLoad(index, published.lessons, teacher.id) : 0;
  const byType = (type: ActivityType) =>
    mine.filter((l) => index.assignmentOf(l)?.type === type).reduce((n, l) => n + (l.parity === 'weekly' ? 1 : 0.5), 0);
  const groups = new Set(mine.flatMap((l) => index.cohorts(index.assignmentOf(l)!.audience).map((c) => c.groupId)));
  const rooms = new Set(mine.map((l) => l.roomId));
  const consultation = teacher.consultation ? parseSlotKey(teacher.consultation) : null;
  const over = load > teacher.maxPairsPerWeek;

  return (
    <div className="page">
      <PageHeader
        title={t('nav.timetable')}
        subtitle={`${teacher.title} ${teacher.name} · ${teacher.department}`}
        actions={
          isMine &&
          mine.length > 0 && (
            <button
              className="btn"
              onClick={() => downloadFile('orarul-meu.ics', timetableToIcs(mine, index, dataset.settings), 'text/calendar')}
            >
              {t('my.addToCalendar')}
            </button>
          )
        }
      />
      {!published ? (
        <div className="card">
          <Empty>{t('tt.notPublished')}</Empty>
        </div>
      ) : (
        <div className="stack">
          <div className="row wrap">
            <ViewPicker dataset={dataset} view={view} onView={setView} week={week} onWeek={setWeek} showWeek={!isMine} />
            {!isMine && (
              <button className="btn" onClick={() => setView({ kind: 'teacher', id: teacher.id })}>
                {t('nav.myTimetable')}
              </button>
            )}
          </div>
          {!isMine ? (
            <>
              <TimetableGrid
                settings={dataset.settings}
                index={index}
                lessons={filterLessons(index, published.lessons, view).filter((l) => inWeek(l, week))}
                hide={HIDE[view.kind]}
                today={dayIndexOf(new Date())}
              />
              <Legend />
            </>
          ) : (
            <>
              <div className="stats">
                <div className="card stat">
                  <div className="value" style={{ color: over ? 'var(--danger)' : undefined }}>
                    {load} / {teacher.maxPairsPerWeek}
                  </div>
                  <div className="label">{t('teacher.load')}</div>
                </div>
                <div className="card stat">
                  <div className="value">
                    {byType('lecture')} · {byType('seminar')} · {byType('lab')}
                  </div>
                  <div className="label">
                    {t('activity.lecture')} · {t('activity.seminar')} · {t('activity.lab')}
                  </div>
                </div>
                <div className="card stat">
                  <div className="value">{groups.size}</div>
                  <div className="label">{t('teacher.groups')}</div>
                </div>
                <div className="card stat">
                  <div className="value">{rooms.size}</div>
                  <div className="label">{t('teacher.rooms')}</div>
                </div>
                <Link to="/teacher/availability" className="card stat" style={{ color: 'inherit' }}>
                  <div className="value" style={{ fontSize: 18 }}>
                    {consultation
                      ? `${t(`dayShort.${consultation[0]}` as 'dayShort.0')} ${dataset.settings.slots[consultation[1]]?.start}`
                      : '—'}
                  </div>
                  <div className="label">{consultation ? t('availability.consultation') : t('teacher.setConsultation')}</div>
                </Link>
              </div>
              {over && <div className="badge danger">{t('teacher.overtime', { extra: load - teacher.maxPairsPerWeek })}</div>}
              <ChangesCard teacherId={teacher.id} />
              <MyTimetable settings={dataset.settings} index={index} lessons={mine} hide={['teacher']} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
