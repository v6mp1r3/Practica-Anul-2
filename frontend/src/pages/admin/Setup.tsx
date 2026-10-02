// Institution setup — split into small ranked steps, each field with a
// default value, so only what differs from the defaults has to be filled in.
import { useState, type ReactNode } from 'react';
import { api, API_MODE } from '../../api';
import { resetMockData } from '../../api/mock';
import { Icon } from '../../components/Icon';
import { Field, PageHeader, Switch } from '../../components/ui';
import type { Settings, TimeSlot } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';

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

function Step({ n, title, required, children }: { n: number; title: string; required?: boolean; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="card">
      <div className="card-header">
        <span className="avatar" style={{ width: 26, height: 26, fontSize: 12 }}>
          {n}
        </span>
        <h2>{title}</h2>
        {required && <span className="badge danger">{t('setup.required')}</span>}
      </div>
      <div className="card-body stack">{children}</div>
    </div>
  );
}

export default function Setup() {
  const { t } = useI18n();
  const { dataset, refresh } = useDataset();
  const toast = useToast();
  const [s, setS] = useState<Settings>(dataset.settings);
  const [breakMin, setBreakMin] = useState(15);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      await api.saveSettings(s);
      await refresh();
      toast(t('common.saved'));
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

  return (
    <div className="page">
      <PageHeader
        title={t('nav.setup')}
        subtitle={t('setup.subtitle')}
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
            <button className="btn primary" onClick={save} disabled={saving}>
              <Icon name="check" />
              {t('common.save')}
            </button>
          </>
        }
      />

      <div className="stack">
        <Step n={1} title={t('setup.institution')} required>
          <div className="form-grid">
            <Field label={t('setup.institutionName')}>
              <input className="input" value={s.institutionName} onChange={(e) => set('institutionName', e.target.value)} />
            </Field>
            <Field label={t('setup.faculty')}>
              <input className="input" value={s.faculty} onChange={(e) => set('faculty', e.target.value)} />
            </Field>
            <Field label={t('setup.semester')}>
              <input className="input" value={s.semester} onChange={(e) => set('semester', e.target.value)} />
            </Field>
          </div>
        </Step>

        <Step n={2} title={t('setup.week')} required>
          <div className="form-grid">
            <Field label={t('setup.workingDays')} hint={t('setup.default', { value: 5 })}>
              <select className="select" value={s.workingDays} onChange={(e) => set('workingDays', Number(e.target.value))}>
                <option value={5}>
                  5 ({t('day.0')}–{t('day.4')})
                </option>
                <option value={6}>
                  6 ({t('day.0')}–{t('day.5')})
                </option>
              </select>
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
                        <input
                          className="input"
                          type="time"
                          value={slot.start}
                          onChange={(e) =>
                            set(
                              'slots',
                              s.slots.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="time"
                          value={slot.end}
                          onChange={(e) =>
                            set(
                              'slots',
                              s.slots.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
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
        </Step>

        <Step n={3} title={t('setup.parity')}>
          <div className="row">
            <Switch checked={s.weekParity} onChange={(v) => set('weekParity', v)} label={t('setup.parityQuestion')} />
            <div>
              <strong>{t('setup.parityQuestion')}</strong>
              <div className="small muted">{t('setup.parityHint')}</div>
            </div>
          </div>
        </Step>

        <Step n={4} title={t('setup.limits')}>
          <div className="form-grid">
            <Field label={t('setup.maxPairsGroup')} hint={t('setup.default', { value: 4 })}>
              <input
                className="input"
                type="number"
                min={1}
                value={s.maxPairsPerDayGroup}
                onChange={(e) => set('maxPairsPerDayGroup', num(e.target.value, 1))}
              />
            </Field>
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
      </div>
    </div>
  );
}
