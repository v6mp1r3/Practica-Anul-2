// In-browser implementation of the API contract. Data lives in localStorage so
// the whole app can be used (and demoed) without the backend.
import { seedDataset, seedNotifications, seedUsers } from '../data/seed';
import { generateTimetable } from '../domain/generator';
import { scoreTimetable } from '../domain/score';
import { findHardConflicts } from '../domain/validator';
import type { Dataset, ExamPlan, Notification, NotificationKind, Role, ScheduleChange, Timetable, User } from '../domain/types';
import { generateExams, generateMidterms } from '../domain/exams';
import { DatasetIndex } from '../domain/indexes';
import { createRng } from '../domain/rng';
import { ApiError } from './http';
import type { Api, CollectionName, Collections } from './types';

const STORE_KEY = 'eduschedule:mock:v1';
/** Bump when demo records are added, so saved stores pick them up (see mergeSeed). */
const SEED_VERSION = 14;

interface Store {
  dataset: Dataset;
  users: User[];
  timetables: Timetable[];
  notifications: Notification[];
  changes: ScheduleChange[];
  /** Exam/atestări timetables, one per faculty and round. */
  examPlans?: ExamPlan[];
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
  examPlans: [],
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
  // UTM only: the faculty list is UTM's own
  ds.settings.institutionName = seedDataset.settings.institutionName;
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
  // room preferences and "first/last pair" flags added to existing demo records
  for (const r of ds.rooms) {
    const seed = seedDataset.rooms.find((x) => x.id === r.id);
    if (seed?.preferredSubjectIds && !r.preferredSubjectIds) r.preferredSubjectIds = [...seed.preferredSubjectIds];
  }
  for (const sub of ds.subjects) {
    const seed = seedDataset.subjects.find((x) => x.id === sub.id);
    if (seed?.edgeOfDay && sub.edgeOfDay === undefined) sub.edgeOfDay = true;
    if (seed?.evaluation && sub.evaluation === undefined) sub.evaluation = seed.evaluation;
  }
  // reduced attendance became session-based: every day of real session dates
  const st = ds.settings;
  if (JSON.stringify(st.formDays?.reduced) === '[5,6]') st.formDays.reduced = [...seedDataset.settings.formDays.reduced];
  if (
    JSON.stringify(st.reducedSessions) ===
    JSON.stringify([
      { start: '2026-10-03', end: '2026-10-04' },
      { start: '2026-11-07', end: '2026-11-08' },
      { start: '2026-12-05', end: '2026-12-06' },
    ])
  )
    st.reducedSessions = structuredClone(seedDataset.settings.reducedSessions);
  for (const a of ds.assignments) {
    const seed = seedDataset.assignments.find((x) => x.id === a.id);
    if (seed?.pairsPerSession && a.pairsPerSession === undefined) a.pairsPerSession = seed.pairsPerSession;
  }
  // parts of the day per year of study, and programme lengths
  if (!st.yearShifts) st.yearShifts = structuredClone(seedDataset.settings.yearShifts);
  if (!st.evaluation) st.evaluation = structuredClone(seedDataset.settings.evaluation);
  // days off are computed every year now: the old hand-written 2026-27 list is not an "extra"
  if (st.evaluation) {
    const auto = new Set([
      '2026-12-25',
      '2026-12-28',
      '2027-03-08',
      '2027-05-01',
      '2027-05-03',
      '2027-05-09',
      '2027-05-10',
      '2027-06-01',
      '2027-07-01',
    ]);
    st.evaluation.vacations = (st.evaluation.vacations ?? []).filter((v) => !auto.has(v.start));
    // Saturday is no longer an exam day by default
    if (JSON.stringify(st.evaluation.examDays) === '[0,1,2,3,4,5]') st.evaluation.examDays = [0, 1, 2, 3, 4];
    if (!st.evaluation.reducedExamDays) st.evaluation.reducedExamDays = [0, 1, 2, 3, 4, 5, 6];
  }
  for (const g of ds.groups) {
    const seed = seedDataset.groups.find((x) => x.id === g.id);
    if (g.programYears === undefined) g.programYears = seed?.programYears ?? Math.max(4, g.year);
  }
  // there is no institution-wide administrator any more: every account belongs to a faculty
  saved.users = saved.users.filter((u) => u.username !== 'natalia.grosu');
  // students and teachers don't sign in any more: only administrators have accounts
  saved.users = saved.users.filter((u) => u.role === 'admin');
  if (!saved.users.some((u) => u.id === saved.sessionUserId)) saved.sessionUserId = null;
  // demo accounts added later (faculty administrators)
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

function setPlanStatus(round: ExamPlan['round'], status: ExamPlan['status']): ExamPlan {
  const u = requireRole('admin');
  const plan = (store.examPlans ?? []).find((p) => p.faculty === (u.faculty ?? '') && p.round === round);
  if (!plan) throw new ApiError(404, 'Not found');
  plan.status = status;
  plan.updatedAt = new Date().toISOString();
  persist();
  return plan;
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
      if (update.faculty !== undefined && u.role === 'admin') {
        if (!store.dataset.settings.faculties.includes(update.faculty)) throw new ApiError(422, 'Unknown faculty');
        u.faculty = update.faculty;
      }
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
      requireRole('admin');
      return delay(store.users);
    },
    async createUser(nu) {
      requireRole('admin');
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
      requireRole('admin');
      const i = store.users.findIndex((u) => u.id === user.id);
      if (i < 0) throw new ApiError(404, 'Not found');
      store.users[i] = { ...store.users[i], ...user };
      persist();
      return delay(store.users[i]);
    },
    async deleteUser(id) {
      const me = requireRole('admin');
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

    // public: anyone can see the timetable, rooms and teachers without signing in
    async getDataset() {
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
      // Only the administration enters and edits availability; teachers just see it
      requireRole('admin');
      const t = store.dataset.teachers.find((x) => x.id === teacherId);
      if (!t) throw new ApiError(404, 'Not found');
      Object.assign(t, data);
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
    async unpublishTimetable(id) {
      const u = requireRole('admin');
      const t = store.timetables.find((x) => x.id === id);
      if (!t) throw new ApiError(404, 'Not found');
      if (t.status !== 'published') throw new ApiError(409, 'Not published');
      // A faculty administrator withdraws only their own faculty's groups
      const mine = new Set(t.groupIds.filter((g) => !u.faculty || store.dataset.groups.find((x) => x.id === g)?.faculty === u.faculty));
      if (!mine.size) throw new ApiError(403, 'None of these groups belong to your faculty');
      const touches = (l: { assignmentId: string }) => groupsOf(l.assignmentId).some((g) => mine.has(g));
      const withdrawn = t.lessons.filter(touches);
      const now = new Date().toISOString();
      let result: Timetable;
      if (mine.size === t.groupIds.length) {
        t.status = 'draft';
        t.updatedAt = now;
        result = t;
      } else {
        // other faculties keep their published pairs; ours come back as a draft
        result = {
          ...structuredClone(t),
          id: uid('tt'),
          status: 'draft',
          groupIds: [...mine],
          lessons: structuredClone(withdrawn),
          updatedAt: now,
          score: scoreTimetable(store.dataset, withdrawn),
        };
        t.lessons = t.lessons.filter((l) => !touches(l));
        t.groupIds = t.groupIds.filter((g) => !mine.has(g));
        t.updatedAt = now;
        store.timetables.unshift(result);
      }
      // tell the students and teachers of the withdrawn groups
      notify('unpublished', { name: t.name }, [], {
        groupIds: [...mine],
        teacherIds: [
          ...new Set(withdrawn.map((l) => store.dataset.assignments.find((a) => a.id === l.assignmentId)?.teacherId ?? '')),
        ].filter(Boolean),
      });
      persist();
      return delay(result);
    },
    async getPublished() {
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

    // Exams: public reads, per-faculty plans for administrators
    async listPublishedExams() {
      return delay(
        (store.examPlans ?? []).filter((p) => p.status === 'published').flatMap((p) => p.events),
        0,
      );
    },
    async getExamPlan(round) {
      const u = requireRole('admin');
      return delay((store.examPlans ?? []).find((p) => p.faculty === (u.faculty ?? '') && p.round === round) ?? null);
    },
    async generateExamPlan(round) {
      const u = requireRole('admin');
      const faculty = u.faculty ?? '';
      const ds = store.dataset;
      const idx = new DatasetIndex(ds);
      const groupIds = ds.groups.filter((g) => !faculty || g.faculty === faculty).map((g) => g.id);
      const plans = store.examPlans ?? [];
      // other faculties' published events and this faculty's other rounds stay booked
      const busy = plans
        .filter((p) => (p.faculty !== faculty && p.status === 'published') || (p.faculty === faculty && p.round !== round))
        .flatMap((p) => p.events);
      const rng = createRng(Date.now() % 100000);
      const classes = store.timetables.find((t) => t.status === 'published')?.lessons ?? [];
      const result =
        round === 'midterm1' || round === 'midterm2'
          ? generateMidterms(ds, idx, groupIds, round === 'midterm1' ? 1 : 2, classes, busy, rng)
          : generateExams(ds, idx, groupIds, round, busy, rng, classes);
      const plan: ExamPlan = { faculty, round, status: 'draft', events: result.events, updatedAt: new Date().toISOString() };
      store.examPlans = [...plans.filter((p) => !(p.faculty === faculty && p.round === round)), plan];
      persist();
      return delay({ ...plan, warnings: result.warnings.length }, 300);
    },
    async saveExamPlan(plan) {
      const u = requireRole('admin');
      const saved: ExamPlan = { ...plan, faculty: u.faculty ?? '', updatedAt: new Date().toISOString() };
      store.examPlans = [...(store.examPlans ?? []).filter((p) => !(p.faculty === saved.faculty && p.round === saved.round)), saved];
      persist();
      return delay(saved);
    },
    async publishExamPlan(round) {
      return delay(setPlanStatus(round, 'published'));
    },
    async unpublishExamPlan(round) {
      return delay(setPlanStatus(round, 'draft'));
    },

    async listChanges() {
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
