// "Zile libere și vacanțe": the academic year's days off as a calendar, then the
// list. Public holidays and the university's breaks are worked out every year;
// the administrator adds other days off (e.g. the city's day), removes them, and
// hides an automatic one that doesn't apply this year. Same for all faculties.
import { useRef, useState } from 'react';
import { api } from '../../api';
import { useHolidayName } from '../../components/Holidays';
import { Icon } from '../../components/Icon';
import { YearCalendar } from '../../components/YearCalendar';
import { DateInput, Empty, Field, PageHeader } from '../../components/ui';
import { parseDate } from '../../domain/changes';
import { DEFAULT_EVALUATION, evaluationOf } from '../../domain/exams';
import { academicYearOf, hiddenHolidays, holidayLength, type Holiday } from '../../domain/holidays';
import type { EvaluationSettings } from '../../domain/types';
import { dateLocale, useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';

export default function Holidays() {
  const { t, lang } = useI18n();
  const { dataset, refresh } = useDataset();
  const toast = useToast();
  const name = useHolidayName();
  // worked out every academic year (holidays.ts), plus the ones added here
  const ev: EvaluationSettings = evaluationOf(dataset);
  const stored: EvaluationSettings = { ...DEFAULT_EVALUATION, ...dataset.settings.evaluation };
  const hidden = hiddenHolidays(stored);
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

  // a new day off: a name and one day, or a few (from–to)
  const [draft, setDraft] = useState({ name: '', start: '', end: '' });
  const [saving, setSaving] = useState(false);
  const firstDay = `${year}-09-01`;
  const lastDay = `${year + 1}-08-31`;
  const draftEnd = draft.end || draft.start;
  const draftError = !draft.start
    ? ''
    : draft.start < firstDay || draftEnd > lastDay
      ? t('holidays.outside', { from: year, to: year + 1 })
      : draftEnd < draft.start
        ? t('holidays.endBeforeStart')
        : '';
  const canAdd = !!draft.name.trim() && !!draft.start && !draftError && !saving;

  async function save(patch: Partial<EvaluationSettings>, done: string) {
    setSaving(true);
    try {
      const saved = dataset.settings;
      await api.saveSettings({ ...saved, evaluation: { ...DEFAULT_EVALUATION, ...saved.evaluation, ...patch } });
      await refresh();
      setSelected(null);
      toast(done);
      return true;
    } catch {
      toast(t('common.error'), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function add() {
    if (!canAdd) return;
    const v = { name: draft.name.trim(), start: draft.start, end: draftEnd };
    if (await save({ vacations: [...stored.vacations, v] }, t('holidays.addedToast', { name: v.name })))
      setDraft({ name: '', start: '', end: '' });
  }

  /** An added one is deleted for good; an automatic one only for this year (it can be brought back). */
  function remove(h: Holiday) {
    if (h.auto) {
      if (!confirm(t('holidays.confirmRemoveAuto', { name: name(h) }))) return;
      return save({ holidayOverrides: { ...stored.holidayOverrides, [h.id]: null } }, t('holidays.removedToast', { name: name(h) }));
    }
    if (!confirm(t('common.confirmDelete', { name: name(h) }))) return;
    const i = Number(h.id.slice('custom:'.length));
    return save({ vacations: stored.vacations.filter((_, j) => j !== i) }, t('holidays.removedToast', { name: name(h) }));
  }

  function restore(h: Holiday) {
    const overrides = { ...stored.holidayOverrides };
    delete overrides[h.id];
    return save({ holidayOverrides: overrides }, t('holidays.restoredToast', { name: name(h) }));
  }

  return (
    <div className="page">
      <PageHeader title={t('nav.holidays')} subtitle={t('holidays.subtitle', { from: year, to: year + 1 })} />

      <div className="stack">
        <section className="card">
          <div className="card-header">
            <h2>{t('holidays.addTitle')}</h2>
          </div>
          <form
            className="card-body holiday-add"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Field label={t('common.name')}>
              <input
                className="input"
                value={draft.name}
                placeholder={t('holidays.newName')}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label={t('holidays.from')}>
              <DateInput value={draft.start} min={firstDay} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
            </Field>
            <Field label={t('holidays.to')}>
              <DateInput value={draft.end} min={draft.start || firstDay} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
            </Field>
            <button className="btn primary" type="submit" disabled={!canAdd}>
              <Icon name="plus" size={15} />
              {t('holidays.add')}
            </button>
            {draftError && <p className="small holiday-add-error">{draftError}</p>}
          </form>
        </section>

        <div ref={calendar}>
          <YearCalendar year={year} holidays={holidays} selected={selected} onSelect={pickFromCalendar} />
        </div>

        <section className="card">
          <div className="card-body stack" style={{ gap: 0 }}>
            {holidays.length === 0 && <Empty>{t('holidays.none')}</Empty>}
            {holidays.map((h) => (
              <div key={h.id} className="holiday-item">
                <button
                  type="button"
                  ref={(el) => {
                    rows.current[h.id] = el;
                  }}
                  className={`holiday-row ${h.id === selected ? 'selected' : ''}`}
                  aria-pressed={h.id === selected}
                  onClick={() => (h.id === selected ? setSelected(null) : pickFromList(h))}
                >
                  <span className={`holiday-dot ${h.kind}`} aria-hidden="true" />
                  <strong className="holiday-name">
                    <span>
                      {name(h)} {!h.auto && <span className="badge">{t('holidays.added')}</span>}
                    </span>
                  </strong>
                  <span className="small muted">
                    {h.start === h.end ? fmt(h.start) : `${fmt(h.start)} – ${fmt(h.end)}`} ·{' '}
                    {holidayLength(h) === 1 ? t('holidays.oneDay') : t('holidays.days', { count: holidayLength(h) })}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn ghost sm icon danger"
                  disabled={saving}
                  title={t('common.delete')}
                  aria-label={`${t('common.delete')}: ${name(h)}`}
                  onClick={() => void remove(h)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
            {hidden.length > 0 && (
              <div className="holidays-hidden small">
                <span className="muted">{t('holidays.hidden')}</span>
                {hidden.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="btn sm"
                    disabled={saving}
                    title={t('holidays.restore')}
                    onClick={() => void restore(h)}
                  >
                    <Icon name="plus" size={13} />
                    {name(h)}
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
