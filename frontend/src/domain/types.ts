// Core domain model shared by the UI, the validator and the API layer.
// Field names match docs/API.md — change both together.

export type Role = 'admin' | 'teacher' | 'student';

export type ActivityType = 'lecture' | 'seminar' | 'lab';

/** Odd/even week support ("Contează paritatea săptămânii?"). */
export type Parity = 'weekly' | 'odd' | 'even';

export type RoomType = 'lecture' | 'seminar' | 'lab';

/** Day index 0 = Monday … 6 = Sunday. */
export type Day = number;

/** Index into Settings.slots (pair number − 1). */
export type SlotIndex = number;

/**
 * Form of study (Education Code, art. 76): full-time attendance, reduced
 * attendance (lessons concentrated on a few days, usually the weekend) and dual
 * (alternating university and company). All forms share teachers and rooms.
 */
export type StudyForm = 'full' | 'reduced' | 'dual';
export const STUDY_FORMS: StudyForm[] = ['full', 'reduced', 'dual'];

export interface TimeSlot {
  start: string; // "08:00"
  end: string; // "09:30"
}

/** First and last pair (0-based, inclusive) of a year's part of the day. */
export interface YearShift {
  first: number;
  last: number;
}

/** A named holiday period (one day: start = end). */
export interface Vacation {
  name: string;
  /** Translation key, for the days off worked out automatically. */
  nameKey?: string;
  start: string;
  end: string;
}

/** A date range (local dates, inclusive). */
export interface DateRange {
  start: string;
  end: string;
}

/**
 * Atestări, exam session and reexaminations (UTM: atestări in weeks 7 and 14
 * during the normal classes; at least 2 free days between exams; a consultation
 * the day before; retakes in afternoon pairs after the session).
 */
export interface EvaluationSettings {
  /** Monday of teaching week 1. */
  semesterStart: string;
  /** Teaching weeks of atestarea 1 and 2. */
  midtermWeeks: [number, number];
  /** Teaching weeks of the retakes of atestarea 1 and 2 (after classes). */
  midtermRetakeWeeks: [number, number];
  /**
   * In the subject's own class (UTM regulation), or in a separate timetable
   * after classes (as some faculties publish an "orarul atestărilor").
   */
  midtermMode: 'inClass' | 'separate';
  midtermStartTimes: string[];
  midtermMinutes: number;
  /** Exam session, possibly in parts (e.g. before and after the winter break). */
  examSession: DateRange[];
  /** Exam session of reduced-attendance groups. */
  reducedExamSession: DateRange[];
  reexamSession: DateRange[];
  /**
   * Extra days off the administrator added for this year. The public holidays and
   * the university's breaks are worked out every year (domain/holidays.ts).
   */
  vacations: Vacation[];
  /** Automatic days off moved (new dates) or hidden (null) this year, by id ("2026:winter"). */
  holidayOverrides?: Record<string, { start: string; end: string } | null>;
  /** Weekdays exams may be held on (0 = Monday). */
  examDays: Day[];
  /** Weekdays for reduced-attendance groups' exams and consultations (weekends too). */
  reducedExamDays: Day[];
  /** Free days at least between two exams of the same group. */
  examMinGap: number;
  /**
   * Hours exams may be held in. Each exam gets its own start time inside the
   * window (not a fixed list), and the admin can move any of them afterwards.
   */
  examFrom: string;
  examTo: string;
  examMinutes: number;
  /** Consultation the day before the exam, or the same day just before it. */
  consultation: 'dayBefore' | 'sameDay';
  consultationMinutes: number;
  /** Hours retakes may be held in (usually the afternoon). */
  reexamFrom: string;
  reexamTo: string;
  reexamMinutes: number;
}

export interface Settings {
  institutionName: string;
  /** Faculties of the institution — as many as needed, none required. */
  faculties: string[];
  semester: string;
  /** Days shown in the week, from Monday: 7 = Monday–Sunday. */
  workingDays: number;
  /** Days each form of study may be scheduled on (subset of the working days). */
  formDays: Record<StudyForm, Day[]>;
  /** Most pairs a group of each form may have in one day (reduced: full session days). */
  formMaxPairs: Record<StudyForm, number>;
  /**
   * Reduced attendance meets only in these sessions (local dates, inclusive);
   * its weekly pattern applies to the session days. Empty = every week.
   */
  reducedSessions: { start: string; end: string }[];
  lessonMinutes: number;
  /** How times are shown: "17:06" (24h, default) or "05:06 PM" (12h). */
  timeFormat?: '24h' | '12h';
  slots: TimeSlot[];
  /**
   * Part of the day each year of study is taught in (index 0 = year 1), as a
   * range of pairs, e.g. year 1 in the morning, years 3+ after lunch. Soft rule.
   */
  yearShifts?: YearShift[];
  weekParity: boolean;
  maxPairsPerDayGroup: number;
  minPairsPerDayGroup: number;
  maxPairsPerDayTeacher: number;
  consultationRequired: boolean;
  evaluation?: EvaluationSettings;
}

/** "day:slot", e.g. "0:2" = Monday, third pair. */
export type SlotKey = `${number}:${number}`;

export interface Teacher {
  id: string;
  name: string;
  title: string;
  department: string;
  /** Faculty the teacher belongs to; empty = teaches across faculties. */
  faculty?: string;
  email: string;
  /** Planned weekly load in pairs; going over it is overtime. */
  maxPairsPerWeek: number;
  activityTypes: ActivityType[];
  unavailable: SlotKey[];
  preferred: SlotKey[];
  /** Weekly consultation hour, if already fixed. */
  consultation?: SlotKey;
  /**
   * Exam-period availability, separate from the weekly one: dates (or half
   * days) the teacher can't examine — "2026-12-15" whole day, "2026-12-15|am"
   * before 13:00, "2026-12-15|pm" from 13:00.
   */
  examUnavailable?: string[];
}

export interface Room {
  id: string;
  name: string;
  building: string;
  /** Subjects and groups that should preferably ("de dorit") use this room. */
  preferredSubjectIds?: string[];
  preferredGroupIds?: string[];
  /** Faculty that manages the room; empty = shared. */
  faculty?: string;
  capacity: number;
  type: RoomType;
  equipment: string[];
}

export interface Group {
  id: string;
  name: string; // FAF-251
  program: string;
  year: number;
  /** Length of the study programme in years (3–6); `year` can't exceed it. */
  programYears?: number;
  size: number;
  /** Form of study; decides which days the group can have pairs on. */
  studyForm: StudyForm;
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
  /** Must be the first or last pair of the group's day (e.g. physical education). */
  edgeOfDay?: boolean;
  /** Faculty whose study plan includes it; empty = shared by all faculties. */
  faculty?: string;
  /** How the subject ends: with an exam in the session, or with the atestări only. Default exam. */
  evaluation?: 'exam' | 'atestari';
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
  /**
   * Reduced attendance: pairs held in each session (UTM: about 1/5 of the
   * full-time hours, same lecture/seminar/lab mix). Used instead of pairsPerWeek.
   */
  pairsPerSession?: number;
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
  /**
   * Reduced attendance: the exact date ("YYYY-MM-DD") of this pair inside a
   * session. Dated pairs happen once, on that date; undated pairs repeat weekly.
   */
  date?: string;
}

export type TimetableStatus = 'draft' | 'published' | 'variant';

export interface ScoreBreakdown {
  teacherGaps: number;
  groupGaps: number;
  earlyStarts: number;
  dayOverload: number;
  unevenDays: number;
  preferenceMisses: number;
  /** Pairs not placed in one of their preferred ("de dorit") rooms. */
  roomMisses: number;
  /** "First or last pair only" subjects (e.g. physical education) placed mid-day. */
  edgeMisses: number;
  /** Pairs outside the part of the day of the group's year of study (in pairs of distance). */
  shiftMisses: number;
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
  | 'wrong-day'
  | 'teacher-overtime'
  | 'teacher-day-overload'
  | 'group-day-overload'
  | 'group-day-underload'
  | 'no-consultation'
  | 'group-gap'
  | 'edge-of-day';

export interface Conflict {
  kind: ConflictKind;
  severity: 'hard' | 'warning';
  lessonIds: string[];
  /** Entity the conflict is about (teacher/room/group/assignment id). */
  subjectId: string;
  day?: Day;
  slot?: SlotIndex;
}

export type ChangeKind = 'room' | 'teacher';

/**
 * A one-off change for a specific date: the pair moves to another room, or a
 * substitute teacher takes it. The published timetable itself is unchanged.
 */
export interface ScheduleChange {
  id: string;
  /** Local date, "YYYY-MM-DD". */
  date: string;
  /** The pair being changed (identified the same way across republishes). */
  assignmentId: string;
  slot: SlotIndex;
  kind: ChangeKind;
  /** Room the pair was planned in. */
  fromRoomId: string;
  /** New room (kind = 'room'). */
  roomId?: string;
  /** Substitute teacher (kind = 'teacher'). */
  teacherId?: string;
  note?: string;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  /**
   * For administrators: the faculty they are responsible for. An administrator
   * without a faculty manages the whole institution (settings, faculty admins).
   */
  faculty?: string;
  /** For teachers: their Teacher id. */
  teacherId?: string;
  /** For students: their Group id. */
  groupId?: string;
  email?: string;
  phone?: string;
  /** Profile picture as a small data URL (or an URL from the server). */
  avatar?: string;
  /** Also send schedule-change notifications by email. */
  emailNotifications?: boolean;
}

/** What the institution administrator sets when creating an account. */
export interface NewUser {
  username: string;
  name: string;
  role: Role;
  faculty?: string;
  email?: string;
  teacherId?: string;
  groupId?: string;
  /** Initial password; the person changes it in "Contul meu". */
  password: string;
}

/** Fields a user may change about themselves. */
export interface ProfileUpdate {
  name: string;
  email?: string;
  phone?: string;
  avatar?: string | null;
  emailNotifications?: boolean;
  /** An administrator's own faculty (one of Settings.faculties). */
  faculty?: string;
}

export type NotificationKind = 'welcome' | 'published' | 'unpublished' | 'updated' | 'availability' | 'room-change' | 'teacher-change';

export interface Notification {
  id: string;
  createdAt: string;
  /**
   * What happened. The client builds the text in the viewer's language from
   * `kind` + `params`; `title`/`body` are a fallback for free-text messages.
   */
  kind?: NotificationKind;
  params?: Record<string, string | number>;
  title: string;
  body: string;
  /** Empty = everyone. */
  roles: Role[];
  /**
   * Only for these groups / teachers (administrators always see it). Used for
   * schedule changes, so students hear only about their own pairs.
   */
  groupIds?: string[];
  teacherIds?: string[];
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

/** Atestarea 1/2, final exams, and the retakes of each (atestarea 1, atestarea 2, final exam). */
export type ExamRound = 'midterm1' | 'midterm2' | 'session' | 'remidterm1' | 'remidterm2' | 'reexam';

/** One entry of the exam timetable: an exam or its consultation, for one group. */
export interface ExamEvent {
  id: string;
  kind: 'exam' | 'consultation';
  /** Atestarea 1/2 (separate timetable), ordinary session or reexamination. */
  round: ExamRound;
  subjectId: string;
  groupId: string;
  teacherId: string;
  roomId: string;
  date: string;
  start: string;
  end: string;
  /** Atestare held in a class: that class (a stream lecture serves several groups at once). */
  lessonId?: string;
  /** Lab atestare of one subgroup (the two subgroups sit theirs at the same time). */
  subgroup?: number;
}

/** A faculty's exam timetable for one round. */
export interface ExamPlan {
  faculty: string;
  round: ExamRound;
  status: 'draft' | 'published';
  events: ExamEvent[];
  updatedAt: string;
}
