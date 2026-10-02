import { useState } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import { slotKey } from '../domain/slots';
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
}: {
  settings: Settings;
  index: DatasetIndex;
  value: AvailabilityValue;
  onChange: (v: AvailabilityValue) => void;
  allowConsultation?: boolean;
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
    const k = slotKey(day, slot);
    const without = (list: SlotKey[]) => list.filter((x) => x !== k);
    // Clicking a cell that already has the brush state clears it
    const target: Brush = stateOf(k) === brush ? 'free' : brush;
    const next: AvailabilityValue = {
      unavailable: without(value.unavailable),
      preferred: without(value.preferred),
      consultation: value.consultation === k ? undefined : value.consultation,
    };
    if (target === 'unavailable') next.unavailable.push(k);
    if (target === 'preferred') next.preferred.push(k);
    if (target === 'consultation') next.consultation = k;
    onChange(next);
  }

  const label: Record<Brush, string> = {
    free: t('availability.free'),
    unavailable: t('availability.unavailable'),
    preferred: t('availability.preferred'),
    consultation: t('availability.consultation'),
  };

  const brushes: Brush[] = allowConsultation ? ['unavailable', 'preferred', 'consultation', 'free'] : ['unavailable', 'preferred', 'free'];

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row wrap">
        <span className="small muted">{t('availability.brush')}</span>
        <Segmented value={brush} onChange={setBrush} options={brushes.map((b) => ({ value: b, label: label[b] }))} />
      </div>
      <TimetableGrid
        className="avail"
        settings={settings}
        index={index}
        lessons={[]}
        cellClass={(d, s) => `state-${stateOf(slotKey(d, s))}`}
        onCellClick={paint}
        renderCell={(d, s) => {
          const st = stateOf(slotKey(d, s));
          return st === 'free' ? '' : label[st];
        }}
      />
    </div>
  );
}
