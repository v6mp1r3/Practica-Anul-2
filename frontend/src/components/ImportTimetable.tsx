// "Importă orar": a timetable the faculty already has (our CSV export, or the
// faculty's PDF / Excel sheet) becomes a draft. The rows are matched to the
// loads in Sarcina didactică; the dialog shows what matched and what did not
// before anything is saved. The draft can then be edited, published, or
// followed as the example of a new generation.
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_MODE, api } from '../api';
import { facultyGroupIds, useAdminScope } from './FacultyFilter';
import { matchImport, parseTimetableCsv, type ImportResult, type RowResult } from '../domain/timetableImport';
import type { Timetable } from '../domain/types';
import { useI18n } from '../i18n';
import { useDataset } from '../state/data';
import { Icon } from './Icon';
import { Field, Modal } from './ui';

const DAY_SHORT = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

export function ImportTimetable({ onClose, onSaved }: { onClose: () => void; onSaved: (t: Timetable) => void }) {
  const { t } = useI18n();
  const { dataset, index } = useDataset();
  const scope = useAdminScope();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  // pairs of other faculties' groups found in the file (a faculty administrator imports only their own)
  const [otherFaculty, setOtherFaculty] = useState(0);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<Timetable | null>(null);

  async function read(file: File) {
    setBusy(true);
    setError('');
    setResult(null);
    setFileName(file.name);
    setName(`${t('import.namePrefix')} ${file.name.replace(/\.[^.]+$/, '')}`);
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      let rows;
      if (isCsv) {
        const parsed = parseTimetableCsv(await file.text());
        if (parsed.error) throw new Error(t('import.badCsv'));
        rows = parsed.rows;
      } else {
        if (API_MODE !== 'http') throw new Error(t('import.liveOnly'));
        rows = (await api.readTimetableSheet(file)).rows;
      }
      if (!rows.length) throw new Error(t('import.nothingFound'));
      const all = matchImport(rows, dataset, index);
      const mine = new Set(facultyGroupIds(dataset, scope));
      const ours = (aid?: string) => {
        const a = aid ? index.assignments.get(aid) : undefined;
        return !scope || (!!a && index.cohorts(a.audience).some((c) => mine.has(c.groupId)));
      };
      const lessons = all.lessons.filter((l) => ours(l.assignmentId));
      setOtherFaculty(all.lessons.length - lessons.length);
      setResult({
        lessons,
        groupIds: all.groupIds.filter((g) => !scope || mine.has(g)),
        results: all.results.filter((r) => !r.assignmentId || ours(r.assignmentId)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const tt = await api.saveTimetable({
        id: `tt${Date.now().toString(36)}`,
        name: name.trim() || fileName,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        algorithm: `${t('import.algorithm')} · ${fileName}`,
        groupIds: result.groupIds,
        lessons: result.lessons,
      });
      setSaved(tt);
      onSaved(tt);
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const count = (s: RowResult['status']) => result?.results.filter((r) => r.status === s).length ?? 0;
  const problems = result?.results.filter((r) => r.status === 'group' || r.status === 'time' || r.status === 'subject') ?? [];
  const guessed = result?.results.filter((r) => r.status === 'ok' && r.roomGuessed).length ?? 0;
  const why = (r: RowResult) =>
    r.status === 'group'
      ? t('import.why.group', { groups: (r.unknownGroups?.length ? r.unknownGroups : r.row.groups).join(', ') || '—' })
      : r.status === 'time'
        ? t('import.why.time', { time: r.row.start ?? '?' })
        : t('import.why.subject');

  return (
    <Modal
      title={t('import.title')}
      onClose={onClose}
      wide
      footer={
        saved ? (
          <>
            <Link className="btn" to={`/admin/timetables/${saved.id}`}>
              {t('generate.open')}
            </Link>
            <Link className="btn primary" to={`/admin/generate?example=${saved.id}`}>
              <Icon name="zap" />
              {t('import.generateFrom')}
            </Link>
          </>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" onClick={save} disabled={busy || !result?.lessons.length}>
              {t('import.save')}
            </button>
          </>
        )
      }
    >
      <div className="stack">
        {saved ? (
          <p style={{ margin: 0 }}>{t('import.saved', { name: saved.name, count: saved.lessons.length })}</p>
        ) : (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              {t('import.hint')}
            </p>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Icon name="upload" />
                {fileName ? t('import.otherFile') : t('import.chooseFile')}
              </button>
              {fileName && <span className="small muted">{fileName}</span>}
              {busy && <span className="small muted">{t('common.loading')}</span>}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.pdf,.xlsx,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) read(f);
                }}
              />
            </div>
            {error && <div className="badge danger import-error">{error}</div>}
            {result && (
              <>
                <div className="import-summary">
                  <div>
                    <strong>{result.lessons.length}</strong>
                    <span>{t('import.matched')}</span>
                  </div>
                  <div>
                    <strong>{result.groupIds.length}</strong>
                    <span>{t('import.groups')}</span>
                  </div>
                  <div className={problems.length ? 'warn' : ''}>
                    <strong>{problems.length}</strong>
                    <span>{t('import.unmatched')}</span>
                  </div>
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {[
                    count('merged') > 0 && t('import.mergedNote', { count: count('merged') }),
                    guessed > 0 && t('import.roomsNote', { count: guessed }),
                    otherFaculty > 0 && t('import.otherFacultyNote', { count: otherFaculty }),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </p>
                {problems.length > 0 && (
                  <details className="import-problems">
                    <summary>{t('import.showUnmatched', { count: problems.length })}</summary>
                    <ul>
                      {problems.slice(0, 200).map((r, i) => (
                        <li key={i}>
                          <span className="muted">
                            {DAY_SHORT[r.row.day]} {r.row.start ?? (r.row.pair !== undefined ? `#${r.row.pair + 1}` : '')}
                          </span>{' '}
                          <strong>{r.row.subject}</strong>
                          {r.row.groups.length > 0 && <span className="muted"> · {r.row.groups.join(', ')}</span>}
                          {r.row.teacher && <span className="muted"> · {r.row.teacher}</span>}
                          <span className="import-why"> — {why(r)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <Field label={t('common.name')}>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
