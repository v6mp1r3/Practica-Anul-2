import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import { range, slotKey } from '../domain/slots';
import type { Parity, Settings, SlotKey } from '../domain/types';
import { useI18n } from '../i18n';
import { TimetableGrid } from './TimetableGrid';
import { Segmented } from './ui';

export interface AvailabilityValue {
  unavailable: SlotKey[];
  /** Unavailable in odd weeks only / even weeks only (besides `unavailable`, every week). */
  unavailableOdd?: SlotKey[];
  unavailableEven?: SlotKey[];
  preferred: SlotKey[];
  consultation?: SlotKey;
}

type Brush = 'free' | 'unavailable' | 'preferred' | 'consultation';
/** What a cell shows: the brushes, plus "unavailable in one kind of week only" in the every-week view. */
type CellState = Brush | 'unavailable-odd' | 'unavailable-even';

/** Is the pair off in odd weeks, in even weeks? */
function offIn(v: AvailabilityValue, k: SlotKey): { odd: boolean; even: boolean } {
  const every = v.unavailable.includes(k);
  return { odd: every || !!v.unavailableOdd?.includes(k), even: every || !!v.unavailableEven?.includes(k) };
}

/** The lists again from "off in odd weeks / in even weeks": both = every week, one = that week only. */
function withOff(v: AvailabilityValue, k: SlotKey, off: { odd: boolean; even: boolean }): AvailabilityValue {
  const without = (list: SlotKey[] = []) => list.filter((x) => x !== k);
  const next = {
    ...v,
    unavailable: without(v.unavailable),
    unavailableOdd: without(v.unavailableOdd),
    unavailableEven: without(v.unavailableEven),
  };
  if (off.odd && off.even) next.unavailable.push(k);
  else if (off.odd) next.unavailableOdd.push(k);
  else if (off.even) next.unavailableEven.push(k);
  return next;
}

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
  // which weeks the grid shows and edits: every week (as it always was), or odd / even weeks on their own
  const [week, setWeek] = useState<Parity>('weekly');
  const byWeek = settings.weekParity && week !== 'weekly';
  const hasWeekOnly = !!(value.unavailableOdd?.length || value.unavailableEven?.length);

  const stateOf = (k: SlotKey): CellState => {
    if (value.consultation === k) return 'consultation';
    const off = offIn(value, k);
    if (byWeek ? off[week as 'odd' | 'even'] : off.odd && off.even) return 'unavailable';
    if (!byWeek && off.odd) return 'unavailable-odd';
    if (!byWeek && off.even) return 'unavailable-even';
    return value.preferred.includes(k) ? 'preferred' : 'free';
  };

  // dragging over cells paints them all the same: the value is kept here so a fast drag never works from an old one
  const current = useRef(value);
  current.current = value;
  const dragging = useRef<Brush | null>(null);
  useEffect(() => {
    const stop = () => (dragging.current = null);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  function paintAs(day: number, slot: number, target: Brush) {
    if (locked?.(day, slot)) return;
    const k = slotKey(day, slot);
    const v = current.current;
    if (byWeek) {
      // odd or even weeks: only this week's unavailability changes, the other week keeps its own
      const off = { ...offIn(v, k), [week]: target === 'unavailable' };
      const next = withOff(v, k, off);
      current.current = next;
      onChange(next);
      return;
    }
    const without = (list: SlotKey[] = []) => list.filter((x) => x !== k);
    const next: AvailabilityValue = {
      unavailable: without(v.unavailable),
      unavailableOdd: without(v.unavailableOdd),
      unavailableEven: without(v.unavailableEven),
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
    if (locked?.(day, slot)) return;
    const target: Brush = stateOf(slotKey(day, slot)) === pick ? 'free' : pick;
    dragging.current = target;
    paintAs(day, slot, target);
  }
  // one consultation hour only: dragging it over several cells moves it, it doesn't copy it
  const drag = (day: number, slot: number) => dragging.current && paintAs(day, slot, dragging.current);

  const label: Record<CellState, string> = {
    free: t('availability.free'),
    unavailable: t('availability.unavailable'),
    preferred: t('availability.preferred'),
    consultation: t('availability.consultation'),
    'unavailable-odd': t('availability.unavailableOdd'),
    'unavailable-even': t('availability.unavailableEven'),
  };

  // in odd / even weeks only unavailability is marked: preferred pairs and the consultation hour are every week
  const brushes: Brush[] = byWeek
    ? ['unavailable', 'free']
    : allowConsultation
      ? ['unavailable', 'preferred', 'consultation', 'free']
      : ['unavailable', 'preferred', 'free'];
  const pick = brushes.includes(brush) ? brush : 'unavailable';

  return (
    <div className="stack" style={{ gap: 10 }}>
      {settings.weekParity && (
        <div className="row wrap">
          <span className="small muted">{t('availability.weeks')}</span>
          <Segmented
            value={week}
            onChange={setWeek}
            options={[
              { value: 'weekly', label: t('availability.everyWeek') },
              { value: 'odd', label: t('tt.weekOdd') },
              { value: 'even', label: t('tt.weekEven') },
            ]}
          />
          {!byWeek && hasWeekOnly && <span className="small muted">{t('availability.weekOnlyHint')}</span>}
        </div>
      )}
      {!readOnly && (
        <div className="row wrap">
          <span className="small muted">{t('availability.brush')}</span>
          <Segmented value={pick} onChange={setBrush} options={brushes.map((b) => ({ value: b, label: label[b] }))} />
        </div>
      )}
      <TimetableGrid
        className="avail"
        settings={settings}
        index={index}
        lessons={[]}
        // also frecvență redusă's weekend sessions: every working day
        days={range(settings.workingDays)}
        cellClass={(d, s) => {
          if (locked?.(d, s)) return 'state-lesson';
          const st = stateOf(slotKey(d, s));
          // off in one kind of week only: shown as unavailable, lighter
          return st === 'unavailable-odd' || st === 'unavailable-even' ? 'state-unavailable state-half' : `state-${st}`;
        }}
        onCellPress={readOnly ? undefined : press}
        onCellDrag={readOnly ? undefined : drag}
        selectable={!readOnly}
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
