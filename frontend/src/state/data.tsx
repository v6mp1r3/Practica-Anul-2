// Shared, cached server data: the dataset, the published timetable and
// notifications. Pages read from here and call refresh() after a write.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_MODE, api } from '../api';
import { DatasetIndex } from '../domain/indexes';
import type { Dataset, ExamEvent, Notification, ScheduleChange, Timetable } from '../domain/types';
import { useAuth } from './auth';

interface Data {
  dataset: Dataset | null;
  index: DatasetIndex | null;
  published: Timetable | null;
  notifications: Notification[];
  changes: ScheduleChange[];
  /** Published exam, reexamination and separate atestări events (all faculties). */
  exams: ExamEvent[];
  loading: boolean;
  refresh: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  /** Mark as read: on the server when signed in, in this browser otherwise (students). */
  markNotificationsRead: (ids: string[]) => Promise<void>;
  /** The institution's default time format (Configurare). */
  institutionTimeFormat: TimeFormat;
  /** This person's own choice on this device ('' = follow the institution). */
  myTimeFormat: TimeFormat | '';
  setMyTimeFormat: (f: TimeFormat | '') => void;
}

type TimeFormat = '24h' | '12h';
const TIME_KEY = 'eduschedule:timeFormat';

const DataContext = createContext<Data | null>(null);

// The last data this browser loaded: pages render from it at once and are
// brought up to date when the server answers (live mode only; the demo data
// is already in this browser).
const CACHE_KEY = 'eduschedule:cache:v1';

// Without an account, which notifications this browser has read (the newest few hundred are enough)
const READ_KEY = 'eduschedule:notifications:read';
function readIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function rememberRead(ids: string[]) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...new Set([...ids, ...readIds()])].slice(0, 500)));
  } catch {
    /* private window: they just show as new again */
  }
}
interface Cached {
  dataset: Dataset;
  published: Timetable | null;
  changes: ScheduleChange[];
  exams: ExamEvent[];
}
function readCache(): Cached | null {
  if (API_MODE !== 'http') return null;
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function writeCache(c: Cached) {
  if (API_MODE !== 'http') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* full or unavailable: the next visit loads from the server */
  }
}

// pages mounting together share one request; after a save (fresh) a new one starts
let inFlight: Promise<Cached> | null = null;
function load(fresh = false): Promise<Cached> {
  if (inFlight && !fresh) return inFlight;
  const req: Promise<Cached> = Promise.all([api.getDataset(), api.getPublished(), api.listChanges(), api.listPublishedExams()])
    .then(([dataset, published, changes, exams]) => ({ dataset, published, changes, exams }))
    .finally(() => {
      if (inFlight === req) inFlight = null;
    });
  inFlight = req;
  return req;
}

// Every list and drop-down reads the dataset, so sorting here puts them all in alphabetical order.
const byName = <T extends { name: string }>(list: T[]) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, 'ro', { sensitivity: 'base', numeric: true }));
function alphabetical(d: Dataset): Dataset {
  return {
    ...d,
    teachers: byName(d.teachers),
    rooms: byName(d.rooms),
    groups: byName(d.groups),
    subjects: byName(d.subjects),
    streams: byName(d.streams),
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const signedIn = !!user;
  const [cached] = useState(readCache);
  const [raw, setDataset] = useState<Dataset | null>(cached?.dataset ?? null);
  const [myTimeFormat, setMyState] = useState<TimeFormat | ''>(() => {
    try {
      const v = localStorage.getItem(TIME_KEY);
      return v === '24h' || v === '12h' ? v : '';
    } catch {
      return '';
    }
  });
  const setMyTimeFormat = useCallback((f: TimeFormat | '') => {
    setMyState(f);
    try {
      if (f) localStorage.setItem(TIME_KEY, f);
      else localStorage.removeItem(TIME_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  const institutionTimeFormat: TimeFormat = raw?.settings.timeFormat ?? '24h';
  // Everything that shows times reads settings.timeFormat, so the personal choice is applied there
  const dataset = useMemo(() => {
    if (!raw) return raw;
    const sorted = alphabetical(raw);
    return myTimeFormat ? { ...sorted, settings: { ...sorted.settings, timeFormat: myTimeFormat } } : sorted;
  }, [raw, myTimeFormat]);
  const [published, setPublished] = useState<Timetable | null>(cached?.published ?? null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [changes, setChanges] = useState<ScheduleChange[]>(cached?.changes ?? []);
  const [exams, setExams] = useState<ExamEvent[]>(cached?.exams ?? []);
  const [loading, setLoading] = useState(false);

  // signed in: one's own notifications; without an account (students): everyone's changes, read state kept here
  const refreshNotifications = useCallback(async () => {
    if (signedIn) {
      setNotifications(await api.listNotifications());
      return;
    }
    const read = readIds();
    setNotifications((await api.listPublicNotifications()).map((n) => ({ ...n, read: read.has(n.id) })));
  }, [signedIn]);

  const markNotificationsRead = useCallback(
    async (ids: string[]) => {
      if (signedIn) await api.markNotificationsRead(ids);
      else rememberRead(ids);
      await refreshNotifications();
    },
    [signedIn, refreshNotifications],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await load(true);
      setDataset(fresh.dataset);
      setPublished(fresh.published);
      setChanges(fresh.changes);
      setExams(fresh.exams);
      writeCache(fresh);
      await refreshNotifications().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }, [refreshNotifications, signedIn]);

  // the timetable is public and the same for everyone: load it once
  useEffect(() => {
    load()
      .then((fresh) => {
        setDataset(fresh.dataset);
        setPublished(fresh.published);
        setChanges(fresh.changes);
        setExams(fresh.exams);
        writeCache(fresh);
      })
      .catch(() => {
        /* offline: keep what this browser had */
      });
  }, []);

  // notifications follow who is looking: one's own after signing in, the public ones otherwise
  useEffect(() => {
    setNotifications([]);
    refreshNotifications().catch(() => undefined);
  }, [refreshNotifications]);

  const index = useMemo(() => (dataset ? new DatasetIndex(dataset) : null), [dataset]);

  const value = useMemo(
    () => ({
      dataset,
      index,
      published,
      notifications,
      changes,
      exams,
      loading,
      refresh,
      refreshNotifications,
      markNotificationsRead,
      institutionTimeFormat,
      myTimeFormat,
      setMyTimeFormat,
    }),
    [
      dataset,
      index,
      published,
      notifications,
      changes,
      exams,
      loading,
      refresh,
      refreshNotifications,
      markNotificationsRead,
      institutionTimeFormat,
      myTimeFormat,
      setMyTimeFormat,
    ],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Data {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}

/** For pages that can't render without the dataset — call after the loading guard. */
export function useDataset(): { dataset: Dataset; index: DatasetIndex } & Omit<Data, 'dataset' | 'index'> {
  const d = useData();
  if (!d.dataset || !d.index) throw new Error('Dataset not loaded');
  return { ...d, dataset: d.dataset, index: d.index };
}
