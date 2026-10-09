import { useState } from 'react';
import { TimetableGrid } from '../../components/TimetableGrid';
import { Field, PageHeader, Segmented } from '../../components/ui';
import { freeRooms } from '../../domain/availability';
import { fmtTime, paritiesOverlap, weekDays } from '../../domain/slots';
import { subjectLabel } from '../../domain/subjects';
import type { Parity } from '../../domain/types';
import { useRoomFilters } from '../../components/RoomFilters';
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
  // the same room filters as Săli: block, floor, seats, equipment
  const roomFilters = useRoomFilters(dataset.rooms);
  const rooms = roomFilters.filtered;

  const lessons = published?.lessons ?? [];
  // the week grid has its own odd / even / both switch
  const [gridWeek, setGridWeek] = useState<Parity>(week);
  const freeInGrid = (d: number, s: number) => freeRooms(rooms, lessons, d, s, gridWeek);
  // checking one room at the chosen day, pair and week
  const allRooms = [...dataset.rooms].sort((a, b) => a.name.localeCompare(b.name, 'ro', { numeric: true }));
  const [checkId, setCheckId] = useState('');
  const checked = index.rooms.get(checkId);
  const occupying = checked
    ? lessons.filter((l) => !l.date && l.roomId === checked.id && l.day === day && l.slot === slot && paritiesOverlap(l.parity, week))
    : [];
  // today only: the rooms free in the current pair (or the next one, between pairs), in this week
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const todaySlot = days.includes(dayIndexOf(now)) ? dataset.settings.slots.findIndex((x) => toMin(x.end) > nowMinutes) : -1;
  const todayList =
    todaySlot >= 0 ? freeRooms(rooms, lessons, dayIndexOf(now), todaySlot, dataset.settings.weekParity ? weekParityOf(now) : 'weekly') : [];

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
            {/* one room: is it free at this day and pair? */}
            <Field label={t('freeRooms.check')}>
              <Select className="select" value={checkId} onChange={(e) => setCheckId(e.target.value)} aria-label={t('freeRooms.check')}>
                <option value="">{t('freeRooms.checkPick')}</option>
                {allRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {checked && (
            <div className="card-body" style={{ paddingTop: 0 }}>
              {occupying.length === 0 ? (
                <span className="badge success">{t('freeRooms.isFree', { room: checked.name })}</span>
              ) : (
                <span className="row wrap" style={{ gap: 8 }}>
                  <span className="badge danger">{t('freeRooms.isBusy', { room: checked.name })}</span>
                  {occupying.map((l) => {
                    const a = index.assignmentOf(l)!;
                    return (
                      <span key={l.id} className="small muted">
                        {subjectLabel(index.subjects.get(a.subjectId))} · {t(`activity.${a.type}`)} · {index.audienceLabel(a.audience)} ·{' '}
                        {index.teachers.get(a.teacherId)?.name}
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
          )}
          <div className="filter-bar">
            {roomFilters.controls}
            {roomFilters.filtering && (
              <button className="btn ghost sm" onClick={roomFilters.reset}>
                {t('filters.reset')}
              </button>
            )}
          </div>
          {dataset.settings.weekParity && (
            <div className="card-body" style={{ paddingTop: 0 }}>
              <Segmented
                value={week}
                onChange={setWeek}
                options={[
                  // both weeks: free (or shown) for the odd and the even week together
                  { value: 'weekly', label: t('tt.weekAll') },
                  { value: 'odd', label: t('tt.weekOdd') },
                  { value: 'even', label: t('tt.weekEven') },
                ]}
              />
            </div>
          )}
        </div>

        {/* today: how many rooms are free now */}
        <div className="card free-now">
          {todaySlot < 0 ? (
            <span className="muted">{t(days.includes(dayIndexOf(now)) ? 'freeRooms.noPairsToday' : 'freeRooms.dayOff')}</span>
          ) : (
            <div className="free-now-count">
              <strong>{todayList.length}</strong>
              <span>{t('freeRooms.today', { pair: todaySlot + 1 })}</span>
            </div>
          )}
        </div>

        <div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 4 }}>
            <h2>{t('freeRooms.overview')}</h2>
            {dataset.settings.weekParity && (
              <Segmented
                value={gridWeek}
                onChange={setGridWeek}
                options={[
                  { value: 'weekly', label: t('tt.weekAll') },
                  { value: 'odd', label: t('tt.weekOdd') },
                  { value: 'even', label: t('tt.weekEven') },
                ]}
              />
            )}
          </div>
          <p className="small muted" style={{ marginBottom: 10 }}>
            {t('freeRooms.overviewHint')}
          </p>
          <TimetableGrid
            className="avail"
            settings={dataset.settings}
            index={index}
            lessons={[]}
            // today's column and the line at the current time, as on Profesori disponibili
            today={dayIndexOf(now)}
            onCellClick={(d, s) => {
              setDay(d);
              setSlot(s);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            cellClass={(d, s) =>
              d === day && s === slot ? 'state-consultation' : freeInGrid(d, s).length ? 'state-free' : 'state-unavailable'
            }
            // the number of free rooms; clicking it opens the list of them (searchable)
            renderCell={(d, s) => {
              const free = freeInGrid(d, s);
              if (!free.length) return 0;
              return (
                <Select
                  className="select cell-select"
                  value=""
                  onChange={(e) => {
                    setDay(d);
                    setSlot(s);
                    setWeek(gridWeek);
                    setCheckId(e.target.value);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  aria-label={t('freeRooms.find')}
                >
                  <option value="">{free.length}</option>
                  {free.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.capacity} {t('rooms.capacity').toLowerCase()}
                    </option>
                  ))}
                </Select>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
