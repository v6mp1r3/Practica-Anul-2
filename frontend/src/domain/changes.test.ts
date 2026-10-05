import { describe, expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { freeRoomsFor, freeTeachersFor, lessonsOnDate, parseDate, toDateString, upcomingChanges } from './changes';
import { DatasetIndex } from './indexes';
import type { Lesson, ScheduleChange } from './types';

const idx = new DatasetIndex(seedDataset);
// a1 = AM lecture for stream "Anul I" (t3), a6 = AC lecture FAF-25, odd weeks (t7)
const lessons: Lesson[] = [
  { id: 'x', assignmentId: 'a1', day: 0, slot: 1, roomId: 'r1', parity: 'weekly' },
  { id: 'y', assignmentId: 'a6', day: 0, slot: 1, roomId: 'r2', parity: 'odd' },
  { id: 'z', assignmentId: 'a2', day: 1, slot: 2, roomId: 'r1', parity: 'weekly' },
];
// The semester starts Tue 1 Sep 2026, so the week of 31 Aug is odd: Mon 7 Sep is
// in an even week and Mon 14 Sep in an odd one
const ODD_MONDAY = '2026-09-14';
const EVEN_MONDAY = '2026-09-07';

describe('dates', () => {
  it('round-trips local dates', () => {
    expect(toDateString(parseDate('2026-10-05'))).toBe('2026-10-05');
  });
});

describe('lessonsOnDate', () => {
  it('returns the weekday’s pairs for that week parity', () => {
    expect(lessonsOnDate(seedDataset, lessons, ODD_MONDAY).map((l) => l.id)).toEqual(['x', 'y']);
    expect(lessonsOnDate(seedDataset, lessons, EVEN_MONDAY).map((l) => l.id)).toEqual(['x']);
    expect(lessonsOnDate(seedDataset, lessons, '2026-09-12')).toEqual([]); // Saturday
  });
});

describe('freeRoomsFor', () => {
  it('offers only free rooms that fit the audience', () => {
    const rooms = freeRoomsFor(seedDataset, idx, lessons, [], ODD_MONDAY, lessons[0]).map((r) => r.id);
    expect(rooms).not.toContain('r1'); // its own room
    expect(rooms).not.toContain('r2'); // busy with the AC lecture
    expect(rooms).toEqual([]); // the stream has 100 students and only 3-114 (its own room) is big enough
  });
  it('frees the planned room of a pair that was moved away that day', () => {
    // the AC lecture (46 students) could use 3-114 only once the AM lecture leaves it
    expect(freeRoomsFor(seedDataset, idx, lessons, [], ODD_MONDAY, lessons[1]).map((r) => r.id)).not.toContain('r1');
    const moved: ScheduleChange = {
      id: 'c',
      date: ODD_MONDAY,
      assignmentId: 'a1',
      slot: 1,
      kind: 'room',
      fromRoomId: 'r1',
      roomId: 'r2',
      createdAt: '',
    };
    const rooms = freeRoomsFor(seedDataset, idx, lessons, [moved], ODD_MONDAY, lessons[1]).map((r) => r.id);
    expect(rooms).toContain('r1');
    expect(rooms).not.toContain('r2'); // now taken by the moved lecture
  });
});

describe('freeTeachersFor', () => {
  it('excludes the planned teacher and anyone teaching then', () => {
    const ids = freeTeachersFor(seedDataset, idx, lessons, [], ODD_MONDAY, lessons[0]).map((t) => t.id);
    expect(ids).not.toContain('t3');
    expect(ids).not.toContain('t7');
    expect(ids.length).toBeGreaterThan(5);
  });
  it('lists teachers of the same activity type first', () => {
    const list = freeTeachersFor(seedDataset, idx, lessons, [], ODD_MONDAY, lessons[0]);
    const firstNonLecturer = list.findIndex((t) => !t.activityTypes.includes('lecture'));
    expect(list.slice(0, firstNonLecturer).every((t) => t.activityTypes.includes('lecture'))).toBe(true);
  });
});

describe('upcomingChanges', () => {
  const mk = (id: string, date: string, assignmentId: string): ScheduleChange => ({
    id,
    date,
    assignmentId,
    slot: 1,
    kind: 'room',
    fromRoomId: 'r1',
    roomId: 'r2',
    createdAt: '',
  });
  const changes = [mk('late', '2026-10-20', 'a1'), mk('past', '2026-09-01', 'a1'), mk('soon', '2026-10-06', 'a6')];

  it('drops past changes and sorts by date', () => {
    expect(upcomingChanges(idx, changes, parseDate('2026-10-05')).map((c) => c.id)).toEqual(['soon', 'late']);
  });
  it('filters by group and by teacher', () => {
    expect(upcomingChanges(idx, changes, parseDate('2026-10-05'), { groupId: 'g3' }).map((c) => c.id)).toEqual(['late']);
    expect(upcomingChanges(idx, changes, parseDate('2026-10-05'), { teacherId: 't7' }).map((c) => c.id)).toEqual(['soon']);
  });
});

describe('reduced-attendance sessions', () => {
  const reduced = seedDataset.assignments.find((a) => a.audience.kind === 'group' && a.audience.id === 'g8')!;
  const satLesson: Lesson = { id: 'r', assignmentId: reduced.id, day: 5, slot: 2, roomId: 'r1', parity: 'weekly' };

  it('happens only on dates inside a session', () => {
    // seed sessions: 3–4 Oct, 7–8 Nov, 5–6 Dec 2026 (Saturday–Sunday)
    expect(lessonsOnDate(seedDataset, [satLesson], '2026-10-03').map((l) => l.id)).toEqual(['r']);
    expect(lessonsOnDate(seedDataset, [satLesson], '2026-10-10')).toEqual([]);
  });

  it('runs every week when no sessions are set', () => {
    const ds = { ...seedDataset, settings: { ...seedDataset.settings, reducedSessions: [] } };
    expect(lessonsOnDate(ds, [satLesson], '2026-10-10').map((l) => l.id)).toEqual(['r']);
  });

  it('does not affect full-time pairs', () => {
    expect(lessonsOnDate(seedDataset, lessons, EVEN_MONDAY).map((l) => l.id)).toEqual(['x']);
  });
});

describe('sessionDates', () => {
  it('lists every weekend date inside a three-week session', async () => {
    const { sessionDates } = await import('../components/SessionTimetable');
    // Sat 3 Oct – Sun 18 Oct 2026, reduced attendance meets Saturday and Sunday
    expect(sessionDates('2026-10-03', '2026-10-18', [5, 6])).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-10',
      '2026-10-11',
      '2026-10-17',
      '2026-10-18',
    ]);
  });
});
