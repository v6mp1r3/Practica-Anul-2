// Public timetables — no sign-in. Two pages: students (any group) and
// teachers (any teacher); the last choice is remembered on this device.
import { useState } from 'react';
import { ExamCalendar, type CalendarEntry } from '../../components/ExamCalendar';
import { examEntries } from '../../components/examEntries';
import { parseDate, toDateString } from '../../domain/changes';
import { evaluationOf, midtermRange, weeksLabel } from '../../domain/exams';
import type { ExamEvent, Lesson, StudyCycle } from '../../domain/types';
import { ChangesCard } from '../../components/ChangesCard';
import { HolidaysCard, HolidayToday } from '../../components/Holidays';
import { MyTimetable } from '../../components/MyTimetable';
import { Select } from '../../components/Select';
import { SessionTimetable, SessionsSection } from '../../components/SessionTimetable';
import { Empty, PageHeader, Segmented } from '../../components/ui';
import { fmtTime, parseSlotKey } from '../../domain/slots';
import { filterLessons, streamGroups } from '../../domain/views';
import { dateLocale, useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { downloadFile } from '../../utils/download';
import { timetableToIcs } from '../../utils/export';

type Kind = 'group' | 'teacher';
type Tab = 'timetable' | 'midterms' | 'exams' | 'reexams';
interface Choice {
  kind: Kind;
  id: string;
  subgroup: number | null;
  /** Licență or master's: which groups (students) or which classes (teachers) are shown. */
  cycle?: StudyCycle;
}

const keyFor = (kind: Kind) => `eduschedule:public:${kind}`;

function loadChoice(kind: Kind): Choice {
  try {
    const c = JSON.parse(localStorage.getItem(keyFor(kind)) ?? 'null') as Choice | null;
    if (c && c.kind === kind) return c;
  } catch {
    /* ignore */
  }
  return { kind, id: '', subgroup: null };
}

function saveChoice(c: Choice) {
  try {
    localStorage.setItem(keyFor(c.kind), JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function StudentSchedule() {
  return <Schedule kind="group" />;
}

export function TeacherSchedule() {
  return <Schedule kind="teacher" />;
}

function Schedule({ kind }: { kind: Kind }) {
  const { t, lang } = useI18n();
  const { dataset, index, published, exams } = useDataset();
  // Orar | Atestări | Examene | Reexaminări for the chosen group or teacher
  const [tab, setTab] = useState<Tab>('timetable');
  const [choice, setChoiceState] = useState<Choice>(() => loadChoice(kind));
  const setChoice = (c: Choice) => {
    setChoiceState(c);
    saveChoice(c);
  };

  const group = choice.kind === 'group' ? index.groups.get(choice.id) : undefined;
  // a stream ("stream:<id>"): its groups' timetables together
  const stream = choice.kind === 'group' && choice.id.startsWith('stream:') ? index.streams.get(choice.id.slice(7)) : undefined;
  const teacher = choice.kind === 'teacher' ? index.teachers.get(choice.id) : undefined;
  const chosen = group ?? stream ?? teacher;

  // licență | master's
  const cycle: StudyCycle = choice.cycle ?? 'licenta';
  const inCycle = (groupId: string) => (index.groups.get(groupId)?.cycle ?? 'licenta') === cycle;
  const groups = [...dataset.groups].filter((g) => inCycle(g.id)).sort((a, b) => a.name.localeCompare(b.name));
  const streams = dataset.streams.filter((st) => st.groupIds.some(inCycle));
  const faculties = [...new Set(groups.map((g) => g.faculty ?? ''))];
  // teachers of this cycle's groups
  const cycleLoads = dataset.assignments.filter((a) => index.cohorts(a.audience).some((c) => inCycle(c.groupId)));
  const teachers = [...dataset.teachers]
    .filter((x) => cycleLoads.some((a) => a.teacherId === x.id))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
  const setCycle = (c: StudyCycle) => {
    // keep the choice if it still belongs to the cycle
    const keep =
      choice.kind === 'teacher'
        ? dataset.assignments.some(
            (a) =>
              a.teacherId === choice.id && index.cohorts(a.audience).some((x) => (index.groups.get(x.groupId)?.cycle ?? 'licenta') === c),
          )
        : streamGroups(index, choice.id).some((g) => (index.groups.get(g)?.cycle ?? 'licenta') === c);
    setChoice({ ...choice, cycle: c, id: keep ? choice.id : '', subgroup: keep ? choice.subgroup : null });
  };
  // a teacher's classes: only those of this cycle
  const ofCycle = (l: Lesson) => index.cohorts(index.assignmentOf(l)!.audience).some((c) => inCycle(c.groupId));

  const chosenLessons =
    published && chosen
      ? filterLessons(
          index,
          published.lessons,
          group || stream
            ? { kind: 'group', id: choice.id, subgroup: group ? choice.subgroup : null }
            : { kind: 'teacher', id: teacher!.id },
        )
      : [];
  const lessons = choice.kind === 'teacher' ? chosenLessons.filter(ofCycle) : chosenLessons;
  // reduced attendance (one group, or a torent of FR groups): the session timetable
  const chosenGroups = group || stream ? streamGroups(index, choice.id) : [];
  const reducedGroup =
    chosenGroups.length > 0 &&
    chosenGroups.every((g) => index.groups.get(g)?.studyForm === 'reduced') &&
    dataset.settings.reducedSessions.length > 0;
  // is today inside the exam session or the retakes (for this group's form of study)?
  // a master's group follows the master calendar
  const ev = evaluationOf(dataset, group?.cycle ?? 'licenta');
  const todayStr = toDateString(new Date());
  const sessionRanges = [
    ...(group?.studyForm === 'reduced' ? ev.reducedExamSession : ev.examSession).map((r) => ({ ...r, round: 'session' as const })),
    ...ev.reexamSession.map((r) => ({ ...r, round: 'reexam' as const })),
  ];
  const sessionNow = sessionRanges.find((r) => r.start <= todayStr && todayStr <= r.end);
  const fmtShort = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long' });
  const consultation = teacher?.consultation ? parseSlotKey(teacher.consultation) : null;

  const subtitle = group
    ? `${group.program} · ${t(`form.${group.studyForm}`)} · ${t('groups.year')} ${group.year}`
    : stream
      ? `${t('groups.stream')}: ${stream.groupIds
          .map((g) => index.groups.get(g)?.name)
          .filter(Boolean)
          .join(', ')}`
      : teacher
        ? `${teacher.title} · ${teacher.department}`
        : undefined;

  return (
    <div className="page">
      <PageHeader
        title={chosen ? chosen.name : t(kind === 'group' ? 'nav.studentSchedule' : 'nav.teacherSchedule')}
        subtitle={subtitle}
        actions={
          <>
            {group && group.subgroups > 1 && (
              <Segmented
                value={String(choice.subgroup ?? 0)}
                onChange={(v) => setChoice({ ...choice, subgroup: Number(v) || null })}
                options={[
                  { value: '0', label: t('view.allSubgroups') },
                  ...Array.from({ length: group.subgroups }, (_, i) => ({
                    value: String(i + 1),
                    label: `${t('assignments.kind.subgroup')} ${i + 1}`,
                  })),
                ]}
              />
            )}
            {lessons.length > 0 && (
              <button
                className="btn"
                onClick={() => downloadFile(`orar-${chosen!.name}.ics`, timetableToIcs(lessons, index, dataset.settings), 'text/calendar')}
              >
                {t('my.addToCalendar')}
              </button>
            )}
          </>
        }
      />

      {/* licență or master's, then any group (students' page) or any teacher (teachers' page) */}
      <div className="row wrap" style={{ gap: 8, marginBottom: 18 }}>
        <Segmented
          value={cycle}
          onChange={setCycle}
          options={[
            { value: 'licenta', label: t('cycle.licenta') },
            { value: 'master', label: t('cycle.master') },
          ]}
        />
        {choice.kind === 'group' ? (
          <Select
            className="select pill"
            style={{ minWidth: 200 }}
            value={choice.id}
            onChange={(e) => setChoice({ ...choice, kind: 'group', id: e.target.value, subgroup: null })}
            aria-label={t('view.group')}
          >
            <option value="">{t('public.chooseGroup')}</option>
            {faculties.map((f) => (
              <optgroup key={f} label={f || '—'}>
                {groups
                  .filter((g) => (g.faculty ?? '') === f)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} · {t('groups.year')} {g.year}
                    </option>
                  ))}
              </optgroup>
            ))}
            {/* streams: e.g. FAF-251/252/253 when they have classes together */}
            {streams.length > 0 && (
              <optgroup label={t('groups.streams')}>
                {[...streams]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((st) => (
                    <option key={st.id} value={`stream:${st.id}`}>
                      {st.name} (
                      {st.groupIds
                        .map((g) => index.groups.get(g)?.name)
                        .filter(Boolean)
                        .join(', ')}
                      )
                    </option>
                  ))}
              </optgroup>
            )}
          </Select>
        ) : (
          <Select
            className="select pill"
            style={{ minWidth: 220 }}
            value={choice.id}
            onChange={(e) => setChoice({ ...choice, kind: 'teacher', id: e.target.value, subgroup: null })}
            aria-label={t('view.teacher')}
          >
            <option value="">{t('public.chooseTeacher')}</option>
            {teachers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        )}
        {consultation && (
          <span className="badge primary">
            {t('availability.consultation')}: {t(`day.${consultation[0]}` as 'day.0')}{' '}
            {fmtTime(dataset.settings.slots[consultation[1]]?.start, dataset.settings.timeFormat)}
          </span>
        )}
      </div>

      {!chosen ? (
        <div className="card">
          <Empty>{choice.kind === 'group' ? t('public.chooseGroupHint') : t('public.chooseTeacherHint')}</Empty>
        </div>
      ) : (
        <div className="stack">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'timetable', label: t('nav.timetable') },
              { value: 'midterms', label: t('exams.midterms') },
              { value: 'exams', label: t('exams.exams') },
              { value: 'reexams', label: t('exams.reexams') },
            ]}
          />
          {tab !== 'timetable' ? (
            <Evaluations
              tab={tab}
              who={group || stream ? { groupId: choice.id, subgroup: group ? choice.subgroup : null } : { teacherId: teacher!.id }}
              events={choice.kind === 'teacher' ? exams.filter((e) => inCycle(e.groupId)) : exams}
            />
          ) : !published ? (
            <div className="card">
              <Empty>{t('tt.notPublished')}</Empty>
            </div>
          ) : (
            <TimetableTab />
          )}
        </div>
      )}
    </div>
  );

  function TimetableTab() {
    return (
      <div className="stack">
        {sessionNow && (
          // exam weeks: no classes, only consultations and exams
          <div className="card session-banner">
            <div className="card-body row wrap">
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong>{t(sessionNow.round === 'session' ? 'exams.sessionNow' : 'exams.reexamNow')}</strong>
                <div className="small muted">
                  {t('exams.noClasses', { from: fmtShort(sessionNow.start), to: fmtShort(sessionNow.end) })}
                </div>
              </div>
              <button className="btn primary" onClick={() => setTab(sessionNow.round === 'session' ? 'exams' : 'reexams')}>
                {t(sessionNow.round === 'session' ? 'exams.seeExams' : 'exams.seeReexams')}
              </button>
            </div>
          </div>
        )}
        <HolidayToday dataset={dataset} />
        {!sessionNow && !stream && <ChangesCard groupId={group?.id} teacherId={teacher?.id} />}
        {sessionNow ? null : reducedGroup ? (
          // reduced attendance: the full calendar of every session, not one week
          <SessionTimetable
            dataset={dataset}
            index={index}
            lessons={lessons}
            groupId={group?.id}
            groupIds={chosenGroups}
            hide={group ? ['audience'] : []}
          />
        ) : (
          <>
            <MyTimetable
              settings={dataset.settings}
              index={index}
              lessons={lessons}
              hide={group ? ['audience'] : stream ? [] : ['teacher']}
              holidays={evaluationOf(dataset).vacations}
            />
            {teacher && <SessionsSection dataset={dataset} index={index} lessons={lessons} hide={['teacher']} />}
          </>
        )}
        <HolidaysCard dataset={dataset} />
      </div>
    );
  }
}

/** Atestări, exams or retakes of one group or teacher, as a calendar by date. */
function Evaluations({
  tab,
  who,
  events,
}: {
  tab: Exclude<Tab, 'timetable'>;
  who: { groupId: string; subgroup: number | null } | { teacherId: string };
  events: ExamEvent[];
}) {
  const { t, lang } = useI18n();
  const { dataset, index } = useDataset();
  // a single master's group shows the master atestare weeks
  const ev = evaluationOf(dataset, 'groupId' in who ? (index.groups.get(who.groupId)?.cycle ?? 'licenta') : 'licenta');
  // a group, or every group of a stream
  const groupIds = 'groupId' in who ? streamGroups(index, who.groupId) : [];
  const mine = (e: ExamEvent) => ('groupId' in who ? groupIds.includes(e.groupId) : e.teacherId === who.teacherId);
  const hide: ('teacher' | 'group')[] = 'groupId' in who ? (groupIds.length > 1 ? [] : ['group']) : ['teacher'];
  const fmt = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' });

  let entries: CalendarEntry[];
  if (tab === 'midterms') {
    entries = examEntries(
      events.filter((e) => e.round.startsWith('midterm') && mine(e)),
      index,
      t,
    );
    if ('groupId' in who && who.subgroup) {
      // the other subgroup's lab atestare isn't theirs
      const sg = who.subgroup;
      const ids = new Set(events.filter((e) => e.subgroup && e.subgroup !== sg).map((e) => e.id));
      entries = entries.filter((e) => !ids.has(e.id));
    }
  } else {
    const rounds = tab === 'exams' ? ['session'] : ['remidterm1', 'remidterm2', 'reexam'];
    entries = examEntries(
      events.filter((e) => rounds.includes(e.round) && mine(e)),
      index,
      t,
    );
  }

  if (tab !== 'midterms')
    return (
      <ExamCalendar
        entries={entries}
        index={index}
        settings={dataset.settings}
        hide={hide}
        empty={<Empty>{t('exams.notPublished')}</Empty>}
      />
    );

  // Atestări: atestarea 1 and atestarea 2, each in its own week
  return (
    <div className="stack">
      {([1, 2] as const).map((n) => {
        const week = midtermRange(ev, n);
        const label = t('exams.midterm', { n });
        const mineN = entries.filter((e) => e.label === label);
        return (
          <section key={n} className="stack" style={{ gap: 10 }}>
            <div>
              <h2>{label}</h2>
              <p className="small muted">{t('exams.weekRange', { week: weeksLabel(ev, n), from: fmt(week.start), to: fmt(week.end) })}</p>
            </div>
            <ExamCalendar
              entries={mineN}
              index={index}
              settings={dataset.settings}
              hide={hide}
              empty={<Empty>{t('exams.notPublished')}</Empty>}
            />
          </section>
        );
      })}
    </div>
  );
}
