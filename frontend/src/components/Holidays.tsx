// The university's holidays, shown on every timetable (public pages and admin).
import { parseDate, toDateString } from '../domain/changes';
import { evaluationOf, vacationOn } from '../domain/exams';
import type { Dataset } from '../domain/types';
import { dateLocale, useI18n } from '../i18n';

/** Holidays of the academic year; past ones dimmed. */
export function HolidaysCard({ dataset }: { dataset: Dataset }) {
  const { t, lang } = useI18n();
  const ev = evaluationOf(dataset);
  if (!ev.vacations.length) return null;
  const today = toDateString(new Date());
  const fmt = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' });
  return (
    <section className="card holidays">
      <div className="card-header">
        <h2>{t('vacation.title')}</h2>
      </div>
      <div className="card-body holidays-list">
        {[...ev.vacations]
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((v) => (
            <span key={`${v.start}-${v.name}`} className={`holiday ${v.end < today ? 'past' : ''}`}>
              <strong>{v.name}</strong>
              <span>{v.start === v.end ? fmt(v.start) : `${fmt(v.start)} – ${fmt(v.end)}`}</span>
            </span>
          ))}
      </div>
    </section>
  );
}

/** "Vacanța de iarnă: nu sunt ore" when today is a holiday. */
export function HolidayToday({ dataset }: { dataset: Dataset }) {
  const { t, lang } = useI18n();
  const v = vacationOn(evaluationOf(dataset), toDateString(new Date()));
  if (!v) return null;
  const fmt = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long' });
  return (
    <div className="card holiday-today">
      <div className="card-body">
        <strong>{t('vacation.now', { name: v.name })}</strong>
        <div className="small muted">{v.start === v.end ? fmt(v.start) : `${fmt(v.start)} – ${fmt(v.end)}`}</div>
      </div>
    </div>
  );
}
