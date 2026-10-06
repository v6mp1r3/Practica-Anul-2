// "Zile libere și vacanțe": the academic year's days off as a calendar, then the
// list. Public holidays and the university's breaks are worked out every year,
// so there is nothing to edit here.
import { useRef, useState } from 'react';
import { useHolidayName } from '../../components/Holidays';
import { YearCalendar } from '../../components/YearCalendar';
import { Empty, PageHeader } from '../../components/ui';
import { parseDate } from '../../domain/changes';
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
