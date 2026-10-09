import { useState } from 'react';
import { TimetableGrid } from '../../components/TimetableGrid';
import { Field, PageHeader, Segmented } from '../../components/ui';
import { freeRooms } from '../../domain/availability';
import { fmtTime, weekDays } from '../../domain/slots';
import type { Parity } from '../../domain/types';
import { useEquipment } from '../../components/useEquipment';
import { dayIndexOf, weekParityOf } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { Select } from '../../components/Select';

/** Find an empty room for studying, a consultation or a make-up class. */
export default function FreeRooms() {
  const { t } = useI18n();
  const { dataset, index, published } = useDataset();
  const days = weekDays(dataset.settings);
  const today = days.includes(dayIndexOf(new Date())) ? dayIndexOf(new Date()) : days[0];
  const [day, setDay] = useState(today);
  const [slot, setSlot] = useState(0);
  const [week, setWeek] = useState<Parity>(dataset.settings.weekParity ? weekParityOf(new Date()) : 'weekly');
  const [minCapacity, setMinCapacity] = useState(0);
  const [equipment, setEquipment] = useState('');
  const eq = useEquipment();

  const lessons = published?.lessons ?? [];
  const opts = { minCapacity, equipment };
  const list = freeRooms(dataset.rooms, lessons, day, slot, week, opts);
  // the room picked in the list (only while it is still free at the chosen time)
  const [roomId, setRoomId] = useState('');
  const chosen = list.find((r) => r.id === roomId);

  return (
    <div className="page">
      <PageHeader title={t('nav.freeRooms')} subtitle={t('freeRooms.subtitle')} />
      <p className="small muted" style={{ marginTop: -12, marginBottom: 18 }}>
        {t('freeRooms.readOnly')}
      </p>
      <div className="stack">
        <div className="card">
          <div className="card-body form-grid">
            <Field label={t('editor.day')}>
              <Select className="select" value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {t(`day.${d}` as 'day.0')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('tt.pair')}>
              <Select className="select" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
                {dataset.settings.slots.map((s, i) => (
                  <option key={i} value={i}>
                    {i + 1} · {fmtTime(s.start, dataset.settings.timeFormat)}–{fmtTime(s.end, dataset.settings.timeFormat)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('freeRooms.minCapacity')}>
              <input
                className="input"
                type="number"
                min={0}
                value={minCapacity}
                onChange={(e) => setMinCapacity(Number(e.target.value) || 0)}
              />
            </Field>
            <Field label={t('freeRooms.equipment')}>
              <Select className="select" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                <option value="">{t('freeRooms.anyEquipment')}</option>
                {eq.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {dataset.settings.weekParity && (
            <div className="card-body" style={{ paddingTop: 0 }}>
              <Segmented
                value={week}
                onChange={setWeek}
                options={[
                  { value: 'odd', label: t('tt.weekOdd') },
                  { value: 'even', label: t('tt.weekEven') },
                ]}
              />
            </div>
          )}
        </div>

        {/* the count, and a searchable list instead of every room at once */}
        <div className="card free-now">
          <div className="free-now-count">
            <strong>{list.length}</strong>
            <span>{t('freeRooms.freeCount')}</span>
          </div>
          {list.length === 0 ? (
            <span className="muted">{t('freeRooms.none')}</span>
          ) : (
            <div className="stack" style={{ gap: 6, width: 280 }}>
              <Select
                className="select"
                value={chosen?.id ?? ''}
                onChange={(e) => setRoomId(e.target.value)}
                aria-label={t('freeRooms.find')}
              >
                <option value="">{t('freeRooms.find')}</option>
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.capacity} {t('rooms.capacity').toLowerCase()}
                  </option>
                ))}
              </Select>
              {chosen && (
                <span className="small muted">
                  {[chosen.building, `${chosen.capacity} ${t('rooms.capacity').toLowerCase()}`, eq.list(chosen.equipment)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <h2 style={{ marginBottom: 4 }}>{t('freeRooms.overview')}</h2>
          <p className="small muted" style={{ marginBottom: 10 }}>
            {t('freeRooms.overviewHint')}
          </p>
          <TimetableGrid
            className="avail"
            settings={dataset.settings}
            index={index}
            lessons={[]}
            onCellClick={(d, s) => {
              setDay(d);
              setSlot(s);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            cellClass={(d, s) =>
              d === day && s === slot
                ? 'state-consultation'
                : freeRooms(dataset.rooms, lessons, d, s, week, opts).length
                  ? 'state-free'
                  : 'state-unavailable'
            }
            renderCell={(d, s) => freeRooms(dataset.rooms, lessons, d, s, week, opts).length}
          />
        </div>
      </div>
    </div>
  );
}
