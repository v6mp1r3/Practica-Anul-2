// Frecvență redusă: the timetable of each session (Configurare), as UTM
// publishes it — consecutive pairs of a subject are one block
// ("08:00–13:00 · c. Programarea calculatoarelor · teacher · room").
// One group (or a teacher): day by day. Several groups (a torent): a table
// with the dates as rows and the groups as columns.
import { fmtDate, parseDate, sessionDates, toDateString } from '../domain/changes';
import { evaluationOf, vacationOn } from '../domain/exams';
import type { DatasetIndex } from '../domain/indexes';
import { fmtTime } from '../domain/slots';
import type { Assignment, Dataset, Lesson } from '../domain/types';
import { dateLocale, useI18n } from '../i18n';
import { useHolidayName } from './Holidays';
import type { LessonField } from './TimetableGrid';

export { sessionDates };

export interface SessionBlock {
  key: string;
  date: string;
  first: number;
  last: number;
  lesson: Lesson;
  assignment: Assignment;
}

/** Consecutive pairs of the same class (same subject, audience and room) on a date make one block. */
export function sessionBlocks(lessons: Lesson[], index: DatasetIndex): SessionBlock[] {
  const dated = lessons.filter((l) => l.date).sort((a, b) => a.date!.localeCompare(b.date!) || a.slot - b.slot);
  const out: SessionBlock[] = [];
  for (const l of dated) {
    const a = index.assignmentOf(l);
    if (!a) continue;
    const prev = out.find((b) => b.date === l.date && b.assignment.id === a.id && b.lesson.roomId === l.roomId && b.last === l.slot - 1);
    if (prev) prev.last = l.slot;
    else out.push({ key: l.id, date: l.date!, first: l.slot, last: l.slot, lesson: l, assignment: a });
  }
  return out;
}

const TYPE_PREFIX = { lecture: 'c.', seminar: 'sem.', lab: 'lab.', project: 'pr.' } as const;

function BlockLine({ block, index, dataset, hide }: { block: SessionBlock; index: DatasetIndex; dataset: Dataset; hide: LessonField[] }) {
  const { t } = useI18n();
  const { settings } = dataset;
  const a = block.assignment;
  const subject = index.subjects.get(a.subjectId);
  return (
    <div className={`fr-block ${a.type}`}>
      <span className="fr-time">
        {fmtTime(settings.slots[block.first]?.start, settings.timeFormat)}–{fmtTime(settings.slots[block.last]?.end, settings.timeFormat)}
      </span>
      <strong>
        {TYPE_PREFIX[a.type]} {subject?.name}
      </strong>
      <span className="small muted">
        {[
          !hide.includes('teacher') && index.teachers.get(a.teacherId)?.name,
          !hide.includes('room') && index.rooms.get(block.lesson.roomId)?.name,
          !hide.includes('audience') && index.audienceLabel(a.audience),
          a.audience.kind === 'subgroup' && t('session.half', { n: a.audience.subgroup }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  );
}

export function SessionTimetable({
  dataset,
  index,
  lessons,
  groupId,
  groupIds,
  hide = [],
}: {
  dataset: Dataset;
  index: DatasetIndex;
  lessons: Lesson[];
  /** One group: day by day. */
  groupId?: string;
  /** Several groups (a torent): dates × groups table. */
  groupIds?: string[];
  hide?: LessonField[];
}) {
  const { t, lang } = useI18n();
  const holidayName = useHolidayName();
  const { settings } = dataset;
  const columns = groupIds && groupIds.length > 1 ? groupIds : null;
  const days = groupId ? index.groupDays(groupId) : (settings.formDays?.reduced ?? [0, 1, 2, 3, 4, 5, 6]);
  const today = toDateString(new Date());
  const ev = evaluationOf(dataset);
  const fmt = (s: string, o: Intl.DateTimeFormatOptions) => parseDate(s).toLocaleDateString(dateLocale(lang), o);
  const blocks = sessionBlocks(lessons, index);

  return (
    <div className="stack">
      {settings.reducedSessions.map((s, i) => {
        const dates = sessionDates(s.start, s.end, days);
        const inSession = blocks.filter((b) => b.date >= s.start && b.date <= s.end);
        const past = s.end < today;
        return (
          <section key={i} className="card" style={past ? { opacity: 0.6 } : undefined}>
            <div className="card-header">
              <h2>
                {t('setup.session')} {i + 1}
              </h2>
              <span className="muted small">
                {fmt(s.start, { day: '2-digit', month: 'long' })} – {fmt(s.end, { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
              <span className="spacer" />
              <span className="badge">{t('session.days', { count: dates.length })}</span>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {dates.length === 0 ? (
                <p className="muted">{t('session.noDays')}</p>
              ) : columns ? (
                // a torent: dates as rows, groups as columns (like the faculty's sheets)
                <div className="table-wrap">
                  <table className="table fr-table">
                    <thead>
                      <tr>
                        <th>{t('session.day')}</th>
                        {columns.map((g) => (
                          <th key={g}>{index.groups.get(g)?.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dates.map((d) => {
                        const off = vacationOn(ev, d);
                        return (
                          <tr key={d} className={d === today ? 'today' : ''}>
                            <td className="fr-date">
                              <strong>{fmt(d, { weekday: 'long' })}</strong>
                              <span>{fmtDate(d)}</span>
                            </td>
                            {off ? (
                              <td colSpan={columns.length} className="muted">
                                {holidayName(off)}
                              </td>
                            ) : (
                              columns.map((g) => (
                                <td key={g}>
                                  {inSession
                                    .filter((b) => b.date === d && index.audienceTouchesGroup(b.assignment.audience, g))
                                    .map((b) => (
                                      <BlockLine key={b.key} block={b} index={index} dataset={dataset} hide={['audience']} />
                                    ))}
                                </td>
                              ))
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : inSession.length ? (
                // one group or a teacher: day by day, only the days with classes
                <div className="exam-days">
                  {dates
                    .filter((d) => inSession.some((b) => b.date === d))
                    .map((d) => (
                      <section key={d} className={`card exam-day ${d < today ? 'past' : ''}`}>
                        <header>
                          <strong>{fmt(d, { weekday: 'long' })}</strong>
                          <span>{fmt(d, { day: 'numeric', month: 'long' })}</span>
                        </header>
                        <div className="fr-day">
                          {inSession
                            .filter((b) => b.date === d)
                            .map((b) => (
                              <BlockLine key={b.key} block={b} index={index} dataset={dataset} hide={hide} />
                            ))}
                        </div>
                      </section>
                    ))}
                </div>
              ) : (
                <p className="muted">{t('session.noClasses')}</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * For weekly pages (teacher, room, group views): when the view also has
 * reduced-attendance session pairs, show them in their session calendar below.
 */
export function SessionsSection({
  dataset,
  index,
  lessons,
  hide,
}: {
  dataset: Dataset;
  index: DatasetIndex;
  lessons: Lesson[];
  hide?: LessonField[];
}) {
  const { t } = useI18n();
  if (!lessons.some((l) => l.date) || !dataset.settings.reducedSessions?.length) return null;
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      <div>
        <h2>{t('session.sectionTitle')}</h2>
        <p className="small muted">{t('session.sectionHint')}</p>
      </div>
      <SessionTimetable dataset={dataset} index={index} lessons={lessons} hide={hide} />
    </div>
  );
}
