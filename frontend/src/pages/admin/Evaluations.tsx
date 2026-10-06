// Evaluări: the faculty's atestări, exam session and retakes. Exams and retakes
// (and atestări, when held after classes) are generated, checked, edited and
// published here; atestări held in class follow from the published timetable.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { facultyGroupIds, useAdminScope } from '../../components/FacultyFilter';
import { ExamWeekCalendar } from '../../components/ExamWeekCalendar';
import { examEntries } from '../../components/examEntries';
import { Icon } from '../../components/Icon';
import { Select } from '../../components/Select';
import { Empty, Field, Modal, PageHeader, Segmented, TimeInput } from '../../components/ui';
import { evaluationOf, findExamProblems, type ExamProblem } from '../../domain/exams';
import type { ExamEvent, ExamPlan, ExamRound } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export default function Evaluations() {
  const { t } = useI18n();
  const { dataset, index, published, refresh, exams } = useDataset();
  const toast = useToast();
  const scope = useAdminScope();
  const ev = evaluationOf(dataset);
  const separate = ev.midtermMode === 'separate';
  // Generare sends here with the round it just generated (?round=session)
  const [params] = useSearchParams();
  const asked = params.get('round');
  const [round, setRound] = useState<ExamRound>(
    asked === 'midterm1' || asked === 'midterm2' || asked === 'reexam' || asked === 'session' ? asked : 'session',
  );
  const [plan, setPlan] = useState<ExamPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [editing, setEditing] = useState<ExamEvent | null>(null);

  const myGroups = facultyGroupIds(dataset, scope);
  const groups = dataset.groups.filter((g) => myGroups.includes(g.id));
  const inClass = (round === 'midterm1' || round === 'midterm2') && !separate;
  const midterm = round === 'midterm1' || round === 'midterm2';

  useEffect(() => {
    setPlan(null);
    api.getExamPlan(round).then(setPlan);
  }, [round]);

  // clashes with this plan and with other faculties' published events
  const problems = useMemo<ExamProblem[]>(() => {
    if (!plan) return [];
    const others = exams.filter((e) => !plan.events.some((p) => p.id === e.id));
    const mine = new Set(plan.events.map((e) => e.id));
    return findExamProblems(dataset, [...plan.events, ...others]).filter((p) => p.ids.some((id) => mine.has(id)));
  }, [plan, exams, dataset]);
  const problemIds = new Set(problems.flatMap((p) => p.ids));

  async function generate() {
    setBusy(true);
    try {
      const result = await api.generateExamPlan(round);
      setPlan(result);
      toast(t('exams.generatedToast', { count: result.events.filter((e) => e.kind === 'exam').length }));
      if (result.warnings) toast(t('exams.unplacedToast', { count: result.warnings }), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(publish: boolean) {
    if (!plan) return;
    setPlan(publish ? await api.publishExamPlan(round) : await api.unpublishExamPlan(round));
    await refresh();
    toast(t(publish ? 'exams.publishedToast' : 'exams.unpublishedToast'));
  }

  async function saveEdit(e: ExamEvent) {
    if (!plan) return;
    const saved = await api.saveExamPlan({ ...plan, events: plan.events.map((x) => (x.id === e.id ? e : x)) });
    setPlan(saved);
    setEditing(null);
    if (saved.status === 'published') await refresh();
  }

  /** Drag & drop: same length, new date and start (atestări held in class stay with their class). */
  async function move(id: string, date: string, start: string) {
    const e = plan?.events.find((x) => x.id === id);
    if (!e || e.lessonId) return;
    const end = toHHMM(toMin(start) + toMin(e.end) - toMin(e.start));
    if (e.date === date && e.start === start) return;
    await saveEdit({ ...e, date, start, end });
  }

  const shown = (plan?.events ?? []).filter((e) => !groupId || e.groupId === groupId);

  return (
    <div className="page">
      <PageHeader
        title={t('nav.evaluations')}
        subtitle={t('exams.subtitle')}
        actions={
          <>
            {plan && (
              <span className={`badge ${plan.status === 'published' ? 'success' : 'primary'}`}>{t(`exams.status.${plan.status}`)}</span>
            )}
            <button className="btn" onClick={generate} disabled={busy}>
              <Icon name="zap" size={15} />
              {plan ? t('exams.regenerate') : t('exams.generate')}
            </button>
            {plan &&
              (plan.status === 'published' ? (
                <button className="btn" onClick={() => setStatus(false)}>
                  {t('exams.unpublish')}
                </button>
              ) : (
                <button className="btn primary" onClick={() => setStatus(true)} disabled={!plan.events.length}>
                  {t('exams.publish')}
                </button>
              ))}
          </>
        }
      />

      <div className="row wrap" style={{ gap: 8, marginBottom: 16 }}>
        <Segmented
          value={round}
          onChange={setRound}
          options={[
            { value: 'midterm1', label: t('exams.midterm', { n: 1 }) },
            { value: 'midterm2', label: t('exams.midterm', { n: 2 }) },
            { value: 'session', label: t('exams.exams') },
            { value: 'reexam', label: t('exams.reexams') },
          ]}
        />
        <Select className="select pill" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label={t('view.group')}>
          <option value="">{t('exams.allGroups')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        {plan && plan.events.length > 0 && (
          <span className={`badge ${problems.length ? 'danger' : 'success'}`}>
            {problems.length ? t('exams.problems', { count: problems.length }) : t('exams.noProblems')}
          </span>
        )}
      </div>

      {problems.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <ul className="card-body small" style={{ margin: 0, paddingLeft: 36 }}>
            {problems.slice(0, 8).map((p, i) => (
              <li key={i}>
                {p.kind === 'gap'
                  ? t('exams.problem.gap', { group: index.groups.get(p.groupId)?.name ?? '', days: p.days })
                  : t(`exams.problem.${p.what}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="stack">
        {midterm && (
          <p className="small muted">
            {inClass
              ? t('exams.inClassNote', { w1: ev.midtermWeeks[0], w2: ev.midtermWeeks[1] })
              : t('exams.separateNote', { w1: ev.midtermWeeks[0], w2: ev.midtermWeeks[1] })}
          </p>
        )}
        {!midterm && <p className="small muted">{t('exams.finalsNote')}</p>}
        <ExamWeekCalendar
          entries={examEntries(shown, index, t)}
          index={index}
          settings={dataset.settings}
          highlight={problemIds}
          vacations={ev.vacations}
          onEdit={(id) => setEditing(plan?.events.find((e) => e.id === id) ?? null)}
          onMove={move}
          empty={<Empty>{midterm && !published ? t('tt.notPublished') : t('exams.none')}</Empty>}
        />
      </div>

      {editing && <EditEvent event={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}
    </div>
  );
}

/** Move one exam/consultation: date, time (same length) and room. */
function EditEvent({ event, onClose, onSave }: { event: ExamEvent; onClose: () => void; onSave: (e: ExamEvent) => void }) {
  const { t } = useI18n();
  const { dataset, index } = useDataset();
  const [draft, setDraft] = useState(event);
  const length = toMin(event.end) - toMin(event.start);
  const size = index.audienceSize({ kind: 'group', id: event.groupId });
  return (
    <Modal
      title={`${t('exams.editTitle')}: ${index.subjects.get(event.subjectId)?.code} · ${index.groups.get(event.groupId)?.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => onSave(draft)}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('exams.date')}>
          <input className="input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </Field>
        <Field label={t('exams.start')}>
          <TimeInput
            value={draft.start}
            format={dataset.settings.timeFormat}
            onChange={(start) => setDraft({ ...draft, start, end: toHHMM(toMin(start) + length) })}
          />
        </Field>
        <Field label={t('exams.room')}>
          <Select value={draft.roomId} onChange={(e) => setDraft({ ...draft, roomId: e.target.value })}>
            {dataset.rooms
              .filter((r) => r.capacity >= size)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.capacity})
                </option>
              ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
