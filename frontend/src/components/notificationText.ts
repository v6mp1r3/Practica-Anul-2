// Turns a stored notification (kind + params) into text in the viewer's language.
import type { DatasetIndex } from '../domain/indexes';
import type { Notification } from '../domain/types';
import type { MessageKey } from '../i18n';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function notificationText(n: Notification, t: Translate, idx: DatasetIndex | null): { title: string; body: string } {
  const p = n.params ?? {};
  switch (n.kind) {
    case 'welcome':
      return { title: t('notify.welcome.title'), body: t('notify.welcome.body') };
    case 'published':
      return { title: t('notify.published.title'), body: t('notify.published.body', { name: p.name ?? '' }) };
    case 'updated':
      return { title: t('notify.updated.title'), body: t('notify.updated.body', { name: p.name ?? '', count: p.count ?? 0 }) };
    case 'availability':
      return { title: t('notify.availability.title'), body: t('notify.availability.body', { name: p.name ?? '' }) };
    case 'room-change':
    case 'teacher-change': {
      const a = idx?.assignments.get(String(p.assignmentId));
      const what = a ? `${idx?.subjects.get(a.subjectId)?.code} ${t(`activity.${a.type}`)} · ${idx?.audienceLabel(a.audience)}` : '';
      const [y, m, d] = String(p.date ?? '').split('-');
      const when = `${d}.${m}.${y}, ${t('tt.pair').toLowerCase()} ${Number(p.slot) + 1}`;
      const body =
        n.kind === 'room-change'
          ? t('notify.room.body', {
              what,
              when,
              room: idx?.rooms.get(String(p.roomId))?.name ?? '?',
              from: idx?.rooms.get(String(p.fromRoomId))?.name ?? '?',
            })
          : t('notify.teacher.body', {
              what,
              when,
              teacher: idx?.teachers.get(String(p.teacherId))?.name ?? '?',
              from: (a && idx?.teachers.get(a.teacherId)?.name) ?? '?',
            });
      return {
        title: t(n.kind === 'room-change' ? 'notify.room.title' : 'notify.teacher.title'),
        body: p.note ? `${body} ${p.note}` : body,
      };
    }
    default:
      return { title: n.title, body: n.body };
  }
}
