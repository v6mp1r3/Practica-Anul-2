// Turns exam and atestări events into rows of the exam calendar.
import type { DatasetIndex } from '../domain/indexes';
import type { ExamEvent } from '../domain/types';
import type { MessageKey } from '../i18n';
import type { CalendarEntry } from './ExamCalendar';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function examEntries(events: ExamEvent[], index: DatasetIndex, t: Translate): CalendarEntry[] {
  return events.map((e) => ({
    // an atestare held in a class says so
    detail: e.lessonId ? t('exams.inClass') : undefined,
    id: e.id,
    date: e.date,
    start: e.start,
    end: e.end,
    label:
      e.kind === 'consultation'
        ? t('exams.consultation')
        : e.round === 'reexam'
          ? t('exams.reexam')
          : e.round === 'remidterm1' || e.round === 'remidterm2'
            ? t('exams.remidterm', { n: e.round === 'remidterm1' ? 1 : 2 })
            : e.round === 'session'
              ? t('exams.exam')
              : t('exams.midterm', { n: e.round === 'midterm1' ? 1 : 2 }),
    tone: e.kind === 'consultation' ? 'consultation' : e.round.includes('midterm') ? 'midterm' : 'exam',
    subjectId: e.subjectId,
    teacherId: e.teacherId,
    roomId: e.roomId,
    groupLabel: `${index.groups.get(e.groupId)?.name ?? ''}${e.subgroup ? `/${e.subgroup}` : ''}`,
  }));
}
