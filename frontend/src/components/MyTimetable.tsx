// Personal timetable for teachers and students: today's pairs, what's next,
// and the full week — the agenda is the default on phones.
import { useEffect, useState } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import { fmtTime, range } from '../domain/slots';
import type { Lesson, Parity, Settings, Vacation } from '../domain/types';
import { toDateString } from '../domain/changes';
import { useHolidayName } from './Holidays';
import { dayIndexOf, inWeek, weekParityOf } from '../domain/views';
import { useI18n } from '../i18n';
import { Agenda, Legend, LessonCard, TimetableGrid, type LessonField } from './TimetableGrid';
import { Segmented } from './ui';

const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;

/** The lesson happening now, or the next one later today. */
export function nextLesson(lessons: Lesson[], settings: Settings, now = new Date()): { lesson: Lesson; current: boolean } | null {
  const day = dayIndexOf(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const today = lessons.filter((l) => l.day === day).sort((a, b) => a.slot - b.slot);
  for (const l of today) {
    const s = settings.slots[l.slot];
    if (!s) continue;
    if (minutes < toMin(s.end)) return { lesson: l, current: minutes >= toMin(s.start) };
  }
  return null;
}

export function MyTimetable({
  settings,
  index,
  lessons,
  hide,
  holidays = [],
}: {
  settings: Settings;
  index: DatasetIndex;
  lessons: Lesson[];
  hide?: LessonField[];
  /** The year's days off: the days of this week that fall on one show it instead of lessons. */
  holidays?: Vacation[];
}) {
  const { t } = useI18n();
  const holidayName = useHolidayName();
  const now = new Date();
  const todayIdx = dayIndexOf(now);
  const thisWeek = weekParityOf(now);
  // the dates of this week (Monday first), e.g. Friday 25 December -> Crăciunul
  const weekDates = range(7).map((d) => {
    const x = new Date(now);
    x.setDate(now.getDate() - todayIdx + d);
    return toDateString(x);
  });
  const [mode, setMode] = useState<'week' | 'day'>(isPhone() ? 'day' : 'week');
  const [week, setWeek] = useState<Parity>(settings.weekParity ? thisWeek : 'weekly');
  const [day, setDay] = useState(todayIdx < settings.workingDays ? todayIdx : 0);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const onChange = () => mq.matches && setMode('day');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const shown = lessons.filter((l) => !l.date && inWeek(l, week));
  // only the week actually happening now is tied to dates
  const isThisWeek = !settings.weekParity || week === thisWeek;
  const dayOff = weekDates.map((date) => {
    const h = isThisWeek ? holidays.find((v) => v.start <= date && date <= v.end) : undefined;
    return h ? holidayName(h) : undefined;
  });
  const todays = lessons.filter((l) => !l.date && inWeek(l, settings.weekParity ? thisWeek : 'weekly'));
  const next = dayOff[todayIdx] ? null : nextLesson(todays, settings, now);

  return (
    <div className="stack">
      {next && (
        <div className="card">
          <div className="card-body row wrap" style={{ gap: 16 }}>
            <div>
              <div className="small muted">{next.current ? t('my.now') : t('my.next')}</div>
              <div className="stat-value">{fmtTime(settings.slots[next.lesson.slot]?.start, settings.timeFormat)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <LessonCard lesson={next.lesson} index={index} hide={hide} />
            </div>
          </div>
        </div>
      )}

      <div className="row wrap">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'day', label: t('my.day') },
            { value: 'week', label: t('common.week') },
          ]}
        />
        {settings.weekParity && (
          <Segmented
            value={week}
            onChange={setWeek}
            options={[
              { value: 'odd', label: t('tt.weekOdd') + (thisWeek === 'odd' ? ' •' : '') },
              { value: 'even', label: t('tt.weekEven') + (thisWeek === 'even' ? ' •' : '') },
            ]}
          />
        )}
        <span className="spacer" />
        {settings.weekParity && (
          <span className="badge primary">{t('my.currentWeek', { week: t(thisWeek === 'odd' ? 'tt.weekOdd' : 'tt.weekEven') })}</span>
        )}
      </div>

      {mode === 'day' ? (
        <div className="card">
          <div className="card-header" style={{ overflowX: 'auto' }}>
            <div className="segmented">
              {range(settings.workingDays).map((d) => (
                <button key={d} type="button" aria-pressed={d === day} onClick={() => setDay(d)}>
                  {t(`dayShort.${d}` as 'dayShort.0')}
                  {d === todayIdx ? ' •' : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="card-body">
            <Agenda settings={settings} index={index} lessons={shown} day={day} hide={hide} off={dayOff[day]} />
          </div>
        </div>
      ) : (
        <>
          <TimetableGrid settings={settings} index={index} lessons={shown} hide={hide} today={todayIdx} dayOff={dayOff} />
          <Legend />
        </>
      )}
    </div>
  );
}
