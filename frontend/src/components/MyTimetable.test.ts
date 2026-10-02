import { describe, expect, it } from 'vitest';
import { seedSettings } from '../data/seed';
import type { Lesson } from '../domain/types';
import { nextLesson } from './MyTimetable';

const L = (id: string, day: number, slot: number): Lesson => ({ id, assignmentId: 'a1', day, slot, roomId: 'r1', parity: 'weekly' });
const lessons = [L('a', 0, 1), L('b', 0, 3), L('c', 1, 0)];

describe('nextLesson', () => {
  // Monday 5 October 2026
  const at = (h: number, m: number) => new Date(2026, 9, 5, h, m);

  it('returns the pair in progress', () => {
    expect(nextLesson(lessons, seedSettings, at(10, 0))).toEqual({ lesson: lessons[0], current: true });
  });
  it('returns the next pair later today', () => {
    expect(nextLesson(lessons, seedSettings, at(11, 20))).toEqual({ lesson: lessons[1], current: false });
  });
  it('returns null after the last pair', () => {
    expect(nextLesson(lessons, seedSettings, at(16, 0))).toBeNull();
  });
});
