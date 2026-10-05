// CSV (spreadsheet) and iCalendar (phone calendar) exports of a timetable.
import type { DatasetIndex } from '../domain/indexes';
import { splitCsvLine } from '../domain/csv';
import type { Lesson, Settings } from '../domain/types';

const DAY_NAMES = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function timetableToCsv(lessons: Lesson[], idx: DatasetIndex, settings: Settings): string {
  const header = ['Ziua', 'Perechea', 'Început', 'Sfârșit', 'Cod', 'Disciplina', 'Tip', 'Profesor', 'Studenți', 'Sala', 'Paritate', 'Data'];
  const typeName = { lecture: 'Curs', seminar: 'Seminar', lab: 'Laborator' };
  const parityName = { weekly: '', odd: 'impar', even: 'par' };
  const rows = [...lessons]
    // weekly pairs first, then reduced-attendance session pairs by date
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.day - b.day || a.slot - b.slot)
    .map((l) => {
      const a = idx.assignmentOf(l)!;
      const s = idx.subjects.get(a.subjectId);
      return [
        DAY_NAMES[l.day],
        l.slot + 1,
        settings.slots[l.slot]?.start ?? '',
        settings.slots[l.slot]?.end ?? '',
        s?.code ?? '',
        s?.name ?? '',
        typeName[a.type],
        idx.teachers.get(a.teacherId)?.name ?? '',
        idx.audienceLabel(a.audience),
        idx.rooms.get(l.roomId)?.name ?? '',
        l.date ? '' : parityName[l.parity],
        l.date ?? '',
      ];
    });
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** First day of the academic year's autumn semester (1 September). */
export function defaultSemesterStart(today = new Date()): Date {
  return new Date(today.getFullYear() - (today.getMonth() < 8 ? 1 : 0), 8, 1);
}

const pad = (n: number) => String(n).padStart(2, '0');
const icsDate = (d: Date, hhmm: string) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${hhmm.replace(':', '')}00`;
const icsText = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');

/**
 * Weekly recurring events for one person's view. Odd/even pairs repeat every
 * two weeks, starting in the first odd (or even) week of the semester.
 */
export function timetableToIcs(
  lessons: Lesson[],
  idx: DatasetIndex,
  settings: Settings,
  semesterStart = defaultSemesterStart(),
  weeks = 16,
): string {
  const monday = new Date(semesterStart);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EduSchedule//RO', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  for (const l of lessons) {
    const a = idx.assignmentOf(l);
    const slot = settings.slots[l.slot];
    if (!a || !slot) continue;
    const subject = idx.subjects.get(a.subjectId);
    const event = (start: Date, rrule?: string) => [
      'BEGIN:VEVENT',
      `UID:${l.id}@eduschedule`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start, slot.start)}`,
      `DTEND:${icsDate(start, slot.end)}`,
      ...(rrule ? [rrule] : []),
      `SUMMARY:${icsText(`${subject?.code ?? ''} ${a.type === 'lecture' ? 'Curs' : a.type === 'lab' ? 'Laborator' : 'Seminar'}`)}`,
      `LOCATION:${icsText(idx.rooms.get(l.roomId)?.name ?? '')}`,
      `DESCRIPTION:${icsText(`${subject?.name ?? ''}\n${idx.teachers.get(a.teacherId)?.name ?? ''}\n${idx.audienceLabel(a.audience)}`)}`,
      'END:VEVENT',
    ];
    // a reduced-attendance session pair happens once, on its date
    if (l.date) {
      const [y, m, d] = l.date.split('-').map(Number);
      lines.push(...event(new Date(y, m - 1, d)));
      continue;
    }
    const first = new Date(monday);
    first.setDate(first.getDate() + l.day + (l.parity === 'even' ? 7 : 0));
    const interval = l.parity === 'weekly' ? 1 : 2;
    // Don't start before the semester does (the first week can begin mid-week)
    while (first < semesterStart) first.setDate(first.getDate() + 7 * interval);
    lines.push(...event(first, `RRULE:FREQ=WEEKLY;INTERVAL=${interval};COUNT=${Math.ceil(weeks / interval)}`));
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** Parse back our own CSV export (used by the tests to round-trip). */
export function readCsvRows(csv: string): string[][] {
  return csv
    .trim()
    .split('\n')
    .map((l) => splitCsvLine(l, ','));
}
