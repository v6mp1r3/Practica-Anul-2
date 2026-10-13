// One particular week of a teacher: their pairs that week are filled in and
// locked, and any free pair can be marked "can't that day" (e.g. next Thursday,
// pair 3). It doesn't move anything in the timetable: the administration sees
// it, and nobody is proposed as a substitute then.
import { useState, type ReactNode } from 'react';
import { dateSlotKey } from '../domain/availability';
import { fmtDate, parseDate, toDateString } from '../domain/changes';
import { teaches, unavailableIn } from '../domain/indexes';
import { paritiesOverlap, slotKey } from '../domain/slots';
import { subjectLabel } from '../domain/subjects';
import type { Day, Lesson } from '../domain/types';
import { datesOfWeek, gridDays, weekParityOf } from '../domain/views';
import { dateLocale, useI18n } from '../i18n';
import { useDataset } from '../state/data';
import { Icon } from './Icon';
import { TimetableGrid } from './TimetableGrid';

/** How far ahead a week can be picked. */
const WEEKS_AHEAD = 26;

/** The teacher's pairs in the week starting on `monday`, each on its weekday (session pairs on their date). */
export function teacherWeekLessons(all: Lesson[], isTeachers: (l: Lesson) => boolean, monday: Date): Lesson[] {
  const dates = datesOfWeek(monday);
  const parity = weekParityOf(monday);
  return all
    .filter((l) => isTeachers(l) && (l.date ? dates.includes(l.date) : paritiesOverlap(l.parity, parity)))
    .map((l) => (l.date ? { ...l, date: undefined, parity: 'weekly' as const } : l));
}

export function WeekAvailability({
  teacherId,
  value,
  onChange,
}: {
  teacherId: string;
  /** Teacher.unavailableOn */
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { t, lang } = useI18n();
  const { dataset, index, published } = useDataset();
  const [offset, setOffset] = useState(0);
  const teacher = index.teachers.get(teacherId);

  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  const dates = datesOfWeek(monday);
  const today = toDateString(now);
  const lessons = teacherWeekLessons(published?.lessons ?? [], (l) => teaches(index.assignmentOf(l), teacherId), monday);
  const days = gridDays(
    dataset.settings,
    (published?.lessons ?? []).filter((l) => l.date && dates.includes(l.date)),
  );

  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => parseDate(d).toLocaleDateString(dateLocale(lang), o);
  const title = `${fmt(dates[0], { day: 'numeric', month: 'long' })} – ${fmt(dates[6], { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const marked = value.filter((k) => dates.includes(k.slice(0, 10))).length;

  type State = 'lesson' | 'consultation' | 'usual' | 'off' | 'past' | 'free';
  const stateOf = (d: Day, s: number): State => {
    if (lessons.some((l) => l.day === d && l.slot === s)) return 'lesson';
    if (teacher?.consultation === slotKey(d, s)) return 'consultation';
    if (teacher && unavailableIn(teacher, weekParityOf(monday)).has(slotKey(d, s))) return 'usual';
    if (value.includes(dateSlotKey(dates[d], s))) return 'off';
    return dates[d] < today ? 'past' : 'free';
  };

  function toggle(d: Day, s: number) {
    const st = stateOf(d, s);
    if (st !== 'free' && st !== 'off') return;
    const k = dateSlotKey(dates[d], s);
    onChange(st === 'off' ? value.filter((x) => x !== k) : [...value, k].sort());
  }

  const render = (d: Day, s: number): ReactNode => {
    switch (stateOf(d, s)) {
      case 'lesson':
        return lessons
          .filter((l) => l.day === d && l.slot === s)
          .map((l) => {
            const a = index.assignmentOf(l)!;
            return (
              <div key={l.id} className="busy-lesson">
                <strong>
                  {subjectLabel(index.subjects.get(a.subjectId))} · {t(`activity.${a.type}`)}
                </strong>
                <span>{index.audienceLabel(a.audience)}</span>
              </div>
            );
          });
      case 'consultation':
        return t('availability.consultation');
      case 'usual':
        return t('myAvail.usuallyOff');
      case 'off':
        return t('availability.unavailable');
      default:
        return '';
    }
  };
  const CLASS: Record<State, string> = {
    lesson: 'state-lesson',
    consultation: 'state-consultation',
    usual: 'state-off',
    off: 'state-unavailable',
    past: 'state-past',
    free: 'state-free',
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn sm icon flip" onClick={() => setOffset(offset - 1)} disabled={offset <= 0} aria-label={t('exams.prevWeek')}>
          <Icon name="arrow" size={14} />
        </button>
        <button
          className="btn sm icon"
          onClick={() => setOffset(offset + 1)}
          disabled={offset >= WEEKS_AHEAD}
          aria-label={t('exams.nextWeek')}
        >
          <Icon name="arrow" size={14} />
        </button>
        <strong>{title}</strong>
        <span className="small muted">
          {offset === 0 ? t('myAvail.thisWeek') : offset === 1 ? t('myAvail.nextWeek') : ''}
          {dataset.settings.weekParity && ` · ${t(weekParityOf(monday) === 'odd' ? 'tt.weekOdd' : 'tt.weekEven').toLowerCase()}`}
        </span>
        {marked > 0 && <span className="badge danger">{t('myAvail.markedCount', { count: marked })}</span>}
      </div>
      <TimetableGrid
        className="avail"
        settings={dataset.settings}
        index={index}
        lessons={[]}
        days={days}
        today={offset === 0 ? (((now.getDay() + 6) % 7) as Day) : undefined}
        dayNote={(d) => fmtDate(dates[d]).slice(0, 5)}
        cellClass={(d, s) => CLASS[stateOf(d, s)]}
        onCellClick={toggle}
        renderCell={render}
      />
    </div>
  );
}
