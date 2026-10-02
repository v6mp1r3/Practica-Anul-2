import { useState, type DragEvent, type ReactNode } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import { range } from '../domain/slots';
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
  /** Highlights today's column. */
  today?: Day;
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
  today,
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

  return (
    <div className="tt-scroll">
      <div className={`tt ${className}`} style={{ ['--days' as string]: settings.workingDays }}>
        <div className="tt-head" />
        {days.map((d) => (
          <div key={d} className={`tt-head ${d === today ? 'today' : ''}`}>
            {t(`day.${d}` as 'day.0')}
          </div>
        ))}
        {settings.slots.map((s, slot) => (
          <div key={slot} style={{ display: 'contents' }}>
            <div className="tt-time">
              <strong>{slot + 1}</strong>
              <span>
                {s.start}–{s.end}
              </span>
            </div>
            {days.map((day) => {
              const key = `${day}:${slot}`;
              const dropState = dragging && over === key ? (canDrop?.(dragging, day, slot) === false ? 'drop-bad' : 'drop-ok') : '';
              return (
                <div
                  key={key}
                  className={`tt-cell ${dropState} ${cellClass?.(day, slot) ?? ''} ${onCellClick ? 'selectable' : ''}`}
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
                  {renderCell?.(day, slot)}
                  {lessonsAt(lessons, day, slot).map((l) => (
                    <LessonCard
                      key={l.id}
                      lesson={l}
                      index={index}
                      hide={hide}
                      conflict={conflictIds?.has(l.id)}
                      highlight={highlightIds?.has(l.id)}
                      dim={highlightIds && highlightIds.size > 0 && !highlightIds.has(l.id)}
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
}: {
  settings: Settings;
  index: DatasetIndex;
  lessons: Lesson[];
  day: Day;
  hide?: LessonField[];
}) {
  const { t } = useI18n();
  const dayLessons = lessons.filter((l) => l.day === day);
  if (!dayLessons.length) return <div className="agenda-free">{t('tt.noLessons')}</div>;
  const first = Math.min(...dayLessons.map((l) => l.slot));
  const last = Math.max(...dayLessons.map((l) => l.slot));

  return (
    <div className="agenda">
      {range(last - first + 1).map((i) => {
        const slot = first + i;
        const here = dayLessons.filter((l) => l.slot === slot);
        return (
          <div key={slot} className="agenda-item">
            <div className="when">
              <strong>{settings.slots[slot]?.start}</strong>
              {settings.slots[slot]?.end}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {here.length ? (
                here.map((l) => <LessonCard key={l.id} lesson={l} index={index} hide={hide} />)
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
