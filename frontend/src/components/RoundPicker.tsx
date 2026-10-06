// Atestarea 1 | Atestarea 2 | Examene finale | Reexaminări — and, under
// Reexaminări, which one is retaken: atestarea 1, atestarea 2 or the final exam.
import type { ExamRound } from '../domain/types';
import { useI18n } from '../i18n';
import { Segmented } from './ui';

const RETAKES: ExamRound[] = ['remidterm1', 'remidterm2', 'reexam'];
export const isRetake = (r: string) => RETAKES.includes(r as ExamRound);
export const ROUNDS: ExamRound[] = ['midterm1', 'midterm2', 'session', ...RETAKES];

export function RoundPicker<T extends string>({
  value,
  onChange,
  before = [],
}: {
  value: ExamRound | T;
  onChange: (v: ExamRound | T) => void;
  /** Extra first options (e.g. the weekly timetable on Generare). */
  before?: { value: T; label: string }[];
}) {
  const { t } = useI18n();
  const retake = isRetake(value);
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <Segmented
        value={(retake ? 'retakes' : value) as string}
        onChange={(v) => onChange((v === 'retakes' ? (retake ? value : 'reexam') : v) as ExamRound | T)}
        options={[
          ...before,
          { value: 'midterm1', label: t('exams.midterm', { n: 1 }) },
          { value: 'midterm2', label: t('exams.midterm', { n: 2 }) },
          { value: 'session', label: t('exams.exams') },
          { value: 'retakes', label: t('exams.reexams') },
        ]}
      />
      {retake && (
        <Segmented
          value={value as string}
          onChange={(v) => onChange(v as ExamRound)}
          options={[
            { value: 'remidterm1', label: t('exams.midterm', { n: 1 }) },
            { value: 'remidterm2', label: t('exams.midterm', { n: 2 }) },
            { value: 'reexam', label: t('exams.exam') },
          ]}
        />
      )}
    </div>
  );
}
