// Exam, reexamination and atestări timetables as a calendar by date: one card
// per day, its consultations / exams / atestări in time order (like the
// faculties' published session sheets, but readable on a phone).
import type { ReactNode } from 'react';
import { parseDate } from '../domain/changes';
import type { DatasetIndex } from '../domain/indexes';
import { fmtTime } from '../domain/slots';
import type { Settings } from '../domain/types';
import { dateLocale, useI18n } from '../i18n';

export interface CalendarEntry {
  id: string;
  date: string;
  start: string;
  end: string;
  /** Badge text: Consultație, Examen, Reexaminare, Atestarea 1… */
  label: string;
  tone: 'exam' | 'consultation' | 'midterm';
  subjectId: string;
  /** e.g. "Seminar" for an atestare held in a class */
  detail?: string;
  teacherId: string;
  roomId: string;
  groupLabel: string;
}

export function ExamCalendar({
  entries,
  index,
  settings,
  hide = [],
  onEdit,
  empty,
  highlight,
}: {
  entries: CalendarEntry[];
  index: DatasetIndex;
  settings: Settings;
  hide?: ('teacher' | 'group')[];
  onEdit?: (id: string) => void;
  empty?: ReactNode;
  highlight?: Set<string>;
}) {
  const { t, lang } = useI18n();
  if (!entries.length) return <div className="card">{empty}</div>;
  const days = [...new Set(entries.map((e) => e.date))].sort();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="exam-days">
      {days.map((date) => (
        <section key={date} className={`card exam-day ${date < today ? 'past' : ''}`}>
          <header>
            <strong>{parseDate(date).toLocaleDateString(dateLocale(lang), { weekday: 'long' })}</strong>
            <span>{parseDate(date).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </header>
          <ul>
            {entries
              .filter((e) => e.date === date)
              .sort((a, b) => a.start.localeCompare(b.start) || a.groupLabel.localeCompare(b.groupLabel))
              .map((e) => {
                const subject = index.subjects.get(e.subjectId);
                return (
                  <li key={e.id} className={`exam-row ${e.tone} ${highlight?.has(e.id) ? 'problem' : ''}`}>
                    <span className="exam-time">
                      {fmtTime(e.start, settings.timeFormat)}
                      <small>{fmtTime(e.end, settings.timeFormat)}</small>
                    </span>
                    <span className="exam-body">
                      <span className={`badge exam-badge ${e.tone}`}>{e.label}</span>
                      <strong>
                        {subject?.code} · {subject?.name}
                      </strong>
                      <span className="small muted">
                        {[
                          e.detail,
                          !hide.includes('group') && e.groupLabel,
                          !hide.includes('teacher') && index.teachers.get(e.teacherId)?.name,
                          `${t('rooms.name').toLowerCase()} ${index.rooms.get(e.roomId)?.name ?? '?'}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {onEdit && (
                      <button className="btn ghost sm" onClick={() => onEdit(e.id)}>
                        {t('common.edit')}
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
