import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, loadRules, saveRules } from './generationRules';

const memory = (initial?: string) => {
  let value = initial ?? null;
  return { getItem: () => value, setItem: (_: string, v: string) => void (value = v) };
};

describe('generation rules storage', () => {
  it('starts from the defaults', () => {
    expect(loadRules(memory())).toEqual(DEFAULT_RULES);
    expect(loadRules(null)).toEqual(DEFAULT_RULES);
  });

  it('remembers what was chosen', () => {
    const store = memory();
    saveRules({ ...DEFAULT_RULES, allowGroupGaps: false, allowThinDays: true }, store);
    expect(loadRules(store)).toEqual({ ...DEFAULT_RULES, allowGroupGaps: false, allowThinDays: true });
  });

  it('ignores anything unreadable or of the wrong type', () => {
    expect(loadRules(memory('not json'))).toEqual(DEFAULT_RULES);
    expect(loadRules(memory(JSON.stringify({ allowGroupGaps: 'no', allowTeacherGaps: false, other: 1 })))).toEqual({
      ...DEFAULT_RULES,
      allowTeacherGaps: false,
    });
  });
});
