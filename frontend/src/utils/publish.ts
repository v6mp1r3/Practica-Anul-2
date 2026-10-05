import { api, ApiError } from '../api';
import type { Timetable } from '../domain/types';

/**
 * Publish a timetable. Returns null and reports through `onClash` when the
 * server refuses because another faculty published clashing pairs meanwhile.
 */
export async function publishSafely(id: string, onClash: (count: number) => void): Promise<Timetable | null> {
  try {
    return await api.publishTimetable(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      onClash(Number(e.message) || 1);
      return null;
    }
    throw e;
  }
}
