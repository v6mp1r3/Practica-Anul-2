import { describe, expect, it, vi } from 'vitest';
import { seedDataset } from '../data/seed';
import { DatasetIndex } from '../domain/indexes';
import { downloadTimetable, groupsByYear } from './ExportDialog';

const files: { name: string; body: string | ArrayBuffer }[] = [];
vi.mock('../utils/download', () => ({ downloadFile: (name: string, body: string | ArrayBuffer) => files.push({ name, body }) }));

const idx = new DatasetIndex(seedDataset);
const groupIds = seedDataset.groups.map((g) => g.id);
const lessons = seedDataset.assignments.map((a, i) => ({
  id: `l${i}`,
  assignmentId: a.id,
  day: i % 5,
  slot: i % 6,
  roomId: 'r1',
  parity: 'weekly' as const,
}));

describe('export by year of study', () => {
  it('counts the groups of each year', () => {
    const years = groupsByYear(idx, groupIds);
    expect(years.map(([y]) => y)).toEqual([...new Set(seedDataset.groups.map((g) => g.year))].sort((a, b) => a - b));
    expect(years.reduce((n, [, c]) => n + c, 0)).toBe(groupIds.length);
  });

  it('keeps only that year’s groups, in a sheet per cycle', async () => {
    const year = groupsByYear(idx, groupIds)[0][0];
    files.length = 0;
    await downloadTimetable({
      what: 'year',
      format: 'xlsx',
      year,
      index: idx,
      settings: seedDataset.settings,
      viewLessons: [],
      allLessons: lessons,
      groupIds,
    });
    expect(files[0].name).toBe(`orar-anul-${year}.xlsx`);
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(files[0].body as ArrayBuffer);
    const names = wb.worksheets.flatMap((ws) => (ws.getRow(5).values as unknown[]).map((v) => String(v ?? '')).filter((n) => n && n !== 'Grupele'));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(seedDataset.groups.find((g) => g.name === n)?.year).toBe(year);
  });

  it('names a master’s year after the cycle', async () => {
    files.length = 0;
    await downloadTimetable({
      what: 'year',
      format: 'ics',
      year: 1,
      index: idx,
      settings: seedDataset.settings,
      viewLessons: [],
      allLessons: lessons,
      groupIds,
      allName: 'orar-toate-grupele-master',
    });
    expect(files[0].name).toBe('orar-anul-1-master.ics');
  });
});
