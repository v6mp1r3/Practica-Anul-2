// Core domain model shared by the UI, the validator and the API layer.
// Field names match docs/API.md — change both together.

export type Role = 'admin' | 'teacher' | 'student';

export type ActivityType = 'lecture' | 'seminar' | 'lab';

/** Odd/even week support ("Contează paritatea săptămânii?"). */
export type Parity = 'weekly' | 'odd' | 'even';

export type RoomType = 'lecture' | 'seminar' | 'lab';

/** Day index 0 = Monday … 5 = Saturday. */
export type Day = number;

/** Index into Settings.slots (pair number − 1). */
export type SlotIndex = number;

export interface TimeSlot {
  start: string; // "08:00"
  end: string; // "09:30"
}

export interface Settings {
  institutionName: string;
  /** Faculties of the institution — as many as needed, none required. */
  faculties: string[];
  semester: string;
  workingDays: number; // 5 or 6
  lessonMinutes: number;
  slots: TimeSlot[];
  weekParity: boolean;
  maxPairsPerDayGroup: number;
  minPairsPerDayGroup: number;
  maxPairsPerDayTeacher: number;
  consultationRequired: boolean;
}

/** "day:slot", e.g. "0:2" = Monday, third pair. */
export type SlotKey = `${number}:${number}`;

export interface Teacher {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  /** Planned weekly load in pairs; going over it is overtime. */
  maxPairsPerWeek: number;
  activityTypes: ActivityType[];
  unavailable: SlotKey[];
  preferred: SlotKey[];
  /** Weekly consultation hour, if already fixed. */
  consultation?: SlotKey;
}

export interface Room {
  id: string;
  name: string;
  building: string;
  capacity: number;
  type: RoomType;
  equipment: string[];
}

export interface Group {
  id: string;
  name: string; // FAF-251
  program: string;
  year: number;
  size: number;
  /** Faculty the group belongs to (one of Settings.faculties), optional. */
  faculty?: string;
  /** Number of subgroups used for labs (1 = not split). */
  subgroups: number;
}

/** A stream ("torentă") joins several groups for one lecture. */
export interface Stream {
  id: string;
  name: string;
  groupIds: string[];
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  credits: number;
  year: number;
  /** Pairs per week by activity type, from the study plan (0.5 = every other week). */
  lecturePairs: number;
  seminarPairs: number;
  labPairs: number;
}

export type Audience = { kind: 'stream'; id: string } | { kind: 'group'; id: string } | { kind: 'subgroup'; id: string; subgroup: number };

/** One teaching load: who teaches what to whom, how often. */
export interface Assignment {
  id: string;
  subjectId: string;
  type: ActivityType;
  teacherId: string;
  audience: Audience;
  pairsPerWeek: number;
  parity: Parity;
  roomType: RoomType;
  equipment: string[];
}

export interface Lesson {
  id: string;
  assignmentId: string;
  day: Day;
  slot: SlotIndex;
  roomId: string;
  parity: Parity;
  /** Edited by hand — the improver must not move it. */
  locked?: boolean;
}

export type TimetableStatus = 'draft' | 'published' | 'variant';

export interface ScoreBreakdown {
  teacherGaps: number;
  groupGaps: number;
  earlyStarts: number;
  dayOverload: number;
  unevenDays: number;
  preferenceMisses: number;
}

export interface Score {
  hard: number;
  soft: number;
  breakdown: ScoreBreakdown;
}

export interface Timetable {
  id: string;
  name: string;
  status: TimetableStatus;
  createdAt: string;
  updatedAt: string;
  algorithm: string;
  groupIds: string[];
  lessons: Lesson[];
  score?: Score;
}

export type ConflictKind =
  | 'teacher-clash'
  | 'room-clash'
  | 'group-clash'
  | 'teacher-unavailable'
  | 'room-capacity'
  | 'room-type'
  | 'room-equipment'
  | 'hours-missing'
  | 'hours-extra'
  | 'outside-hours'
  | 'teacher-overtime'
  | 'teacher-day-overload'
  | 'group-day-overload'
  | 'group-day-underload'
  | 'no-consultation';

export interface Conflict {
  kind: ConflictKind;
  severity: 'hard' | 'warning';
  lessonIds: string[];
  /** Entity the conflict is about (teacher/room/group/assignment id). */
  subjectId: string;
  day?: Day;
  slot?: SlotIndex;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  /** For teachers: their Teacher id. */
  teacherId?: string;
  /** For students: their Group id. */
  groupId?: string;
}

export interface Notification {
  id: string;
  createdAt: string;
  title: string;
  body: string;
  /** Empty = everyone. */
  roles: Role[];
  read?: boolean;
}

/** Everything the solver needs in one object. */
export interface Dataset {
  settings: Settings;
  teachers: Teacher[];
  rooms: Room[];
  groups: Group[];
  streams: Stream[];
  subjects: Subject[];
  assignments: Assignment[];
}
