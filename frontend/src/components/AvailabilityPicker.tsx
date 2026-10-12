import { useState, type ReactNode } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import { range, slotKey } from '../domain/slots';
import type { Settings, SlotKey } from '../domain/types';
import { useI18n } from '../i18n';
import { TimetableGrid } from './TimetableGrid';
import { Segmented } from './ui';

export interface AvailabilityValue {
  unavailable: SlotKey[];
  preferred: SlotKey[];
  consultation?: SlotKey;
}

type Brush = 'free' | 'unavailable' | 'preferred' | 'consultation';

export function AvailabilityPicker({
  settings,
  index,
  value,
  onChange,
  allowConsultation = true,
  readOnly = false,
  locked,
}: {
  settings: Settings;
  index: DatasetIndex;
  value: AvailabilityValue;
  onChange: (v: AvailabilityValue) => void;
  allowConsultation?: boolean;
  /** Show the grid without editing (teachers see what the administration set). */
  readOnly?: boolean;
  /** Pairs that can't be marked (the teacher's own lessons): what to show there instead. */
  locked?: (day: number, slot: number) => ReactNode | undefined;
}) {
  const { t } = useI18n();
  const [brush, setBrush] = useState<Brush>('unavailable');

  const stateOf = (k: SlotKey): Brush =>
    value.consultation === k
      ? 'consultation'
      : value.unavailable.includes(k)
        ? 'unavailable'
        : value.preferred.includes(k)
          ? 'preferred'
          : 'free';

  function paint(day: number, slot: number) {
    if (locked?.(day, slot)) return;
    const k = slotKey(day, slot);
    const v = current.current;
    const without = (list: SlotKey[]) => list.filter((x) => x !== k);
    const next: AvailabilityValue = {
      unavailable: without(v.unavailable),
      preferred: without(v.preferred),
      consultation: v.consultation === k ? undefined : v.consultation,
    };
    if (target === 'unavailable') next.unavailable.push(k);
    if (target === 'preferred') next.preferred.push(k);
    if (target === 'consultation') next.consultation = k;
    current.current = next;
    onChange(next);
  }

  // pressing a cell that already has the brush state clears it, and the drag then clears too
  function press(day: number, slot: number) {
    const target: Brush = stateOf(slotKey(day, slot)) === brush ? 'free' : brush;
    dragging.current = target;
    paintAs(day, slot, target);
  }
  // one consultation hour only: dragging it over several cells moves it, it doesn't copy it
  const drag = (day: number, slot: number) => dragging.current && paintAs(day, slot, dragging.current);

  const label: Record<Brush, string> = {
    free: t('availability.free'),
    unavailable: t('availability.unavailable'),
    preferred: t('availability.preferred'),
    consultation: t('availability.consultation'),
  };

  const brushes: Brush[] = allowConsultation ? ['unavailable', 'preferred', 'consultation', 'free'] : ['unavailable', 'preferred', 'free'];

  return (
    <div className="stack" style={{ gap: 10 }}>
      {!readOnly && (
        <div className="row wrap">
          <span className="small muted">{t('availability.brush')}</span>
          <Segmented value={brush} onChange={setBrush} options={brushes.map((b) => ({ value: b, label: label[b] }))} />
        </div>
      )}
      <TimetableGrid
        className="avail"
        settings={settings}
        index={index}
        lessons={[]}
        // also frecvență redusă's weekend sessions: every working day
        days={range(settings.workingDays)}
        cellClass={(d, s) => (locked?.(d, s) ? 'state-lesson' : `state-${stateOf(slotKey(d, s))}`)}
        onCellClick={readOnly ? undefined : paint}
        renderCell={(d, s) => {
          const lesson = locked?.(d, s);
          if (lesson) return lesson;
          const st = stateOf(slotKey(d, s));
          return st === 'free' ? '' : label[st];
        }}
      />
    </div>
  );
}
