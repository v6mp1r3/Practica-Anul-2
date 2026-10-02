// The contract between the web client and the backend. Every method here maps
// to one endpoint in docs/API.md.
import type {
  Assignment,
  Dataset,
  Group,
  Notification,
  Room,
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
  /** The timetable students and teachers see; null before the first publish. */
  getPublished(): Promise<Timetable | null>;

  generate(req: GenerateRequest, onProgress?: (p: GenerateProgress) => void): Promise<Timetable[]>;

  listNotifications(): Promise<Notification[]>;
  markNotificationsRead(ids: string[]): Promise<void>;
}
