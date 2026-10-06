// Institution setup — split into small ranked steps, each field with a
// default value, so only what differs from the defaults has to be filled in.
import { useState, type ReactNode } from 'react';
import { api, API_MODE } from '../../api';
import { resetMockData } from '../../api/mock';
import { Icon } from '../../components/Icon';
import { Field, PageHeader, Segmented, Switch, TimeInput, useClock } from '../../components/ui';
import { fmtTime, parseTime, range } from '../../domain/slots';
import { DEFAULT_EVALUATION } from '../../domain/exams';
import { semesterChoices, semesterOf, semesterStartOf } from '../../domain/holidays';
import { STUDY_FORMS, type EvaluationSettings, type Settings, type TimeSlot } from '../../domain/types';
import { UTM_FACULTIES, UTM_NAME } from '../../domain/utm';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useData, useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import { Select } from '../../components/Select';

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
  3: ['workingDays', 'lessonMinutes', 'timeFormat', 'slots', 'yearShifts'],
  4: ['weekParity'],
  5: ['minPairsPerDayGroup', 'maxPairsPerDayGroup', 'maxPairsPerDayTeacher', 'consultationRequired'],
  6: ['evaluation'],
};

export default function Setup() {
  const { t } = useI18n();
  const { dataset, refresh } = useDataset();
  const toast = useToast();
  const { institutionTimeFormat } = useData();
  const [s, setS] = useState<Settings>({ ...dataset.settings, timeFormat: institutionTimeFormat });
  const [breakMin, setBreakMin] = useState(15);
  const { user, setUser } = useAuth();
  const [faculty, setFaculty] = useState(user?.faculty ?? '');
  const clock = useClock();
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<number | null>(null);
  // as many years as the longest programme (at least 4, at most 6)
  const shiftYears = Math.min(6, Math.max(4, ...dataset.groups.map((g) => g.programYears ?? g.year)));
  const ev = { ...DEFAULT_EVALUATION, ...s.evaluation };
  const [evalTab, setEvalTab] = useState<'midterms' | 'finals'>('midterms');
  const setEv = (patch: Partial<EvaluationSettings>) =>
    setS((x) => ({ ...x, evaluation: { ...DEFAULT_EVALUATION, ...x.evaluation, ...patch } }));
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
      };
      // only this section's settings; the others stay as last saved
      const saved: Settings = { ...dataset.settings, timeFormat: institutionTimeFormat };
      const own: Partial<Settings> = Object.fromEntries(SECTION_KEYS[section].map((k) => [k, clean[k]]));
      // days off are edited on their own page (Zile libere și vacanțe): keep them as stored
      const storedEv = { ...DEFAULT_EVALUATION, ...saved.evaluation };
      if (section === 6)
        own.evaluation = { ...clean.evaluation!, vacations: storedEv.vacations, holidayOverrides: storedEv.holidayOverrides };
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
      setJustSaved(section);
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
  // days off live on their own page, so Evaluări compares everything else
  const evRest = (v: Settings['evaluation']) => {
    const { vacations: _v, holidayOverrides: _o, ...rest } = { ...DEFAULT_EVALUATION, ...v };
    return JSON.stringify(rest);
  };
  const dirty = (section: number) =>
    section === 6
      ? evRest(s.evaluation) !== evRest(stored.evaluation)
      : SECTION_KEYS[section].some((k) => k !== 'institutionName' && norm(k, s[k]) !== norm(k, stored[k])) ||
        (section === 1 && !!faculty && faculty !== user?.faculty);
  const step = (n: number) => ({
    onSave: () => save(n),
    saving,
    dirty: dirty(n),
    saved: justSaved === n && !dirty(n),
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
                <input
                  className="input"
                  type="date"
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
                <input
                  className="input"
                  type="date"
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
            {range(shiftYears).map((y) => {
              const shift = s.yearShifts?.[y] ?? { first: 0, last: s.slots.length - 1 };
              const setShift = (v: Partial<typeof shift>) => {
                const next = range(shiftYears).map((i) => s.yearShifts?.[i] ?? { first: 0, last: s.slots.length - 1 });
                next[y] = { ...shift, ...v };
                if (next[y].last < next[y].first)
                  next[y] = v.first !== undefined ? { ...next[y], last: next[y].first } : { ...next[y], first: next[y].last };
                set('yearShifts', next);
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
          {/* two tabs: atestări (midterms) and final exams */}
          <Segmented
            value={evalTab}
            onChange={setEvalTab}
            options={[
              { value: 'midterms', label: t('exams.midterms') },
              { value: 'finals', label: t('exams.exams') },
            ]}
          />
          {evalTab === 'midterms' ? (
            <div className="stack">
              <div className="form-grid">
                <Field label={t('setup.semesterStart')}>
                  <input
                    className="input"
                    type="date"
                    value={semesterStartOf(ev.semesterStart)}
                    onChange={(e) => setEv({ semesterStart: e.target.value })}
                  />
                </Field>
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
                        <input
                          key={edge}
                          className="input"
                          type="date"
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

              <div className="form-grid">
                <Field label={t('setup.examMinGap')} hint={t('setup.default', { value: 2 })}>
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

        </Step>
      </div>
    </div>
  );
}

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
