// How many pairs a weekly teaching load still needs, week by week (backend: app/domain/weeks.py).
// A load of N pairs per week has N pairs in odd weeks and N in even weeks. A weekly pair counts in both weeks,
// an odd- or even-week pair only in its own. So "odd weeks at pair 2, even weeks at pair 3" is one pair per
// week, and a load of 0.5 is one pair every other week (odd or even, either will do).
import type { Lesson, Parity } from './types';

export interface WeekNeed {
  /** Pairs still needed in odd weeks only. */
  odd: number;
  /** Pairs still needed in even weeks only. */
  even: number;
  /** A half pair (0.5 per week) still needed, in odd or in even weeks. */
  either: number;
}

/** Pairs that can go every week (both weeks need one). */
export const weeklyOf = (n: WeekNeed) => Math.min(n.odd, n.even);

/** Week-pairs missing: a weekly pair is two, an odd/even pair one. */
export const halvesOf = (n: WeekNeed) => n.odd + n.even + n.either;

/** Pairs in odd weeks and in even weeks. */
export function weekCounts(lessons: Pick<Lesson, 'parity'>[]): [number, number] {
  const odd = lessons.filter((l) => l.parity !== 'even').length;
  const even = lessons.filter((l) => l.parity !== 'odd').length;
  return [odd, even];
}

/** What a load of `pairsPerWeek` still needs, given its weekly (not dated) lessons. */
export function weekNeed(pairsPerWeek: number, lessons: Pick<Lesson, 'parity'>[]): WeekNeed {
  const base = Math.floor(pairsPerWeek + 1e-9);
  const half = pairsPerWeek - base > 1e-9 ? 1 : 0;
  const [odd, even] = weekCounts(lessons);
  // a pair over the base in one week is the half pair, already placed
  const over = Math.max(0, odd - base) + Math.max(0, even - base);
  return { odd: Math.max(0, base - odd), even: Math.max(0, base - even), either: Math.max(0, half - over) };
}

/** Week-pairs too many (a weekly pair too many is two). */
export function weekExcess(pairsPerWeek: number, lessons: Pick<Lesson, 'parity'>[]): number {
  const [odd, even] = weekCounts(lessons);
  return Math.max(0, odd + even - Math.round(2 * pairsPerWeek));
}

/** What is left after placing a pair of that parity, or null if the load does not need it. */
export function take(n: WeekNeed, parity: Parity): WeekNeed | null {
  if (parity === 'weekly') return n.odd > 0 && n.even > 0 ? { ...n, odd: n.odd - 1, even: n.even - 1 } : null;
  if (n[parity] > 0) return { ...n, [parity]: n[parity] - 1 };
  if (n.either > 0) return { ...n, either: n.either - 1 };
  return null;
}

/** The pairs to place, each with the weeks it may take: every week, odd only, even only, or odd or even. */
export function tasksOf(n: WeekNeed): Parity[][] {
  const w = weeklyOf(n);
  return [
    ...Array.from({ length: w }, (): Parity[] => ['weekly']),
    ...Array.from({ length: n.odd - w }, (): Parity[] => ['odd']),
    ...Array.from({ length: n.even - w }, (): Parity[] => ['even']),
    ...Array.from({ length: n.either }, (): Parity[] => ['odd', 'even']),
  ];
}
