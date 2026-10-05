// Full calendar for reduced-attendance groups: every session (date range from
// Configurare), one column per real date the group meets, with the pairs that
// take place on that date (weekday + odd/even week + session).
import type { DatasetIndex } from '../domain/indexes';
import { lessonsOnDate, parseDate, toDateString } from '../domain/changes';
import { fmtTime, range } from '../domain/slots';
import type { Dataset, Lesson } from '../domain/types';
import { dayIndexOf } from '../domain/views';
import { dateLocale, useI18n } from '../i18n';
import { LessonCard, type LessonField } from './TimetableGrid';

/** Every date from start to end (inclusive) that falls on one of the given weekdays. */
export function sessionDates(start: string, end: string, days: number[]): string[] {
  const out: string[] = [];
  const d = parseDate(start);
  const last = parseDate(end);
  while (d <= last) {
    if (days.includes(dayIndexOf(d))) out.push(toDateString(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function SessionTimetable({
  dataset,
  index,
  lessons,
  groupId,
  hide,
}: {
  dataset: Dataset;
  index: DatasetIndex;
  lessons: Lesson[];
  groupId: string;
  hide?: LessonField[];
}) {
  const { t, lang } = useI18n();
  const { settings } = dataset;
  const days = index.groupDays(groupId);
  const today = toDateString(new Date());
  const fmt = (s: string, o: Intl.DateTimeFormatOptions) => parseDate(s).toLocaleDateString(dateLocale(lang), o);

  return (
    <div className="stack">
      {settings.reducedSessions.map((s, i) => {
        const dates = sessionDates(s.start, s.end, days);
        const past = s.end < today;
        return (
          <section key={i} className="card" style={past ? { opacity: 0.6 } : undefined}>
            <div className="card-header">
              <h2>
                {t('setup.session')} {i + 1}
              </h2>
              <span className="muted small">
                {fmt(s.start, { day: '2-digit', month: 'long' })} – {fmt(s.end, { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
              <span className="spacer" />
              <span className="badge">{t('session.days', { count: dates.length })}</span>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {dates.length === 0 ? (
                <p className="muted">{t('session.noDays')}</p>
              ) : (
                <div className="tt-scroll">
                  <div className="tt" style={{ ['--days' as string]: dates.length }}>
                    <div className="tt-head" />
                    {dates.map((d) => (
                      <div key={d} className={`tt-head ${d === today ? 'today' : ''}`}>
                        {fmt(d, { weekday: 'short' })} {fmt(d, { day: '2-digit', month: '2-digit' })}
                      </div>
                    ))}
                    {range(settings.slots.length).map((slot) => (
                      <div key={slot} style={{ display: 'contents' }}>
                        <div className="tt-time">
                          <strong>{slot + 1}</strong>
                          <span>{fmtTime(settings.slots[slot].start, settings.timeFormat)}</span>
                          <span>{fmtTime(settings.slots[slot].end, settings.timeFormat)}</span>
                        </div>
                        {dates.map((d) => (
                          <div key={d} className="tt-cell">
                            {lessonsOnDate(dataset, lessons, d, index)
                              .filter((l) => l.slot === slot)
                              .map((l) => (
                                <LessonCard key={l.id} lesson={l} index={index} hide={hide} />
                              ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
