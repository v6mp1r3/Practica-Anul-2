// In-browser implementation of the API contract. Data lives in localStorage so
// the whole app can be used (and demoed) without the backend.
import { seedDataset, seedNotifications, seedUsers } from '../data/seed';
import { generateTimetable } from '../domain/generator';
import { scoreTimetable } from '../domain/score';
import { findHardConflicts } from '../domain/validator';
import type { Dataset, Notification, NotificationKind, Role, ScheduleChange, Timetable, User } from '../domain/types';
import { ApiError } from './http';
import type { Api, CollectionName, Collections } from './types';

const STORE_KEY = 'eduschedule:mock:v1';
/** Bump when demo records are added, so saved stores pick them up (see mergeSeed). */
const SEED_VERSION = 5;

interface Store {
  dataset: Dataset;
  users: User[];
  timetables: Timetable[];
  notifications: Notification[];
  changes: ScheduleChange[];
  /** userId -> password; users not listed still use the demo password. */
  passwords?: Record<string, string>;
  readIds: Record<string, string[]>; // userId -> notification ids
  sessionUserId: string | null;
  seedVersion?: number;
}

const fresh = (): Store => ({
  dataset: structuredClone(seedDataset),
  users: structuredClone(seedUsers),
  timetables: [],
  notifications: structuredClone(seedNotifications),
  changes: [],
  readIds: {},
  sessionUserId: null,
  seedVersion: SEED_VERSION,
});

/**
 * Add demo records introduced after this store was saved (e.g. a new faculty),
 * without touching anything the user created, edited or deleted earlier.
 */
function mergeSeed(saved: Store) {
  const ds = saved.dataset;
  const add = <T extends { id: string }>(list: T[], seed: T[]) => {
    const have = new Set(list.map((x) => x.id));
    for (const item of seed) if (!have.has(item.id)) list.push(structuredClone(item));
  };
  for (const f of seedDataset.settings.faculties) if (!ds.settings.faculties.includes(f)) ds.settings.faculties.push(f);
  add(ds.teachers, seedDataset.teachers);
  add(ds.rooms, seedDataset.rooms);
  add(ds.groups, seedDataset.groups);
  add(ds.streams, seedDataset.streams);
  add(ds.subjects, seedDataset.subjects);
  // only teaching loads whose teacher, subject and audience exist in the store
  const ok = (id: string, list: { id: string }[]) => list.some((x) => x.id === id);
  add(
    ds.assignments,
    seedDataset.assignments.filter(
      (a) =>
        ok(a.teacherId, ds.teachers) &&
        ok(a.subjectId, ds.subjects) &&
        ok(a.audience.id, a.audience.kind === 'stream' ? ds.streams : ds.groups),
    ),
  );
  // new groups that belong to an existing demo stream (e.g. a dual group joining "Anul II")
  for (const st of seedDataset.streams) {
    const mine = ds.streams.find((x) => x.id === st.id);
    if (mine) for (const g of st.groupIds) if (!mine.groupIds.includes(g) && ok(g, ds.groups)) mine.groupIds.push(g);
  }
  // faculty on demo teachers/rooms saved before they had one
  for (const [list, seed] of [
    [ds.teachers, seedDataset.teachers],
    [ds.rooms, seedDataset.rooms],
    [ds.subjects, seedDataset.subjects],
  ] as [{ id: string; faculty?: string }[], { id: string; faculty?: string }[]][]) {
    for (const item of list) if (!item.faculty) item.faculty = seed.find((x) => x.id === item.id)?.faculty;
  }
  // demo accounts added later (institution + faculty administrators)
  const users = new Set(saved.users.map((u) => u.username));
  for (const u of seedUsers) if (!users.has(u.username)) saved.users.push(structuredClone(u));
  for (const u of saved.users) {
    const seed = seedUsers.find((x) => x.id === u.id);
    if (seed?.faculty && u.faculty === undefined) u.faculty = seed.faculty;
  }
  saved.seedVersion = SEED_VERSION;
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Stores saved before multi-faculty support had a single `faculty` string
      const st = saved.dataset?.settings;
      if (st && !Array.isArray(st.faculties)) st.faculties = st.faculty ? [st.faculty] : [];
      if (!Array.isArray(saved.changes)) saved.changes = [];
      // Stores saved before forms of study: Monday–Sunday week, every group full-time
      if (st && !st.formDays) {
        st.workingDays = 7;
        st.formDays = structuredClone(seedDataset.settings.formDays);
      }
      for (const g of saved.dataset?.groups ?? []) if (!g.studyForm) g.studyForm = 'full';
      if (st && !st.formMaxPairs) st.formMaxPairs = { full: st.maxPairsPerDayGroup, reduced: 6, dual: st.maxPairsPerDayGroup };
      if (st && !st.reducedSessions) st.reducedSessions = structuredClone(seedDataset.settings.reducedSessions);
      // Notifications saved as Romanian text before they had a kind
      for (const n of saved.notifications ?? []) {
        if (n.kind) continue;
        const name = /„(.+)”/.exec(n.body)?.[1] ?? '';
        if (n.title === 'Bine ați venit în EduSchedule') n.kind = 'welcome';
        else if (n.title === 'Orarul a fost publicat') Object.assign(n, { kind: 'published', params: { name } });
        else if (n.title === 'Orarul a fost actualizat')
          Object.assign(n, { kind: 'updated', params: { name, count: Number(/^(\d+)/.exec(n.body)?.[1] ?? 0) } });
        else if (n.title === 'Disponibilitate actualizată')
          Object.assign(n, { kind: 'availability', params: { name: n.body.replace(/ și-a actualizat.*$/, '') } });
      }
      if ((saved.seedVersion ?? 1) < SEED_VERSION) {
        mergeSeed(saved);
        localStorage.setItem(STORE_KEY, JSON.stringify(saved));
      }
      return saved;
    }
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

/** Institution administrator: an admin without a faculty. */
function requireInstitutionAdmin(): User {
  const u = requireRole('admin');
  if (u.faculty) throw new ApiError(403, 'Only the institution administrator can do this');
  return u;
}

/** Groups an assignment's audience covers. */
function groupsOf(assignmentId: string): string[] {
  const a = store.dataset.assignments.find((x) => x.id === assignmentId);
  if (!a) return [];
  return a.audience.kind === 'stream' ? (store.dataset.streams.find((x) => x.id === a.audience.id)?.groupIds ?? []) : [a.audience.id];
}

function requireRole(...roles: Role[]): User {
  const u = currentUser();
  if (!roles.includes(u.role)) throw new ApiError(403, 'Forbidden');
  return u;
}

/** Store a notification by kind; the text is rendered in each viewer's language. */
function notify(
  kind: NotificationKind,
  params: Record<string, string | number>,
  roles: Role[] = [],
  target?: { groupIds: string[]; teacherIds: string[] },
) {
  store.notifications.unshift({ id: uid('n'), createdAt: new Date().toISOString(), kind, params, title: '', body: '', roles, ...target });
}

/** Does a notification concern this user? Targeted ones reach only the groups/teachers involved. */
function concerns(n: Notification, u: User): boolean {
  if (n.roles.length && !n.roles.includes(u.role)) return false;
  if (u.role === 'admin' || (!n.groupIds && !n.teacherIds)) return true;
  if (u.role === 'student') return !!u.groupId && !!n.groupIds?.includes(u.groupId);
  return !!u.teacherId && !!n.teacherIds?.includes(u.teacherId);
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
      if (!user || password !== (store.passwords?.[user.id] ?? 'demo')) throw new ApiError(401, 'Invalid credentials');
      store.sessionUserId = user.id;
      persist();
      return delay({ token: `mock-${user.id}`, user });
    },
    async updateProfile(update) {
      const u = currentUser();
      const name = update.name.trim();
      if (!name) throw new ApiError(422, 'Name is required');
      Object.assign(u, {
        name,
        email: update.email?.trim() || undefined,
        phone: update.phone?.trim() || undefined,
        emailNotifications: !!update.emailNotifications,
      });
      if (update.avatar !== undefined) u.avatar = update.avatar ?? undefined;
      persist();
      return delay(u);
    },
    async changePassword(current, next) {
      const u = currentUser();
      if (current !== (store.passwords?.[u.id] ?? 'demo')) throw new ApiError(400, 'Wrong password');
      if (next.length < 8) throw new ApiError(422, 'Password too short');
      store.passwords = { ...store.passwords, [u.id]: next };
      persist();
      return delay(undefined);
    },
    async listUsers() {
      requireInstitutionAdmin();
      return delay(store.users);
    },
    async createUser(nu) {
      requireInstitutionAdmin();
      const username = nu.username.trim().toLowerCase();
      if (!username || store.users.some((u) => u.username === username)) throw new ApiError(422, 'Username taken');
      if (nu.password.length < 8) throw new ApiError(422, 'Password too short');
      const { password, ...rest } = nu;
      const created: User = { ...rest, username, id: uid('u') };
      store.users.push(created);
      store.passwords = { ...store.passwords, [created.id]: password };
      persist();
      return delay(created);
    },
    async updateUser(user) {
      requireInstitutionAdmin();
      const i = store.users.findIndex((u) => u.id === user.id);
      if (i < 0) throw new ApiError(404, 'Not found');
      store.users[i] = { ...store.users[i], ...user };
      persist();
      return delay(store.users[i]);
    },
    async deleteUser(id) {
      const me = requireInstitutionAdmin();
      if (id === me.id) throw new ApiError(422, 'You cannot delete your own account');
      store.users = store.users.filter((u) => u.id !== id);
      persist();
      return delay(undefined);
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
      requireInstitutionAdmin();
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
      if (u.role === 'teacher') notify('availability', { name: t.name }, ['admin']);
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
      if (prev && prev.id !== t.id) {
        // Only this timetable's groups are replaced; other faculties' published pairs stay
        const mine = new Set(t.groupIds);
        const touches = (l: { assignmentId: string }) => groupsOf(l.assignmentId).some((g) => mine.has(g));
        const merged = [...prev.lessons.filter((l) => !touches(l)), ...t.lessons.filter(touches)];
        // Refuse if this draft now double-books a room, teacher or group that
        // another faculty published in the meantime
        const ownIds = new Set(t.lessons.filter(touches).map((l) => l.id));
        const clashes = findHardConflicts(store.dataset, merged).filter(
          (c) =>
            ['room-clash', 'teacher-clash', 'group-clash'].includes(c.kind) &&
            c.lessonIds.some((id) => ownIds.has(id)) &&
            c.lessonIds.some((id) => !ownIds.has(id)),
        );
        if (clashes.length) throw new ApiError(409, String(clashes.length));
        t.lessons = merged;
        t.groupIds = [...new Set([...prev.groupIds, ...t.groupIds])];
      }
      const changes = countChanges(prev, t);
      if (prev) prev.status = 'draft';
      t.status = 'published';
      t.updatedAt = new Date().toISOString();
      if (prev) notify('updated', { name: t.name, count: changes });
      else notify('published', { name: t.name });
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
      // Other groups' published pairs (e.g. another faculty) stay in place and booked
      const selected = new Set(req.groupIds);
      const keep =
        store.timetables
          .find((t) => t.status === 'published')
          ?.lessons.filter((l) => !groupsOf(l.assignmentId).some((g) => selected.has(g))) ?? [];
      const seed0 = req.seed ?? Math.floor(Math.random() * 1e6);
      const out: Timetable[] = [];
      const now = new Date().toISOString();
      for (let v = 0; v < req.variants; v++) {
        const result = await generateTimetable(
          store.dataset,
          { groupIds: req.groupIds, seed: seed0 + v * 7919, iterations: req.iterations, fixed, keep },
          (p, best) => onProgress?.({ variant: v, progress: (v + p) / req.variants, best }),
        );
        out.push({
          id: uid('tt'),
          name: `Varianta ${String.fromCharCode(65 + v)}`,
          status: 'variant',
          createdAt: now,
          updatedAt: now,
          algorithm: `Greedy + LNS · ${req.iterations} it.`,
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

    async listChanges() {
      currentUser();
      return delay(store.changes, 0);
    },
    async createChange(change) {
      requireRole('admin');
      const created: ScheduleChange = { ...change, id: uid('c'), createdAt: new Date().toISOString() };
      store.changes.push(created);
      notify(
        change.kind === 'room' ? 'room-change' : 'teacher-change',
        {
          assignmentId: change.assignmentId,
          date: change.date,
          slot: change.slot,
          fromRoomId: change.fromRoomId,
          ...(change.roomId ? { roomId: change.roomId } : {}),
          ...(change.teacherId ? { teacherId: change.teacherId } : {}),
          ...(change.note ? { note: change.note } : {}),
        },
        [],
        // the affected groups (and every subgroup of them) and both teachers involved
        (() => {
          const a = store.dataset.assignments.find((x) => x.id === change.assignmentId);
          const groupIds = !a
            ? []
            : a.audience.kind === 'stream'
              ? (store.dataset.streams.find((x) => x.id === a.audience.id)?.groupIds ?? [])
              : [a.audience.id];
          const teacherIds = [a?.teacherId, change.teacherId].filter((x): x is string => !!x);
          return { groupIds, teacherIds };
        })(),
      );
      persist();
      return delay(created);
    },
    async deleteChange(id) {
      requireRole('admin');
      store.changes = store.changes.filter((c) => c.id !== id);
      persist();
      return delay(undefined);
    },

    async listNotifications() {
      const u = currentUser();
      const read = new Set(store.readIds[u.id] ?? []);
      return delay(
        store.notifications.filter((n) => concerns(n, u)).map((n) => ({ ...n, read: read.has(n.id) })),
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
