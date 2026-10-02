import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { precheck } from './precheck';
import type { Dataset } from './types';

describe('precheck', () => {
  it('finds no blocking problems in the demo data', () => {
    expect(precheck(seedDataset).filter((i) => i.severity === 'hard')).toEqual([]);
  });

  it('reports an assignment no room can host', () => {
    const ds: Dataset = { ...seedDataset, rooms: seedDataset.rooms.filter((r) => r.type !== 'lab') };
    expect(precheck(ds).some((i) => i.kind === 'no-room')).toBe(true);
  });

  it('reports planned overtime', () => {
    const ds: Dataset = { ...seedDataset, teachers: seedDataset.teachers.map((t) => (t.id === 't8' ? { ...t, maxPairsPerWeek: 2 } : t)) };
    expect(precheck(ds).find((i) => i.kind === 'teacher-planned-overtime')?.subjectId).toBe('t8');
  });

  it('reports a study plan mismatch', () => {
    const ds: Dataset = { ...seedDataset, subjects: seedDataset.subjects.map((s) => (s.code === 'LE' ? { ...s, seminarPairs: 2 } : s)) };
    const issues = precheck(ds).filter((i) => i.kind === 'plan-mismatch' && i.vars.subject === 'LE');
    expect(issues).toHaveLength(4); // all four year-1 groups
  });

  it('reports a group with nothing assigned', () => {
    const ds: Dataset = {
      ...seedDataset,
      groups: [...seedDataset.groups, { id: 'gx', name: 'X-1', program: '', year: 1, size: 10, subgroups: 1 }],
    };
    expect(precheck(ds).some((i) => i.kind === 'group-empty' && i.subjectId === 'gx')).toBe(true);
  });
});
