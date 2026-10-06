// Full calendar for reduced-attendance groups: every session (date range from
// Configurare), one column per real date the group meets, with the pairs that
// take place on that date (weekday + odd/even week + session).
import { lessonsOnDate, parseDate, sessionDates, toDateString } from '../domain/changes';
import { evaluationOf, vacationOn } from '../domain/exams';
import type { DatasetIndex } from '../domain/indexes';
import { fmtTime, range } from '../domain/slots';
import type { Dataset, Lesson } from '../domain/types';
import { dateLocale, useI18n } from '../i18n';
import { LessonCard, type LessonField } from './TimetableGrid';

export { sessionDates };

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
  /** Whose days to show; without it, the reduced form's days. */
  groupId?: string;
  hide?: LessonField[];
}) {
  const { t, lang } = useI18n();
  const { settings } = dataset;
  const days = groupId ? index.groupDays(groupId) : (settings.formDays?.reduced ?? [0, 1, 2, 3, 4, 5, 6]);
  const today = toDateString(new Date());
  const ev = evaluationOf(dataset);
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
                    {dates.map((d) => {
                      const holiday = vacationOn(ev, d);
                      return (
                        <div key={d} className={`tt-head ${d === today ? 'today' : holiday ? 'holiday-col' : ''}`} title={holiday?.name}>
                          {fmt(d, { weekday: 'short' })} {fmt(d, { day: '2-digit', month: '2-digit' })}
                          {holiday && <div className="small">{t('vacation.short')}</div>}
                        </div>
                      );
                    })}
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

/**
 * For weekly pages (teacher, room, group views): when the view also has
 * reduced-attendance session pairs, show them in their session calendar below.
 */
export function SessionsSection({
  dataset,
  index,
  lessons,
  hide,
}: {
  dataset: Dataset;
  index: DatasetIndex;
  lessons: Lesson[];
  hide?: LessonField[];
}) {
  const { t } = useI18n();
  if (!lessons.some((l) => l.date) || !dataset.settings.reducedSessions?.length) return null;
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      <div>
        <h2>{t('session.sectionTitle')}</h2>
        <p className="small muted">{t('session.sectionHint')}</p>
      </div>
      <SessionTimetable dataset={dataset} index={index} lessons={lessons} hide={hide} />
    </div>
  );
}
