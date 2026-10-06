// Exam, reexamination and atestări timetables as a calendar by date: one card
// per day, its consultations / exams / atestări in time order (like the
// faculties' published session sheets, but readable on a phone).
import type { ReactNode } from 'react';
import { useHolidayName } from './Holidays';
import { parseDate } from '../domain/changes';
import type { DatasetIndex } from '../domain/indexes';
import { fmtTime } from '../domain/slots';
import type { Settings, Vacation } from '../domain/types';
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
  vacations = [],
}: {
  entries: CalendarEntry[];
  index: DatasetIndex;
  settings: Settings;
  hide?: ('teacher' | 'group')[];
  onEdit?: (id: string) => void;
  empty?: ReactNode;
  highlight?: Set<string>;
  /** Holidays to show among the days (only those inside the shown period). */
  vacations?: Vacation[];
}) {
  const { t, lang } = useI18n();
  const holidayName = useHolidayName();
  if (!entries.length) return <div className="card">{empty}</div>;
  const days = [...new Set(entries.map((e) => e.date))].sort();
  const today = new Date().toISOString().slice(0, 10);
  const fmt = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long' });
  // holidays that fall between the first and the last day shown
  const breaks = vacations.filter((v) => v.end >= days[0] && v.start <= days[days.length - 1]);
  const items = [
    ...days.map((date) => ({ date, vacation: undefined as Vacation | undefined })),
    ...breaks.map((v) => ({ date: v.start, vacation: v })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.vacation ? -1 : 1));

  return (
    <div className="exam-days">
      {items.map(({ date, vacation }) =>
        vacation ? (
          <section key={`v-${vacation.start}`} className="card exam-day vacation">
            <header>
              <strong>{holidayName(vacation)}</strong>
              <span>{vacation.start === vacation.end ? fmt(vacation.start) : `${fmt(vacation.start)} – ${fmt(vacation.end)}`}</span>
            </header>
            <p className="small muted" style={{ margin: 0, padding: '0 18px 14px' }}>
              {t('vacation.none')}
            </p>
          </section>
        ) : (
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
        ),
      )}
    </div>
  );
}
