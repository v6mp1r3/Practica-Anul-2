// The contract between the web client and the backend. Every method here maps
// to one endpoint in docs/API.md.
import type {
  ExamEvent,
  ExamPlan,
  ExamRound,
  Assignment,
  Dataset,
  Group,
  Notification,
  NewUser,
  ProfileUpdate,
  Room,
  ScheduleChange,
  Score,
  Settings,
  SlotKey,
  Stream,
  Subject,
  Teacher,
  Timetable,
  User,
} from '../domain/types';

export interface Session {
  token: string;
  user: User;
}

export interface Collections {
  teachers: Teacher;
  rooms: Room;
  groups: Group;
  streams: Stream;
  subjects: Subject;
  assignments: Assignment;
}

export type CollectionName = keyof Collections;

export interface GenerateRequest {
  groupIds: string[];
  variants: number;
  /** Solver effort; the backend maps it to a time limit. */
  iterations: number;
  seed?: number;
  /** Timetable whose locked lessons must be kept. */
  baseTimetableId?: string;
}

export interface GenerateProgress {
  variant: number;
  progress: number; // 0..1 over the whole job
  best?: Score;
}

export interface AvailabilityUpdate {
  unavailable: SlotKey[];
  preferred: SlotKey[];
  consultation?: SlotKey;
}

export interface Api {
  login(username: string, password: string): Promise<Session>;
  me(): Promise<User>;
  logout(): Promise<void>;
  /** The signed-in user changes their own profile. */
  updateProfile(update: ProfileUpdate): Promise<User>;
  /** Accounts (institution administrator only). */
  listUsers(): Promise<User[]>;
  createUser(user: NewUser): Promise<User>;
  updateUser(user: User): Promise<User>;
  deleteUser(id: string): Promise<void>;
  /** Fails with 400 when the current password is wrong. */
  changePassword(current: string, next: string): Promise<void>;

  getDataset(): Promise<Dataset>;
  saveSettings(settings: Settings): Promise<Settings>;

  list<K extends CollectionName>(name: K): Promise<Collections[K][]>;
  create<K extends CollectionName>(name: K, item: Omit<Collections[K], 'id'>): Promise<Collections[K]>;
  update<K extends CollectionName>(name: K, item: Collections[K]): Promise<Collections[K]>;
  remove(name: CollectionName, id: string): Promise<void>;
  importSubjects(subjects: Omit<Subject, 'id'>[]): Promise<Subject[]>;

  updateAvailability(teacherId: string, data: AvailabilityUpdate): Promise<Teacher>;

  listTimetables(): Promise<Timetable[]>;
  getTimetable(id: string): Promise<Timetable>;
  saveTimetable(t: Timetable): Promise<Timetable>;
  deleteTimetable(id: string): Promise<void>;
  publishTimetable(id: string): Promise<Timetable>;
  /**
   * Withdraw a published timetable: it becomes a draft again. A faculty
   * administrator withdraws only their faculty's groups; their pairs come back
   * as a separate draft and the other faculties stay published.
   */
  unpublishTimetable(id: string): Promise<Timetable>;
  /** The timetable students and teachers see; null before the first publish. */
  getPublished(): Promise<Timetable | null>;

  generate(req: GenerateRequest, onProgress?: (p: GenerateProgress) => void): Promise<Timetable[]>;

  /** One-off changes (room move or substitute teacher) for specific dates. */
  listChanges(): Promise<ScheduleChange[]>;
  createChange(change: Omit<ScheduleChange, 'id' | 'createdAt'>): Promise<ScheduleChange>;
  deleteChange(id: string): Promise<void>;

  /** Published exam, reexamination and separate atestări timetables of every faculty (public). */
  listPublishedExams(): Promise<ExamEvent[]>;
  /** The administrator's faculty's plan for one round, draft or published; null if none yet. */
  getExamPlan(round: ExamRound): Promise<ExamPlan | null>;
  /** Every plan of the administrator's faculty (all rounds, drafts and published). */
  listExamPlans(): Promise<ExamPlan[]>;
  deleteExamPlan(round: ExamRound): Promise<void>;
  /** Generate a new draft for the administrator's faculty (other faculties' published events stay booked). */
  generateExamPlan(round: ExamRound): Promise<ExamPlan & { warnings: number }>;
  saveExamPlan(plan: ExamPlan): Promise<ExamPlan>;
  publishExamPlan(round: ExamRound): Promise<ExamPlan>;
  unpublishExamPlan(round: ExamRound): Promise<ExamPlan>;

  listNotifications(): Promise<Notification[]>;
  markNotificationsRead(ids: string[]): Promise<void>;
}
