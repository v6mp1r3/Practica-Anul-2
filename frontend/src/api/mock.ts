// In-browser implementation of the API contract. Data lives in localStorage so
// the whole app can be used (and demoed) without the backend.
import { seedDataset, seedNotifications, seedUsers } from '../data/seed';
import { generateTimetable } from '../domain/generator';
import { scoreTimetable } from '../domain/score';
import type { Dataset, Notification, Role, Timetable, User } from '../domain/types';
import { ApiError } from './http';
import type { Api, CollectionName, Collections } from './types';

const STORE_KEY = 'eduschool:mock:v1';

interface Store {
  dataset: Dataset;
  users: User[];
  timetables: Timetable[];
  notifications: Notification[];
  readIds: Record<string, string[]>; // userId -> notification ids
  sessionUserId: string | null;
}

const fresh = (): Store => ({
  dataset: structuredClone(seedDataset),
  users: structuredClone(seedUsers),
  timetables: [],
  notifications: structuredClone(seedNotifications),
  readIds: {},
  sessionUserId: null,
});

function load(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through to a fresh store */
  }
  return fresh();
}

let store = load();

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* quota or private mode — keep working in memory */
  }
}

/** Wipe local data back to the demo dataset. */
export function resetMockData() {
  const session = store.sessionUserId;
  store = fresh();
  store.sessionUserId = session;
  persist();
}

const delay = <T>(value: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), ms));
const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function currentUser(): User {
  const u = store.users.find((x) => x.id === store.sessionUserId);
  if (!u) throw new ApiError(401, 'Not signed in');
  return u;
}

function requireRole(...roles: Role[]): User {
  const u = currentUser();
  if (!roles.includes(u.role)) throw new ApiError(403, 'Forbidden');
  return u;
}

function notify(title: string, body: string, roles: Role[] = []) {
  store.notifications.unshift({ id: uid('n'), createdAt: new Date().toISOString(), title, body, roles });
}

function collection<K extends CollectionName>(name: K): Collections[K][] {
  return store.dataset[name] as Collections[K][];
}

/** How many lessons moved between two versions — shown in the publish notification. */
function countChanges(prev: Timetable | undefined, next: Timetable): number {
  if (!prev) return next.lessons.length;
  const key = (l: Timetable['lessons'][number]) => `${l.assignmentId}|${l.day}|${l.slot}|${l.roomId}|${l.parity}`;
  const before = new Set(prev.lessons.map(key));
  return next.lessons.filter((l) => !before.has(key(l))).length;
}

export function createMockApi(): Api {
  return {
    async login(username, password) {
      const user = store.users.find((u) => u.username === username.trim().toLowerCase());
      if (!user || password !== 'demo') throw new ApiError(401, 'Invalid credentials');
      store.sessionUserId = user.id;
      persist();
      return delay({ token: `mock-${user.id}`, user });
    },
    async me() {
      return delay(currentUser(), 0);
    },
    async logout() {
      store.sessionUserId = null;
      persist();
    },

    async getDataset() {
      currentUser();
      return delay(store.dataset);
    },
    async saveSettings(settings) {
      requireRole('admin');
      store.dataset.settings = settings;
      persist();
      return delay(settings);
    },

    async list(name) {
      currentUser();
      return delay(collection(name));
    },
    async create(name, item) {
      requireRole('admin');
      const created = { ...item, id: uid(name[0]) } as Collections[typeof name];
      collection(name).push(created);
      persist();
      return delay(created);
    },
    async update(name, item) {
      requireRole('admin');
      const list = collection(name);
      const i = list.findIndex((x) => x.id === item.id);
      if (i < 0) throw new ApiError(404, 'Not found');
      list[i] = item;
      persist();
      return delay(item);
    },
    async remove(name, id) {
      requireRole('admin');
      const list = collection(name);
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) list.splice(i, 1);
      if (name !== 'assignments') {
        // Drop teaching loads that pointed at the deleted record
        store.dataset.assignments = store.dataset.assignments.filter(
          (a) => a.teacherId !== id && a.subjectId !== id && a.audience.id !== id,
        );
      }
      persist();
      return delay(undefined);
    },
    async importSubjects(subjects) {
      requireRole('admin');
      const created = subjects.map((s) => ({ ...s, id: uid('s') }));
      store.dataset.subjects.push(...created);
      persist();
      return delay(created);
    },

    async updateAvailability(teacherId, data) {
      const u = requireRole('admin', 'teacher');
      if (u.role === 'teacher' && u.teacherId !== teacherId) throw new ApiError(403, 'Forbidden');
      const t = store.dataset.teachers.find((x) => x.id === teacherId);
      if (!t) throw new ApiError(404, 'Not found');
      Object.assign(t, data);
      if (u.role === 'teacher') notify('Disponibilitate actualizată', `${t.name} și-a actualizat disponibilitatea.`, ['admin']);
      persist();
      return delay(t);
    },

    async listTimetables() {
      requireRole('admin');
      return delay(store.timetables.filter((t) => t.status !== 'variant' || Date.now() - Date.parse(t.createdAt) < 864e5));
    },
    async getTimetable(id) {
      currentUser();
      const t = store.timetables.find((x) => x.id === id);
      if (!t) throw new ApiError(404, 'Not found');
      return delay(t);
    },
    async saveTimetable(t) {
      requireRole('admin');
      const saved: Timetable = {
        ...t,
        status: t.status === 'variant' ? 'draft' : t.status,
        updatedAt: new Date().toISOString(),
        score: scoreTimetable(store.dataset, t.lessons),
      };
      const i = store.timetables.findIndex((x) => x.id === t.id);
      if (i >= 0) store.timetables[i] = saved;
      else store.timetables.unshift(saved);
      persist();
      return delay(saved);
    },
    async deleteTimetable(id) {
      requireRole('admin');
      store.timetables = store.timetables.filter((t) => t.id !== id);
      persist();
      return delay(undefined);
    },
    async publishTimetable(id) {
      requireRole('admin');
      const t = store.timetables.find((x) => x.id === id);
      if (!t) throw new ApiError(404, 'Not found');
      const prev = store.timetables.find((x) => x.status === 'published');
      const changes = countChanges(prev, t);
      if (prev) prev.status = 'draft';
      t.status = 'published';
      t.updatedAt = new Date().toISOString();
      notify(
        prev ? 'Orarul a fost actualizat' : 'Orarul a fost publicat',
        prev ? `${changes} perechi au fost modificate în „${t.name}”.` : `„${t.name}” este acum disponibil.`,
      );
      persist();
      return delay(t);
    },
    async getPublished() {
      currentUser();
      return delay(store.timetables.find((t) => t.status === 'published') ?? null);
    },

    async generate(req, onProgress) {
      requireRole('admin');
      const base = req.baseTimetableId ? store.timetables.find((t) => t.id === req.baseTimetableId) : undefined;
      const fixed = base?.lessons.filter((l) => l.locked) ?? [];
      const seed0 = req.seed ?? Math.floor(Math.random() * 1e6);
      const out: Timetable[] = [];
      const now = new Date().toISOString();
      for (let v = 0; v < req.variants; v++) {
        const result = await generateTimetable(
          store.dataset,
          { groupIds: req.groupIds, seed: seed0 + v * 7919, iterations: req.iterations, fixed },
          (p, best) => onProgress?.({ variant: v, progress: (v + p) / req.variants, best }),
        );
        out.push({
          id: uid('tt'),
          name: `Varianta ${String.fromCharCode(65 + v)}`,
          status: 'variant',
          createdAt: now,
          updatedAt: now,
          algorithm: `Greedy + LNS (seed ${result.seed}, ${req.iterations} it.)`,
          groupIds: req.groupIds,
          lessons: result.lessons,
          score: result.score,
        });
      }
      // Drop variants from earlier runs, keep drafts and the published one
      store.timetables = [...out, ...store.timetables.filter((t) => t.status !== 'variant')];
      persist();
      return delay(out, 0);
    },

    async listNotifications() {
      const u = currentUser();
      const read = new Set(store.readIds[u.id] ?? []);
      return delay(
        store.notifications.filter((n) => n.roles.length === 0 || n.roles.includes(u.role)).map((n) => ({ ...n, read: read.has(n.id) })),
        0,
      );
    },
    async markNotificationsRead(ids) {
      const u = currentUser();
      store.readIds[u.id] = [...new Set([...(store.readIds[u.id] ?? []), ...ids])];
      persist();
    },
  };
}
