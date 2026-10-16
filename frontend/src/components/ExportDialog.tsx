// Export a timetable: the group / teacher / room shown, or every group, as a
// spreadsheet (Excel, laid out like the printed timetable) or a calendar (iCal). Used by the editor and the
// public timetable pages.
import { useState } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import type { Lesson, Settings } from '../domain/types';
import { useI18n } from '../i18n';
import { downloadFile } from '../utils/download';
import { timetableToIcs } from '../utils/export';
import { XLSX_TYPE, timetableToXlsx, timetableToXlsxAllGroups } from '../utils/xlsxExport';
import { Icon } from './Icon';
import { Field, Modal, Segmented } from './ui';

export type ExportWhat = 'view' | 'all';
export type ExportFormat = 'xlsx' | 'ics';

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-');

/** Download the export chosen in the dialog. */
export async function downloadTimetable(o: {
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
  const wb = all
    ? await timetableToXlsxAllGroups(lessons, o.index, o.settings, o.groupIds)
    : await timetableToXlsx(lessons, o.index, o.settings, o.viewName ?? '');
  downloadFile(`${base}.xlsx`, (await wb.xlsx.writeBuffer()) as ArrayBuffer, XLSX_TYPE);
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
  const [format, setFormat] = useState<ExportFormat>('xlsx');
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
          hint={format === 'xlsx' ? t(what === 'all' ? 'editor.xlsxAllHint' : 'editor.xlsxHint') : t('editor.icsHint')}
        >
          <Segmented
            value={format}
            onChange={setFormat}
            options={[
              { value: 'xlsx', label: 'Excel' },
              { value: 'ics', label: 'iCal' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}
