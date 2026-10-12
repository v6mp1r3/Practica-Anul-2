// Room filters shared by Săli (admin) and Săli libere: block, floor, seats (a bar
// to drag) and equipment. Returns the rooms that pass and the controls to show.
import { useState } from 'react';
import { floorOf } from '../domain/rooms';
import type { Room } from '../domain/types';
import { useI18n } from '../i18n';
import { RangeSlider } from './RangeSlider';
import { Select } from './Select';
import { useEquipment } from './useEquipment';

export function useRoomFilters(rooms: Room[]) {
  const { t } = useI18n();
  const equipment = useEquipment();
  const [block, setBlock] = useState('');
  const [floor, setFloor] = useState('');
  const [seats, setSeats] = useState<[number, number] | null>(null);
  const [needs, setNeeds] = useState('');

  const blocks = [...new Set(rooms.map((r) => r.building).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro', { numeric: true }));
  const floors = [...new Set(rooms.map((r) => floorOf(r.name)).filter((f) => f !== null))].sort((a, b) => a - b);
  const floorName = (f: number) => (f < 0 ? t('rooms.basement') : f === 0 ? t('rooms.ground') : t('rooms.floorN', { n: f }));
  const capacities = rooms.map((r) => r.capacity);
  const minSeats = capacities.length ? Math.min(...capacities) : 0;
  const maxSeats = capacities.length ? Math.max(...capacities) : 0;
  const [lo, hi] = seats ?? [minSeats, maxSeats];

  const filtered = rooms.filter(
    (r) =>
      (!block || r.building === block) &&
      (!floor || floorOf(r.name) === Number(floor)) &&
      r.capacity >= lo &&
      r.capacity <= hi &&
      (!needs || r.equipment.includes(needs)),
  );
  const filtering = !!(block || floor || seats || needs);
  const reset = () => {
    setBlock('');
    setFloor('');
    setSeats(null);
    setNeeds('');
  };

  const controls = (
    <>
      <Select className="select pill" value={block} onChange={(e) => setBlock(e.target.value)} aria-label={t('rooms.building')}>
        <option value="">{t('rooms.allBlocks')}</option>
        {blocks.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </Select>
      <Select className="select pill" value={floor} onChange={(e) => setFloor(e.target.value)} aria-label={t('rooms.floor')}>
        <option value="">{t('rooms.allFloors')}</option>
        {floors.map((f) => (
          <option key={f} value={f}>
            {floorName(f)}
          </option>
        ))}
      </Select>
      {maxSeats > minSeats && (
        <RangeSlider min={minSeats} max={maxSeats} value={[lo, hi]} onChange={setSeats} label={t('rooms.capacity')} />
      )}
      <Select className="select pill" value={needs} onChange={(e) => setNeeds(e.target.value)} aria-label={t('rooms.equipment')}>
        <option value="">{t('rooms.anyEquipment')}</option>
        {equipment.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </>
  );

  return { filtered, controls, filtering, reset };
}
