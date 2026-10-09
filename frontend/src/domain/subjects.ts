import type { Subject } from './types';

/** What the timetable shows for a subject: its abbreviation, or its code when it has none. */
export const subjectLabel = (s?: Pick<Subject, 'code' | 'abbreviation'>) => s?.abbreviation?.trim() || s?.code || '';
