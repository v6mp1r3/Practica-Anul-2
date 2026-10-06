import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import { fmtTime, range } from '../domain/slots';
import type { Day, Lesson, Settings, SlotIndex } from '../domain/types';
import { lessonsAt } from '../domain/views';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

export type LessonField = 'teacher' | 'audience' | 'room';

export function LessonCard({
  lesson,
  index,
  hide = [],
  conflict,
  highlight,
  dim,
  draggable,
  onDragStart,
  onClick,
}: {
  lesson: Lesson;
  index: DatasetIndex;
  hide?: LessonField[];
  conflict?: boolean;
  highlight?: boolean;
  dim?: boolean;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onClick?: () => void;
}) {
  const { t } = useI18n();
  const a = index.assignmentOf(lesson);
  if (!a) return null;
  const subject = index.subjects.get(a.subjectId);
  const teacher = index.teachers.get(a.teacherId);
  const room = index.rooms.get(lesson.roomId);
  const classes = ['lesson', a.type, lesson.parity !== 'weekly' && 'parity', conflict && 'conflict', highlight && 'highlight', dim && 'dim']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      title={`${subject?.name} — ${t(`activity.${a.type}`)}`}
    >
      <div className="tags">
        {lesson.parity !== 'weekly' && <span>{t(lesson.parity === 'odd' ? 'tt.oddShort' : 'tt.evenShort')}</span>}
        {lesson.locked && <Icon name="lock" size={11} />}
      </div>
      <div className="title">
        {subject?.code} · {t(`activity.${a.type}`)}
      </div>
      {!hide.includes('audience') && <div className="meta">{index.audienceLabel(a.audience)}</div>}
      {!hide.includes('teacher') && <div className="meta">{teacher?.name}</div>}
      {!hide.includes('room') && <div className="meta">{room?.name}</div>}
    </div>
  );
}

export interface GridProps {
  settings: Settings;
  index: DatasetIndex;
  lessons: Lesson[];
  hide?: LessonField[];
  conflictIds?: Set<string>;
  highlightIds?: Set<string>;
  /** Fade lessons that are not highlighted (used to focus on a conflict). */
  dimOthers?: boolean;
  /** Highlights today's column. */
  today?: Day;
  /** Days off this week (by day index): the column shows the holiday instead of lessons. */
  dayOff?: (string | undefined)[];
  /** Enables drag & drop; called with the new slot. */
  onMove?: (lessonId: string, day: Day, slot: SlotIndex) => void;
  /** Tells the grid whether dropping a lesson at a slot would be conflict-free. */
  canDrop?: (lessonId: string, day: Day, slot: SlotIndex) => boolean;
  onLessonClick?: (lesson: Lesson) => void;
  cellClass?: (day: Day, slot: SlotIndex) => string;
  onCellClick?: (day: Day, slot: SlotIndex) => void;
  renderCell?: (day: Day, slot: SlotIndex) => ReactNode;
  className?: string;
}

export function TimetableGrid({
  settings,
  index,
  lessons,
  hide,
  conflictIds,
  highlightIds,
  dimOthers = false,
  today,
  dayOff,
  onMove,
  canDrop,
  onLessonClick,
  cellClass,
  onCellClick,
  renderCell,
  className = '',
}: GridProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const days = range(settings.workingDays);
  const now = useNow(today !== undefined);
  const nowAt = today !== undefined && now ? nowPosition(settings, now) : null;

  return (
    <div className="tt-scroll">
      <div className={`tt ${className}`} style={{ ['--days' as string]: settings.workingDays }}>
        <div className="tt-head" />
        {days.map((d) => (
          <div key={d} className={`tt-head ${d === today ? 'today' : ''} ${dayOff?.[d] ? 'holiday-col' : ''}`}>
            {t(`day.${d}` as 'day.0')}
            {dayOff?.[d] && <div className="small">{dayOff[d]}</div>}
          </div>
        ))}
        {settings.slots.map((s, slot) => (
          <div key={slot} style={{ display: 'contents' }}>
            <div className="tt-time">
              <strong>{slot + 1}</strong>
              <span>{fmtTime(s.start, settings.timeFormat)}</span>
              <span>{fmtTime(s.end, settings.timeFormat)}</span>
            </div>
            {days.map((day) => {
              const key = `${day}:${slot}`;
              const dropState = dragging && over === key ? (canDrop?.(dragging, day, slot) === false ? 'drop-bad' : 'drop-ok') : '';
              return (
                <div
                  key={key}
                  className={`tt-cell ${dropState} ${cellClass?.(day, slot) ?? ''} ${onCellClick ? 'selectable' : ''} ${dayOff?.[day] ? 'day-off' : ''}`}
                  onClick={onCellClick ? () => onCellClick(day, slot) : undefined}
                  onDragOver={
                    onMove
                      ? (e) => {
                          e.preventDefault();
                          setOver(key);
                        }
                      : undefined
                  }
                  onDragLeave={onMove ? () => setOver((o) => (o === key ? null : o)) : undefined}
                  onDrop={
                    onMove
                      ? (e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData('text/plain');
                          if (id) onMove(id, day, slot);
                          setDragging(null);
                          setOver(null);
                        }
                      : undefined
                  }
                >
                  {nowAt && day === today && slot === nowAt.slot && (
                    <div className="tt-now" style={{ top: `${nowAt.frac * 100}%` }}>
                      <span>{nowAt.label}</span>
                    </div>
                  )}
                  {renderCell?.(day, slot)}
                  {/* the weekly grid shows the repeating week; session (dated) pairs have their own calendar */}
                  {lessonsAt(lessons, day, slot)
                    .filter((l) => !l.date && !dayOff?.[day])
                    .map((l) => (
                      <LessonCard
                        key={l.id}
                        lesson={l}
                        index={index}
                        hide={hide}
                        conflict={conflictIds?.has(l.id)}
                        highlight={highlightIds?.has(l.id)}
                        dim={dimOthers && !!highlightIds && !highlightIds.has(l.id)}
                        draggable={!!onMove && !l.locked}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', l.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragging(l.id);
                        }}
                        onClick={onLessonClick ? () => onLessonClick(l) : undefined}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Current time, refreshed every minute (only when the grid shows today). */
function useNow(enabled: boolean): Date | null {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [enabled]);
  return enabled ? now : null;
}

/** Which pair row the current time falls in, and how far through it. */
function nowPosition(settings: Settings, now: Date): { slot: number; frac: number; label: string } | null {
  const m = now.getHours() * 60 + now.getMinutes();
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const slot = settings.slots.findIndex((s) => m >= toMin(s.start) && m < toMin(s.end));
  if (slot < 0) return null;
  const s = settings.slots[slot];
  const label = fmtTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, settings.timeFormat);
  return { slot, frac: (m - toMin(s.start)) / (toMin(s.end) - toMin(s.start)), label };
}

export function Legend() {
  const { t } = useI18n();
  return (
    <div className="legend">
      <span>
        <i style={{ background: 'var(--lecture)' }} />
        {t('activity.lecture')}
      </span>
      <span>
        <i style={{ background: 'var(--seminar)' }} />
        {t('activity.seminar')}
      </span>
      <span>
        <i style={{ background: 'var(--lab)' }} />
        {t('activity.lab')}
      </span>
      <span>
        {t('tt.oddShort')} / {t('tt.evenShort')} — {t('parity.odd')} / {t('parity.even')}
      </span>
    </div>
  );
}

/** Single-day list for phones and the "today" card. */
export function Agenda({
  settings,
  index,
  lessons,
  day,
  hide,
  off,
  unavailable = [],
}: {
  settings: Settings;
  index: DatasetIndex;
  lessons: Lesson[];
  day: Day;
  hide?: LessonField[];
  /** The day is a holiday: no lessons, just its name. */
  off?: string;
  /** Pairs of that day the teacher is unavailable. */
  unavailable?: number[];
}) {
  const { t } = useI18n();
  if (off) return <div className="agenda-free">{t('vacation.now', { name: off })}</div>;
  const dayLessons = lessons.filter((l) => l.day === day);
  if (!dayLessons.length && !unavailable.length) return <div className="agenda-free">{t('tt.noLessons')}</div>;
  const used = [...dayLessons.map((l) => l.slot), ...unavailable];
  const first = Math.min(...used);
  const last = Math.max(...used);

  return (
    <div className="agenda">
      {range(last - first + 1).map((i) => {
        const slot = first + i;
        const here = dayLessons.filter((l) => l.slot === slot);
        return (
          <div key={slot} className="agenda-item">
            <div className="when">
              <strong>{fmtTime(settings.slots[slot]?.start, settings.timeFormat)}</strong>
              {fmtTime(settings.slots[slot]?.end, settings.timeFormat)}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {here.length ? (
                here.map((l) => <LessonCard key={l.id} lesson={l} index={index} hide={hide} />)
              ) : unavailable.includes(slot) ? (
                <div className="agenda-free unavailable">{t('availability.unavailable')}</div>
              ) : (
                <div className="agenda-free">{t('tt.free')}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
