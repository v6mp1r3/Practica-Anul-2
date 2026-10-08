// Exams, consultations and atestări as a week calendar (Monday–Sunday, real
// dates), like the weekly timetable but positioned by the minute. Cards can be
// dragged to another day or time (snapped to 15 minutes, same length).
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { parseDate, toDateString } from '../domain/changes';
import type { DatasetIndex } from '../domain/indexes';
import { fmtTime } from '../domain/slots';
import type { Settings, Vacation } from '../domain/types';
import { dateLocale, useI18n } from '../i18n';
import type { CalendarEntry } from './ExamCalendar';
import { useHolidayName } from './Holidays';
import { Icon } from './Icon';
import { subjectLabel } from '../domain/subjects';

const PX_PER_MIN = 1.15;
const SNAP = 15;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const mondayOf = (date: string) => {
  const d = parseDate(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateString(d);
};
const addDays = (date: string, n: number) => {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateString(d);
};

/** Side-by-side lanes for overlapping cards of one day. */
function lanes(list: CalendarEntry[]) {
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const out = new Map<string, { lane: number; of: number }>();
  let cluster: CalendarEntry[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    const of = laneEnds.length;
    for (const e of cluster) out.set(e.id, { ...out.get(e.id)!, of });
    cluster = [];
    laneEnds = [];
  };
  for (const e of sorted) {
    const s = toMin(e.start);
    if (cluster.length && s >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = toMin(e.end);
    out.set(e.id, { lane, of: 1 });
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, toMin(e.end));
  }
  close();
  return out;
}

export function ExamWeekCalendar({
  entries,
  index,
  settings,
  hide = [],
  highlight,
  vacations = [],
  onEdit,
  onMove,
  empty,
}: {
  entries: CalendarEntry[];
  index: DatasetIndex;
  settings: Settings;
  hide?: ('teacher' | 'group')[];
  highlight?: Set<string>;
  vacations?: Vacation[];
  onEdit?: (id: string) => void;
  /** Drag & drop: the card's new date and start time (same length). */
  onMove?: (id: string, date: string, start: string) => void;
  empty?: ReactNode;
}) {
  const { t, lang } = useI18n();
  const holidayName = useHolidayName();
  const today = toDateString(new Date());

  // the weeks that have something in them, in order
  const weeks = useMemo(() => [...new Set(entries.map((e) => mondayOf(e.date)))].sort(), [entries]);
  const [picked, setPicked] = useState<string | null>(null);
  const week = picked && weeks.includes(picked) ? picked : (weeks.find((w) => addDays(w, 6) >= today) ?? weeks[0]);
  const [drag, setDrag] = useState<{ id: string; grab: number } | null>(null);
  const [over, setOver] = useState<{ date: string; start: string } | null>(null);

  if (!entries.length || !week) return <div className="card">{empty}</div>;

  // the hours shown: the same for every week (from the earliest start to the latest end)
  const first = Math.min(8 * 60, ...entries.map((e) => toMin(e.start)));
  const last = Math.max(18 * 60, ...entries.map((e) => toMin(e.end)));
  const from = Math.floor(first / 60) * 60;
  const to = Math.ceil(last / 60) * 60;
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const height = (to - from) * PX_PER_MIN;

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  // a day with exams side by side gets wider (the calendar scrolls sideways if needed)
  const laneCount = days.map((d) => {
    const pos = lanes(entries.filter((e) => e.date === d));
    return Math.max(1, ...[...pos.values()].map((p) => p.of));
  });
  const columns = `56px ${laneCount.map((n) => `minmax(${Math.max(120, n * 92)}px, ${n}fr)`).join(' ')}`;
  const tones = [...new Set(entries.map((e) => e.tone))];
  const i = weeks.indexOf(week);
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => parseDate(d).toLocaleDateString(dateLocale(lang), o);
  const title = `${fmt(days[0], { day: 'numeric', month: 'long' })} – ${fmt(days[6], { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const minuteAt = (e: DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = from + (e.clientY - rect.top - (drag?.grab ?? 0)) / PX_PER_MIN;
    return Math.max(from, Math.round(raw / SNAP) * SNAP);
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn sm icon flip" onClick={() => setPicked(weeks[i - 1])} disabled={i <= 0} aria-label={t('exams.prevWeek')}>
          <Icon name="arrow" size={14} />
        </button>
        <button
          className="btn sm icon"
          onClick={() => setPicked(weeks[i + 1])}
          disabled={i >= weeks.length - 1}
          aria-label={t('exams.nextWeek')}
        >
          <Icon name="arrow" size={14} />
        </button>
        <strong>{title}</strong>
        <span className="small muted">{t('exams.weekOf', { n: i + 1, count: weeks.length })}</span>
        {onMove && <span className="small muted">· {t('exams.dragHint')}</span>}
        <span className="xw-legend small">
          {tones.map((tone) => (
            <span key={tone}>
              <i className={`xw-swatch ${tone}`} />
              {t(tone === 'exam' ? 'exams.exam' : tone === 'consultation' ? 'exams.consultation' : 'exams.midtermShort')}
            </span>
          ))}
        </span>
      </div>

      <div className="tt-scroll">
        <div className="xw" style={{ ['--h' as string]: `${height}px`, gridTemplateColumns: columns }}>
          <div className="xw-head" />
          {days.map((d) => {
            const off = vacations.find((v) => v.start <= d && d <= v.end);
            return (
              <div key={d} className={`xw-head ${d === today ? 'today' : ''} ${off ? 'holiday-col' : ''}`}>
                <strong>{fmt(d, { weekday: 'short' })}</strong> {fmt(d, { day: 'numeric', month: 'short' })}
                {off && <div className="small">{holidayName(off)}</div>}
              </div>
            );
          })}

          <div className="xw-times">
            {hours.map((h) => (
              <span key={h} style={{ top: (h - from) * PX_PER_MIN }}>
                {fmtTime(toHHMM(h), settings.timeFormat)}
              </span>
            ))}
          </div>

          {days.map((date) => {
            const off = vacations.some((v) => v.start <= date && date <= v.end);
            const dayEntries = entries.filter((e) => e.date === date);
            const pos = lanes(dayEntries);
            const dragged = drag && entries.find((e) => e.id === drag.id);
            return (
              <div
                key={date}
                className={`xw-day ${off ? 'off' : ''}`}
                onDragOver={
                  onMove && !off
                    ? (e) => {
                        e.preventDefault();
                        setOver({ date, start: toHHMM(minuteAt(e)) });
                      }
                    : undefined
                }
                onDragLeave={() => setOver((o) => (o?.date === date ? null : o))}
                onDrop={
                  onMove && !off
                    ? (e) => {
                        e.preventDefault();
                        if (drag) onMove(drag.id, date, toHHMM(minuteAt(e)));
                        setDrag(null);
                        setOver(null);
                      }
                    : undefined
                }
              >
                {hours.map((h) => (
                  <div key={h} className="xw-line" style={{ top: (h - from) * PX_PER_MIN }} />
                ))}
                {/* where the dragged card would land */}
                {over?.date === date && dragged && (
                  <div
                    className="xw-ghost"
                    style={{
                      top: (toMin(over.start) - from) * PX_PER_MIN,
                      height: (toMin(dragged.end) - toMin(dragged.start)) * PX_PER_MIN,
                    }}
                  >
                    {fmtTime(over.start, settings.timeFormat)}
                  </div>
                )}
                {dayEntries.map((e) => {
                  const p = pos.get(e.id)!;
                  const subject = index.subjects.get(e.subjectId);
                  return (
                    <div
                      key={e.id}
                      className={`xw-card ${e.tone} ${highlight?.has(e.id) ? 'problem' : ''} ${drag?.id === e.id ? 'dragging' : ''}`}
                      style={{
                        top: (toMin(e.start) - from) * PX_PER_MIN,
                        height: Math.max(22, (toMin(e.end) - toMin(e.start)) * PX_PER_MIN - 2),
                        left: `calc(${(p.lane / p.of) * 100}% + 2px)`,
                        width: `calc(${100 / p.of}% - 4px)`,
                      }}
                      draggable={!!onMove}
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('text/plain', e.id);
                        ev.dataTransfer.effectAllowed = 'move';
                        setDrag({ id: e.id, grab: ev.clientY - ev.currentTarget.getBoundingClientRect().top });
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                      onClick={onEdit ? () => onEdit(e.id) : undefined}
                      title={[
                        e.label,
                        `${subjectLabel(subject)} · ${subject?.name}`,
                        `${fmtTime(e.start, settings.timeFormat)}–${fmtTime(e.end, settings.timeFormat)}`,
                        e.groupLabel,
                        index.teachers.get(e.teacherId)?.name,
                        index.rooms.get(e.roomId)?.name,
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      <strong>
                        {subjectLabel(subject)}
                        {!hide.includes('group') && ` · ${e.groupLabel}`}
                      </strong>
                      <span>
                        {fmtTime(e.start, settings.timeFormat)}–{fmtTime(e.end, settings.timeFormat)}
                      </span>
                      {!hide.includes('teacher') && <span>{index.teachers.get(e.teacherId)?.name}</span>}
                      <span>{index.rooms.get(e.roomId)?.name}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
