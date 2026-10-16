// Export a timetable: the group / teacher / room shown, one year's groups or every
// group, as a spreadsheet (CSV for Excel) or a calendar (iCal). Used by the editor and the
// public timetable pages.
import { useState } from 'react';
import type { DatasetIndex } from '../domain/indexes';
import type { Lesson, Settings } from '../domain/types';
import { useI18n } from '../i18n';
import { downloadFile } from '../utils/download';
import { timetableToCsv, timetableToCsvAllGroups, timetableToIcs } from '../utils/export';
import { Icon } from './Icon';
import { Field, Modal, Segmented } from './ui';

export type ExportWhat = 'view' | 'year' | 'all';
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
  /** Every lesson; "all groups" keeps those of groupIds, "a year" those of its groups. */
  allLessons: Lesson[];
  groupIds: string[];
  /** The year of study, for "a year". */
  year?: number;
  /** File name for "all groups" (default orar-toate-grupele); "a year" swaps in anul-<year>. */
  allName?: string;
}) {
  const all = o.what !== 'view';
  const groupIds = o.what === 'year' ? o.groupIds.filter((g) => o.index.groups.get(g)?.year === o.year) : o.groupIds;
  const lessons = all
    ? o.allLessons.filter((l) => {
        const a = o.index.assignmentOf(l);
        return !!a && groupIds.some((g) => o.index.audienceTouchesGroup(a.audience, g));
      })
    : o.viewLessons;
  const allName = o.allName ?? 'orar-toate-grupele';
  const base = !all ? slug(`orar-${o.viewName ?? ''}`) : o.what === 'year' ? allName.replace('toate-grupele', `anul-${o.year}`) : allName;
  if (o.format === 'ics') return downloadFile(`${base}.ics`, timetableToIcs(lessons, o.index, o.settings), 'text/calendar');
  const csv = all ? timetableToCsvAllGroups(lessons, o.index, o.settings, groupIds) : timetableToCsv(lessons, o.index, o.settings);
  downloadFile(`${base}.csv`, csv, 'text/csv');
}

/** How many of these groups each year of study has, by year. */
export function groupsByYear(index: DatasetIndex, groupIds: string[]): [number, number][] {
  const n = new Map<number, number>();
  for (const g of groupIds) {
    const year = index.groups.get(g)?.year;
    if (year) n.set(year, (n.get(year) ?? 0) + 1);
  }
  return [...n].sort((a, b) => a[0] - b[0]);
}

/** Export the timetable: the view shown, one year's groups or every group, as a spreadsheet or a calendar. */
export function ExportDialog({
  viewName,
  groupCount,
  years,
  defaultYear,
  defaultWhat = 'all',
  onClose,
  onExport,
}: {
  /** The group / teacher / room shown; without one, only a year or all groups can be exported. */
  viewName?: string;
  groupCount: number;
  /** [year, number of groups] of the groups that can be exported. */
  years: [number, number][];
  /** The shown group's year. */
  defaultYear?: number;
  defaultWhat?: ExportWhat;
  onClose: () => void;
  onExport: (what: ExportWhat, format: ExportFormat, year: number) => void;
}) {
  const { t } = useI18n();
  const [what, setWhat] = useState<ExportWhat>(viewName ? defaultWhat : 'all');
  const [year, setYear] = useState(String(years.find(([y]) => y === defaultYear)?.[0] ?? years[0]?.[0] ?? 1));
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
          <button className="btn primary" onClick={() => onExport(what, format, Number(year))}>
            <Icon name="download" size={15} />
            {t('editor.exportDownload')}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('editor.exportWhat')}>
          <Segmented
            wrap
            value={what}
            onChange={setWhat}
            options={[
              ...(viewName ? [{ value: 'view' as const, label: t('editor.exportView', { name: viewName }) }] : []),
              ...(years.length > 1 ? [{ value: 'year' as const, label: t('editor.exportYear') }] : []),
              { value: 'all', label: t('editor.exportAll', { count: groupCount }) },
            ]}
          />
        </Field>
        {what === 'year' && (
          <Field label={t('groups.year')}>
            <Segmented
              wrap
              value={year}
              onChange={setYear}
              options={years.map(([y, n]) => ({
                value: String(y),
                label: t(n === 1 ? 'editor.exportYearOne' : 'editor.exportYearN', { year: y, count: n }),
              }))}
            />
          </Field>
        )}
        <Field
          label={t('editor.exportFormat')}
          hint={format === 'csv' ? t(what === 'view' ? 'editor.csvHint' : 'editor.csvAllHint') : t('editor.icsHint')}
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
