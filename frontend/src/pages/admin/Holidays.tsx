// "Zile libere și vacanțe": the academic year's days off as a calendar, then the
// list. Public holidays and the university's breaks are worked out every year,
// so there is nothing to edit here.
import { useRef, useState } from 'react';
import { useHolidayName } from '../../components/Holidays';
import { Empty, PageHeader } from '../../components/ui';
import { parseDate, toDateString } from '../../domain/changes';
import { evaluationOf } from '../../domain/exams';
import { academicYearOf, holidayLength, type Holiday } from '../../domain/holidays';
import type { EvaluationSettings } from '../../domain/types';
import { dateLocale, useI18n } from '../../i18n';
import { useDataset } from '../../state/data';

export default function Holidays() {
  const { t, lang } = useI18n();
  const { dataset } = useDataset();
  const name = useHolidayName();
  // worked out every academic year (holidays.ts): only listed here, nothing to edit
  const ev: EvaluationSettings = evaluationOf(dataset);
  const holidays = ev.vacations as Holiday[];
  const year = academicYearOf(ev.semesterStart);
  const fmt = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' });
  // calendar ⇄ list: clicking a day off picks its holiday in the list, and the other way round
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useRef<Record<string, HTMLButtonElement | null>>({});
  const calendar = useRef<HTMLDivElement>(null);
  const pickFromCalendar = (id: string) => {
    setSelected(id);
    rows.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const pickFromList = (h: Holiday) => {
    setSelected(h.id);
    calendar.current?.querySelector(`[data-month="${h.start.slice(0, 7)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="page">
      <PageHeader title={t('nav.holidays')} subtitle={t('holidays.subtitle', { from: year, to: year + 1 })} />

      <div className="stack">
        <div ref={calendar}>
          <YearCalendar year={year} holidays={holidays} selected={selected} onSelect={pickFromCalendar} />
        </div>

        <section className="card">
          <div className="card-body stack" style={{ gap: 0 }}>
            {holidays.length === 0 && <Empty>{t('holidays.none')}</Empty>}
            {holidays.map((h) => (
              <button
                key={h.id}
                type="button"
                ref={(el) => {
                  rows.current[h.id] = el;
                }}
                className={`holiday-row ${h.id === selected ? 'selected' : ''}`}
                aria-pressed={h.id === selected}
                onClick={() => (h.id === selected ? setSelected(null) : pickFromList(h))}
              >
                <span className={`holiday-dot ${h.kind}`} aria-hidden="true" />
                <strong className="holiday-name">{name(h)}</strong>
                <span className="small muted">
                  {h.start === h.end ? fmt(h.start) : `${fmt(h.start)} – ${fmt(h.end)}`} · {t('holidays.days', { count: holidayLength(h) })}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** September → August, one small month per cell; days off coloured and clickable. */
function YearCalendar({
  year,
  holidays,
  selected,
  onSelect,
}: {
  year: number;
  holidays: Holiday[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const name = useHolidayName();
  const today = toDateString(new Date());
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, 8 + i, 1));
  const on = (d: string) => holidays.find((h) => h.start <= d && d <= h.end);
  const current = holidays.find((h) => h.id === selected);
  const fmtLong = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <section className="card">
      <div className="card-body">
        <div className="year-cal">
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
                    const cls = `year-cal-day ${h ? `off ${h.kind}` : ''} ${h && h.id === selected ? 'selected' : ''} ${weekend ? 'weekend' : ''} ${date === today ? 'today' : ''}`;
                    return h ? (
                      <button key={date} type="button" className={cls} title={name(h)} onClick={() => onSelect(h.id)}>
                        {i + 1}
                      </button>
                    ) : (
                      <span key={date} className={cls}>
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
