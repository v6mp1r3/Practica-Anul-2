import { fmtTime } from '../../domain/slots';
import { facultyGroupIds, useAdminScope } from '../../components/FacultyFilter';
// "Modificări în orar": one-off changes for a given date — a pair moves to
// another room, or a substitute teacher takes it. Saving notifies everyone.
import { useMemo, useState } from 'react';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { Empty, Field, Modal, PageHeader, Segmented } from '../../components/ui';
import { freeRoomsFor, freeTeachersFor, lessonsOnDate, parseDate, toDateString } from '../../domain/changes';
import type { ChangeKind, Lesson, ScheduleChange } from '../../domain/types';
import { filterLessons } from '../../domain/views';
import { dateLocale, useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import { Select } from '../../components/Select';

/** Next working day (today if it is one). */
function nextWorkingDay(workingDays: number): string {
  const d = new Date();
  while ((d.getDay() + 6) % 7 >= workingDays) d.setDate(d.getDate() + 1);
  return toDateString(d);
}

export default function Changes() {
  const { t, lang } = useI18n();
  const { dataset, index, published, changes, refresh, refreshNotifications } = useDataset();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const scope = useAdminScope();
  const scopeGroups = facultyGroupIds(dataset, scope);
  const mine = changes.filter((c) => {
    const a = index.assignments.get(c.assignmentId);
    return !scope || (!!a && scopeGroups.some((g) => index.audienceTouchesGroup(a.audience, g)));
  });
  const today = toDateString(new Date());
  const sorted = useMemo(() => {
    const upcoming = mine.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);
    const past = mine.filter((c) => c.date < today).sort((a, b) => b.date.localeCompare(a.date) || a.slot - b.slot);
    return [...upcoming, ...past];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, today, scope]);

  const fmtDate = (s: string) => parseDate(s).toLocaleDateString(dateLocale(lang), { weekday: 'short', day: '2-digit', month: 'short' });
  const what = (assignmentId: string) => {
    const a = index.assignments.get(assignmentId);
    return a ? `${index.subjects.get(a.subjectId)?.code} ${t(`activity.${a.type}`)} · ${index.audienceLabel(a.audience)}` : '?';
  };
  const describe = (c: ScheduleChange) => {
    if (c.kind === 'room') {
      return t('changes.roomChange', {
        room: index.rooms.get(c.roomId ?? '')?.name ?? '?',
        from: index.rooms.get(c.fromRoomId)?.name ?? '?',
      });
    }
    const a = index.assignments.get(c.assignmentId);
    return t('changes.teacherChange', {
      teacher: index.teachers.get(c.teacherId ?? '')?.name ?? '?',
      from: (a && index.teachers.get(a.teacherId)?.name) ?? '?',
    });
  };

  async function remove(c: ScheduleChange) {
    if (!confirm(t('common.confirmDelete', { name: `${fmtDate(c.date)} · ${what(c.assignmentId)}` }))) return;
    await api.deleteChange(c.id);
    await refresh();
  }

  return (
    <div className="page">
      <PageHeader
        title={t('nav.changes')}
        subtitle={t('changes.subtitle')}
        actions={
          published && (
            <button className="btn primary" onClick={() => setOpen(true)}>
              <Icon name="plus" />
              {t('changes.add')}
            </button>
          )
        }
      />

      <div className="card">
        {!published ? (
          <Empty>{t('changes.needPublished')}</Empty>
        ) : sorted.length === 0 ? (
          <Empty>{t('changes.empty')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('changes.date')}</th>
                  <th>{t('tt.pair')}</th>
                  <th>{t('assignments.subject')}</th>
                  <th>{t('changes.kind')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} style={c.date < today ? { opacity: 0.5 } : undefined}>
                    <td>
                      <strong>{fmtDate(c.date)}</strong>
                    </td>
                    <td>
                      {c.slot + 1}{' '}
                      <span className="small muted">{fmtTime(dataset.settings.slots[c.slot]?.start, dataset.settings.timeFormat)}</span>
                    </td>
                    <td>{what(c.assignmentId)}</td>
                    <td>
                      <span className={`badge ${c.kind === 'room' ? 'primary' : 'warning'}`}>
                        {t(c.kind === 'room' ? 'changes.kind.room' : 'changes.kind.teacher')}
                      </span>{' '}
                      {describe(c)}
                      {c.note && <div className="small muted">{c.note}</div>}
                    </td>
                    <td className="actions">
                      <button className="btn ghost sm icon danger" onClick={() => remove(c)} aria-label={t('common.delete')}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && published && (
        <ChangeForm
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await Promise.all([refresh(), refreshNotifications()]);
            toast(t('changes.saved'));
          }}
          lessons={published.lessons}
          changes={changes}
          defaultDate={nextWorkingDay(dataset.settings.workingDays)}
        />
      )}
    </div>
  );
}

function ChangeForm({
  onClose,
  onSaved,
  lessons,
  changes,
  defaultDate,
}: {
  onClose: () => void;
  onSaved: () => void;
  lessons: Lesson[];
  changes: ScheduleChange[];
  defaultDate: string;
}) {
  const { t } = useI18n();
  const { dataset, index } = useDataset();
  const scope = useAdminScope();
  const [date, setDate] = useState(defaultDate);
  const [groupId, setGroupId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [kind, setKind] = useState<ChangeKind>('room');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const dayLessons = useMemo(() => {
    const scoped = facultyGroupIds(dataset, scope);
    const all = lessonsOnDate(dataset, lessons, date).filter((l) => {
      const asg = index.assignmentOf(l);
      return !scope || (!!asg && scoped.some((g) => index.audienceTouchesGroup(asg.audience, g)));
    });
    return (groupId ? filterLessons(index, all, { kind: 'group', id: groupId }) : all).sort((a, b) => a.slot - b.slot);
  }, [dataset, index, lessons, date, groupId, scope]);
  const lesson = dayLessons.find((l) => l.id === lessonId);
  const assignment = lesson && index.assignmentOf(lesson);

  const rooms = lesson ? freeRoomsFor(dataset, index, lessons, changes, date, lesson) : [];
  const teachers = lesson ? freeTeachersFor(dataset, index, lessons, changes, date, lesson) : [];

  const label = (l: Lesson) => {
    const a = index.assignmentOf(l);
    return `${l.slot + 1} · ${fmtTime(dataset.settings.slots[l.slot]?.start, dataset.settings.timeFormat)} — ${a ? index.subjects.get(a.subjectId)?.code : ''} ${a ? t(`activity.${a.type}`) : ''} · ${a ? index.audienceLabel(a.audience) : ''} · ${index.rooms.get(l.roomId)?.name} · ${a ? index.teachers.get(a.teacherId)?.name : ''}`;
  };

  async function save() {
    if (!lesson || !target) return;
    setSaving(true);
    try {
      await api.createChange({
        date,
        assignmentId: lesson.assignmentId,
        slot: lesson.slot,
        kind,
        fromRoomId: lesson.roomId,
        ...(kind === 'room' ? { roomId: target } : { teacherId: target }),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      title={t('changes.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={save} disabled={!lesson || !target || saving}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <Field label={t('changes.date')}>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setLessonId('');
                setTarget('');
              }}
            />
          </Field>
          <Field label={t('changes.group')}>
            <Select
              className="select"
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setLessonId('');
                setTarget('');
              }}
            >
              <option value="">{t('assignments.allGroups')}</option>
              {dataset.groups
                .filter((g) => !scope || g.faculty === scope)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <Field label={t('changes.lesson')}>
          {dayLessons.length === 0 ? (
            <span className="muted">{t('changes.noLessons')}</span>
          ) : (
            <Select
              className="select"
              value={lessonId}
              onChange={(e) => {
                setLessonId(e.target.value);
                setTarget('');
              }}
            >
              <option value="">—</option>
              {dayLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {label(l)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {lesson && (
          <>
            <Field label={t('changes.kind')}>
              <Segmented
                value={kind}
                onChange={(k) => {
                  setKind(k);
                  setTarget('');
                }}
                options={[
                  { value: 'room', label: t('changes.kind.room') },
                  { value: 'teacher', label: t('changes.kind.teacher') },
                ]}
              />
            </Field>

            {kind === 'room' ? (
              <Field label={t('changes.newRoom')}>
                {rooms.length === 0 ? (
                  <span className="muted">{t('changes.noRooms')}</span>
                ) : (
                  <Select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">—</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.capacity} · {t(`roomType.${r.type}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label={t('changes.newTeacher')} hint={t('changes.teacherHint')}>
                {teachers.length === 0 ? (
                  <span className="muted">{t('changes.noTeachers')}</span>
                ) : (
                  <Select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">—</option>
                    {teachers.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {x.department}
                        {assignment && !x.activityTypes.includes(assignment.type) ? ' *' : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            <Field label={t('changes.note')}>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
