import { api, ApiError } from '../api';
import type { Timetable } from '../domain/types';

/**
 * Publish a timetable. Returns null and reports through `onClash` when the
 * server refuses because another faculty published clashing pairs meanwhile.
 */
/** Ask, then withdraw a published timetable. Returns the resulting draft, or null if cancelled. */
export async function unpublishWithConfirm(
  tt: Timetable,
  faculty: string | undefined,
  t: (key: 'timetables.unpublishConfirm' | 'timetables.unpublishConfirmFaculty', vars: Record<string, string>) => string,
): Promise<Timetable | null> {
  const ask = faculty ? t('timetables.unpublishConfirmFaculty', { faculty }) : t('timetables.unpublishConfirm', { name: tt.name });
  if (!confirm(ask)) return null;
  return api.unpublishTimetable(tt.id);
}

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
