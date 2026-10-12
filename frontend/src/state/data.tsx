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
  const dataset = useMemo(
    () => (raw && myTimeFormat ? { ...raw, settings: { ...raw.settings, timeFormat: myTimeFormat } } : raw),
    [raw, myTimeFormat],
  );
  const [published, setPublished] = useState<Timetable | null>(cached?.published ?? null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [changes, setChanges] = useState<ScheduleChange[]>(cached?.changes ?? []);
  const [exams, setExams] = useState<ExamEvent[]>(cached?.exams ?? []);
  const [loading, setLoading] = useState(false);

  const refreshNotifications = useCallback(async () => {
    setNotifications(await api.listNotifications());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await load(true);
      setDataset(fresh.dataset);
      setPublished(fresh.published);
      setChanges(fresh.changes);
      setExams(fresh.exams);
      writeCache(fresh);
      if (signedIn) await refreshNotifications();
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

  // notifications are per person: after signing in, cleared after signing out
  useEffect(() => {
    if (signedIn) refreshNotifications().catch(() => undefined);
    else setNotifications([]);
  }, [signedIn, refreshNotifications]);

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
