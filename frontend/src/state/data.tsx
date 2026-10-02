// Shared, cached server data: the dataset, the published timetable and
// notifications. Pages read from here and call refresh() after a write.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import { DatasetIndex } from '../domain/indexes';
import type { Dataset, Notification, Timetable } from '../domain/types';
import { useAuth } from './auth';

interface Data {
  dataset: Dataset | null;
  index: DatasetIndex | null;
  published: Timetable | null;
  notifications: Notification[];
  loading: boolean;
  refresh: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const DataContext = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [published, setPublished] = useState<Timetable | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshNotifications = useCallback(async () => {
    setNotifications(await api.listNotifications());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ds, pub] = await Promise.all([api.getDataset(), api.getPublished()]);
      setDataset(ds);
      setPublished(pub);
      await refreshNotifications();
    } finally {
      setLoading(false);
    }
  }, [refreshNotifications]);

  useEffect(() => {
    if (user) refresh();
    else {
      setDataset(null);
      setPublished(null);
      setNotifications([]);
    }
  }, [user, refresh]);

  const index = useMemo(() => (dataset ? new DatasetIndex(dataset) : null), [dataset]);

  const value = useMemo(
    () => ({ dataset, index, published, notifications, loading, refresh, refreshNotifications }),
    [dataset, index, published, notifications, loading, refresh, refreshNotifications],
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
