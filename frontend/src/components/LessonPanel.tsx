import type { DatasetIndex } from '../domain/indexes';
import { fmtTime, paritiesOverlap, range } from '../domain/slots';
import type { Dataset, Lesson, Parity } from '../domain/types';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { Field } from './ui';
import { Select } from './Select';

/** Details of the selected lesson, with manual room / time / lock changes. */
export function LessonPanel({
  lesson,
  lessons,
  dataset,
  index,
  onChange,
  onClose,
}: {
  lesson: Lesson;
  lessons: Lesson[];
  dataset: Dataset;
  index: DatasetIndex;
  onChange: (patch: Partial<Lesson>) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const a = index.assignmentOf(lesson);
  if (!a) return null;
  const subject = index.subjects.get(a.subjectId);
  const teacher = index.teachers.get(a.teacherId);
  const size = index.audienceSize(a.audience);

  const busy = (roomId: string) =>
    lessons.some(
      (o) =>
        o.id !== lesson.id &&
        o.roomId === roomId &&
        o.day === lesson.day &&
        o.slot === lesson.slot &&
        paritiesOverlap(o.parity, lesson.parity),
    );
  const suitable = dataset.rooms
    .filter((r) => r.capacity >= size && index.roomFits(a, r) && index.hasEquipment(a, r))
    .sort((x, y) => Number(busy(x.id)) - Number(busy(y.id)) || x.capacity - y.capacity);
  const others = dataset.rooms.filter((r) => !suitable.includes(r));

  return (
    <div className="card">
      <div className="card-header">
        <span className={`badge ${a.type}`}>{t(`activity.${a.type}`)}</span>
        <h3 style={{ minWidth: 0 }}>{subject?.code}</h3>
        <span className="spacer" />
        <button className="btn ghost sm icon" onClick={onClose} aria-label={t('common.close')}>
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className="card-body stack" style={{ gap: 12 }}>
        <div className="small">
          <div>
            <strong>{subject?.name}</strong>
          </div>
          <div className="muted">{teacher?.name}</div>
          <div className="muted">
            {index.audienceLabel(a.audience)} · {size} {t('groups.size').toLowerCase()}
          </div>
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label={t('editor.day')}>
            <Select
              className="select"
              value={lesson.day}
              disabled={lesson.locked}
              onChange={(e) => onChange({ day: Number(e.target.value) })}
            >
              {range(dataset.settings.workingDays).map((d) => (
                <option key={d} value={d}>
                  {t(`day.${d}` as 'day.0')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('tt.pair')}>
            <Select
              className="select"
              value={lesson.slot}
              disabled={lesson.locked}
              onChange={(e) => onChange({ slot: Number(e.target.value) })}
            >
              {dataset.settings.slots.map((s, i) => (
                <option key={i} value={i}>
                  {i + 1} · {fmtTime(s.start, dataset.settings.timeFormat)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t('rooms.name')}>
          <Select className="select" value={lesson.roomId} disabled={lesson.locked} onChange={(e) => onChange({ roomId: e.target.value })}>
            <optgroup label={t('editor.suitableRooms')}>
              {suitable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.capacity}){busy(r.id) ? ` — ${t('editor.busy')}` : ''}
                </option>
              ))}
            </optgroup>
            {others.length > 0 && (
              <optgroup label={t('editor.otherRooms')}>
                {others.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.capacity})
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>

        {dataset.settings.weekParity && (
          <Field label={t('assignments.parity')}>
            <Select
              className="select"
              value={lesson.parity}
              disabled={lesson.locked}
              onChange={(e) => onChange({ parity: e.target.value as Parity })}
            >
              {(['weekly', 'odd', 'even'] as Parity[]).map((p) => (
                <option key={p} value={p}>
                  {t(`parity.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <button className={`btn ${lesson.locked ? 'primary' : ''}`} onClick={() => onChange({ locked: !lesson.locked })}>
          <Icon name={lesson.locked ? 'lock' : 'unlock'} size={15} />
          {lesson.locked ? t('editor.locked') : t('editor.lock')}
        </button>
        <p className="small muted">{t('editor.lockHint')}</p>
      </div>
    </div>
  );
}
