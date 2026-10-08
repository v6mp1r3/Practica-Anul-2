import { describe, expect, it } from 'vitest';
import { collapseClusters, deriveClusters, groupsForSubject, specialityOf, subjectInSpeciality } from './clusters';
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
    const cs = deriveClusters([]);
    expect(cs.filter((c) => c.kind === 'year').map((c) => c.name)).toEqual([
      'Year 1',
      'Year 2',
      'Year 3',
      'Year 4',
      'Master · Year 1',
      'Master · Year 2',
    ]);
    expect(cs.filter((c) => c.kind === 'language').map((c) => c.language)).toEqual(['ro', 'ru', 'en', 'fr']);
    expect(cs.filter((c) => c.kind === 'form').map((c) => c.studyForm)).toEqual(['full', 'reduced', 'dual']);
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

  it('groups them by language and form of study', () => {
    const ru: Group = { ...g('1', 'FAF-261', 1), language: 'ru', studyForm: 'reduced' };
    const cs = deriveClusters([ru, g('2', 'TI-261', 1)]);
    const by = Object.fromEntries(cs.map((c) => [c.id, c]));
    expect(by['lang:ru'].groupIds).toEqual(['1']);
    expect(by['lang:ro'].groupIds).toEqual(['2']);
    expect(by['form:reduced'].groupIds).toEqual(['1']);
    expect(by['form:full'].groupIds).toEqual(['2']);
  });

  it("keeps master's apart and puts the years before the specialities", () => {
    const cs = deriveClusters([g('1', 'MIA-251', 1, 'master'), g('2', 'FAF-261', 1)]);
    expect(cs.find((c) => c.name === 'Year 1')!.groupIds).toEqual(['2']);
    expect(cs.find((c) => c.name === 'Master · MIA · Year 1')!.groupIds).toEqual(['1']);
    expect(cs.map((c) => c.name).slice(0, 2)).toEqual(['Year 1', 'FAF · Year 1']);
  });
});

describe('collapseClusters', () => {
  const cs = deriveClusters([g('1', 'FAF-261', 1), g('2', 'TI-261', 1), g('3', 'TI-241', 3)]);
  const id = (name: string) => cs.find((c) => c.name === name)!.id;

  it('turns every speciality of a year into the year', () => {
    expect(collapseClusters([id('FAF · Year 1'), id('TI · Year 1')], cs)).toEqual([id('Year 1')]);
  });
  it('leaves a part of the specialities as they are', () => {
    expect(collapseClusters([id('FAF · Year 1')], cs)).toEqual([id('FAF · Year 1')]);
  });
  it('keeps other tags and works year by year', () => {
    const out = collapseClusters([id('TI · Year 3'), id('FAF · Year 1'), id('Language · RO')], cs);
    expect(new Set(out)).toEqual(new Set([id('Year 3'), id('FAF · Year 1'), id('Language · RO')]));
  });
});

describe('subjectInSpeciality', () => {
  const cs = deriveClusters([g('1', 'FAF-261', 1), g('2', 'TI-261', 1), g('3', 'TI-241', 3)]);
  const id = (name: string) => cs.find((c) => c.name === name)!.id;

  it('matches a tag of the speciality', () => {
    expect(subjectInSpeciality([id('FAF · Year 1')], 'FAF', cs)).toBe(true);
    expect(subjectInSpeciality([id('FAF · Year 1')], 'TI', cs)).toBe(false);
  });
  it('matches every speciality of a tagged year, and only the years that have it', () => {
    expect(subjectInSpeciality([id('Year 1')], 'TI', cs)).toBe(true);
    expect(subjectInSpeciality([id('Year 2')], 'TI', cs)).toBe(false);
  });
  it('treats a subject without a year or speciality tag as for everyone', () => {
    expect(subjectInSpeciality([], 'TI', cs)).toBe(true);
    expect(subjectInSpeciality([id('Language · RU')], 'TI', cs)).toBe(true);
  });
});

describe('groupsForSubject', () => {
  const groups = [g('1', 'FAF-261', 1), g('2', 'TI-261', 1), g('3', 'TI-251', 2), { ...g('4', 'TI-262', 1), language: 'ru' as const }];
  const cs = deriveClusters(groups);
  const id = (name: string) => cs.find((c) => c.name === name)!.id;
  const names = (clusterIds: string[], year = 1) => groupsForSubject({ year, clusterIds }, groups, cs).map((x) => x.name);

  it('keeps a year-1 subject away from the groups of year 2', () => {
    expect(names([id('Year 1')])).toEqual(['FAF-261', 'TI-261', 'TI-262']);
  });
  it('limits a speciality tag to that speciality', () => {
    expect(names([id('TI · Year 1')])).toEqual(['TI-261', 'TI-262']);
  });
  it('adds up tags of one kind and needs every kind to fit', () => {
    expect(names([id('Year 1'), id('Year 2')])).toEqual(['FAF-261', 'TI-261', 'TI-251', 'TI-262']);
    expect(names([id('Year 1'), id('Language · RU')])).toEqual(['TI-262']);
  });
  it('uses the subject year when there are no tags', () => {
    expect(names([], 2)).toEqual(['TI-251']);
  });
});
