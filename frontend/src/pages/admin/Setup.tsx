// Institution setup — split into small ranked steps, each field with a
// default value, so only what differs from the defaults has to be filled in.
import { useEffect, useState, type ReactNode } from 'react';
import { api, API_MODE } from '../../api';
import { resetMockData } from '../../api/mock';
import { useAdminScope } from '../../components/FacultyFilter';
import { Icon } from '../../components/Icon';
import { DateInput, Field, PageHeader, Segmented, Switch, TimeInput, useClock } from '../../components/ui';
import { fmtTime, parseTime, range } from '../../domain/slots';
import { DEFAULT_EVALUATION, DEFAULT_MASTER, evaluationOf, midtermRange, teachingWeek } from '../../domain/exams';
import { parseDate, toDateString } from '../../domain/changes';
import { semesterChoices, semesterOf, semesterStartOf } from '../../domain/holidays';
import {
  STUDY_FORMS,
  type EvaluationSettings,
  type MasterEvaluation,
  type Settings,
  type StudyCycle,
  type TimeSlot,
  type GroupPeriod,
} from '../../domain/types';
import { UTM_FACULTIES, UTM_NAME } from '../../domain/utm';
import { YearCalendar, type CalendarPeriod } from '../../components/YearCalendar';
import { academicYearOf, type Holiday } from '../../domain/holidays';
import { dateLocale, useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useData, useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import { Select } from '../../components/Select';
import { GroupPicker } from '../../components/GroupPicker';

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Build `count` pairs from a start time, pair length and break length. */
export function buildSlots(start: string, lessonMinutes: number, breakMinutes: number, count: number): TimeSlot[] {
  const out: TimeSlot[] = [];
  let t = toMin(start);
  for (let i = 0; i < count; i++) {
    out.push({ start: toHHMM(t), end: toHHMM(t + lessonMinutes) });
    t += lessonMinutes + breakMinutes;
  }
  return out;
}

/** "Toamna 2026/2027" in the viewer's language. */
const semesterLabel = (value: string, t: (k: 'setup.autumn' | 'setup.spring') => string) =>
  value.replace(/^Toamna/, t('setup.autumn')).replace(/^Primăvara/, t('setup.spring'));

function Step({
  n,
  title,
  required,
  onSave,
  saving,
  dirty,
  saved,
  children,
}: {
  n: number;
  title: string;
  required?: boolean;
  /** Saves this section only. */
  onSave: () => void;
  saving?: boolean;
  /** This section has unsaved changes (the button only shows then). */
  dirty: boolean;
  /** Just saved: shows "Salvat" until the next change. */
  saved: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="card">
      <div className="card-header">
        <span className="step-num">{n}</span>
        <h2>{title}</h2>
        {required && <span className="badge danger">{t('setup.required')}</span>}
      </div>
      <div className="card-body stack">
        {children}
        {(dirty || saved) && (
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {dirty ? (
              <button className="btn primary" onClick={onSave} disabled={saving}>
                <Icon name="check" />
                {t('common.save')}
              </button>
            ) : (
              <span className="saved-note">
                <Icon name="check" size={15} />
                {t('common.saved')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The settings each section of Configurare owns (saved by its own button). */
const SECTION_KEYS: Record<number, (keyof Settings)[]> = {
  1: ['semester', 'institutionName'],
  2: ['formDays', 'formMaxPairs', 'reducedSessions'],
  3: ['workingDays', 'lessonMinutes', 'timeFormat', 'slots', 'yearShifts', 'masterYearShifts'],
  4: ['weekParity'],
  5: ['minPairsPerDayGroup', 'maxPairsPerDayGroup', 'maxPairsPerDayTeacher', 'consultationRequired'],
  6: ['evaluation'],
  7: ['groupPeriods'],
};

/** Configurare → Evaluări → Atestări: the settings its own save button stores (the rest is Examene finale). */
const MIDTERM_KEYS: (keyof EvaluationSettings)[] = [
  'semesterStart',
  'midtermWeeks',
  'midtermSpanWeeks',
  'midtermRetakeWeeks',
  'midtermMode',
  'midtermStartTimes',
  'midtermMinutes',
];
/** Days off are edited on their own page (Zile libere și vacanțe). */
const HOLIDAY_KEYS: (keyof EvaluationSettings)[] = ['vacations', 'holidayOverrides'];
const tabKeys = (tab: 'midterms' | 'finals') =>
  (Object.keys(DEFAULT_EVALUATION) as (keyof EvaluationSettings)[]).filter(
    (k) => !HOLIDAY_KEYS.includes(k) && MIDTERM_KEYS.includes(k) === (tab === 'midterms'),
  );

/** Master's start of semester is "N weeks after licență" (it rolls over with it). */
const masterOffset = (st: Settings) => ({ ...DEFAULT_MASTER, ...st.masterEvaluation }).startOffsetWeeks ?? 4;

/** The evaluation settings a Configurare tab shows: licență, or licență with the master overrides. */
function evalFor(st: Settings, cycle: StudyCycle): EvaluationSettings {
  const lic = { ...DEFAULT_EVALUATION, ...st.evaluation };
  if (cycle === 'licenta') return lic;
  const { startOffsetWeeks: _o, ...m } = { ...DEFAULT_MASTER, ...st.masterEvaluation };
  const start = parseDate(semesterStartOf(lic.semesterStart));
  start.setDate(start.getDate() + 7 * masterOffset(st));
  return { ...lic, ...m, semesterStart: toDateString(start) };
}

const withoutStart = ({ semesterStart: _s, ...rest }: Partial<EvaluationSettings>) => rest;

export default function Setup() {
  const { t, lang } = useI18n();
  const { dataset, refresh } = useDataset();
  const toast = useToast();
  const { institutionTimeFormat } = useData();
  const [s, setS] = useState<Settings>({ ...dataset.settings, timeFormat: institutionTimeFormat });
  const [breakMin, setBreakMin] = useState(15);
  const { user, setUser } = useAuth();
  const [faculty, setFaculty] = useState(user?.faculty ?? '');
  const clock = useClock();
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<number | string | null>(null);
  // as many years as the longest programme (at least 4, at most 6)
  const shiftYears = Math.min(6, Math.max(4, ...dataset.groups.map((g) => g.programYears ?? g.year)));
  const [evalTab, setEvalTab] = useState<'midterms' | 'finals'>('midterms');
  // Stagii de practică: the faculty's groups, by cycle and year
  const scope = useAdminScope();
  const myGroupIds = dataset.groups.filter((g) => !scope || g.faculty === scope).map((g) => g.id);
  // a period's groups: licență and master's each in the group picker (by year, then a line per specialty)
  const periodCycles = (['licenta', 'master'] as StudyCycle[])
    .map((cy) => ({ cycle: cy, groups: dataset.groups.filter((g) => myGroupIds.includes(g.id) && (g.cycle ?? 'licenta') === cy) }))
    .filter((x) => x.groups.length > 0);
  // Licență | Master: master's tab shows licență's settings with the master overrides on top
  const [evCycle, setEvCycle] = useState<StudyCycle>('licenta');
  const [shiftCycle, setShiftCycle] = useState<StudyCycle>('licenta');
  const ev = evalFor(s, evCycle);
  // the year's days off, worked out from the semester being edited (green on the calendar)
  const holidays = evaluationOf({ ...dataset, settings: s }).vacations as Holiday[];
  // months on the calendar (0 = September): the semester's six by default, follows the semester picked
  const spring = s.semester.startsWith('Primăvara');
  const [calRange, setCalRange] = useState<[number, number]>(spring ? [5, 10] : [0, 5]);
  useEffect(() => setCalRange(spring ? [5, 10] : [0, 5]), [spring]);
  const monthName = (m: number) => new Date(2000, 8 + m, 1).toLocaleDateString(dateLocale(lang), { month: 'long' });
  // what each tab draws on the calendar
  const midtermPeriods: CalendarPeriod[] = ([1, 2] as const).map((n, i) => ({
    ...midtermRange(ev, n),
    tone: 'midterm',
    days: ev.examDays,
    label: t('exams.midterm', { n: i + 1 }),
    legend: t('exams.midterms'),
  }));
  // the retake weeks of the atestări, on the same calendar
  midtermPeriods.push(
    ...ev.midtermRetakeWeeks.map((w, i) => ({
      ...teachingWeek(ev, w),
      tone: 'reexam' as const,
      days: ev.examDays,
      label: t('exams.remidterm', { n: i + 1 }),
      legend: t('exams.reexams'),
    })),
  );
  const filled = (r: { start: string; end: string }) => !!r.start && !!r.end && r.start <= r.end;
  const examPeriods: CalendarPeriod[] = [
    ...ev.examSession.filter(filled).map((r) => ({ ...r, days: ev.examDays, tone: 'session' as const, label: t('setup.examSession') })),
    ...ev.reducedExamSession
      .filter(filled)
      .map((r) => ({ ...r, days: ev.reducedExamDays, tone: 'reduced' as const, label: t('setup.reducedExamSession') })),
    ...ev.reexamSession.filter(filled).map((r) => ({ ...r, days: ev.examDays, tone: 'reexam' as const, label: t('setup.reexamSession') })),
  ];
  const setEv = (patch: Partial<EvaluationSettings>) =>
    setS((x) =>
      evCycle === 'master'
        ? // master's start is set as an offset from licență, not a date
          { ...x, masterEvaluation: { ...DEFAULT_MASTER, ...x.masterEvaluation, ...withoutStart(patch) } }
        : { ...x, evaluation: { ...DEFAULT_EVALUATION, ...x.evaluation, ...patch } },
    );
  const setMasterOffset = (weeks: number) =>
    setS((x) => ({ ...x, masterEvaluation: { ...DEFAULT_MASTER, ...x.masterEvaluation, startOffsetWeeks: weeks } }));
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));

  async function save(section: number) {
    setSaving(true);
    try {
      const clean: Settings = {
        ...s,
        faculties: s.faculties.map((f) => f.trim()).filter(Boolean),
        reducedSessions: s.reducedSessions.filter((x) => x.start && x.end && x.start <= x.end),
        institutionName: UTM_NAME,
        evaluation: {
          ...ev,
          examSession: ev.examSession.filter((x) => x.start && x.end && x.start <= x.end),
          reducedExamSession: ev.reducedExamSession.filter((x) => x.start && x.end && x.start <= x.end),
          reexamSession: ev.reexamSession.filter((x) => x.start && x.end && x.start <= x.end),
        },
        yearShifts: s.yearShifts?.map((x) => ({
          first: Math.min(x.first, s.slots.length - 1),
          last: Math.min(x.last, s.slots.length - 1),
        })),
        groupPeriods: (s.groupPeriods ?? []).filter((p) => p.start && p.end && p.start <= p.end && p.groupIds.length),
        masterYearShifts: s.masterYearShifts?.map((x) => ({
          first: Math.min(x.first, s.slots.length - 1),
          last: Math.min(x.last, s.slots.length - 1),
        })),
      };
      // only this section's settings; the others stay as last saved
      const saved: Settings = { ...dataset.settings, timeFormat: institutionTimeFormat };
      const own: Partial<Settings> = Object.fromEntries(SECTION_KEYS[section].map((k) => [k, clean[k]]));
      // days off are edited on their own page (Zile libere și vacanțe): keep them as stored
      const storedEv = { ...DEFAULT_EVALUATION, ...saved.evaluation };
      // Evaluări: only the open tab (atestări or examene finale); the other tab stays as last saved
      if (section === 6 && evCycle === 'licenta') {
        const keys = tabKeys(evalTab);
        own.evaluation = {
          ...storedEv,
          ...(Object.fromEntries(keys.map((k) => [k, clean.evaluation![k]])) as Partial<EvaluationSettings>),
        };
      } else if (section === 6) {
        // master's: only its overrides, for the open tab
        delete own.evaluation;
        const keys = tabKeys(evalTab).filter((k) => k !== 'semesterStart');
        own.masterEvaluation = {
          ...DEFAULT_MASTER,
          ...saved.masterEvaluation,
          ...(Object.fromEntries(keys.map((k) => [k, clean.evaluation![k]])) as MasterEvaluation),
          ...(evalTab === 'midterms' ? { startOffsetWeeks: masterOffset(s) } : {}),
        };
      }
      await api.saveSettings({ ...saved, ...own });
      // the form now shows exactly what was stored (e.g. empty rows dropped)
      setS((x) => ({ ...x, ...own }));
      // the administrator's own faculty is part of their account (section 1)
      if (section === 1 && user && faculty && faculty !== user.faculty) {
        setUser(
          await api.updateProfile({
            name: user.name,
            email: user.email,
            phone: user.phone,
            emailNotifications: user.emailNotifications,
            faculty,
          }),
        );
      }
      await refresh();
      setJustSaved(section === 6 ? `6-${evCycle}-${evalTab}` : section);
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  }

  // what is stored, to know which sections have unsaved changes
  const stored: Settings = { ...dataset.settings, timeFormat: institutionTimeFormat };
  const norm = (k: keyof Settings, v: Settings[keyof Settings]) =>
    JSON.stringify(k === 'evaluation' ? { ...DEFAULT_EVALUATION, ...(v as Settings['evaluation']) } : (v ?? null));
  // Evaluări compares the open tab's settings only (days off live on their own page)
  const evPart = (st: Settings, cycle: StudyCycle, tab: 'midterms' | 'finals') => {
    const full = evalFor(st, cycle);
    return JSON.stringify([...tabKeys(tab).map((k) => full[k]), cycle === 'master' && tab === 'midterms' ? masterOffset(st) : 0]);
  };
  const tabDirty = (tab: 'midterms' | 'finals', cycle: StudyCycle = evCycle) => evPart(s, cycle, tab) !== evPart(stored, cycle, tab);
  const cycleDirty = (cycle: StudyCycle) => tabDirty('midterms', cycle) || tabDirty('finals', cycle);
  const dirty = (section: number) =>
    section === 6
      ? tabDirty(evalTab)
      : SECTION_KEYS[section].some((k) => k !== 'institutionName' && norm(k, s[k]) !== norm(k, stored[k])) ||
        (section === 1 && !!faculty && faculty !== user?.faculty);
  const step = (n: number) => ({
    onSave: () => save(n),
    saving,
    dirty: dirty(n),
    saved: justSaved === (n === 6 ? `6-${evCycle}-${evalTab}` : n) && !dirty(n),
  });

  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

  return (
    <div className="page">
      <PageHeader
        title={t('nav.setup')}
        actions={
          <>
            {API_MODE === 'mock' && (
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm(t('setup.resetConfirm'))) return;
                  resetMockData();
                  await refresh();
                  setS(dataset.settings);
                  window.location.reload();
                }}
              >
                {t('setup.reset')}
              </button>
            )}
          </>
        }
      />

      <div className="stack">
        <Step n={1} {...step(1)} title={t('setup.institution')} required>
          <div className="form-grid">
            {/* UTM only: the institution is fixed, the administrator picks their faculty */}
            <Field label={t('setup.institutionName')}>
              <input className="input" value={UTM_NAME} readOnly disabled />
            </Field>
            <Field label={t('setup.myFaculty')}>
              <Select value={faculty} onChange={(e) => setFaculty(e.target.value)} aria-label={t('setup.myFaculty')}>
                <option value="">{t('setup.chooseFaculty')}</option>
                {UTM_FACULTIES.map((f) => (
                  <option key={f.code} value={f.name}>
                    {f.name.replace(/^Facultatea (de )?/, '')} ({f.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('setup.semester')}>
              {/* only this academic year's two semesters; a new year takes over by itself */}
              <Select value={semesterOf(s.semester)} onChange={(e) => set('semester', e.target.value)} aria-label={t('setup.semester')}>
                {semesterChoices().map((v) => (
                  <option key={v} value={v}>
                    {semesterLabel(v, t)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Step>

        <Step n={2} {...step(2)} title={t('setup.forms')}>
          <div className="stack" style={{ gap: 10 }}>
            {STUDY_FORMS.map((form) => (
              <div key={form} className="row wrap" style={{ gap: 12 }}>
                <strong style={{ minWidth: 150 }}>{t(`form.${form}`)}</strong>
                <div className="checks">
                  {range(s.workingDays).map((d) => (
                    <label key={d} className="check">
                      <input
                        type="checkbox"
                        checked={s.formDays[form].includes(d)}
                        onChange={(e) =>
                          set('formDays', {
                            ...s.formDays,
                            [form]: e.target.checked ? [...s.formDays[form], d].sort() : s.formDays[form].filter((x) => x !== d),
                          })
                        }
                      />
                      {t(`dayShort.${d}` as 'dayShort.0')}
                    </label>
                  ))}
                </div>
                <label className="row" style={{ gap: 8, marginLeft: 'auto' }}>
                  <span className="small muted">{t('setup.formMaxPairs')}</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={s.slots.length}
                    style={{ width: 72 }}
                    value={s.formMaxPairs[form]}
                    onChange={(e) => set('formMaxPairs', { ...s.formMaxPairs, [form]: num(e.target.value, 1) })}
                  />
                </label>
              </div>
            ))}
          </div>

          {/* Reduced attendance meets only during its sessions */}
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <h3>{t('setup.sessions')}</h3>
            {s.reducedSessions.map((sess, i) => (
              <div key={i} className="row wrap">
                <span className="small muted" style={{ minWidth: 70 }}>
                  {t('setup.session')} {i + 1}
                </span>
                <DateInput
                  style={{ width: 170 }}
                  value={sess.start}
                  aria-label={`${t('setup.session')} ${i + 1} — ${t('setup.start')}`}
                  onChange={(e) =>
                    set(
                      'reducedSessions',
                      s.reducedSessions.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                    )
                  }
                />
                <span className="muted">–</span>
                <DateInput
                  style={{ width: 170 }}
                  value={sess.end}
                  min={sess.start}
                  aria-label={`${t('setup.session')} ${i + 1} — ${t('setup.end')}`}
                  onChange={(e) =>
                    set(
                      'reducedSessions',
                      s.reducedSessions.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                    )
                  }
                />
                <button
                  className="btn ghost sm icon danger"
                  onClick={() =>
                    set(
                      'reducedSessions',
                      s.reducedSessions.filter((_, j) => j !== i),
                    )
                  }
                  aria-label={t('common.delete')}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
            <div>
              <button className="btn sm" onClick={() => set('reducedSessions', [...s.reducedSessions, { start: '', end: '' }])}>
                <Icon name="plus" size={14} />
                {t('setup.session')}
              </button>
            </div>
          </div>
        </Step>

        <Step n={3} {...step(3)} title={t('setup.week')} required>
          <div className="form-grid">
            <Field label={t('setup.workingDays')} hint={t('setup.default', { value: 7 })}>
              <Select className="select" value={s.workingDays} onChange={(e) => set('workingDays', Number(e.target.value))}>
                {[5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} ({t('day.0')}–{t(`day.${n - 1}` as 'day.0')})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('setup.lessonMinutes')} hint={t('setup.default', { value: 90 })}>
              <input
                className="input"
                type="number"
                min={30}
                value={s.lessonMinutes}
                onChange={(e) => set('lessonMinutes', num(e.target.value, 30))}
              />
            </Field>
            <Field label={t('setup.breakMinutes')} hint={t('setup.default', { value: 15 })}>
              <input className="input" type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(num(e.target.value))} />
            </Field>
            <Field label={t('setup.timeFormat')} hint={t('setup.default', { value: t('setup.timeFormat24') })}>
              <Select value={s.timeFormat ?? '24h'} onChange={(e) => set('timeFormat', e.target.value as '24h' | '12h')}>
                <option value="24h">
                  {fmtTime(clock, '24h')} ({t('setup.timeFormat24')})
                </option>
                <option value="12h">
                  {fmtTime(clock, '12h')} ({t('setup.timeFormat12')})
                </option>
              </Select>
            </Field>
          </div>

          <div>
            <div className="row" style={{ marginBottom: 8 }}>
              <h3>{t('setup.slots')}</h3>
              <span className="spacer" />
              <button
                className="btn sm"
                onClick={() => set('slots', buildSlots(s.slots[0]?.start ?? '08:00', s.lessonMinutes, breakMin, s.slots.length || 7))}
              >
                {t('setup.rebuildSlots')}
              </button>
              <button
                className="btn sm"
                onClick={() => {
                  const last = s.slots[s.slots.length - 1];
                  const start = last ? toHHMM(toMin(last.end) + breakMin) : '08:00';
                  set('slots', [...s.slots, { start, end: toHHMM(toMin(start) + s.lessonMinutes) }]);
                }}
              >
                <Icon name="plus" size={14} />
                {t('setup.addSlot')}
              </button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('tt.pair')}</th>
                    <th>{t('setup.start')}</th>
                    <th>{t('setup.end')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {s.slots.map((slot, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <TimeInput
                          value={slot.start}
                          format={s.timeFormat}
                          aria-label={`${t('tt.pair')} ${i + 1} — ${t('setup.start')}`}
                          onChange={(v) =>
                            set(
                              'slots',
                              s.slots.map((x, j) => (j === i ? { ...x, start: v } : x)),
                            )
                          }
                        />
                      </td>
                      <td>
                        <TimeInput
                          value={slot.end}
                          format={s.timeFormat}
                          aria-label={`${t('tt.pair')} ${i + 1} — ${t('setup.end')}`}
                          onChange={(v) =>
                            set(
                              'slots',
                              s.slots.map((x, j) => (j === i ? { ...x, end: v } : x)),
                            )
                          }
                        />
                      </td>
                      <td className="actions">
                        <button
                          className="btn ghost sm danger"
                          onClick={() =>
                            set(
                              'slots',
                              s.slots.filter((_, j) => j !== i),
                            )
                          }
                          aria-label={t('common.delete')}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Part of the day per year of study (programmes last 3–6 years) */}
          <div className="stack" style={{ gap: 8 }}>
            <h3>{t('setup.shifts')}</h3>
            <p className="small muted">{t('setup.shiftsHint')}</p>
            {/* licență's years, or master's (usually evenings) */}
            <Segmented
              value={shiftCycle}
              onChange={setShiftCycle}
              options={[
                { value: 'licenta', label: t('cycle.licenta') },
                { value: 'master', label: t('cycle.master') },
              ]}
            />
            {range(shiftCycle === 'master' ? 2 : shiftYears).map((y) => {
              const key = shiftCycle === 'master' ? 'masterYearShifts' : 'yearShifts';
              const years = shiftCycle === 'master' ? 2 : shiftYears;
              const shift = s[key]?.[y] ?? { first: 0, last: s.slots.length - 1 };
              const setShift = (v: Partial<typeof shift>) => {
                const next = range(years).map((i) => s[key]?.[i] ?? { first: 0, last: s.slots.length - 1 });
                next[y] = { ...shift, ...v };
                if (next[y].last < next[y].first)
                  next[y] = v.first !== undefined ? { ...next[y], last: next[y].first } : { ...next[y], first: next[y].last };
                set(key, next);
              };
              const pairOption = (i: number, edge: 'start' | 'end') => (
                <option key={i} value={i}>
                  {i + 1} · {fmtTime(s.slots[i][edge], s.timeFormat)}
                </option>
              );
              return (
                <div key={y} className="row wrap">
                  <strong style={{ minWidth: 70 }}>{t('setup.year', { n: y + 1 })}</strong>
                  <span className="small muted">{t('setup.fromPair')}</span>
                  <Select
                    style={{ width: 150 }}
                    value={Math.min(shift.first, s.slots.length - 1)}
                    onChange={(e) => setShift({ first: Number(e.target.value) })}
                  >
                    {range(s.slots.length).map((i) => pairOption(i, 'start'))}
                  </Select>
                  <span className="small muted">{t('setup.toPair')}</span>
                  <Select
                    style={{ width: 150 }}
                    value={Math.min(shift.last, s.slots.length - 1)}
                    onChange={(e) => setShift({ last: Number(e.target.value) })}
                  >
                    {range(s.slots.length).map((i) => pairOption(i, 'end'))}
                  </Select>
                </div>
              );
            })}
          </div>
        </Step>

        <Step n={4} {...step(4)} title={t('setup.parity')}>
          <div className="row">
            <Switch checked={s.weekParity} onChange={(v) => set('weekParity', v)} label={t('setup.parityQuestion')} />
            <div>
              <strong>{t('setup.parityQuestion')}</strong>
              <div className="small muted">{t('setup.parityHint')}</div>
            </div>
          </div>
        </Step>

        <Step n={5} {...step(5)} title={t('setup.limits')}>
          <div className="form-grid">
            <Field label={t('setup.minPairsGroup')} hint={t('setup.default', { value: 2 })}>
              <input
                className="input"
                type="number"
                min={0}
                value={s.minPairsPerDayGroup}
                onChange={(e) => set('minPairsPerDayGroup', num(e.target.value))}
              />
            </Field>
            <Field label={t('setup.maxPairsTeacher')} hint={t('setup.default', { value: 5 })}>
              <input
                className="input"
                type="number"
                min={1}
                value={s.maxPairsPerDayTeacher}
                onChange={(e) => set('maxPairsPerDayTeacher', num(e.target.value, 1))}
              />
            </Field>
          </div>
          <div className="row">
            <Switch checked={s.consultationRequired} onChange={(v) => set('consultationRequired', v)} label={t('setup.consultation')} />
            <div>
              <strong>{t('setup.consultation')}</strong>
              <div className="small muted">{t('setup.consultationHint')}</div>
            </div>
          </div>
        </Step>

        <Step n={6} {...step(6)} title={t('setup.evaluation')}>
          {/* licență or master's, then atestări / final exams; a dot marks unsaved changes */}
          <Segmented
            value={evCycle}
            onChange={setEvCycle}
            options={[
              { value: 'licenta', label: t('cycle.licenta') + (cycleDirty('licenta') ? ' •' : '') },
              { value: 'master', label: t('cycle.master') + (cycleDirty('master') ? ' •' : '') },
            ]}
          />
          <Segmented
            value={evalTab}
            onChange={setEvalTab}
            options={[
              // a dot marks a tab with unsaved changes
              { value: 'midterms', label: t('exams.midterms') + (tabDirty('midterms') ? ' •' : '') },
              { value: 'finals', label: t('exams.exams') + (tabDirty('finals') ? ' •' : '') },
            ]}
          />
          {/* settings on the left; the year with its holidays (and this tab's periods) on the right */}
          <div className={`eval-layout ${evalTab === 'midterms' ? 'below' : ''}`}>
            <div className="stack">
              {evalTab === 'midterms' ? (
                <div className="stack">
                  <div className="form-grid">
                    {evCycle === 'master' ? (
                      <Field
                        label={t('setup.masterOffset')}
                        hint={t('setup.masterStartsOn', {
                          date: parseDate(ev.semesterStart).toLocaleDateString(dateLocale(lang), {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          }),
                        })}
                      >
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={10}
                          value={masterOffset(s)}
                          onChange={(e) => setMasterOffset(num(e.target.value))}
                        />
                      </Field>
                    ) : (
                      <Field label={t('setup.semesterStart')}>
                        <DateInput value={semesterStartOf(ev.semesterStart)} onChange={(e) => setEv({ semesterStart: e.target.value })} />
                      </Field>
                    )}
                    <Field label={t('setup.midtermWeeks')}>
                      <div className="row" style={{ gap: 8 }}>
                        {[0, 1].map((i) => (
                          <input
                            key={i}
                            className="input"
                            type="number"
                            min={1}
                            max={20}
                            style={{ width: 80 }}
                            aria-label={t('exams.midterm', { n: i + 1 })}
                            value={ev.midtermWeeks[i]}
                            onChange={(e) => {
                              const w = [...ev.midtermWeeks] as [number, number];
                              w[i] = num(e.target.value, 1);
                              setEv({ midtermWeeks: w });
                            }}
                          />
                        ))}
                      </div>
                    </Field>
                    <Field label={t('setup.midtermSpanWeeks')} hint={t('setup.default', { value: 2 })}>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={4}
                        value={ev.midtermSpanWeeks}
                        onChange={(e) => setEv({ midtermSpanWeeks: num(e.target.value, 1) })}
                      />
                    </Field>
                    <Field label={t('setup.midtermRetakeWeeks')}>
                      <div className="row" style={{ gap: 8 }}>
                        {[0, 1].map((i) => (
                          <input
                            key={i}
                            className="input"
                            type="number"
                            min={1}
                            max={20}
                            style={{ width: 80 }}
                            aria-label={t('exams.remidterm', { n: i + 1 })}
                            value={ev.midtermRetakeWeeks[i]}
                            onChange={(e) => {
                              const w = [...ev.midtermRetakeWeeks] as [number, number];
                              w[i] = num(e.target.value, 1);
                              setEv({ midtermRetakeWeeks: w });
                            }}
                          />
                        ))}
                      </div>
                    </Field>
                    <Field label={t('setup.midtermMode')}>
                      <Select value={ev.midtermMode} onChange={(e) => setEv({ midtermMode: e.target.value as 'inClass' | 'separate' })}>
                        <option value="inClass">{t('setup.midtermInClass')}</option>
                        <option value="separate">{t('setup.midtermSeparate')}</option>
                      </Select>
                    </Field>
                    {ev.midtermMode === 'separate' && (
                      <Field label={t('setup.midtermTimes')} hint={t('setup.timesHint')}>
                        <TimesInput value={ev.midtermStartTimes} onChange={(v) => setEv({ midtermStartTimes: v })} />
                      </Field>
                    )}
                  </div>
                </div>
              ) : (
                <div className="stack">
                  {(
                    [
                      ['examSession', 'setup.examSession'],
                      ['reducedExamSession', 'setup.reducedExamSession'],
                      ['reexamSession', 'setup.reexamSession'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="stack" style={{ gap: 8 }}>
                      <h3>{t(label)}</h3>
                      {ev[key].map((r, i) => (
                        <div key={i} className="row wrap">
                          <span className="small muted" style={{ minWidth: 70 }}>
                            {t('setup.period')} {i + 1}
                          </span>
                          {(['start', 'end'] as const).map((edge) => (
                            <DateInput
                              key={edge}
                              style={{ width: 170 }}
                              value={r[edge]}
                              min={edge === 'end' ? r.start : undefined}
                              aria-label={`${t(label)} ${i + 1} — ${t(`setup.${edge}`)}`}
                              onChange={(e) => setEv({ [key]: ev[key].map((x, j) => (j === i ? { ...x, [edge]: e.target.value } : x)) })}
                            />
                          ))}
                          <button
                            className="btn ghost sm icon danger"
                            onClick={() => setEv({ [key]: ev[key].filter((_, j) => j !== i) })}
                            aria-label={t('common.delete')}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      ))}
                      <div>
                        <button className="btn sm" onClick={() => setEv({ [key]: [...ev[key], { start: '', end: '' }] })}>
                          <Icon name="plus" size={14} />
                          {t('setup.period')}
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* weekdays for exams and consultations: frecvență on weekdays, frecvență redusă also at the weekend */}
                  {(
                    [
                      ['examDays', 'setup.examDays'],
                      ['reducedExamDays', 'setup.reducedExamDays'],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={t(label)}>
                      <div className="checks">
                        {range(7).map((d) => (
                          <label key={d} className="check">
                            <input
                              type="checkbox"
                              checked={ev[key].includes(d)}
                              onChange={(e) => setEv({ [key]: e.target.checked ? [...ev[key], d].sort() : ev[key].filter((x) => x !== d) })}
                            />
                            {t(`dayShort.${d}` as 'dayShort.0')}
                          </label>
                        ))}
                      </div>
                    </Field>
                  ))}

                  <div className="form-grid">
                    <Field label={t('setup.examMinGap')} hint={t('setup.default', { value: 1 })}>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        max={7}
                        value={ev.examMinGap}
                        onChange={(e) => setEv({ examMinGap: num(e.target.value) })}
                      />
                    </Field>
                    <Field label={t('setup.examHours')} hint={t('setup.hoursHint')}>
                      <div className="row" style={{ gap: 8 }}>
                        <TimeInput value={ev.examFrom} format={s.timeFormat} onChange={(v) => setEv({ examFrom: v })} />
                        <span className="muted">–</span>
                        <TimeInput value={ev.examTo} format={s.timeFormat} onChange={(v) => setEv({ examTo: v })} />
                      </div>
                    </Field>
                    <Field label={t('setup.examMinutes')} hint={t('setup.default', { value: 135 })}>
                      <input
                        className="input"
                        type="number"
                        min={30}
                        value={ev.examMinutes}
                        onChange={(e) => setEv({ examMinutes: num(e.target.value, 30) })}
                      />
                    </Field>
                    <Field label={t('setup.reexamHours')} hint={t('setup.hoursHint')}>
                      <div className="row" style={{ gap: 8 }}>
                        <TimeInput value={ev.reexamFrom} format={s.timeFormat} onChange={(v) => setEv({ reexamFrom: v })} />
                        <span className="muted">–</span>
                        <TimeInput value={ev.reexamTo} format={s.timeFormat} onChange={(v) => setEv({ reexamTo: v })} />
                      </div>
                    </Field>
                    <Field label={t('setup.examConsultation')}>
                      <Select value={ev.consultation} onChange={(e) => setEv({ consultation: e.target.value as 'dayBefore' | 'sameDay' })}>
                        <option value="dayBefore">{t('setup.consultationDayBefore')}</option>
                        <option value="sameDay">{t('setup.consultationSameDay')}</option>
                      </Select>
                    </Field>
                  </div>
                </div>
              )}
            </div>
            <aside className="eval-calendar">
              {/* which months to show: the semester by default (autumn Sep–Feb, spring Feb–Jul) */}
              <div className="row wrap cal-range">
                <span className="small muted">{t('calendar.from')}</span>
                <Select
                  value={calRange[0]}
                  onChange={(e) => setCalRange([Number(e.target.value), Math.max(Number(e.target.value), calRange[1])])}
                >
                  {range(12).map((m) => (
                    <option key={m} value={m}>
                      {monthName(m)}
                    </option>
                  ))}
                </Select>
                <span className="small muted">{t('calendar.to')}</span>
                <Select
                  value={calRange[1]}
                  onChange={(e) => setCalRange([Math.min(calRange[0], Number(e.target.value)), Number(e.target.value)])}
                >
                  {range(12).map((m) => (
                    <option key={m} value={m}>
                      {monthName(m)}
                    </option>
                  ))}
                </Select>
              </div>
              <YearCalendar
                year={academicYearOf(ev.semesterStart)}
                holidays={holidays}
                periods={evalTab === 'midterms' ? midtermPeriods : examPeriods}
                compact={evalTab !== 'midterms'}
                fromMonth={calRange[0]}
                toMonth={calRange[1]}
              />
            </aside>
          </div>
        </Step>

        {/* internships (students at their internship, not at university), a final year's own session, VP, licence exam */}
        <Step n={7} {...step(7)} title={t('periods.title')}>
          <p className="small muted">{t('periods.hint')}</p>
          {(s.groupPeriods ?? [])
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => !scope || !p.groupIds.length || p.groupIds.some((g) => myGroupIds.includes(g)))
            .map(({ p, i }) => {
              const setPeriod = (patch: Partial<GroupPeriod>) =>
                set(
                  'groupPeriods',
                  (s.groupPeriods ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <div key={p.id} className="period-row">
                  <div className="row wrap">
                    <Select
                      style={{ width: 230 }}
                      value={p.kind}
                      onChange={(e) => setPeriod({ kind: e.target.value as GroupPeriod['kind'] })}
                    >
                      {PERIOD_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`periods.kind.${k}`)}
                        </option>
                      ))}
                    </Select>
                    {(['start', 'end'] as const).map((edge) => (
                      <DateInput
                        key={edge}
                        style={{ width: 170 }}
                        value={p[edge]}
                        min={edge === 'end' ? p.start : undefined}
                        aria-label={`${t(`periods.kind.${p.kind}`)} — ${t(`setup.${edge}`)}`}
                        onChange={(e) =>
                          setPeriod({
                            [edge]: e.target.value,
                            ...(edge === 'start' && (!p.end || p.end < e.target.value) ? { end: e.target.value } : {}),
                          })
                        }
                      />
                    ))}
                    <span className="spacer" />
                    <button
                      className="btn ghost sm icon danger"
                      onClick={() =>
                        set(
                          'groupPeriods',
                          (s.groupPeriods ?? []).filter((_, j) => j !== i),
                        )
                      }
                      aria-label={t('common.delete')}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  {/* which groups: by cycle and year (other faculties' groups in it stay as they are) */}
                  <div className="period-groups">
                    {periodCycles.map(({ cycle: cy, groups }) => (
                      <div key={cy} className="stack" style={{ gap: 6 }}>
                        {periodCycles.length > 1 && <strong className="small">{t(`cycle.${cy}`)}</strong>}
                        {/* other faculties' groups already in the period stay as they are */}
                        <GroupPicker groups={groups} value={p.groupIds} onChange={(groupIds) => setPeriod({ groupIds })} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          <div>
            <button
              className="btn sm"
              onClick={() =>
                set('groupPeriods', [
                  ...(s.groupPeriods ?? []),
                  { id: `gp${Date.now().toString(36)}`, kind: 'internship', start: '', end: '', groupIds: [] },
                ])
              }
            >
              <Icon name="plus" size={14} />
              {t('periods.add')}
            </button>
          </div>
        </Step>
      </div>
    </div>
  );
}

const PERIOD_KINDS: GroupPeriod['kind'][] = ['internship', 'examSession', 'plagiarism', 'licence'];

/** "09:00, 12:00" — a list of start times. */
function TimesInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <input
      className="input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const times = text
          .split(/[,;]/)
          .map((x) => parseTime(x))
          .filter((x): x is string => !!x)
          .sort();
        if (times.length) onChange([...new Set(times)]);
        setText((times.length ? times : value).join(', '));
      }}
    />
  );
}
