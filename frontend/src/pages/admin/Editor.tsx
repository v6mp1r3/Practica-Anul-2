// Timetable editor: view by group / teacher / room, live validation, manual
// changes, then save as draft or publish.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { ConflictList } from '../../components/ConflictList';
import { Icon } from '../../components/Icon';
import { LessonPanel } from '../../components/LessonPanel';
import { Legend, TimetableGrid, type LessonField } from '../../components/TimetableGrid';
import { ViewPicker } from '../../components/ViewPicker';
import { Loading, PageHeader } from '../../components/ui';
import { scopeAssignments } from '../../domain/generator';
import { findWarnings, scoreTimetable } from '../../domain/score';
import type { Conflict, Dataset, Lesson, Parity, Timetable } from '../../domain/types';
import { findHardConflicts } from '../../domain/validator';
import { filterLessons, inWeek, type ViewFilter } from '../../domain/views';
import { useI18n } from '../../i18n';
import { useData, useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import { downloadFile } from '../../utils/download';
import { publishSafely } from '../../utils/publish';
import { timetableToCsv, timetableToIcs } from '../../utils/export';
import { StatusBadge } from './Dashboard';

const HIDE: Record<ViewFilter['kind'], LessonField[]> = { group: [], teacher: ['teacher'], room: ['room'] };

export default function Editor() {
  const { id } = useParams();
  const { t } = useI18n();
  const { dataset, index } = useDataset();
  const { refresh } = useData();
  const toast = useToast();
  const navigate = useNavigate();

  const [tt, setTt] = useState<Timetable | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<ViewFilter>({ kind: 'group', id: dataset.groups[0]?.id ?? '' });
  const [week, setWeek] = useState<Parity>('weekly');
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [history, setHistory] = useState<Lesson[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getTimetable(id)
      .then((x) => {
        setTt(x);
        setLessons(x.lessons);
        if (x.groupIds[0]) setView({ kind: 'group', id: x.groupIds[0] });
      })
      .catch(() => navigate('/admin/timetables', { replace: true }));
  }, [id, navigate]);

  // Validate against the assignments this timetable is responsible for
  const scoped: Dataset = useMemo(
    () => ({ ...dataset, assignments: tt ? scopeAssignments(dataset, tt.groupIds, index) : dataset.assignments }),
    [dataset, index, tt],
  );
  const hard = useMemo(() => findHardConflicts(scoped, lessons, index), [scoped, lessons, index]);
  const warnings = useMemo(() => findWarnings(scoped, lessons, index), [scoped, lessons, index]);
  const score = useMemo(() => scoreTimetable(scoped, lessons, index), [scoped, lessons, index]);
  const conflictIds = useMemo(() => new Set(hard.flatMap((c) => c.lessonIds)), [hard]);

  /** Replace the lessons, remembering the previous state for undo. */
  const commit = useCallback(
    (next: Lesson[]) => {
      setHistory((h) => [...h.slice(-49), lessons]);
      setLessons(next);
      setDirty(true);
    },
    [lessons],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setLessons(h[h.length - 1]);
      setDirty(true);
      return h.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  /** Hard conflicts that involve one specific lesson, if it were at (day, slot). */
  const conflictsIfMoved = useCallback(
    (lessonId: string, day: number, slot: number) => {
      const moved = lessons.map((l) => (l.id === lessonId ? { ...l, day, slot } : l));
      return findHardConflicts(scoped, moved, index).filter(
        (c) => c.kind !== 'hours-missing' && c.kind !== 'hours-extra' && c.lessonIds.includes(lessonId),
      );
    },
    [lessons, scoped, index],
  );

  if (!tt) return <Loading />;

  const selected = lessons.find((l) => l.id === selectedId) ?? null;

  function patchLesson(lessonId: string, patch: Partial<Lesson>) {
    commit(lessons.map((x) => (x.id === lessonId ? { ...x, ...patch } : x)));
  }

  function move(lessonId: string, day: number, slot: number) {
    const l = lessons.find((x) => x.id === lessonId);
    if (!l || l.locked || (l.day === day && l.slot === slot)) return;
    const clashes = conflictsIfMoved(lessonId, day, slot);
    commit(lessons.map((x) => (x.id === lessonId ? { ...x, day, slot } : x)));
    if (clashes.length) toast(t('editor.movedWithConflicts', { count: clashes.length }), 'error');
  }

  const visible = filterLessons(index, lessons, view).filter((l) => inWeek(l, week));
  const highlightIds = selectedConflict ? new Set(selectedConflict.lessonIds) : undefined;

  function selectConflict(c: Conflict) {
    setSelectedConflict((cur) => (cur === c ? null : c));
    const first = lessons.find((l) => c.lessonIds.includes(l.id));
    if (c.kind.startsWith('teacher') || c.kind === 'no-consultation') setView({ kind: 'teacher', id: c.subjectId });
    else if (c.kind.startsWith('room')) setView({ kind: 'room', id: c.subjectId });
    else if (c.kind.startsWith('group')) setView({ kind: 'group', id: c.subjectId });
    else if (first) {
      const a = index.assignmentOf(first);
      const g = a && index.cohorts(a.audience)[0]?.groupId;
      if (g) setView({ kind: 'group', id: g });
    }
  }

  async function save() {
    if (!tt) return;
    const saved = await api.saveTimetable({ ...tt, lessons });
    setTt(saved);
    setDirty(false);
    toast(t('common.saved'));
    return saved;
  }

  async function publish() {
    if (hard.length && !confirm(t('timetables.publishWithConflicts', { count: hard.length }))) return;
    const saved = dirty || tt?.status === 'variant' ? await save() : tt;
    if (!saved) return;
    const done = await publishSafely(saved.id, (count) => toast(t('timetables.clashOnPublish', { count }), 'error'));
    if (!done) return;
    setTt(done);
    await refresh();
    toast(t('timetables.publishedToast', { name: saved.name }));
  }

  function rename() {
    const name = prompt(t('editor.renamePrompt'), tt?.name);
    if (name?.trim() && tt) {
      setTt({ ...tt, name: name.trim() });
      setDirty(true);
    }
  }

  function viewName() {
    if (view.kind === 'teacher') return index.teachers.get(view.id)?.name ?? 'profesor';
    if (view.kind === 'room') return index.rooms.get(view.id)?.name ?? 'sala';
    return index.groups.get(view.id)?.name ?? 'grupa';
  }

  const fileBase = () =>
    `orar-${viewName()}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]+/g, '-');

  return (
    <div className="page">
      <PageHeader
        title={tt.name}
        subtitle={
          <span className="row wrap">
            <StatusBadge status={tt.status} />
            <span>{tt.algorithm}</span>
            {dirty && <span className="badge warning">{t('editor.unsaved')}</span>}
          </span>
        }
        actions={
          <>
            <button className="btn ghost" onClick={rename}>
              <Icon name="edit" size={15} />
              {t('editor.rename')}
            </button>
            <button
              className="btn"
              onClick={() => downloadFile(`${fileBase()}.csv`, timetableToCsv(visible, index, dataset.settings), 'text/csv')}
            >
              <Icon name="download" size={15} />
              CSV
            </button>
            <button
              className="btn"
              onClick={() => downloadFile(`${fileBase()}.ics`, timetableToIcs(visible, index, dataset.settings), 'text/calendar')}
              title={t('editor.icsHint')}
            >
              <Icon name="calendar" size={15} />
              iCal
            </button>
            <button className="btn" onClick={() => window.print()}>
              <Icon name="printer" size={15} />
              {t('common.print')}
            </button>
            <button className="btn" onClick={undo} disabled={!history.length} title="Ctrl/⌘ + Z">
              {t('editor.undo')}
            </button>
            <button className="btn primary" onClick={save} disabled={!dirty && tt.status !== 'variant'}>
              <Icon name="check" />
              {tt.status === 'variant' ? t('generate.keep') : t('common.save')}
            </button>
            {tt.status !== 'published' || dirty ? (
              <button className="btn primary" onClick={publish}>
                {t('timetables.publish')}
              </button>
            ) : null}
          </>
        }
      />

      <div className="editor-layout">
        <div className="stack" style={{ minWidth: 0 }}>
          <h2 className="print-only">
            {viewName()} — {dataset.settings.semester}
          </h2>
          <div className="row wrap no-print">
            <ViewPicker dataset={dataset} view={view} onView={setView} week={week} onWeek={setWeek} />
          </div>
          <TimetableGrid
            settings={dataset.settings}
            index={index}
            lessons={visible}
            hide={HIDE[view.kind]}
            conflictIds={conflictIds}
            highlightIds={selected ? new Set([selected.id]) : highlightIds}
            dimOthers={!selected && !!selectedConflict}
            onMove={move}
            onLessonClick={(l) => setSelectedId((cur) => (cur === l.id ? null : l.id))}
            canDrop={(id, day, slot) => conflictsIfMoved(id, day, slot).length === 0}
          />
          <div className="row wrap">
            <Legend />
            <span className="spacer" />
            <span className="small muted no-print">{t('editor.dragHint')}</span>
          </div>
        </div>

        <aside className="stack no-print">
          {selected && (
            <LessonPanel
              lesson={selected}
              lessons={lessons}
              dataset={dataset}
              index={index}
              onChange={(patch) => patchLesson(selected.id, patch)}
              onClose={() => setSelectedId(null)}
            />
          )}
          <div className="card">
            <div className="card-body">
              <div className="stat-value" style={{ color: score.hard ? 'var(--danger)' : 'var(--success)' }}>
                {score.hard}
              </div>
              <div className="small muted">{t('score.hard')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3>{t('conflict.hard')}</h3>
              <span className="spacer" />
              <span className={`badge ${hard.length ? 'danger' : 'success'}`}>{hard.length}</span>
            </div>
            <div className="card-body" style={{ padding: 8, maxHeight: 320, overflow: 'auto' }}>
              <ConflictList conflicts={hard} index={index} onSelect={selectConflict} selected={selectedConflict} />
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3>{t('conflict.warnings')}</h3>
              <span className="spacer" />
              <span className="badge warning">{warnings.length}</span>
            </div>
            <div className="card-body" style={{ padding: 8, maxHeight: 320, overflow: 'auto' }}>
              <ConflictList conflicts={warnings} index={index} onSelect={selectConflict} selected={selectedConflict} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
