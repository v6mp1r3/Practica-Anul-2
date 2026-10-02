// Browser-side timetable generator used by the mock API, so the UI can be
// developed and demoed before the backend solver (CP-SAT + LNS) is ready.
// Stage 1 builds a timetable greedily; stage 2 improves it with Large
// Neighborhood Search (report, Algorithm 2). Locked lessons are never moved.
import { DatasetIndex } from './indexes';
import { createRng, type Rng } from './rng';
import { scoreTimetable } from './score';
import { paritiesOverlap, range, slotKey } from './slots';
import type { Assignment, Dataset, Lesson, Score } from './types';

export interface GenerateOptions {
  groupIds: string[];
  seed: number;
  iterations: number;
  /** Lessons to keep as they are (locked by hand or from other years). */
  fixed?: Lesson[];
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
      teacher: `${a.teacherId}@${k}`,
      room: `${l.roomId}@${k}`,
      groups: [...new Set(this.idx.cohorts(a.audience).map((c) => `${c.groupId}@${k}`))],
    };
  }

  private static push(m: Busy, k: string, l: Lesson) {
    m.set(k, [...(m.get(k) ?? []), l]);
  }

  private static drop(m: Busy, k: string, l: Lesson) {
    m.set(k, (m.get(k) ?? []).filter((x) => x.id !== l.id));
  }

  add(l: Lesson) {
    const a = this.idx.assignmentOf(l)!;
    const k = this.keys(l, a);
    Occupancy.push(this.teacher, k.teacher, l);
    Occupancy.push(this.room, k.room, l);
    k.groups.forEach((g) => Occupancy.push(this.group, g, l));
  }

  remove(l: Lesson) {
    const a = this.idx.assignmentOf(l)!;
    const k = this.keys(l, a);
    Occupancy.drop(this.teacher, k.teacher, l);
    Occupancy.drop(this.room, k.room, l);
    k.groups.forEach((g) => Occupancy.drop(this.group, g, l));
  }

  /** Can `l` go where it says without breaking a hard constraint? */
  fits(l: Lesson, a: Assignment): boolean {
    const k = this.keys(l, a);
    const clash = (others: Lesson[] | undefined, extra?: (o: Lesson) => boolean) =>
      (others ?? []).some((o) => o.id !== l.id && paritiesOverlap(o.parity, l.parity) && (!extra || extra(o)));
    if (clash(this.teacher.get(k.teacher)) || clash(this.room.get(k.room))) return false;
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
    let c = slot === 0 ? 1.5 : 0;
    if (slot >= settings.slots.length - 1) c += 1;

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
      c += 4 * gapDelta(slots);
      if (new Set(slots).size >= settings.maxPairsPerDayGroup) c += 6;
      const sameSubject = this.lessons.some((l) => {
        const o = this.idx.assignmentOf(l)!;
        return l.day === day && o.subjectId === a.subjectId && this.idx.audienceTouchesGroup(o.audience, cohort.groupId);
      });
      if (sameSubject) c += 3;
    }
    c += 3 * gapDelta(this.daySlots((l) => this.idx.assignmentOf(l)!.teacherId === a.teacherId, day));
    if (t?.preferred.includes(slotKey(day, slot))) c -= 1;
    return c + this.rng.next() * 1.2;
  }

  /** Place one pair of `a`; returns false if no conflict-free spot exists. */
  place(a: Assignment): boolean {
    const { settings } = this.ds;
    const teacher = this.idx.teachers.get(a.teacherId);
    const size = this.idx.audienceSize(a.audience);
    const rooms = this.ds.rooms
      .filter((r) => r.capacity >= size && this.idx.roomFits(a, r) && this.idx.hasEquipment(a, r))
      .sort((x, y) => x.capacity - y.capacity);

    let best: Lesson | null = null;
    let bestCost = Infinity;
    for (const day of range(settings.workingDays)) {
      for (const slot of range(settings.slots.length)) {
        if (teacher?.unavailable.includes(slotKey(day, slot))) continue;
        const cost = this.cost(a, day, slot);
        if (cost >= bestCost) continue;
        for (const room of rooms) {
          const l: Lesson = { id: newLessonId(), assignmentId: a.id, day, slot, roomId: room.id, parity: a.parity };
          if (this.occ.fits(l, a)) {
            best = l;
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

  /** Last resort: put it somewhere so the admin sees the conflict instead of a silent gap. */
  forcePlace(a: Assignment) {
    const room = this.ds.rooms.find((r) => this.idx.roomFits(a, r)) ?? this.ds.rooms[0];
    this.add({
      id: newLessonId(),
      assignmentId: a.id,
      day: this.rng.int(this.ds.settings.workingDays),
      slot: this.rng.int(this.ds.settings.slots.length),
      roomId: room.id,
      parity: a.parity,
    });
  }
}

/** Hardest first: big audiences, labs (few rooms), teachers with little availability. */
function difficulty(a: Assignment, idx: DatasetIndex): number {
  const t = idx.teachers.get(a.teacherId);
  return idx.audienceSize(a.audience) / 10 + (a.type === 'lab' ? 4 : 0) + (t?.unavailable.length ?? 0) / 3 + a.equipment.length * 2;
}

function construct(ds: Dataset, idx: DatasetIndex, scoped: Assignment[], fixed: Lesson[], rng: Rng): Builder {
  const b = new Builder(ds, idx, rng);
  fixed.forEach((l) => b.add(l));
  const already = new Map<string, number>();
  fixed.forEach((l) => already.set(l.assignmentId, (already.get(l.assignmentId) ?? 0) + 1));

  const queue = rng
    .shuffle(scoped)
    .sort((x, y) => difficulty(y, idx) - difficulty(x, idx))
    .flatMap((a) => range(Math.max(0, a.pairsPerWeek - (already.get(a.id) ?? 0))).map(() => a));
  for (const a of queue) if (!b.place(a)) b.forcePlace(a);
  return b;
}

const better = (x: Score, y: Score) => x.hard < y.hard || (x.hard === y.hard && x.soft <= y.soft);

/**
 * One LNS step: free k lessons chosen by a domain strategy, re-insert them
 * greedily, keep the result if it is not worse.
 */
function lnsStep(ds: Dataset, idx: DatasetIndex, current: Lesson[], currentScore: Score, k: number, rng: Rng) {
  const movable = current.filter((l) => !l.locked);
  if (!movable.length) return null;
  const strategy = rng.pick(['random', 'byDay', 'byTeacher', 'byGroup'] as const);
  const seed = rng.pick(movable);
  const seedA = idx.assignmentOf(seed)!;
  let pool = movable;
  if (strategy === 'byDay') pool = movable.filter((l) => l.day === seed.day);
  if (strategy === 'byTeacher') pool = movable.filter((l) => idx.assignmentOf(l)!.teacherId === seedA.teacherId);
  if (strategy === 'byGroup') {
    const g = idx.cohorts(seedA.audience)[0]?.groupId;
    pool = movable.filter((l) => idx.audienceTouchesGroup(idx.assignmentOf(l)!.audience, g));
  }
  const destroyed = new Set(rng.shuffle(pool).slice(0, k).map((l) => l.id));

  const b = new Builder(ds, idx, rng);
  current.filter((l) => !destroyed.has(l.id)).forEach((l) => b.add(l));
  const freed = current.filter((l) => destroyed.has(l.id)).map((l) => idx.assignmentOf(l)!);
  for (const a of rng.shuffle(freed)) if (!b.place(a)) b.forcePlace(a);

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
  const fixed = (opts.fixed ?? []).filter((l) => scoped.some((a) => a.id === l.assignmentId));
  const scopedDs: Dataset = { ...ds, assignments: scoped };

  let lessons = construct(ds, idx, scoped, fixed, rng).lessons;
  let score = scoreTimetable(scopedDs, lessons, idx);
  let k = 4;
  let stale = 0;

  for (let i = 0; i < opts.iterations; i++) {
    const next = lnsStep(scopedDs, idx, lessons, score, k, rng);
    if (next && (next.score.hard < score.hard || next.score.soft < score.soft)) {
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
  onProgress?.(1, score);
  return { lessons, score, seed: opts.seed };
}
