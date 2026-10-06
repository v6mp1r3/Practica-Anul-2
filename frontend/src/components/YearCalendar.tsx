// The academic year (September → August) as small months: holidays and days
// off coloured and clickable, plus optional periods such as the exam session.
import { parseDate, toDateString } from '../domain/changes';
import { holidayLength, type Holiday } from '../domain/holidays';
import { dateLocale, useI18n } from '../i18n';
import { useHolidayName } from './Holidays';

export interface CalendarPeriod {
  start: string;
  end: string;
  tone: 'session' | 'reduced' | 'reexam' | 'midterm';
  /** Tooltip on the days. */
  label: string;
  /** Legend text (defaults to the label). */
  legend?: string;
  /** Weekdays it uses (0 = Monday); other days of the range stay plain. */
  days?: number[];
}

/** September → August, one small month per cell; days off coloured and clickable. */
export function YearCalendar({
  year,
  holidays,
  selected = null,
  onSelect,
  periods = [],
  compact,
  fromMonth = 0,
  toMonth = 11,
}: {
  year: number;
  /** Months shown, counted from September (0) to August (11); default the whole year. */
  fromMonth?: number;
  toMonth?: number;
  holidays: Holiday[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** Periods drawn on the calendar too (exam session, retakes, atestare weeks…). */
  periods?: CalendarPeriod[];
  /** Two months per row (e.g. beside a form). */
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const name = useHolidayName();
  const today = toDateString(new Date());
  // September → August, or just the chosen months (e.g. one semester)
  const months = Array.from({ length: Math.max(1, toMonth - fromMonth + 1) }, (_, i) => new Date(year, 8 + fromMonth + i, 1));
  const on = (d: string) => holidays.find((h) => h.start <= d && d <= h.end);
  const inPeriod = (d: string) =>
    periods.find((p) => p.start <= d && d <= p.end && (!p.days || p.days.includes((parseDate(d).getDay() + 6) % 7)));
  const current = holidays.find((h) => h.id === selected);
  const fmtLong = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <section className="card">
      <div className="card-body">
        <div className={`year-cal ${compact ? 'compact' : ''}`}>
          {months.map((m) => {
            const first = (m.getDay() + 6) % 7;
            const count = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
            return (
              <div key={m.toISOString()} className="year-cal-month" data-month={toDateString(m).slice(0, 7)}>
                <div className="year-cal-title">{m.toLocaleDateString(dateLocale(lang), { month: 'long', year: 'numeric' })}</div>
                <div className="year-cal-grid">
                  {Array.from({ length: 7 }, (_, d) => (
                    <span key={`h${d}`} className="year-cal-dow">
                      {t(`dayShort.${d}` as 'dayShort.0').slice(0, 2)}
                    </span>
                  ))}
                  {Array.from({ length: first }, (_, i) => (
                    <span key={`e${i}`} />
                  ))}
                  {Array.from({ length: count }, (_, i) => {
                    const date = toDateString(new Date(m.getFullYear(), m.getMonth(), i + 1));
                    const h = on(date);
                    const weekend = (first + i) % 7 >= 5;
                    const p = inPeriod(date);
                    const cls = `year-cal-day ${h ? `off ${h.kind}` : ''} ${p && !h ? `period ${p.tone}` : ''} ${h && h.id === selected ? 'selected' : ''} ${weekend ? 'weekend' : ''} ${date === today ? 'today' : ''}`;
                    return h ? (
                      <button key={date} type="button" className={cls} title={name(h)} onClick={() => onSelect?.(h.id)}>
                        {i + 1}
                      </button>
                    ) : (
                      <span key={date} className={cls} title={p?.label}>
                        {i + 1}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {current && (
          <div className="year-cal-picked">
            <span className={`holiday-dot ${current.kind}`} aria-hidden="true" />
            <strong>{name(current)}</strong>
            <span className="small muted">
              {current.start === current.end ? fmtLong(current.start) : `${fmtLong(current.start)} – ${fmtLong(current.end)}`} ·{' '}
              {t('holidays.days', { count: holidayLength(current) })}
            </span>
          </div>
        )}
        <div className="year-cal-legend small muted">
          {[...new Map(periods.map((p) => [p.tone, p])).values()].map((p) => (
            <span key={p.tone}>
              <i className={`period-dot ${p.tone}`} /> {p.legend ?? p.label}
            </span>
          ))}
          <span>
            <i className="holiday-dot break" /> {t('holidays.breaks')}
          </span>
          <span>
            <i className="holiday-dot day" /> {t('holidays.daysOff')}
          </span>
        </div>
      </div>
    </section>
  );
}
