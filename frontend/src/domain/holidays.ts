// Days off of an academic year, worked out automatically every year: Moldova's
// public holidays (Codul muncii, art. 111) and UTM's breaks, plus whatever the
// administrator adds, moves or hides for that year.
import { parseDate, toDateString } from './changes';
import type { EvaluationSettings, Vacation } from './types';

/** A day off of the year; `auto` ones come from the rules below. */
export interface Holiday extends Vacation {
  /** Stable per year, e.g. "2026:winter" (auto) or "custom:3". */
  id: string;
  /** Translation key of an automatic day off ("holiday.winter"); custom ones use `name`. */
  nameKey?: string;
  auto: boolean;
  /** One day or a few: a "zi liberă"; a whole break: a "vacanță". */
  kind: 'day' | 'break';
}

const iso = (y: number, m: number, d: number) => toDateString(new Date(y, m - 1, d));
const addDays = (date: string, n: number) => {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateString(d);
};
/** 0 = Monday … 6 = Sunday */
const weekday = (date: string) => (parseDate(date).getDay() + 6) % 7;

/** Orthodox Easter Sunday (Meeus' Julian algorithm + 13 days, valid 1900–2099). */
export function orthodoxEaster(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return addDays(iso(year, month, day), 13);
}

/** First calendar year of the academic year that starts on `semesterStart` (Sept 2026 → 2026). */
export const academicYearOf = (semesterStart: string) => {
  const d = parseDate(semesterStart);
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
};

/** The academic year happening now (from September): October 2026 -> 2026, March 2027 -> 2026. */
export const currentAcademicYear = (today = new Date()) => today.getFullYear() - (today.getMonth() < 8 ? 1 : 0);

/**
 * The semester, kept up to date by itself: a stored semester of a past academic
 * year becomes the autumn semester of the current one ("Toamna 2027/2028").
 */
export function semesterOf(stored: string, today = new Date()): string {
  const y = currentAcademicYear(today);
  const m = /^(Toamna|Primăvara) (\d{4})\//.exec(stored ?? '');
  if (m && Number(m[2]) === y) return stored;
  return `Toamna ${y}/${y + 1}`;
}

/** The two semesters that can be chosen: those of the current academic year. */
export const semesterChoices = (today = new Date()) => {
  const y = currentAcademicYear(today);
  return [`Toamna ${y}/${y + 1}`, `Primăvara ${y}/${y + 1}`];
};

/** Monday of the week of 1 September of the current academic year (the first teaching week). */
export function defaultSemesterStart(today = new Date()): string {
  const sept = new Date(currentAcademicYear(today), 8, 1);
  sept.setDate(sept.getDate() - ((sept.getDay() + 6) % 7));
  return toDateString(sept);
}

/** The stored semester start, moved to this academic year once that one has begun. */
export function semesterStartOf(stored: string | undefined, today = new Date()): string {
  return stored && academicYearOf(stored) >= currentAcademicYear(today) ? stored : defaultSemesterStart(today);
}

/** The days off the rules give for academic year `y` (September y – August y+1). */
export function autoHolidays(y: number): Holiday[] {
  const n = y + 1;
  const easter = orthodoxEaster(n);
  // UTM breaks: winter from the Monday of the week of 28 December to the Sunday of the week of
  // 8 January (after both Christmases and New Year), Easter week, and the summer.
  const winterStart = addDays(iso(y, 12, 28), -weekday(iso(y, 12, 28)));
  const winterEnd = addDays(iso(n, 1, 8), 6 - weekday(iso(n, 1, 8)));
  const breaks: Holiday[] = [
    {
      id: `${y}:winter`,
      nameKey: 'holiday.winter',
      name: 'Vacanța de iarnă',
      start: winterStart,
      end: winterEnd,
      auto: true,
      kind: 'break',
    },
    {
      id: `${y}:easter`,
      nameKey: 'holiday.easterBreak',
      name: 'Vacanța de Paște',
      start: easter,
      end: addDays(easter, 6),
      auto: true,
      kind: 'break',
    },
    {
      id: `${y}:summer`,
      nameKey: 'holiday.summer',
      name: 'Vacanța de vară',
      start: iso(n, 7, 1),
      end: iso(n, 8, 31),
      auto: true,
      kind: 'break',
    },
  ];
  const day = (key: string, name: string, date: string, end = date): Holiday => ({
    id: `${y}:${key}`,
    nameKey: `holiday.${key}`,
    name,
    start: date,
    end,
    auto: true,
    kind: 'day',
  });
  const days: Holiday[] = [
    day('christmas', 'Crăciunul (stil nou)', iso(y, 12, 25)),
    day('newyear', 'Anul Nou', iso(n, 1, 1)),
    day('christmasOld', 'Crăciunul (stil vechi)', iso(n, 1, 7), iso(n, 1, 8)),
    day('women', 'Ziua Internațională a Femeii', iso(n, 3, 8)),
    day('pascha', 'Paștele', easter, addDays(easter, 1)),
    day('blajini', 'Paștele Blajinilor', addDays(easter, 8)),
    day('labour', 'Ziua Muncii', iso(n, 5, 1)),
    day('victory', 'Ziua Victoriei și a Europei', iso(n, 5, 9)),
    day('children', 'Ziua Ocrotirii Copiilor', iso(n, 6, 1)),
    day('independence', 'Ziua Independenței', iso(n, 8, 27)),
    day('language', 'Limba noastră', iso(n, 8, 31)),
  ];
  // a public holiday that falls inside a break adds nothing: keep the list short
  const inBreak = (h: Holiday) => breaks.some((b) => b.start <= h.start && h.end <= b.end);
  return [...breaks, ...days.filter((h) => !inBreak(h))].sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * All days off of the academic year: the automatic ones (moved or hidden by the
 * administrator via `holidayOverrides`) and the extra ones they added.
 */
export function holidaysOf(ev: Pick<EvaluationSettings, 'semesterStart' | 'vacations' | 'holidayOverrides'>): Holiday[] {
  const y = academicYearOf(ev.semesterStart);
  const overrides = ev.holidayOverrides ?? {};
  const auto = autoHolidays(y).flatMap((h) => {
    const o = overrides[h.id];
    if (o === null) return []; // hidden for this year
    return [o ? { ...h, ...o } : h];
  });
  const custom: Holiday[] = (ev.vacations ?? []).map((v, i) => ({
    ...v,
    id: `custom:${i}`,
    auto: false,
    kind: v.start === v.end ? 'day' : 'break',
  }));
  // saved stores still hold the old hand-written list: drop what the rules already give
  const fresh = custom.filter((c) => !auto.some((a) => a.start === c.start && a.end === c.end));
  return [...auto, ...fresh].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/** Hidden automatic days off of the year (to bring them back). */
export function hiddenHolidays(ev: Pick<EvaluationSettings, 'semesterStart' | 'holidayOverrides'>): Holiday[] {
  const overrides = ev.holidayOverrides ?? {};
  return autoHolidays(academicYearOf(ev.semesterStart)).filter((h) => overrides[h.id] === null);
}

/** Number of calendar days a holiday spans. */
export const holidayLength = (h: Vacation) => Math.round((parseDate(h.end).getTime() - parseDate(h.start).getTime()) / 86400000) + 1;
