// Public timetables — no sign-in. Two pages: students (any group) and
// teachers (any teacher); the last choice is remembered on this device.
import { useState } from 'react';
import { ExamCalendar, type CalendarEntry } from '../../components/ExamCalendar';
import { examEntries, midtermEntries } from '../../components/examEntries';
import { parseDate, toDateString } from '../../domain/changes';
import { evaluationOf, midtermsFor, teachingWeek } from '../../domain/exams';
import type { ExamEvent, Lesson } from '../../domain/types';
import { ChangesCard } from '../../components/ChangesCard';
import { MyTimetable } from '../../components/MyTimetable';
import { Select } from '../../components/Select';
import { SessionTimetable, SessionsSection } from '../../components/SessionTimetable';
import { Empty, PageHeader, Segmented } from '../../components/ui';
import { fmtTime, parseSlotKey } from '../../domain/slots';
import { filterLessons } from '../../domain/views';
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
  const teacher = choice.kind === 'teacher' ? index.teachers.get(choice.id) : undefined;
  const chosen = group ?? teacher;

  const groups = [...dataset.groups].sort((a, b) => a.name.localeCompare(b.name));
  const faculties = [...new Set(groups.map((g) => g.faculty ?? ''))];
  const teachers = [...dataset.teachers].sort((a, b) => a.name.localeCompare(b.name, lang));

  const lessons =
    published && chosen
      ? filterLessons(
          index,
          published.lessons,
          group ? { kind: 'group', id: group.id, subgroup: choice.subgroup } : { kind: 'teacher', id: teacher!.id },
        )
      : [];
  const reducedGroup = group?.studyForm === 'reduced' && dataset.settings.reducedSessions.length > 0;
  // is today inside the exam session or the retakes (for this group's form of study)?
  const ev = evaluationOf(dataset);
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

      {/* any group (students' page) or any teacher (teachers' page) — one timetable at a time */}
      <div className="row wrap" style={{ gap: 8, marginBottom: 18 }}>
        {choice.kind === 'group' ? (
          <Select
            className="select pill"
            style={{ minWidth: 200 }}
            value={choice.id}
            onChange={(e) => setChoice({ kind: 'group', id: e.target.value, subgroup: null })}
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
          </Select>
        ) : (
          <Select
            className="select pill"
            style={{ minWidth: 220 }}
            value={choice.id}
            onChange={(e) => setChoice({ kind: 'teacher', id: e.target.value, subgroup: null })}
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
              who={group ? { groupId: group.id, subgroup: choice.subgroup } : { teacherId: teacher!.id }}
              lessons={published?.lessons ?? []}
              events={exams}
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
        {!sessionNow && <ChangesCard groupId={group?.id} teacherId={teacher?.id} />}
        {sessionNow ? null : reducedGroup ? (
          // reduced attendance: the full calendar of every session, not one week
          <SessionTimetable dataset={dataset} index={index} lessons={lessons} groupId={group!.id} hide={['audience']} />
        ) : (
          <>
            <MyTimetable settings={dataset.settings} index={index} lessons={lessons} hide={group ? ['audience'] : ['teacher']} />
            {teacher && <SessionsSection dataset={dataset} index={index} lessons={lessons} hide={['teacher']} />}
          </>
        )}
      </div>
    );
  }
}

/** Atestări, exams or retakes of one group or teacher, as a calendar by date. */
function Evaluations({
  tab,
  who,
  lessons,
  events,
}: {
  tab: Exclude<Tab, 'timetable'>;
  who: { groupId: string; subgroup: number | null } | { teacherId: string };
  lessons: Lesson[];
  events: ExamEvent[];
}) {
  const { t, lang } = useI18n();
  const { dataset, index } = useDataset();
  const ev = evaluationOf(dataset);
  const mine = (e: ExamEvent) => ('groupId' in who ? e.groupId === who.groupId : e.teacherId === who.teacherId);
  const hide: ('teacher' | 'group')[] = 'groupId' in who ? ['group'] : ['teacher'];
  const fmt = (d: string) => parseDate(d).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' });

  let entries: CalendarEntry[];
  if (tab === 'midterms') {
    const reducedGroup = 'groupId' in who && index.groups.get(who.groupId)?.studyForm === 'reduced';
    if (ev.midtermMode === 'separate' && !reducedGroup) {
      entries = examEntries(
        events.filter((e) => e.round.startsWith('midterm') && mine(e)),
        index,
        t,
      );
    } else {
      // held in the subject's own class
      let list = midtermsFor(dataset, index, lessons, 'groupId' in who ? { groupId: who.groupId } : { teacherId: who.teacherId });
      if ('groupId' in who && who.subgroup) {
        const sg = who.subgroup;
        list = list.filter((m) => {
          const aud = index.assignmentOf(m.lesson)!.audience;
          return aud.kind !== 'subgroup' || aud.subgroup === sg;
        });
      }
      entries = midtermEntries(list, index, dataset.settings, t);
    }
  } else {
    const round = tab === 'exams' ? 'session' : 'reexam';
    entries = examEntries(
      events.filter((e) => e.round === round && mine(e)),
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
        const week = teachingWeek(ev, ev.midtermWeeks[n - 1]);
        const label = t('exams.midterm', { n });
        const mineN = entries.filter((e) => e.label === label);
        return (
          <section key={n} className="stack" style={{ gap: 10 }}>
            <div>
              <h2>{label}</h2>
              <p className="small muted">
                {t('exams.weekRange', { week: ev.midtermWeeks[n - 1], from: fmt(week.start), to: fmt(week.end) })}
              </p>
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
