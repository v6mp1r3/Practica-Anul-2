// Turns exam events and in-class atestări into rows of the exam calendar.
import type { Midterm } from '../domain/exams';
import type { DatasetIndex } from '../domain/indexes';
import type { ExamEvent, Settings } from '../domain/types';
import type { MessageKey } from '../i18n';
import type { CalendarEntry } from './ExamCalendar';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function examEntries(events: ExamEvent[], index: DatasetIndex, t: Translate): CalendarEntry[] {
  return events.map((e) => ({
    id: e.id,
    date: e.date,
    start: e.start,
    end: e.end,
    label:
      e.kind === 'consultation'
        ? t('exams.consultation')
        : e.round === 'reexam'
          ? t('exams.reexam')
          : e.round === 'session'
            ? t('exams.exam')
            : t('exams.midterm', { n: e.round === 'midterm1' ? 1 : 2 }),
    tone: e.kind === 'consultation' ? 'consultation' : e.round.startsWith('midterm') ? 'midterm' : 'exam',
    subjectId: e.subjectId,
    teacherId: e.teacherId,
    roomId: e.roomId,
    groupLabel: index.groups.get(e.groupId)?.name ?? '',
  }));
}

/** Atestări held in the subject's own class, at that class's time and room. */
export function midtermEntries(list: Midterm[], index: DatasetIndex, settings: Settings, t: Translate): CalendarEntry[] {
  return list.map((m) => {
    const a = index.assignmentOf(m.lesson)!;
    const slot = settings.slots[m.lesson.slot];
    return {
      id: `${m.n}-${m.lesson.id}-${m.date}`,
      date: m.date,
      start: slot?.start ?? '',
      end: slot?.end ?? '',
      label: t('exams.midterm', { n: m.n }),
      tone: 'midterm',
      subjectId: a.subjectId,
      detail: t(`activity.${a.type}`),
      teacherId: a.teacherId,
      roomId: m.lesson.roomId,
      groupLabel: index.audienceLabel(a.audience),
    };
  });
}
