import type { Assignment, Audience, Dataset, Day, Group, Lesson, Room, Stream, Subject, Teacher, YearShift } from './types';

/** A slice of students: a whole group (subgroup = null) or one subgroup. */
export interface Cohort {
  groupId: string;
  subgroup: number | null;
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

/** Lookup tables over a dataset, built once per validation/generation run. */
export class DatasetIndex {
  readonly teachers: Map<string, Teacher>;
  readonly rooms: Map<string, Room>;
  readonly groups: Map<string, Group>;
  readonly streams: Map<string, Stream>;
  readonly subjects: Map<string, Subject>;
  readonly assignments: Map<string, Assignment>;

  constructor(readonly ds: Dataset) {
    this.teachers = byId(ds.teachers);
    this.rooms = byId(ds.rooms);
    this.groups = byId(ds.groups);
    this.streams = byId(ds.streams);
    this.subjects = byId(ds.subjects);
    this.assignments = byId(ds.assignments);
  }

  cohorts(aud: Audience): Cohort[] {
    switch (aud.kind) {
      case 'stream':
        return (aud.groupIds?.length ? aud.groupIds : (this.streams.get(aud.id)?.groupIds ?? [])).map((groupId) => ({
          groupId,
          subgroup: null,
        }));
      case 'group':
        return [{ groupId: aud.id, subgroup: null }];
      case 'subgroup':
        return [{ groupId: aud.id, subgroup: aud.subgroup }];
    }
  }

  audienceSize(aud: Audience): number {
    if (aud.kind === 'stream') {
      return this.cohorts(aud).reduce((n, c) => n + (this.groups.get(c.groupId)?.size ?? 0), 0);
    }
    const g = this.groups.get(aud.id);
    if (!g) return 0;
    return aud.kind === 'group' ? g.size : Math.ceil(g.size / Math.max(1, g.subgroups));
  }

  audienceLabel(aud: Audience): string {
    if (aud.kind === 'stream') {
      const st = this.streams.get(aud.id);
      if (st?.name) return st.name;
      // a lecture's own torent: its groups
      return (
        this.cohorts(aud)
          .map((c) => this.groups.get(c.groupId)?.name)
          .filter(Boolean)
          .join(', ') || '?'
      );
    }
    const name = this.groups.get(aud.id)?.name ?? '?';
    return aud.kind === 'group' ? name : `${name}/${aud.subgroup}`;
  }

  /** Does this audience include (any part of) the given group? */
  audienceTouchesGroup(aud: Audience, groupId: string): boolean {
    return this.cohorts(aud).some((c) => c.groupId === groupId);
  }

  audiencesOverlap(a: Audience, b: Audience): boolean {
    const cb = this.cohorts(b);
    return this.cohorts(a).some((x) =>
      cb.some((y) => x.groupId === y.groupId && (x.subgroup === null || y.subgroup === null || x.subgroup === y.subgroup)),
    );
  }

  /** Days a group may have pairs on, from its form of study. */
  groupDays(groupId: string): Day[] {
    const { settings } = this.ds;
    const form = this.groups.get(groupId)?.studyForm ?? 'full';
    return (settings.formDays?.[form] ?? []).filter((d) => d < settings.workingDays);
  }

  /** The part of the day a group's year of study is taught in, if set. */
  groupShift(groupId: string): YearShift | undefined {
    const group = this.groups.get(groupId);
    const year = group?.year ?? 1;
    const shifts = (group?.cycle === 'master' ? this.ds.settings.masterYearShifts : this.ds.settings.yearShifts) ?? [];
    return shifts.length ? shifts[Math.min(year, shifts.length) - 1] : undefined;
  }

  /** How many pairs `slot` lies outside the shifts of the pair's groups (0 = inside all). */
  shiftDistance(a: Pick<Assignment, 'audience'>, slot: number): number {
    let d = 0;
    for (const c of this.cohorts(a.audience)) {
      const s = this.groupShift(c.groupId);
      if (s) d += slot < s.first ? s.first - slot : slot > s.last ? slot - s.last : 0;
    }
    return d;
  }

  /** Most pairs per day for a group, from its form of study. */
  groupMaxPairs(groupId: string): number {
    const form = this.groups.get(groupId)?.studyForm ?? 'full';
    return this.ds.settings.formMaxPairs?.[form] ?? this.ds.settings.maxPairsPerDayGroup;
  }

  /** A teaching load for reduced-attendance groups only: scheduled on session dates. */
  isReduced(a: Pick<Assignment, 'audience'>): boolean {
    const cohorts = this.cohorts(a.audience);
    return cohorts.length > 0 && cohorts.every((c) => this.groups.get(c.groupId)?.studyForm === 'reduced');
  }

  /** Pairs a teaching load must receive in the timetable. */
  requiredPairs(a: Assignment): number {
    if (!this.isReduced(a)) return a.pairsPerWeek;
    return (a.pairsPerSession ?? a.pairsPerWeek) * (this.ds.settings.reducedSessions?.length ?? 0);
  }

  /** Days a pair may be placed on: allowed for every group in its audience. */
  allowedDays(a: Assignment): Day[] {
    const lists = this.cohorts(a.audience).map((c) => this.groupDays(c.groupId));
    if (!lists.length) return [];
    return lists.reduce((acc, l) => acc.filter((d) => l.includes(d)));
  }

  /** Rooms marked "de dorit" for this pair (by its subject or one of its groups). */
  preferredRooms(a: Assignment): Room[] {
    const groups = this.cohorts(a.audience).map((c) => c.groupId);
    return this.ds.rooms.filter(
      (r) => r.preferredSubjectIds?.includes(a.subjectId) || r.preferredGroupIds?.some((g) => groups.includes(g)),
    );
  }

  assignmentOf(lesson: Lesson): Assignment | undefined {
    return this.assignments.get(lesson.assignmentId);
  }

  /** Room types an activity may use. Seminars can fall back to lecture halls. */
  roomFits(assignment: Assignment, room: Room): boolean {
    if (assignment.roomType === 'seminar') return room.type === 'seminar' || room.type === 'lecture';
    return room.type === assignment.roomType;
  }

  hasEquipment(assignment: Assignment, room: Room): boolean {
    return assignment.equipment.every((e) => room.equipment.includes(e));
  }
}
