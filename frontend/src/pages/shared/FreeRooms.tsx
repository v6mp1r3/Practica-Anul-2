import { useState } from 'react';
import { TimetableGrid } from '../../components/TimetableGrid';
import { Empty, Field, PageHeader, Segmented } from '../../components/ui';
import { freeRooms } from '../../domain/availability';
import { range } from '../../domain/slots';
import type { Parity, RoomType } from '../../domain/types';
import { dayIndexOf, weekParityOf } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';

/** Find an empty room for studying, a consultation or a make-up class. */
export default function FreeRooms() {
  const { t } = useI18n();
  const { dataset, index, published } = useDataset();
  const today = Math.min(dayIndexOf(new Date()), dataset.settings.workingDays - 1);
  const [day, setDay] = useState(today);
  const [slot, setSlot] = useState(0);
  const [week, setWeek] = useState<Parity>(dataset.settings.weekParity ? weekParityOf(new Date()) : 'weekly');
  const [minCapacity, setMinCapacity] = useState(0);
  const [type, setType] = useState<RoomType | ''>('');

  const lessons = published?.lessons ?? [];
  const opts = { minCapacity, type };
  const list = freeRooms(dataset.rooms, lessons, day, slot, week, opts);

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
              <select className="select" value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {range(dataset.settings.workingDays).map((d) => (
                  <option key={d} value={d}>
                    {t(`day.${d}` as 'day.0')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('tt.pair')}>
              <select className="select" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
                {dataset.settings.slots.map((s, i) => (
                  <option key={i} value={i}>
                    {i + 1} · {s.start}–{s.end}
                  </option>
                ))}
              </select>
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
            <Field label={t('rooms.type')}>
              <select className="select" value={type} onChange={(e) => setType(e.target.value as RoomType | '')}>
                <option value="">{t('common.all')}</option>
                {(['lecture', 'seminar', 'lab'] as RoomType[]).map((r) => (
                  <option key={r} value={r}>
                    {t(`roomType.${r}`)}
                  </option>
                ))}
              </select>
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

        <div className="card">
          <div className="card-header">
            <h2>{t('freeRooms.result', { count: list.length })}</h2>
          </div>
          {list.length === 0 ? (
            <Empty>{t('freeRooms.none')}</Empty>
          ) : (
            <div className="card-body row wrap" style={{ gap: 10 }}>
              {list.map((r) => (
                <div key={r.id} className="card" style={{ padding: '10px 14px', minWidth: 150 }}>
                  <strong>{r.name}</strong>
                  <div className="small muted">
                    {t(`roomType.${r.type}`)} · {r.capacity} {t('rooms.capacity').toLowerCase()}
                  </div>
                  {r.equipment.length > 0 && <div className="small muted">{r.equipment.join(', ')}</div>}
                </div>
              ))}
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
