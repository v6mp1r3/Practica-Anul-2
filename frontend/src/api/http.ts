// REST implementation of the API contract (docs/API.md).
import type { Api, GenerateProgress, Session } from './types';

const TOKEN_KEY = 'eduschedule:token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — session lasts until reload */
  }
}

export function createHttpApi(baseUrl: string): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) setToken(null);
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new ApiError(res.status, detail.message ?? res.statusText);
    }
    return res.status === 204 ? (undefined as T) : res.json();
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    async login(username, password) {
      const session = await request<Session>('POST', '/auth/login', { username, password });
      setToken(session.token);
      return session;
    },
    me: () => request('GET', '/auth/me'),
    async logout() {
      await request('POST', '/auth/logout').catch(() => undefined);
      setToken(null);
    },

    updateProfile: (update) => request('PUT', '/auth/me', update),
    changePassword: (current, next) => request('POST', '/auth/password', { current, next }),
    listUsers: () => request('GET', '/users'),
    createUser: (user) => request('POST', '/users', user),
    updateUser: (user) => request('PUT', `/users/${user.id}`, user),
    deleteUser: (id) => request('DELETE', `/users/${id}`),

    getDataset: () => request('GET', '/dataset'),
    saveSettings: (s) => request('PUT', '/settings', s),

    list: (name) => request('GET', `/${name}`),
    create: (name, item) => request('POST', `/${name}`, item),
    update: (name, item) => request('PUT', `/${name}/${item.id}`, item),
    remove: (name, id) => request('DELETE', `/${name}/${id}`),
    importSubjects: (subjects) => request('POST', '/subjects/import', { subjects }),

    updateAvailability: (teacherId, data) => request('PUT', `/teachers/${teacherId}/availability`, data),

    listTimetables: () => request('GET', '/timetables'),
    getTimetable: (id) => request('GET', `/timetables/${id}`),
    saveTimetable: (t) => request('PUT', `/timetables/${t.id}`, t),
    deleteTimetable: (id) => request('DELETE', `/timetables/${id}`),
    publishTimetable: (id) => request('POST', `/timetables/${id}/publish`),
    getPublished: () => request('GET', '/timetables/published'),

    // Generation is a background job: start it, then poll until it is done.
    async generate(req, onProgress) {
      const { jobId } = await request<{ jobId: string }>('POST', '/generate', req);
      for (;;) {
        const job = await request<{
          status: 'running' | 'done' | 'failed';
          progress: GenerateProgress;
          timetableIds?: string[];
          error?: string;
        }>('GET', `/generate/${jobId}`);
        onProgress?.(job.progress);
        if (job.status === 'failed') throw new ApiError(500, job.error ?? 'Generation failed');
        if (job.status === 'done') return Promise.all((job.timetableIds ?? []).map((id) => request<never>('GET', `/timetables/${id}`)));
        await sleep(1000);
      }
    },

    listChanges: () => request('GET', '/changes'),
    createChange: (change) => request('POST', '/changes', change),
    deleteChange: (id) => request('DELETE', `/changes/${id}`),

    listNotifications: () => request('GET', '/notifications'),
    markNotificationsRead: (ids) => request('POST', '/notifications/read', { ids }),
  };
}
