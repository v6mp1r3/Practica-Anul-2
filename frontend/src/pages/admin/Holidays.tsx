// "Zile libere și vacanțe": the academic year's days off as a calendar, then the
// list. Public holidays and the university's breaks are worked out every year;
// the administrator can move or hide one, and add the faculty's own days off.
import { useState } from 'react';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { useHolidayName } from '../../components/Holidays';
import { Empty, PageHeader } from '../../components/ui';
import { parseDate, toDateString } from '../../domain/changes';
import { DEFAULT_EVALUATION } from '../../domain/exams';
import { academicYearOf, hiddenHolidays, holidayLength, holidaysOf, type Holiday } from '../../domain/holidays';
import type { EvaluationSettings, Vacation } from '../../domain/types';
import { dateLocale, useI18n } from '../../i18n';
import { useData, useDataset } from '../../state/data';
import { useToast } from '../../state/toast';

export default function Holidays() {
  const { t, lang } = useI18n();
  const { dataset, refresh } = useDataset();
  const { institutionTimeFormat } = useData();
  const toast = useToast();
  const name = useHolidayName();
  const ev: EvaluationSettings = { ...DEFAULT_EVALUATION, ...dataset.settings.evaluation };
  const holidays = holidaysOf(ev);
  const hidden = hiddenHolidays(ev);
  const year = academicYearOf(ev.semesterStart);
  const [draft, setDraft] = useState<Vacation>({ name: '', start: '', end: '' });

  async function save(patch: Partial<EvaluationSettings>) {
    try {
      await api.saveSettings({
        ...dataset.settings,
        timeFormat: institutionTimeFormat,
        evaluation: { ...ev, ...patch },
      });
      await refresh();
    } catch {
      toast(t('common.error'), 'error');
    }
  }

  const overrides = ev.holidayOverrides ?? {};
  const custom = ev.vacations;
  const customIndex = (h: Holiday) => Number(h.id.slice('custom:'.length));

  /** New dates for a day off: automatic ones are stored as a change for this year. */
  function move(h: Holiday, edge: 'start' | 'end', value: string) {
    if (!value) return;
    const next = { start: h.start, end: h.end, [edge]: value };
    if (next.end < next.start) next.end = next.start;
    if (h.auto) save({ holidayOverrides: { ...overrides, [h.id]: next } });
    else save({ vacations: custom.map((v, i) => (i === customIndex(h) ? { ...v, ...next } : v)) });
  }
  function remove(h: Holiday) {
    if (h.auto) save({ holidayOverrides: { ...overrides, [h.id]: null } });
    else save({ vacations: custom.filter((_, i) => i !== customIndex(h)) });
  }
  function restore(id: string) {
    const { [id]: _, ...rest } = overrides;
    save({ holidayOverrides: rest });
  }
  function rename(h: Holiday, value: string) {
    if (h.auto || !value.trim()) return;
    save({ vacations: custom.map((v, i) => (i === customIndex(h) ? { ...v, name: value.trim() } : v)) });
  }
  function add() {
    if (!draft.name.trim() || !draft.start) return;
    const end = draft.end && draft.end >= draft.start ? draft.end : draft.start;
    save({ vacations: [...custom, { name: draft.name.trim(), start: draft.start, end }] });
    setDraft({ name: '', start: '', end: '' });
  }

  const fmt = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="page">
      <PageHeader title={t('nav.holidays')} subtitle={t('holidays.subtitle', { from: year, to: year + 1 })} />

      <div className="stack">
        <YearCalendar year={year} holidays={holidays} />

        <section className="card">
          <div className="card-body stack" style={{ gap: 0 }}>
            {holidays.length === 0 && <Empty>{t('holidays.none')}</Empty>}
            {holidays.map((h) => {
              const moved = h.auto && !!overrides[h.id];
              return (
                <div key={h.id} className="holiday-row">
                  <span className={`holiday-dot ${h.kind}`} aria-hidden="true" />
                  <div className="holiday-name">
                    {h.auto ? (
                      <strong>{name(h)}</strong>
                    ) : (
                      <input
                        className="input"
                        defaultValue={h.name}
                        aria-label={t('vacation.name')}
                        onBlur={(e) => e.target.value !== h.name && rename(h, e.target.value)}
                      />
                    )}
                    <span className="small muted">
                      {h.start === h.end ? fmt(h.start) : `${fmt(h.start)} – ${fmt(h.end)}`} ·{' '}
                      {t('holidays.days', { count: holidayLength(h) })}
                      {!h.auto && ` · ${t('holidays.added')}`}
                      {moved && ` · ${t('holidays.moved')}`}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    {(['start', 'end'] as const).map((edge) => (
                      <input
                        key={edge}
                        className="input"
                        type="date"
                        style={{ width: 160 }}
                        value={h[edge]}
                        min={edge === 'end' ? h.start : undefined}
                        aria-label={`${name(h)} — ${t(`setup.${edge}`)}`}
                        onChange={(e) => move(h, edge, e.target.value)}
                      />
                    ))}
                    {moved && (
                      <button className="btn ghost sm" onClick={() => restore(h.id)}>
                        {t('holidays.reset')}
                      </button>
                    )}
                    <button
                      className="btn ghost sm icon danger"
                      onClick={() => remove(h)}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* the faculty's own days off (e.g. a rector's order, the city's day) */}
            <div className="holiday-row add">
              <span className="holiday-dot" aria-hidden="true" />
              <div className="holiday-name">
                <input
                  className="input"
                  value={draft.name}
                  placeholder={t('holidays.newName')}
                  aria-label={t('vacation.name')}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  type="date"
                  style={{ width: 160 }}
                  value={draft.start}
                  aria-label={t('setup.start')}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                />
                <input
                  className="input"
                  type="date"
                  style={{ width: 160 }}
                  value={draft.end}
                  min={draft.start || undefined}
                  aria-label={t('setup.end')}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
                <button className="btn sm primary" onClick={add} disabled={!draft.name.trim() || !draft.start}>
                  <Icon name="plus" size={14} />
                  {t('holidays.add')}
                </button>
              </div>
            </div>

            {hidden.length > 0 && (
              <div className="holidays-hidden small muted">
                {t('holidays.hidden')}{' '}
                {hidden.map((h) => (
                  <button key={h.id} className="btn ghost sm" onClick={() => restore(h.id)}>
                    {name(h)} ↺
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** September → August, one small month per cell; days off coloured. */
function YearCalendar({ year, holidays }: { year: number; holidays: Holiday[] }) {
  const { t, lang } = useI18n();
  const name = useHolidayName();
  const today = toDateString(new Date());
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, 8 + i, 1));
  const on = (d: string) => holidays.find((h) => h.start <= d && d <= h.end);

  return (
    <section className="card">
      <div className="card-body">
        <div className="year-cal">
          {months.map((m) => {
            const first = (m.getDay() + 6) % 7;
            const count = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
            return (
              <div key={m.toISOString()} className="year-cal-month">
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
                    return (
                      <span
                        key={date}
                        className={`year-cal-day ${h ? `off ${h.kind}` : ''} ${weekend ? 'weekend' : ''} ${date === today ? 'today' : ''}`}
                        title={h ? name(h) : undefined}
                      >
                        {i + 1}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
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
