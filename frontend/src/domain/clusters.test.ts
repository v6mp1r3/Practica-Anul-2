import { describe, expect, it } from 'vitest';
import { deriveClusters, specialityOf } from './clusters';
import type { Group } from './types';

const g = (id: string, name: string, year: number, cycle?: 'master'): Group => ({
  id,
  name,
  program: 'p',
  year,
  size: 20,
  studyForm: 'full',
  subgroups: 1,
  ...(cycle ? { cycle } : {}),
});

describe('specialityOf', () => {
  it('drops the number of the group', () => {
    expect(specialityOf('FAF-261')).toBe('FAF');
    expect(specialityOf('R-251')).toBe('R');
    expect(specialityOf('DUAL')).toBe('DUAL');
  });
});

describe('deriveClusters', () => {
  it('always has the years, even without groups', () => {
    expect(deriveClusters([]).map((c) => c.name)).toEqual(['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Master · Year 1', 'Master · Year 2']);
  });

  it('makes a speciality cluster per speciality and year, shared by its groups', () => {
    const cs = deriveClusters([g('1', 'FAF-261', 1), g('2', 'FAF-262', 1), g('3', 'TI-241', 3)]);
    const by = Object.fromEntries(cs.map((c) => [c.name, c]));
    expect(by['FAF · Year 1'].groupIds).toEqual(['1', '2']);
    expect(by['Year 1'].groupIds).toEqual(['1', '2']);
    expect(by['TI · Year 3'].groupIds).toEqual(['3']);
    expect(by['TI · Year 3'].kind).toBe('speciality');
    expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
  });

  it("keeps master's apart and puts the years before the specialities", () => {
    const cs = deriveClusters([g('1', 'MIA-251', 1, 'master'), g('2', 'FAF-261', 1)]);
    expect(cs.find((c) => c.name === 'Year 1')!.groupIds).toEqual(['2']);
    expect(cs.find((c) => c.name === 'Master · MIA · Year 1')!.groupIds).toEqual(['1']);
    expect(cs.map((c) => c.name).slice(0, 2)).toEqual(['Year 1', 'FAF · Year 1']);
  });
});
