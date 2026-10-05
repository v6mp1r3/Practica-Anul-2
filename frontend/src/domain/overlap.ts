// When do two pairs in the same weekday/slot actually meet? Weekly pairs meet
// unless their odd/even weeks differ; a dated pair (reduced attendance) meets a
// weekly pair only if that weekly pair runs in the date's week, and another
// dated pair only on the same date.
import { paritiesOverlap } from './slots';
import type { Lesson, Parity } from './types';

/** Odd/even week of a "YYYY-MM-DD" date, counted from 1 September. */
export function weekOfDate(date: string): Parity {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const start = new Date(m - 1 < 8 ? y - 1 : y, 8, 1);
  const monday = (x: Date) => {
    const c = new Date(x);
    c.setHours(0, 0, 0, 0);
    c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
    return c;
  };
  const weeks = Math.floor((monday(day).getTime() - monday(start).getTime()) / (7 * 864e5));
  return weeks % 2 === 0 ? 'odd' : 'even';
}

export function lessonsOverlap(x: Lesson, y: Lesson): boolean {
  if (x.day !== y.day || x.slot !== y.slot) return false;
  if (x.date && y.date) return x.date === y.date;
  if (x.date || y.date) {
    const weekly = x.date ? y : x;
    return paritiesOverlap(weekly.parity, weekOfDate((x.date ?? y.date)!));
  }
  return paritiesOverlap(x.parity, y.parity);
}
