// Reduced attendance ("frecvență redusă") is taught compactly in sessions of
// real dates, Monday–Sunday (UTM regulation, art. 55): each subject gets its
// session pairs in blocks of consecutive pairs (e.g. 8:00–13:00 = 3 pairs), and
// every date can have different content. This places those dated pairs around
// all other pairs (weekly full-time/dual and other dated ones), so a teacher or
// room shared with full-time groups is never double-booked.
import { sessionDates } from './changes';
import type { DatasetIndex } from './indexes';
import { lessonsOverlap } from './overlap';
import type { Rng } from './rng';
import { slotKey } from './slots';
import type { Assignment, Dataset, Lesson } from './types';
import { dayIndexOf } from './views';

const MAX_BLOCK = 3;

let counter = 0;
const newId = () => `S${Date.now().toString(36)}${(counter++).toString(36)}`;

const weekdayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return dayIndexOf(new Date(y, m - 1, d));
};

/** Index of pairs by weekday:slot (overlap needs the same weekday and slot). */
class Board {
  private bySlot = new Map<string, Lesson[]>();
  constructor(
    private idx: DatasetIndex,
    lessons: Lesson[],
  ) {
    lessons.forEach((l) => this.add(l));
  }
  add(l: Lesson) {
    const k = slotKey(l.day, l.slot);
    this.bySlot.set(k, [...(this.bySlot.get(k) ?? []), l]);
  }
  /** Would `l` clash with a teacher, room or students already busy then? */
  clashes(l: Lesson, a: Assignment): boolean {
    return (this.bySlot.get(slotKey(l.day, l.slot)) ?? []).some((o) => {
      if (!lessonsOverlap(o, l)) return false;
      const b = this.idx.assignmentOf(o);
      if (!b) return false;
      return b.teacherId === a.teacherId || o.roomId === l.roomId || this.idx.audiencesOverlap(a.audience, b.audience);
    });
  }
  /** Slots already taken on a date by pairs that concern the given group. */
  groupSlots(date: string, groupId: string): number[] {
    const out: number[] = [];
    for (const list of this.bySlot.values()) {
      for (const o of list) {
        if (o.date !== date) continue;
        const b = this.idx.assignmentOf(o);
        if (b && this.idx.audienceTouchesGroup(b.audience, groupId)) out.push(o.slot);
      }
    }
    return out;
  }
  subjectOnDate(date: string, subjectId: string, groupId: string): boolean {
    for (const list of this.bySlot.values()) {
      for (const o of list) {
        if (o.date !== date) continue;
        const b = this.idx.assignmentOf(o);
        if (b?.subjectId === subjectId && this.idx.audienceTouchesGroup(b.audience, groupId)) return true;
      }
    }
    return false;
  }
}

/**
 * Place the session pairs of the given reduced-attendance teaching loads.
 * `existing` = every other pair in the timetable. Returns the new dated pairs.
 */
export function placeSessions(ds: Dataset, idx: DatasetIndex, loads: Assignment[], existing: Lesson[], rng: Rng): Lesson[] {
  const board = new Board(idx, existing);
  const placed: Lesson[] = [];
  const { settings } = ds;
  const nSlots = settings.slots.length;

  for (const session of settings.reducedSessions ?? []) {
    // biggest loads and labs (scarce rooms) first
    const order = rng
      .shuffle(loads)
      .sort(
        (x, y) =>
          (y.pairsPerSession ?? y.pairsPerWeek) - (x.pairsPerSession ?? x.pairsPerWeek) ||
          Number(y.type === 'lab') - Number(x.type === 'lab'),
      );

    for (const a of order) {
      const groupIds = idx.cohorts(a.audience).map((c) => c.groupId);
      const days = idx.allowedDays(a);
      const dates = sessionDates(session.start, session.end, days);
      if (!dates.length) continue;
      const teacher = idx.teachers.get(a.teacherId);
      const size = idx.audienceSize(a.audience);
      const preferred = new Set(idx.preferredRooms(a).map((r) => r.id));
      const rooms = ds.rooms
        .filter((r) => r.capacity >= size && idx.roomFits(a, r) && idx.hasEquipment(a, r))
        .sort((x, y) => Number(preferred.has(y.id)) - Number(preferred.has(x.id)) || x.capacity - y.capacity);
      const maxPerDay = Math.min(...groupIds.map((g) => idx.groupMaxPairs(g)));

      let remaining = a.pairsPerSession ?? a.pairsPerWeek;
      while (remaining > 0) {
        let best: { date: string; start: number; k: number; roomId: string; cost: number } | null = null;
        for (let k = Math.min(MAX_BLOCK, remaining); k >= 1 && !best; k--) {
          dates.forEach((date) => {
            const day = weekdayOf(date);
            const taken = groupIds.flatMap((g) => board.groupSlots(date, g));
            if (new Set(taken).size + k > maxPerDay) return;
            for (let start = 0; start + k <= nSlots; start++) {
              const slots = Array.from({ length: k }, (_, i) => start + i);
              if (slots.some((s) => teacher?.unavailable.includes(slotKey(day, s)) || taken.includes(s))) continue;
              // no gaps: the block must touch the group's other pairs that date
              let cost = 0;
              if (taken.length) {
                const lo = Math.min(...taken);
                const hi = Math.max(...taken);
                const gap = start > hi ? start - hi - 1 : lo > start + k - 1 ? lo - (start + k - 1) - 1 : 0;
                cost += gap * 10;
              }
              // spread the session evenly: the least busy dates first, over the whole range
              cost += new Set(taken).size * 1.2;
              if (start === 0) cost += 0.5;
              if (groupIds.some((g) => board.subjectOnDate(date, a.subjectId, g))) cost += 3;
              cost += rng.next() * 0.6;
              if (best && cost >= best.cost) continue;
              const room = rooms.find((r) =>
                slots.every((s) => !board.clashes({ id: '', assignmentId: a.id, day, slot: s, roomId: r.id, parity: 'weekly', date }, a)),
              );
              if (room) best = { date, start, k, roomId: room.id, cost };
            }
          });
        }
        if (!best) break; // nothing fits: the validator will report the missing pairs
        const b: { date: string; start: number; k: number; roomId: string } = best;
        for (let i = 0; i < b.k; i++) {
          const l: Lesson = {
            id: newId(),
            assignmentId: a.id,
            day: weekdayOf(b.date),
            slot: b.start + i,
            roomId: b.roomId,
            parity: 'weekly',
            date: b.date,
          };
          board.add(l);
          placed.push(l);
        }
        remaining -= b.k;
      }
    }
  }
  return placed;
}
