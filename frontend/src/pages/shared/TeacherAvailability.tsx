import { useState } from 'react';
import { TimetableGrid } from '../../components/TimetableGrid';
import { PageHeader, Segmented } from '../../components/ui';
import { teacherStateAt, type TeacherSlotState } from '../../domain/availability';
import type { Parity } from '../../domain/types';
import { dayIndexOf, weekParityOf } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';

const CELL: Record<TeacherSlotState, string> = {
  free: 'state-free',
  teaching: 'state-preferred',
  unavailable: 'state-unavailable',
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
          <select
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
          </select>
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
          renderCell={(d, s) => label[teacherStateAt(index, lessons, teacherId, d, s, week)]}
        />
      </div>
    </div>
  );
}
