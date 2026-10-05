import { useState } from 'react';
import { TimetableGrid } from '../../components/TimetableGrid';
import { PageHeader, Segmented } from '../../components/ui';
import { teacherStateAt, type TeacherSlotState } from '../../domain/availability';
import { paritiesOverlap } from '../../domain/slots';
import type { Day, Parity } from '../../domain/types';
import { dayIndexOf, weekParityOf } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { Select } from '../../components/Select';

const CELL: Record<TeacherSlotState, string> = {
  free: 'state-free',
  // teaching = busy (red, with the pair); unavailable stays neutral so the two don't look alike
  teaching: 'state-teaching',
  unavailable: 'state-off',
  consultation: 'state-consultation',
};

/** When a teacher is teaching, free, unavailable or holding consultations. */
export default function TeacherAvailability() {
  const { t } = useI18n();
  const { dataset, index, published } = useDataset();
  const teachers = [...dataset.teachers].sort((a, b) => a.name.localeCompare(b.name));
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? '');
  const [week, setWeek] = useState<Parity>(dataset.settings.weekParity ? weekParityOf(new Date()) : 'weekly');
  const lessons = published?.lessons ?? [];
  const teacher = index.teachers.get(teacherId);

  const label: Record<TeacherSlotState, string> = {
    free: t('availability.free'),
    teaching: t('teacherAvail.teaching'),
    unavailable: t('availability.unavailable'),
    consultation: t('availability.consultation'),
  };

  // The pair(s) the teacher has in a slot of the chosen week
  const lessonsAt = (d: Day, s: number) =>
    lessons.filter(
      (l) => !l.date && l.day === d && l.slot === s && paritiesOverlap(l.parity, week) && index.assignmentOf(l)?.teacherId === teacherId,
    );
  const renderCell = (d: Day, s: number) => {
    const state = teacherStateAt(index, lessons, teacherId, d, s, week);
    if (state !== 'teaching') return label[state];
    return lessonsAt(d, s).map((l) => {
      const a = index.assignmentOf(l)!;
      return (
        <div key={l.id} className="busy-lesson">
          <strong>
            {index.subjects.get(a.subjectId)?.code} · {t(`activity.${a.type}`)}
          </strong>
          <span>{index.audienceLabel(a.audience)}</span>
          <span>{index.rooms.get(l.roomId)?.name}</span>
        </div>
      );
    });
  };

  // Who is free right now?
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const currentSlot = dataset.settings.slots.findIndex((s) => {
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    return minutes >= sh * 60 + sm && minutes < eh * 60 + em;
  });
  const today = dayIndexOf(now);
  const freeNow =
    currentSlot >= 0 && today < dataset.settings.workingDays
      ? teachers.filter((x) => ['free', 'consultation'].includes(teacherStateAt(index, lessons, x.id, today, currentSlot, week)))
      : null;

  return (
    <div className="page">
      <PageHeader title={t('nav.teacherAvailability')} subtitle={t('teacherAvail.subtitle')} />
      <div className="stack">
        {freeNow && (
          <div className="card">
            <div className="card-header">
              <h2>{t('teacherAvail.freeNow', { pair: currentSlot + 1 })}</h2>
              <span className="spacer" />
              <span className="badge success">{freeNow.length}</span>
            </div>
            <div className="card-body row wrap" style={{ gap: 6 }}>
              {freeNow.map((x) => (
                <button key={x.id} className="badge" style={{ border: 'none', cursor: 'pointer' }} onClick={() => setTeacherId(x.id)}>
                  {x.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="row wrap">
          <Select
            className="select"
            style={{ width: 260 }}
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            aria-label={t('view.teacher')}
          >
            {teachers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          {dataset.settings.weekParity && (
            <Segmented
              value={week}
              onChange={setWeek}
              options={[
                { value: 'odd', label: t('tt.weekOdd') },
                { value: 'even', label: t('tt.weekEven') },
              ]}
            />
          )}
          {teacher && (
            <span className="small muted">
              {teacher.title} · {teacher.department} · {teacher.email}
            </span>
          )}
        </div>

        <TimetableGrid
          className="avail"
          settings={dataset.settings}
          index={index}
          lessons={[]}
          today={today}
          cellClass={(d, s) => CELL[teacherStateAt(index, lessons, teacherId, d, s, week)]}
          renderCell={renderCell}
        />
      </div>
    </div>
  );
}
