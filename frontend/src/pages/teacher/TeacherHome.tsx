import { Link } from 'react-router-dom';
import { MyTimetable } from '../../components/MyTimetable';
import { Empty, PageHeader } from '../../components/ui';
import { parseSlotKey } from '../../domain/slots';
import type { ActivityType } from '../../domain/types';
import { filterLessons, teacherLoad } from '../../domain/views';
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

  if (!teacher) return <Empty />;
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
        title={t('nav.myTimetable')}
        subtitle={`${teacher.title} ${teacher.name} · ${teacher.department}`}
        actions={
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
          <MyTimetable settings={dataset.settings} index={index} lessons={mine} hide={['teacher']} />
        </div>
      )}
    </div>
  );
}
