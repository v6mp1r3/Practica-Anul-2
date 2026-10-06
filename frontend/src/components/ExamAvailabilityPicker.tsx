// A teacher's availability during the final exams and retakes — separate from
// the weekly one, since there are no classes then. Each session day has a
// morning (before 13:00) and an afternoon half; click to mark it unavailable.
import { parseDate } from '../domain/changes';
import { evaluationOf, rangeDates } from '../domain/exams';
import type { Dataset } from '../domain/types';
import { dateLocale, useI18n } from '../i18n';

type Half = 'am' | 'pm';

export function ExamAvailabilityPicker({
  dataset,
  value,
  onChange,
}: {
  dataset: Dataset;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { t, lang } = useI18n();
  const ev = evaluationOf(dataset);
  const periods = [
    { label: t('setup.examSession'), ranges: ev.examSession },
    { label: t('setup.reducedExamSession'), ranges: ev.reducedExamSession },
    { label: t('setup.reexamSession'), ranges: ev.reexamSession },
  ];
  const off = (date: string, half: Half) => value.includes(date) || value.includes(`${date}|${half}`);
  // store a whole day as the date alone, a half day as "date|am" / "date|pm"
  const setDay = (date: string, am: boolean, pm: boolean) => {
    const rest = value.filter((x) => x !== date && !x.startsWith(`${date}|`));
    onChange(am && pm ? [...rest, date] : am ? [...rest, `${date}|am`] : pm ? [...rest, `${date}|pm`] : rest);
  };
  const toggle = (date: string, half: Half) => {
    const am = half === 'am' ? !off(date, 'am') : off(date, 'am');
    const pm = half === 'pm' ? !off(date, 'pm') : off(date, 'pm');
    setDay(date, am, pm);
  };
  const fmt = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { weekday: 'short', day: 'numeric', month: 'short' });
  const shown = new Set<string>();

  return (
    <div className="stack" style={{ gap: 12 }}>
      {periods.map((p) => {
        // a day shared by two periods (e.g. retakes and the reduced-attendance session) is listed once
        const dates = rangeDates(p.ranges, ev.examDays, ev.vacations).filter((d) => !shown.has(d) && shown.add(d));
        if (!dates.length) return null;
        return (
          <div key={p.label}>
            <div className="small muted" style={{ marginBottom: 6 }}>
              {p.label}
            </div>
            <div className="exam-avail">
              {dates.map((d) => (
                <div key={d} className="exam-avail-day">
                  <button
                    type="button"
                    className="exam-avail-date"
                    onClick={() => setDay(d, !(off(d, 'am') && off(d, 'pm')), !(off(d, 'am') && off(d, 'pm')))}
                  >
                    {fmt(d)}
                  </button>
                  {(['am', 'pm'] as Half[]).map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`exam-avail-half ${off(d, h) ? 'off' : ''}`}
                      aria-pressed={off(d, h)}
                      title={off(d, h) ? t('availability.unavailable') : t('availability.free')}
                      onClick={() => toggle(d, h)}
                    >
                      {t(h === 'am' ? 'examAvail.am' : 'examAvail.pm')}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
