import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { roomTypeOf } from './equipment';
import { DatasetIndex } from './indexes';
import type { Assignment, Room } from './types';

const idx = new DatasetIndex(seedDataset);
const room = (type: Room['type']): Room => ({ id: 'x', name: 'x', building: '', capacity: 40, type, equipment: [] });
const cls = (roomType: Assignment['roomType'], equipment: string[] = []) => ({ ...seedDataset.assignments[0], roomType, equipment });

describe('rooms have no fixed type', () => {
  it('lets lectures and seminars use any ordinary room', () => {
    expect(idx.roomFits(cls('lecture'), room('seminar'))).toBe(true);
    expect(idx.roomFits(cls('seminar'), room('lecture'))).toBe(true);
  });
  it('keeps laboratories for labs, unless the class needs equipment', () => {
    expect(idx.roomFits(cls('lab'), room('seminar'))).toBe(false);
    expect(idx.roomFits(cls('seminar'), room('lab'))).toBe(false);
    expect(idx.roomFits(cls('seminar', ['calculatoare']), room('lab'))).toBe(true);
  });
  it('works the stored type out from the room', () => {
    expect(roomTypeOf({ capacity: 30, equipment: ['calculatoare', 'proiector'] })).toBe('lab');
    expect(roomTypeOf({ capacity: 120, equipment: ['proiector'] })).toBe('lecture');
    expect(roomTypeOf({ capacity: 30, equipment: ['televizor'] })).toBe('seminar');
  });
});
