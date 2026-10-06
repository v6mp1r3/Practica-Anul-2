// Public timetables — no sign-in. Two pages: students (any group) and
// teachers (any teacher); the last choice is remembered on this device.
import { useState } from 'react';
import { ChangesCard } from '../../components/ChangesCard';
import { MyTimetable } from '../../components/MyTimetable';
import { Select } from '../../components/Select';
import { SessionTimetable, SessionsSection } from '../../components/SessionTimetable';
import { Empty, PageHeader, Segmented } from '../../components/ui';
import { fmtTime, parseSlotKey } from '../../domain/slots';
import { filterLessons } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { downloadFile } from '../../utils/download';
import { timetableToIcs } from '../../utils/export';

type Kind = 'group' | 'teacher';
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
  const { dataset, index, published } = useDataset();
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
      ) : !published ? (
        <div className="card">
          <Empty>{t('tt.notPublished')}</Empty>
        </div>
      ) : (
        <div className="stack">
          <ChangesCard groupId={group?.id} teacherId={teacher?.id} />
          {reducedGroup ? (
            // reduced attendance: the full calendar of every session, not one week
            <SessionTimetable dataset={dataset} index={index} lessons={lessons} groupId={group!.id} hide={['audience']} />
          ) : (
            <>
              <MyTimetable settings={dataset.settings} index={index} lessons={lessons} hide={group ? ['audience'] : ['teacher']} />
              {teacher && <SessionsSection dataset={dataset} index={index} lessons={lessons} hide={['teacher']} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
