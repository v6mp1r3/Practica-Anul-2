// Export a timetable: the group / teacher / room shown, or every group, as a
// spreadsheet (CSV for Excel) or a calendar (iCal). Used by the editor and the
// public timetable pages.
import { useState } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import type { Lesson, Settings } from '../domain/types';
import { useI18n } from '../i18n';
import { downloadFile } from '../utils/download';
import { timetableToCsv, timetableToCsvAllGroups, timetableToIcs } from '../utils/export';
import { Icon } from './Icon';
import { Field, Modal, Segmented } from './ui';

export type ExportWhat = 'view' | 'all';
export type ExportFormat = 'csv' | 'ics';

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-');

/** Download the export chosen in the dialog. */
export function downloadTimetable(o: {
  what: ExportWhat;
  format: ExportFormat;
  index: DatasetIndex;
  settings: Settings;
  viewName?: string;
  viewLessons: Lesson[];
  /** Every lesson; "all groups" keeps those of groupIds. */
  allLessons: Lesson[];
  groupIds: string[];
  /** File name for "all groups" (default orar-toate-grupele). */
  allName?: string;
}) {
  const all = o.what === 'all';
  const lessons = all
    ? o.allLessons.filter((l) => {
        const a = o.index.assignmentOf(l);
        return !!a && o.groupIds.some((g) => o.index.audienceTouchesGroup(a.audience, g));
      })
    : o.viewLessons;
  const base = all ? (o.allName ?? 'orar-toate-grupele') : slug(`orar-${o.viewName ?? ''}`);
  if (o.format === 'ics') return downloadFile(`${base}.ics`, timetableToIcs(lessons, o.index, o.settings), 'text/calendar');
  const csv = all ? timetableToCsvAllGroups(lessons, o.index, o.settings, o.groupIds) : timetableToCsv(lessons, o.index, o.settings);
  downloadFile(`${base}.csv`, csv, 'text/csv');
}

/** Export the timetable: the view shown or every group, as a spreadsheet or a calendar. */
export function ExportDialog({
  viewName,
  groupCount,
  defaultWhat = 'all',
  onClose,
  onExport,
}: {
  /** The group / teacher / room shown; without one, only "all groups" can be exported. */
  viewName?: string;
  groupCount: number;
  defaultWhat?: ExportWhat;
  onClose: () => void;
  onExport: (what: ExportWhat, format: ExportFormat) => void;
}) {
  const { t } = useI18n();
  const [what, setWhat] = useState<ExportWhat>(viewName ? defaultWhat : 'all');
  const [format, setFormat] = useState<ExportFormat>('csv');
  return (
    <Modal
      title={t('editor.exportTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => onExport(what, format)}>
            <Icon name="download" size={15} />
            {t('editor.exportDownload')}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('editor.exportWhat')}>
          <Segmented
            value={what}
            onChange={setWhat}
            options={[
              { value: 'all', label: t('editor.exportAll', { count: groupCount }) },
              ...(viewName ? [{ value: 'view' as const, label: t('editor.exportView', { name: viewName }) }] : []),
            ]}
          />
        </Field>
        <Field
          label={t('editor.exportFormat')}
          hint={format === 'csv' ? t(what === 'all' ? 'editor.csvAllHint' : 'editor.csvHint') : t('editor.icsHint')}
        >
          <Segmented
            value={format}
            onChange={setFormat}
            options={[
              { value: 'csv', label: 'CSV (Excel)' },
              { value: 'ics', label: 'iCal' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}
