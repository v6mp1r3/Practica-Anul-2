import { describe, expect, it } from 'vitest';
import { academicYearOf, autoHolidays, holidaysOf, orthodoxEaster } from './holidays';

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
});
