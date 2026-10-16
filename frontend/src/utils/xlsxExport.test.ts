import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { generateTimetable } from '../domain/generator';
import { DatasetIndex } from '../domain/indexes';
import type { Lesson } from '../domain/types';
import { timetableToXlsx, timetableToXlsxAllGroups } from './xlsxExport';

const idx = new DatasetIndex(seedDataset);
const settings = seedDataset.settings;
const allGroups = seedDataset.groups.map((g) => g.id);
const text = (v: unknown) => String(v ?? '');

describe('timetableToXlsxAllGroups', () => {
  it('lays the groups out side by side, a sheet per year, with every class in its cell', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 2, iterations: 10 });
    const wb = await timetableToXlsxAllGroups(lessons, idx, settings, allGroups);
    const years = new Set(seedDataset.groups.map((g) => g.year));
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(years.size);

    const ws = wb.worksheets[0];
    // far fewer rows than one per class and group: days × pairs × 6 plus the heading
    expect(ws.rowCount).toBeLessThan(10 + settings.workingDays * (settings.slots.length * 6 + 1));
    const header = (ws.getRow(5).values as unknown[]).map(text).filter(Boolean);
    expect(header[0]).toBe('Grupele');
    const names = header.slice(1).filter((n) => n !== 'Grupele');
    // a speciality's groups side by side, in number order
    const specs = names.map((n) => n.split('-')[0]);
    expect(specs.filter((s, i) => s !== specs[i - 1])).toEqual([...new Set(specs)]);
    for (const s of new Set(specs)) {
      const mine = names.filter((n) => n.startsWith(`${s}-`));
      expect(mine).toEqual([...mine].sort((a, b) => a.localeCompare(b, 'ro', { numeric: true })));
    }

    // every weekly class of the sheet's groups is written in some cell, a shared lecture once per run of groups
    const cells = new Set<string>();
    const lectureCells: string[] = [];
    ws.eachRow((row) =>
      row.eachCell(
        (c) => (
          cells.add(text(c.value)),
          text(c.value).startsWith('c. ') && c.master.address === c.address && lectureCells.push(c.address)
        ),
      ),
    );
    const all = [...cells].join('\n');
    const sheetLectures = lessons.filter((l) => {
      const a = idx.assignmentOf(l)!;
      return (
        !l.date &&
        a.type === 'lecture' &&
        names.some((n) => idx.audienceTouchesGroup(a.audience, seedDataset.groups.find((g) => g.name === n)!.id))
      );
    });
    expect(lectureCells.length).toBe(sheetLectures.length);
    const sheetGroups = seedDataset.groups.filter((g) => names.includes(g.name));
    for (const l of lessons.filter((x) => sheetGroups.some((g) => idx.audienceTouchesGroup(idx.assignmentOf(x)!.audience, g.id)))) {
      expect(all).toContain(idx.rooms.get(l.roomId)!.name);
    }
  });

  it('merges a shared lecture across its groups and splits odd and even weeks', async () => {
    const lecture = seedDataset.assignments.find((a) => a.type === 'lecture' && a.audience.kind === 'stream')!;
    const other = seedDataset.assignments.find((a) => a.type !== 'lecture' && a.audience.kind !== 'stream')!;
    const lessons: Lesson[] = [
      { id: 'L', assignmentId: lecture.id, day: 0, slot: 0, roomId: 'r1', parity: 'weekly' },
      { id: 'O', assignmentId: other.id, day: 0, slot: 1, roomId: 'r2', parity: 'odd' },
    ];
    const wb = await timetableToXlsxAllGroups(lessons, idx, settings, allGroups);
    const merges: string[] = wb.worksheets.flatMap((ws) => (ws.model as { merges: string[] }).merges) ?? [];
    const top = wb.worksheets.flatMap((ws) => {
      const found: { ws: typeof ws; addr: string }[] = [];
      ws.eachRow((row) => row.eachCell((c) => text(c.value).startsWith('c. ') && found.push({ ws, addr: c.address })));
      return found;
    });
    expect(top.length).toBeGreaterThan(0);
    // the lecture's cell is six rows high, and as wide as its neighbouring groups
    const lectureMerge = merges.find((m) => m.startsWith(top[0].addr + ':'))!;
    const [, a, b] = /^[A-Z]+(\d+):[A-Z]+(\d+)$/.exec(lectureMerge)!;
    expect(Number(b) - Number(a)).toBe(5);
    expect(top[0].ws.getCell(top[0].addr).fill).toMatchObject({ fgColor: { argb: 'FFD9D9D9' } });
    // the odd-week class takes the top three rows of its pair
    const odd = merges.filter((m) => {
      const [, r1, r2] = /^[A-Z]+(\d+):[A-Z]+(\d+)$/.exec(m)!;
      return Number(r2) - Number(r1) === 2;
    });
    expect(odd.length).toBeGreaterThan(0);
  });
});

describe('timetableToXlsx', () => {
  it('writes one view as a single column, and dated session pairs on their own sheet', async () => {
    const a = seedDataset.assignments[0];
    const lessons: Lesson[] = [
      { id: 'w', assignmentId: a.id, day: 1, slot: 2, roomId: 'r1', parity: 'weekly' },
      { id: 'd', assignmentId: a.id, day: 2, slot: 1, roomId: 'r1', parity: 'weekly', date: '2026-10-14' },
    ];
    const wb = await timetableToXlsx(lessons, idx, settings, 'Ion Popescu');
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Ion Popescu', 'Sesiuni']);
    expect(text(wb.worksheets[0].getCell('E5').value)).toBe('Ion Popescu');
    expect(text(wb.worksheets[1].getCell('A2').value)).toBe('14/10/2026');
    const buf = await wb.xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});
