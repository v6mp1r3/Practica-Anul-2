import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { timetableToCsv, timetableToCsvAllGroups } from '../utils/export';
import { generateTimetable } from './generator';
import { DatasetIndex } from './indexes';
import { matchImport, nameSimilarity, parseTimetableCsv, teacherSimilarity, type ImportRow } from './timetableImport';

const idx = new DatasetIndex(seedDataset);
const allGroups = seedDataset.groups.map((g) => g.id);
const key = (l: { assignmentId: string; day: number; slot: number; roomId: string; parity: string; date?: string }) =>
  `${l.assignmentId}|${l.date ?? l.day}|${l.slot}|${l.roomId}|${l.parity}`;

describe('timetable import', () => {
  it('reads back our own CSV export into the same lessons', async () => {
    const { lessons } = await generateTimetable(seedDataset, { groupIds: allGroups, seed: 2, iterations: 10 });
    for (const csv of [
      timetableToCsv(lessons, idx, seedDataset.settings),
      timetableToCsvAllGroups(lessons, idx, seedDataset.settings, allGroups),
    ]) {
      const { rows, error } = parseTimetableCsv(csv);
      expect(error).toBeUndefined();
      const result = matchImport(rows, seedDataset, idx);
      expect(result.results.filter((r) => r.status !== 'ok' && r.status !== 'merged')).toEqual([]);
      expect(result.lessons.map(key).sort()).toEqual(lessons.map(key).sort());
    }
  });

  it('refuses a file that is not a timetable', () => {
    expect(parseTimetableCsv('code,name,credits\nX,Y,5').error).toBe('header');
  });

  it('matches shortened UTM names', () => {
    expect(nameSimilarity('Planificarea și Infrastructura T.U.', 'Planificarea și infrastructura transportului urban')).toBe(1);
    expect(nameSimilarity('Analiza Matematică II', 'Analiza matematică 2')).toBe(1);
    expect(nameSimilarity('Fizica', 'Analiza matematică')).toBe(0);
    expect(teacherSimilarity('Balan M.', 'Mihai Balan')).toBe(1);
    expect(teacherSimilarity('Balan M.', 'Ion Balan')).toBe(0.6);
    expect(teacherSimilarity('Rusu Elena', 'Ion Balan')).toBe(0);
  });

  it('matches FCIM short names and rooms', () => {
    expect(nameSimilarity('Filosofia GI', 'Filosofie și gândire inginerească')).toBe(1);
    expect(nameSimilarity('Cadrul Legal al SI', 'Cadrul legal al securității informaționale')).toBe(1);
    expect(nameSimilarity('Dreptul de Proprietate Intelectuală', 'Dreptul proprietății intelectuale')).toBe(1);
    const ds = {
      ...seedDataset,
      rooms: [
        { ...seedDataset.rooms[0], id: 'x1', name: '3-606' },
        { ...seedDataset.rooms[0], id: 'x2', name: 'A-03' },
        { ...seedDataset.rooms[0], id: 'x3', name: '3-3' },
      ],
    };
    const g = ds.groups[0];
    const a = ds.assignments.find((x) => idx.audienceTouchesGroup(x.audience, g.id) && x.audience.kind === 'group')!;
    const s = idx.subjects.get(a.subjectId)!;
    const row = (room: string, start: string): ImportRow => ({
      source: room,
      groups: [g.name],
      day: 0,
      start,
      subject: s.name,
      type: a.type,
      parity: 'weekly',
      room,
    });
    const slots = ds.settings.slots;
    const r = matchImport(
      [row('606', slots[0].start), row('A03', slots[1].start), row('3-3 Amdaris', slots[2].start)],
      ds,
      new DatasetIndex(ds),
    );
    expect(r.lessons.map((l) => l.roomId)).toEqual(['x1', 'x2', 'x3']);
  });

  it('reports rows it cannot place and why', () => {
    const g = seedDataset.groups[0];
    const a = seedDataset.assignments.find((x) => idx.audienceTouchesGroup(x.audience, g.id))!;
    const s = idx.subjects.get(a.subjectId)!;
    const base: ImportRow = {
      source: '1',
      groups: [g.name],
      day: 0,
      start: seedDataset.settings.slots[0].start,
      subject: s.name,
      type: a.type,
      parity: 'weekly',
    };
    const r = matchImport(
      [
        base,
        { ...base, source: '2', groups: ['ZZ-999'] },
        { ...base, source: '3', start: '03:00' },
        { ...base, source: '4', subject: 'Astrologie aplicată' },
      ],
      seedDataset,
      idx,
    );
    expect(r.results.map((x) => x.status)).toEqual(['ok', 'group', 'time', 'subject']);
    expect(r.results[1].unknownGroups).toEqual(['ZZ-999']);
    expect(r.lessons).toHaveLength(1);
  });
});
