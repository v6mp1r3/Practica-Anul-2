// Browser-side timetable generator used by the mock API, so the UI can be
// developed and demoed before the backend solver (CP-SAT + LNS) is ready.
// Stage 1 builds a timetable greedily; stage 2 improves it with Large
// Neighborhood Search (report, Algorithm 2). Locked lessons are never moved.
import { DatasetIndex, shareTeacher, teacherIdsOf } from './indexes';
import { createRng, type Rng } from './rng';
import { placeSessions } from './sessions';
import { scoreTimetable } from './score';
import { paritiesOverlap, range, slotKey } from './slots';
import type { Assignment, Dataset, Lesson, Parity, Room, Score } from './types';
import { halvesOf, take, tasksOf, weekExcess, weekNeed, type WeekNeed } from './weeks';

export interface GenerateOptions {
  groupIds: string[];
  seed: number;
  iterations: number;
  /** Lessons to keep as they are (locked by hand or from other years). */
  fixed?: Lesson[];
  /**
   * Pairs of other groups (e.g. another faculty's published timetable): they
   * keep their rooms and teachers busy, are never moved, and are returned with
   * the result so the timetable stays complete.
   */
  keep?: Lesson[];
  /**
   * A timetable to follow (e.g. last year's, imported): its pairs go back to
   * the same day, pair and room whenever that still fits, and move only when
   * that makes the timetable better.
   */
  example?: Lesson[];
}

export interface GenerateResult {
  lessons: Lesson[];
  score: Score;
  seed: number;
}

type Busy = Map<string, Lesson[]>;

/** Keeps track of who/what is busy in each slot so placement checks stay cheap. */
class Occupancy {
  private teacher: Busy = new Map();
  private room: Busy = new Map();
  private group: Busy = new Map();

  constructor(private idx: DatasetIndex) {}

  private keys(l: Lesson, a: Assignment) {
    const k = slotKey(l.day, l.slot);
    return {
      teachers: teacherIdsOf(a).map((t) => `${t}@${k}`),
      room: `${l.roomId}@${k}`,
      groups: [...new Set(this.idx.cohorts(a.audience).map((c) => `${c.groupId}@${k}`))],
    };
  }

  private static push(m: Busy, k: string, l: Lesson) {
    m.set(k, [...(m.get(k) ?? []), l]);
  }

  private static drop(m: Busy, k: string, l: Lesson) {
    m.set(
      k,
      (m.get(k) ?? []).filter((x) => x.id !== l.id),
    );
  }

  add(l: Lesson) {
    const a = this.idx.assignmentOf(l)!;
    const k = this.keys(l, a);
    k.teachers.forEach((t) => Occupancy.push(this.teacher, t, l));
    Occupancy.push(this.room, k.room, l);
    k.groups.forEach((g) => Occupancy.push(this.group, g, l));
  }

  remove(l: Lesson) {
    const a = this.idx.assignmentOf(l)!;
    const k = this.keys(l, a);
    k.teachers.forEach((t) => Occupancy.drop(this.teacher, t, l));
    Occupancy.drop(this.room, k.room, l);
    k.groups.forEach((g) => Occupancy.drop(this.group, g, l));
  }

  /** Can `l` go where it says without breaking a hard constraint? */
  fits(l: Lesson, a: Assignment): boolean {
    const k = this.keys(l, a);
    const clash = (others: Lesson[] | undefined, extra?: (o: Lesson) => boolean) =>
      (others ?? []).some((o) => o.id !== l.id && paritiesOverlap(o.parity, l.parity) && (!extra || extra(o)));
    if (k.teachers.some((t) => clash(this.teacher.get(t))) || clash(this.room.get(k.room))) return false;
    return !k.groups.some((g) =>
      clash(this.group.get(g), (o) => this.idx.audiencesOverlap(this.idx.assignmentOf(o)!.audience, a.audience)),
    );
  }
}

/** Assignments that belong to the selected groups. */
export function scopeAssignments(ds: Dataset, groupIds: string[], idx = new DatasetIndex(ds)): Assignment[] {
  const set = new Set(groupIds);
  return ds.assignments.filter((a) => idx.cohorts(a.audience).some((c) => set.has(c.groupId)));
}

let lessonCounter = 0;
const newLessonId = () => `L${Date.now().toString(36)}${(lessonCounter++).toString(36)}`;

class Builder {
  readonly occ: Occupancy;
  readonly lessons: Lesson[] = [];

  constructor(
    readonly ds: Dataset,
    readonly idx: DatasetIndex,
    readonly rng: Rng,
  ) {
    this.occ = new Occupancy(idx);
  }

  add(l: Lesson) {
    this.lessons.push(l);
    this.occ.add(l);
  }

  remove(l: Lesson) {
    const i = this.lessons.findIndex((x) => x.id === l.id);
    if (i >= 0) this.lessons.splice(i, 1);
    this.occ.remove(l);
  }

  private daySlots(pred: (l: Lesson) => boolean, day: number) {
    return this.lessons.filter((l) => l.day === day && pred(l)).map((l) => l.slot);
  }

  /** Heuristic cost of putting a lesson at (day, slot) — lower is better. */
  private cost(a: Assignment, day: number, slot: number): number {
    const { settings } = this.ds;
    const t = this.idx.teachers.get(a.teacherId);
    // each year of study has its part of the day (year 1 mornings, upper years after lunch)
    const shift = this.idx.shiftDistance(a, slot);
    let c = 4 * shift;
    const shifted = !!settings.yearShifts?.length;
    if (!shifted && slot === 0) c += 1.5;
    if (!shifted && slot >= settings.slots.length - 1) c += 1;

    const gapDelta = (slots: number[]) => {
      if (!slots.length) return 0;
      const lo = Math.min(...slots);
      const hi = Math.max(...slots);
      return slot < lo ? lo - slot - 1 : slot > hi ? slot - hi - 1 : -1;
    };

    for (const cohort of this.idx.cohorts(a.audience)) {
      const slots = this.daySlots((l) => {
        const o = this.idx.assignmentOf(l)!;
        return this.idx.audienceTouchesGroup(o.audience, cohort.groupId);
      }, day);
      // no gaps for students: strongly prefer slots next to the group's other pairs
      c += 10 * gapDelta(slots);
      // "first or last pair only" subjects must not land between other pairs
      const subj = this.idx.subjects.get(a.subjectId);
      if (subj?.edgeOfDay && slots.length && slot > Math.min(...slots) && slot < Math.max(...slots)) c += 12;
      if (new Set(slots).size >= this.idx.groupMaxPairs(cohort.groupId)) c += 6;
      const sameSubject = this.lessons.some((l) => {
        const o = this.idx.assignmentOf(l)!;
        return l.day === day && o.subjectId === a.subjectId && this.idx.audienceTouchesGroup(o.audience, cohort.groupId);
      });
      if (sameSubject) c += 3;
    }
    for (const tid of teacherIdsOf(a)) c += 3 * gapDelta(this.daySlots((l) => teacherIdsOf(this.idx.assignmentOf(l)!).includes(tid), day));
    if (t?.preferred.includes(slotKey(day, slot))) c -= 1;
    return c + this.rng.next() * 1.2;
  }

  /**
   * Place one pair of `a` in one of the given kinds of week (every week, odd, even);
   * returns false if no conflict-free spot exists.
   */
  place(a: Assignment, weeks: Parity[] = ['weekly']): boolean {
    const { settings } = this.ds;
    const unavailable = new Map(weeks.map((p) => [p, this.idx.teacherUnavailable(a, p)]));
    const size = this.idx.audienceSize(a.audience);
    const preferred = new Set(this.idx.preferredRooms(a).map((r) => r.id));
    const rooms = this.ds.rooms
      .filter((r) => r.capacity >= size && this.idx.roomFits(a, r) && this.idx.hasEquipment(a, r))
      // preferred ("de dorit") rooms first, then the smallest room that fits
      .sort((x, y) => Number(preferred.has(y.id)) - Number(preferred.has(x.id)) || x.capacity - y.capacity);

    let best: Lesson | null = null;
    let bestCost = Infinity;
    for (const day of this.idx.allowedDays(a)) {
      for (const slot of range(settings.slots.length)) {
        // the kinds of week the teachers are free then
        const free = weeks.filter((p) => !unavailable.get(p)!.has(slotKey(day, slot)));
        if (!free.length) continue;
        const cost = this.cost(a, day, slot);
        if (cost >= bestCost) continue;
        for (const parity of free) {
          const room = rooms.find((r) => this.occ.fits({ id: '', assignmentId: a.id, day, slot, roomId: r.id, parity }, a));
          if (room) {
            best = { id: newLessonId(), assignmentId: a.id, day, slot, roomId: room.id, parity };
            bestCost = cost + (room.capacity - size) / 200;
            break;
          }
        }
      }
    }
    if (!best) return false;
    this.add(best);
    return true;
  }

  /** Put a pair where the example has it: same day and pair, its room or another that fits; false if that clashes now. */
  adopt(ex: Lesson, a: Assignment): boolean {
    if (ex.slot >= this.ds.settings.slots.length || !this.idx.allowedDays(a).includes(ex.day)) return false;
    if (this.idx.teacherUnavailable(a, ex.parity).has(slotKey(ex.day, ex.slot))) return false;
    const size = this.idx.audienceSize(a.audience);
    const ok = (r: Room) => r.capacity >= size && this.idx.roomFits(a, r) && this.idx.hasEquipment(a, r);
    const same = this.idx.rooms.get(ex.roomId);
    const rooms = [
      ...(same && ok(same) ? [same] : []),
      ...this.ds.rooms.filter((r) => r.id !== ex.roomId && ok(r)).sort((x, y) => x.capacity - y.capacity),
    ];
    for (const room of rooms) {
      const l: Lesson = { id: newLessonId(), assignmentId: a.id, day: ex.day, slot: ex.slot, roomId: room.id, parity: ex.parity };
      if (this.occ.fits(l, a)) {
        this.add(l);
        return true;
      }
    }
    return false;
  }

  /** Last resort: put it somewhere so the admin sees the conflict instead of a silent gap. */
  forcePlace(a: Assignment, parity: Parity = 'weekly') {
    const room = this.ds.rooms.find((r) => this.idx.roomFits(a, r)) ?? this.ds.rooms[0];
    this.add({
      id: newLessonId(),
      assignmentId: a.id,
      day: (() => {
        const days = this.idx.allowedDays(a);
        return days.length ? this.rng.pick(days) : this.rng.int(this.ds.settings.workingDays);
      })(),
      slot: this.rng.int(this.ds.settings.slots.length),
      roomId: room.id,
      parity,
    });
  }
}

/** Hardest first: big audiences, labs (few rooms), teachers with little availability. */
function difficulty(a: Assignment, idx: DatasetIndex): number {
  return idx.audienceSize(a.audience) / 10 + (a.type === 'lab' ? 4 : 0) + idx.teacherUnavailable(a).size / 3 + a.equipment.length * 2;
}

function construct(ds: Dataset, idx: DatasetIndex, scoped: Assignment[], fixed: Lesson[], rng: Rng, example: Lesson[] = []): Builder {
  const b = new Builder(ds, idx, rng);
  fixed.forEach((l) => b.add(l));
  // what each load still needs in odd and in even weeks
  const left = new Map<string, WeekNeed>(
    scoped.map((a) => [
      a.id,
      weekNeed(
        a.pairsPerWeek,
        fixed.filter((l) => l.assignmentId === a.id && !l.date),
      ),
    ]),
  );
  // the example's pairs first, where they were
  const byId = new Map(scoped.map((a) => [a.id, a]));
  for (const ex of example) {
    const a = byId.get(ex.assignmentId);
    const rest = a && !ex.date ? take(left.get(a.id)!, ex.parity) : null;
    if (a && rest && b.adopt(ex, a)) left.set(a.id, rest);
  }

  const queue = rng
    .shuffle(scoped)
    .sort((x, y) => difficulty(y, idx) - difficulty(x, idx))
    .flatMap((a) => tasksOf(left.get(a.id)!).map((weeks) => ({ a, weeks })));
  for (const { a, weeks } of queue) if (!b.place(a, weeks)) b.forcePlace(a, weeks[0]);
  return b;
}

/** Search cost of moving one pair away from the example timetable (as much as a missed preferred room). */
export const EXAMPLE_WEIGHT = 2;

const better = (x: Score, y: Score) => x.hard < y.hard || (x.hard === y.hard && x.soft <= y.soft);

/**
 * One LNS step: free k lessons chosen by a domain strategy, re-insert them
 * greedily, keep the result if it is not worse.
 */
function lnsStep(ds: Dataset, idx: DatasetIndex, current: Lesson[], currentScore: Score, k: number, rng: Rng, keep: Set<string>) {
  const movable = current.filter((l) => !l.locked && !keep.has(l.id) && !l.date);
  if (!movable.length) return null;
  const strategy = rng.pick(['random', 'byDay', 'byTeacher', 'byGroup'] as const);
  const seed = rng.pick(movable);
  const seedA = idx.assignmentOf(seed)!;
  let pool = movable;
  if (strategy === 'byDay') pool = movable.filter((l) => l.day === seed.day);
  if (strategy === 'byTeacher') pool = movable.filter((l) => shareTeacher(idx.assignmentOf(l)!, seedA));
  if (strategy === 'byGroup') {
    const g = idx.cohorts(seedA.audience)[0]?.groupId;
    pool = movable.filter((l) => idx.audienceTouchesGroup(idx.assignmentOf(l)!.audience, g));
  }
  const destroyed = new Set(
    rng
      .shuffle(pool)
      .slice(0, k)
      .map((l) => l.id),
  );

  const b = new Builder(ds, idx, rng);
  current.filter((l) => !destroyed.has(l.id)).forEach((l) => b.add(l));
  // each freed pair goes back in its own kind of week; a half pair (0.5 per week) may switch between odd and even
  const freed = current.filter((l) => destroyed.has(l.id));
  for (const l of rng.shuffle(freed)) {
    const a = idx.assignmentOf(l)!;
    const weeks: Parity[] = l.parity !== 'weekly' && a.pairsPerWeek % 1 ? ['odd', 'even'] : [l.parity];
    if (!b.place(a, weeks)) b.forcePlace(a, l.parity);
  }

  const score = scoreTimetable(ds, b.lessons, idx);
  return better(score, currentScore) ? { lessons: b.lessons, score } : null;
}

/** Generate one timetable. `onProgress` gets values in [0, 1]. */
export async function generateTimetable(
  ds: Dataset,
  opts: GenerateOptions,
  onProgress?: (p: number, score: Score) => void,
): Promise<GenerateResult> {
  const idx = new DatasetIndex(ds);
  const rng = createRng(opts.seed);
  const scoped = scopeAssignments(ds, opts.groupIds, idx);
  const scopedIds = new Set(scoped.map((a) => a.id));
  const fixed = (opts.fixed ?? []).filter((l) => scopedIds.has(l.assignmentId));
  const keep = (opts.keep ?? []).filter((l) => !scopedIds.has(l.assignmentId));
  const keepIds = new Set(keep.map((l) => l.id));
  // Reduced attendance is placed on session dates afterwards; the weekly engine
  // handles full-time and dual groups
  const weekly = scoped.filter((a) => !idx.isReduced(a));
  const reduced = scoped.filter((a) => idx.isReduced(a));
  const weeklyFixed = fixed.filter((l) => !l.date);
  const scopedDs: Dataset = { ...ds, assignments: weekly };

  let lessons = construct(ds, idx, weekly, [...keep, ...weeklyFixed], rng, opts.example).lessons;
  let score = scoreTimetable(scopedDs, lessons, idx);
  let k = 4;
  let stale = 0;

  // following an example: each pair moved away from it costs a little, so a pair moves only for a real gain
  const exampleAt = new Map<string, number>();
  for (const l of opts.example ?? [])
    exampleAt.set(`${l.assignmentId}|${l.day}|${l.slot}`, (exampleAt.get(`${l.assignmentId}|${l.day}|${l.slot}`) ?? 0) + 1);
  const away = (ls: Lesson[]) => {
    if (!exampleAt.size) return 0;
    const left = new Map(exampleAt);
    let n = 0;
    for (const l of ls) {
      const key = `${l.assignmentId}|${l.day}|${l.slot}`;
      const c = left.get(key) ?? 0;
      if (c > 0) left.set(key, c - 1);
      else if (!keepIds.has(l.id) && !l.date) n++;
    }
    return n;
  };
  let awayNow = away(lessons);

  for (let i = 0; i < opts.iterations; i++) {
    const next = lnsStep(scopedDs, idx, lessons, score, k, rng, keepIds);
    const awayNext = next ? away(next.lessons) : 0;
    if (
      next &&
      (next.score.hard < score.hard ||
        (next.score.hard === score.hard && next.score.soft + EXAMPLE_WEIGHT * awayNext < score.soft + EXAMPLE_WEIGHT * awayNow))
    ) {
      awayNow = awayNext;
      lessons = next.lessons;
      score = next.score;
      stale = 0;
      k = 4;
    } else if (++stale > 15) {
      k = Math.min(12, k + 1); // widen the neighbourhood when stuck
      stale = 0;
    }
    if (i % 10 === 0) {
      onProgress?.(i / opts.iterations, score);
      await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
    }
  }
  if (reduced.length) {
    lessons = [...lessons, ...placeSessions(ds, idx, reduced, lessons, rng, opts.example)];
  }
  score = scoreTimetable({ ...ds, assignments: scoped }, lessons, idx);
  onProgress?.(1, score);
  return { lessons, score, seed: opts.seed };
}

/** How a timetable differs from its teaching loads after the data changed (new loads, more or fewer pairs). */
export interface LoadDrift {
  /**
   * Loads with fewer pairs placed than they need, and how many pairs per week are missing (0.5 = one pair
   * in odd or in even weeks); `need` says which weeks, for a weekly load.
   */
  missing: { assignment: Assignment; count: number; need?: WeekNeed }[];
  /** Loads with more pairs placed than they need, and how many are too many. */
  extra: { assignment: Assignment; count: number }[];
}

export function loadDrift(ds: Dataset, lessons: Lesson[], groupIds: string[], idx = new DatasetIndex(ds)): LoadDrift {
  const own = new Map<string, Lesson[]>();
  for (const l of lessons) own.set(l.assignmentId, [...(own.get(l.assignmentId) ?? []), l]);
  const out: LoadDrift = { missing: [], extra: [] };
  for (const a of scopeAssignments(ds, groupIds, idx)) {
    if (!idx.isReduced(a)) {
      // odd and even weeks each need their pairs
      const weekly = (own.get(a.id) ?? []).filter((l) => !l.date);
      const need = weekNeed(a.pairsPerWeek, weekly);
      if (halvesOf(need)) out.missing.push({ assignment: a, count: halvesOf(need) / 2, need });
      const excess = weekExcess(a.pairsPerWeek, weekly);
      if (excess) out.extra.push({ assignment: a, count: excess / 2 });
      continue;
    }
    const need = idx.requiredPairs(a);
    const have = own.get(a.id)?.length ?? 0;
    if (have < need) out.missing.push({ assignment: a, count: Math.ceil(need - have) });
    // 2 pairs for a load of 1.5 is not one too many: removing one would leave it short
    if (have - need >= 1) out.extra.push({ assignment: a, count: Math.floor(have - need) });
  }
  return out;
}

/**
 * Place only what the timetable lacks (a new teaching load, a load given more pairs), around the pairs it
 * already has, which stay where they are. Pairs that fit nowhere without a clash are left out and counted.
 */
export function placeMissing(
  ds: Dataset,
  lessons: Lesson[],
  groupIds: string[],
  seed = Date.now(),
): { lessons: Lesson[]; placed: number; unplaced: number } {
  const idx = new DatasetIndex(ds);
  const rng = createRng(seed);
  const { missing } = loadDrift(ds, lessons, groupIds, idx);
  const b = new Builder(ds, idx, rng);
  // session pairs (on a date) keep their weekday and pair busy too: a new weekly pair would meet them some week
  for (const l of lessons) if (idx.assignmentOf(l)) b.add(l);
  let placed = 0;
  let unplaced = 0;
  const weekly = missing.filter((m) => !idx.isReduced(m.assignment));
  for (const { assignment, need } of weekly.sort((x, y) => difficulty(y.assignment, idx) - difficulty(x.assignment, idx))) {
    for (const weeks of tasksOf(need!)) {
      // a weekly pair counts as one, an odd- or even-week pair as half
      const n = weeks[0] === 'weekly' ? 1 : 0.5;
      if (b.place(assignment, weeks)) placed += n;
      else unplaced += n;
    }
  }
  const added = b.lessons.filter((l) => !lessons.includes(l));
  // reduced attendance: a load with no session pairs yet gets them on the session dates
  const reduced = missing.filter((m) => idx.isReduced(m.assignment));
  const fresh = reduced.filter((m) => !lessons.some((l) => l.assignmentId === m.assignment.id)).map((m) => m.assignment);
  const sessions = fresh.length ? placeSessions(ds, idx, fresh, [...lessons, ...added], rng) : [];
  placed += sessions.length;
  unplaced += reduced.reduce((n, m) => n + m.count, 0) - sessions.length;
  return { lessons: [...lessons, ...added, ...sessions], placed, unplaced };
}

/** Take out the pairs a load no longer needs (its pairs per week went down); locked pairs stay. */
export function dropExtra(ds: Dataset, lessons: Lesson[], groupIds: string[]): { lessons: Lesson[]; removed: number } {
  const { extra } = loadDrift(ds, lessons, groupIds);
  const idx = new DatasetIndex(ds);
  const gone = new Set<string>();
  // the last ones of the week go first
  const lastFirst = (x: Lesson, y: Lesson) => (y.date ?? '').localeCompare(x.date ?? '') || y.day - x.day || y.slot - x.slot;
  for (const { assignment, count } of extra) {
    const own = lessons.filter((l) => l.assignmentId === assignment.id && !l.locked).sort(lastFirst);
    if (idx.isReduced(assignment)) {
      own.slice(0, count).forEach((l) => gone.add(l.id));
      continue;
    }
    // one pair at a time, as long as there are too many, never leaving a week short
    let kept = lessons.filter((l) => l.assignmentId === assignment.id && !l.date);
    for (;;) {
      if (!weekExcess(assignment.pairsPerWeek, kept)) break;
      const without = (l: Lesson) => kept.filter((x) => x !== l);
      const pick =
        own.find((l) => !gone.has(l.id) && !l.date && !halvesOf(weekNeed(assignment.pairsPerWeek, without(l)))) ??
        own.find((l) => !gone.has(l.id) && !l.date);
      if (!pick) break;
      gone.add(pick.id);
      kept = without(pick);
    }
  }
  return { lessons: lessons.filter((l) => !gone.has(l.id)), removed: gone.size };
}
