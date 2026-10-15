import { describe, expect, it } from 'vitest';
import type { Subject } from './types';
import { plannedPairs } from './weeks';

const subject: Subject = {
  id: 's',
  code: 'MD',
  name: 'Matematica discretă',
  credits: 3,
  year: 1,
  lecturePairs: 1,
  seminarPairs: 0.5,
  labPairs: 0,
};

describe('plannedPairs', () => {
  it('takes the pairs of the kind of class from the subject', () => {
    expect(plannedPairs(subject, 'lecture')).toBe(1);
    expect(plannedPairs(subject, 'seminar')).toBe(0.5);
  });
  it('gives nothing when the plan has no pairs for it', () => {
    expect(plannedPairs(subject, 'lab')).toBeUndefined();
    expect(plannedPairs(subject, 'project')).toBeUndefined();
    expect(plannedPairs(undefined, 'lecture')).toBeUndefined();
  });
});
