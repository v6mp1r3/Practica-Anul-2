import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { DatasetIndex } from './indexes';
import { floorOf, needsSplit } from './rooms';

describe('floorOf', () => {
  it('reads the floor as the first digit after the dash', () => {
    expect(floorOf('3-114')).toBe(1);
    expect(floorOf('3-405')).toBe(4);
    expect(floorOf('3-722')).toBe(7);
  });
  it('knows UTM’s exceptions', () => {
    expect(floorOf('A-02')).toBe(1);
    expect(floorOf('D-04')).toBe(-1);
    expect(floorOf('6-2')).toBe(2);
    expect(floorOf('3-3 ')).toBe(2);
  });
  it('gives up on names without a dash', () => {
    expect(floorOf('501A')).toBeNull();
    expect(floorOf('Sala de sport')).toBeNull();
  });
});

describe('needsSplit', () => {
  const idx = new DatasetIndex(seedDataset);
  const lab = { roomType: 'lab' as const, equipment: ['calculatoare'] };
  const group = (size: number) => ({ ...seedDataset.groups[0], id: 'big', size });
  it('keeps a group whole when a suitable room is big enough', () => {
    const ds = { ...seedDataset, groups: [...seedDataset.groups, group(10)] };
    expect(needsSplit(new DatasetIndex(ds), ds.rooms, { ...lab, audience: { kind: 'group', id: 'big' } })).toBeNull();
  });
  it('splits it when every suitable room is too small', () => {
    const largest = Math.max(
      ...seedDataset.rooms.filter((r) => r.equipment.includes('calculatoare') && r.type === 'lab').map((r) => r.capacity),
    );
    const ds = { ...seedDataset, groups: [...seedDataset.groups, group(largest + 5)] };
    expect(needsSplit(new DatasetIndex(ds), ds.rooms, { ...lab, audience: { kind: 'group', id: 'big' } })).toEqual({
      size: largest + 5,
      largest,
    });
  });
  it('never splits a torent', () => {
    expect(needsSplit(idx, seedDataset.rooms, { ...lab, audience: { kind: 'stream', id: 's1' } })).toBeNull();
  });
});
