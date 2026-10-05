// Upcoming schedule changes for one group or teacher, shown on their home page.
import { parseDate, upcomingChanges } from '../domain/changes';
import { fmtTime } from '../domain/slots';
import { dateLocale, useI18n } from '../i18n';
import { useDataset } from '../state/data';
import { Icon } from './Icon';

export function ChangesCard({ groupId, teacherId }: { groupId?: string; teacherId?: string }) {
  const { t, lang } = useI18n();
  const { dataset, index, changes } = useDataset();
  const list = upcomingChanges(index, changes, new Date(), { groupId, teacherId });
  if (!list.length) return null;

  return (
    <section className="card">
      <div className="card-header">
        <Icon name="swap" size={17} />
        <h2>{t('changes.upcoming')}</h2>
      </div>
      <div className="card-body stack" style={{ gap: 12, paddingTop: 4 }}>
        {list.map((c) => {
          const a = index.assignments.get(c.assignmentId);
          const text =
            c.kind === 'room'
              ? t('changes.roomChange', {
                  room: index.rooms.get(c.roomId ?? '')?.name ?? '?',
                  from: index.rooms.get(c.fromRoomId)?.name ?? '?',
                })
              : t('changes.teacherChange', {
                  teacher: index.teachers.get(c.teacherId ?? '')?.name ?? '?',
                  from: (a && index.teachers.get(a.teacherId)?.name) ?? '?',
                });
          return (
            <div key={c.id} className="row wrap" style={{ gap: 12 }}>
              <strong style={{ minWidth: 120 }}>
                {parseDate(c.date).toLocaleDateString(dateLocale(lang), { weekday: 'short', day: '2-digit', month: 'short' })}
              </strong>
              <span className="muted" style={{ minWidth: 90 }}>
                {t('tt.pair')} {c.slot + 1} · {fmtTime(dataset.settings.slots[c.slot]?.start, dataset.settings.timeFormat)}
              </span>
              <span>
                {a && `${index.subjects.get(a.subjectId)?.code} ${t(`activity.${a.type}`)} — `}
                <strong>{text}</strong>
                {c.note && <span className="muted"> · {c.note}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
