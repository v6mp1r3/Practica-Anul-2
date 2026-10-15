import { describe, expect, it } from 'vitest';
import {
  academicYearOf,
  autoHolidays,
  dueSemester,
  semesterOrder,
  holidaysOf,
  orthodoxEaster,
  semesterChoices,
  semesterOf,
  semesterStartOf,
} from './holidays';

describe('days off, every year', () => {
  it('knows Orthodox Easter', () => {
    expect(orthodoxEaster(2026)).toBe('2026-04-12');
    expect(orthodoxEaster(2027)).toBe('2027-05-02');
    expect(orthodoxEaster(2028)).toBe('2028-04-16');
  });

  it('uses the academic year of the semester start', () => {
    expect(academicYearOf('2026-08-31')).toBe(2026);
    expect(academicYearOf('2027-02-01')).toBe(2026);
  });

  it('gives 2026-27 the same breaks UTM publishes', () => {
    const byId = Object.fromEntries(autoHolidays(2026).map((h) => [h.id, h]));
    expect(byId['2026:christmas']).toMatchObject({ start: '2026-12-25', end: '2026-12-25' });
    expect(byId['2026:winter']).toMatchObject({ start: '2026-12-28', end: '2027-01-10' });
    expect(byId['2026:easter']).toMatchObject({ start: '2027-05-02', end: '2027-05-08' });
    expect(byId['2026:blajini']).toMatchObject({ start: '2027-05-10' });
    expect(byId['2026:summer']).toMatchObject({ start: '2027-07-01', end: '2027-08-31' });
    // inside a break: not listed again
    expect(byId['2026:newyear']).toBeUndefined();
  });

  it('moves with the year', () => {
    const next = autoHolidays(2027);
    expect(next.find((h) => h.id === '2027:christmas')?.start).toBe('2027-12-25');
    expect(next.find((h) => h.id === '2027:blajini')?.start).toBe('2028-04-24');
  });

  it('applies moved, hidden and added days off', () => {
    const list = holidaysOf({
      semesterStart: '2026-08-31',
      vacations: [{ name: 'Hramul orașului', start: '2026-10-14', end: '2026-10-14' }],
      holidayOverrides: { '2026:winter': { start: '2026-12-26', end: '2027-01-11' }, '2026:women': null },
    });
    expect(list.find((h) => h.id === '2026:winter')).toMatchObject({ start: '2026-12-26', end: '2027-01-11' });
    expect(list.some((h) => h.id === '2026:women')).toBe(false);
    expect(list.some((h) => h.name === 'Hramul orașului' && !h.auto)).toBe(true);
  });

  it('brings every automatic day off back the next year, and keeps added ones to their own year', () => {
    const ev = {
      vacations: [{ name: 'Hramul orașului', start: '2026-10-14', end: '2026-10-14' }],
      holidayOverrides: { '2026:women': null, '2026:winter': null },
    };
    const next = holidaysOf({ ...ev, semesterStart: '2027-08-30' });
    expect(next.map((h) => h.id)).toEqual(expect.arrayContaining(['2027:women', '2027:winter']));
    expect(next.some((h) => !h.auto)).toBe(false);
  });
});

describe('a new academic year takes over by itself', () => {
  it('offers only this year’s two semesters', () => {
    expect(semesterChoices(new Date(2026, 9, 6))).toEqual(['Toamna 2026/2027', 'Primăvara 2026/2027']);
    expect(semesterChoices(new Date(2027, 8, 15))).toEqual(['Toamna 2027/2028', 'Primăvara 2027/2028']);
  });

  it('moves a past semester to the autumn of the new year', () => {
    expect(semesterOf('Primăvara 2026/2027', new Date(2027, 2, 1))).toBe('Primăvara 2026/2027');
    expect(semesterOf('Primăvara 2026/2027', new Date(2027, 8, 2))).toBe('Toamna 2027/2028');
  });

  it('starts the new year on the Monday of the week of 1 September', () => {
    expect(semesterStartOf('2026-08-31', new Date(2026, 9, 6))).toBe('2026-08-31');
    expect(semesterStartOf('2026-08-31', new Date(2027, 8, 10))).toBe('2027-08-30');
  });
});

describe('dueSemester', () => {
  it('starts spring with the winter break and autumn with the summer break', () => {
    expect(dueSemester(new Date(2026, 9, 13))).toBe('Toamna 2026/2027');
    expect(dueSemester(new Date(2026, 11, 27))).toBe('Toamna 2026/2027');
    expect(dueSemester(new Date(2026, 11, 28))).toBe('Primăvara 2026/2027');
    expect(dueSemester(new Date(2027, 5, 30))).toBe('Primăvara 2026/2027');
    expect(dueSemester(new Date(2027, 6, 1))).toBe('Toamna 2027/2028');
    expect(dueSemester(new Date(2026, 11, 21), { '2026:winter': { start: '2026-12-21', end: '2027-01-10' } })).toBe('Primăvara 2026/2027');
    expect(semesterOrder('Primăvara 2026/2027')).toBeGreaterThan(semesterOrder('Toamna 2026/2027'));
  });
});
