// Excel export of a timetable, laid out like the faculty's printed timetable:
// the groups side by side as columns, every day and pair down the rows, a pair
// six rows high (odd week in the top half, even week in the bottom half), and a
// lecture shared by neighbouring groups merged across their columns.
import type { Borders, PaperSize, Workbook, Worksheet } from 'exceljs';
import { teacherIdsOf, type DatasetIndex } from '../domain/indexes';
import { fmtDate } from '../domain/changes';
import type { Assignment, Lesson, Settings } from '../domain/types';
import { subjectLabel } from '../domain/subjects';

const DAY_NAMES = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];
const TYPE_NAMES = { lecture: 'Curs', seminar: 'Seminar', lab: 'Laborator', project: 'Proiect' };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Rows per pair: three for the odd week (subject, teacher, room), three for the even week. */
const PAIR_ROWS = 6;
/** Columns before the first group: spacer, day, time, spacer. */
const FIRST = 5;
const FONT = 'Arial';
const LECTURE_FILL = 'FFD9D9D9';

/** A column of the grid: a group, or the one teacher / room / group of a single view. */
interface Column {
  name: string;
  lessons: Lesson[];
}

interface SheetSpec {
  title: string;
  /** Second heading line, e.g. "ANUL II". */
  heading: string;
  columns: Column[];
  /** Also print the groups in each class (a teacher's or a room's timetable). */
  withAudience: boolean;
}

/** "c. Matematici Speciale", "2) lab. CDE" (subgroup 2): how the printed timetable names a class. */
function classLabel(a: Assignment, idx: DatasetIndex): string {
  const s = idx.subjects.get(a.subjectId);
  const short = subjectLabel(s);
  const base =
    a.type === 'lecture' ? `c. ${s?.name || short}` : a.type === 'lab' ? `lab. ${short}` : a.type === 'project' ? `pr. ${short}` : short;
  return a.audience.kind === 'subgroup' ? `${a.audience.subgroup}) ${base}` : base;
}

/** "Ababii Nicolai" → "Ababii N.", as the printed timetable writes teachers. */
export const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return [first, ...rest.map((w) => `${w[0]}.`)].join(' ');
};

/**
 * The lines of one cell: subject, teacher(s), room (and the groups, in a teacher's or a room's timetable).
 * Classes held at once (two subgroups' labs) are stacked one under the other.
 */
function cellLines(lessons: Lesson[], idx: DatasetIndex, withAudience: boolean): string[] {
  return lessons.flatMap((l) => {
    const a = idx.assignmentOf(l)!;
    return [
      classLabel(a, idx),
      ...teacherIdsOf(a)
        .map((t) => shortName(idx.teachers.get(t)?.name ?? ''))
        .filter(Boolean),
      idx.rooms.get(l.roomId)?.name ?? '',
      ...(withAudience ? [idx.audienceLabel(a.audience)] : []),
    ];
  });
}

const keyOf = (lessons: Lesson[]) =>
  lessons
    .map((l) => l.id)
    .sort()
    .join('|');

type Side = Partial<Borders>['top'];
const thin: Side = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const medium: Side = { style: 'medium' };
const thick: Side = { style: 'thick' };

/** Draw a border around a block of cells. */
function frame(ws: Worksheet, r1: number, c1: number, r2: number, c2: number, side: Side) {
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        ...cell.border,
        ...(r === r1 ? { top: side } : {}),
        ...(r === r2 ? { bottom: side } : {}),
        ...(c === c1 ? { left: side } : {}),
        ...(c === c2 ? { right: side } : {}),
      };
    }
}

/** Merge a block (when it is more than one cell) and draw a border around it. */
function block(ws: Worksheet, r1: number, c1: number, r2: number, c2: number, side: Side) {
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  frame(ws, r1, c1, r2, c2, side);
}

function writeGrid(ws: Worksheet, spec: SheetSpec, idx: DatasetIndex, settings: Settings) {
  const n = spec.columns.length;
  const last = FIRST + n - 1;
  // a wide sheet repeats the days and times on the right, as the printed one does
  const mirror = n > 6;
  const width = mirror ? last + 4 : last;
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true } as const;

  ws.getColumn(1).width = 1;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 13;
  ws.getColumn(4).width = 1;
  for (let c = FIRST; c <= last; c++) ws.getColumn(c).width = spec.withAudience ? 40 : 24;
  if (mirror) {
    ws.getColumn(last + 1).width = 1;
    ws.getColumn(last + 2).width = 13;
    ws.getColumn(last + 3).width = 16;
  }

  // Heading
  const headings: [string, number][] = [
    [settings.institutionName.toUpperCase(), 16],
    ['O R A R U L', 36],
    [`ACTIVITĂȚILOR DIDACTICE, ${settings.semester.toUpperCase()}${spec.heading ? `, ${spec.heading}` : ''}`, 14],
  ];
  headings.forEach(([text, size], i) => {
    const r = i + 1;
    ws.mergeCells(r, 2, r, width);
    const cell = ws.getCell(r, 2);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = size * 1.6;
  });
  ws.getRow(4).height = 6;

  // Group names
  const H = 5;
  const headerFont = { name: FONT, size: 14, bold: true };
  const corner = (c1: number, c2: number, top: string, bottom: string) => {
    ws.getCell(H, c1).value = top;
    ws.getCell(H + 1, c1).value = bottom;
    for (const r of [H, H + 1]) {
      block(ws, r, c1, r, c2, thick);
      Object.assign(ws.getCell(r, c1), { font: headerFont, alignment: center });
    }
  };
  corner(2, 3, 'Grupele', 'Zilele, Orele');
  if (mirror) corner(last + 2, last + 3, 'Grupele', 'Orele, Zilele');
  spec.columns.forEach((col, i) => {
    const c = FIRST + i;
    block(ws, H, c, H + 1, c, thick);
    Object.assign(ws.getCell(H, c), { value: col.name, font: { name: FONT, size: 16, bold: true }, alignment: center });
  });
  ws.getRow(H).height = 24;
  ws.getRow(H + 1).height = 24;
  ws.getRow(H + 2).height = 5;
  ws.views = [{ state: 'frozen', xSplit: FIRST - 1, ySplit: H + 1 }];

  // A day only shows if it is a weekday or has classes (a free Saturday is left out)
  const all = spec.columns.flatMap((c) => c.lessons);
  const days = Array.from({ length: settings.workingDays }, (_, d) => d).filter((d) => d < 5 || all.some((l) => l.day === d));
  const pairs = settings.slots.length;
  const timeFont = { name: FONT, size: 11, bold: true };
  const classFont = { name: FONT, size: 10, bold: true };
  let row = H + 3;

  for (const day of days) {
    const dayTop = row;
    const dayBottom = row + pairs * PAIR_ROWS - 1;
    for (const [c1, c2] of mirror
      ? [
          [2, 2],
          [last + 3, last + 3],
        ]
      : [[2, 2]]) {
      block(ws, dayTop, c1, dayBottom, c2, thick);
      Object.assign(ws.getCell(dayTop, c1), { value: DAY_NAMES[day], font: { name: FONT, size: 18, bold: true }, alignment: center });
    }

    for (let slot = 0; slot < pairs; slot++) {
      const top = row + slot * PAIR_ROWS;
      const mid = top + PAIR_ROWS / 2;
      const bottom = top + PAIR_ROWS - 1;
      const time = `${settings.slots[slot].start}-${settings.slots[slot].end}`;
      for (const c of mirror ? [3, last + 2] : [3]) {
        block(ws, top, c, bottom, c, thick);
        Object.assign(ws.getCell(top, c), { value: time, font: timeFont, alignment: center });
      }
      // What each column has in the odd and the even week of this pair
      const halves = spec.columns.map((col) => {
        const here = col.lessons.filter((l) => l.day === day && l.slot === slot);
        const odd = here.filter((l) => l.parity !== 'even');
        const even = here.filter((l) => l.parity !== 'odd');
        return { odd, even, whole: keyOf(odd) === keyOf(even) };
      });
      // Rows tall enough for the fullest cell (a 10 pt line is about 13 pt high; a half is three rows)
      const lines = (l: Lesson[]) => (l.length ? cellLines(l, idx, spec.withAudience).length : 0);
      const half = (pick: (h: (typeof halves)[number]) => number) => Math.max(15, Math.ceil((Math.max(0, ...halves.map(pick)) * 13) / 3));
      const upper = half((h) => (h.whole ? lines(h.odd) / 2 : lines(h.odd)));
      const lower = half((h) => (h.whole ? lines(h.odd) / 2 : lines(h.even)));
      for (let r = top; r <= bottom; r++) ws.getRow(r).height = r < mid ? upper : lower;
      // Faint lines between the empty cells, a line between the pairs
      for (let c = FIRST; c <= last; c++) {
        frame(ws, top, c, bottom, c, thin);
        const [first, end] = [ws.getCell(top, c), ws.getCell(bottom, c)];
        first.border = { ...first.border, top: medium };
        end.border = { ...end.border, bottom: medium };
      }

      // One cell per run of neighbouring columns with the same classes
      const place = (r1: number, r2: number, pick: (i: number) => Lesson[] | null) => {
        for (let i = 0; i < n;) {
          const lessons = pick(i);
          let j = i + 1;
          if (lessons?.length) while (j < n && pick(j) && keyOf(pick(j)!) === keyOf(lessons)) j++;
          if (lessons?.length) {
            const c1 = FIRST + i;
            const c2 = FIRST + j - 1;
            block(ws, r1, c1, r2, c2, medium);
            const lecture = lessons.some((l) => idx.assignmentOf(l)?.type === 'lecture');
            for (let r = r1; r <= r2; r++)
              for (let c = c1; c <= c2; c++)
                if (lecture) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LECTURE_FILL } };
            Object.assign(ws.getCell(r1, c1), {
              value: cellLines(lessons, idx, spec.withAudience).join('\n'),
              font: classFont,
              alignment: center,
            });
          }
          i = j;
        }
      };
      place(top, bottom, (i) => (halves[i].whole ? halves[i].odd : null));
      place(top, mid - 1, (i) => (halves[i].whole ? null : halves[i].odd));
      place(mid, bottom, (i) => (halves[i].whole ? null : halves[i].even));
    }
    row = dayBottom + 1;
    ws.getRow(row).height = 5;
    row++;
  }

  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 8 as PaperSize, // A3 (missing from the exceljs enum)
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0, footer: 0 },
  };
}

/** Reduced-attendance pairs happen on dates, not every week: they are listed by date on a sheet of their own. */
function writeSessions(ws: Worksheet, lessons: Lesson[], idx: DatasetIndex, settings: Settings) {
  const header = ['Data', 'Ziua', 'Perechea', 'Ora', 'Grupa', 'Disciplina', 'Tip', 'Profesor', 'Sala'];
  ws.columns = [12, 11, 9, 13, 22, 40, 11, 26, 12].map((width) => ({ width }));
  ws.addRow(header).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const l of [...lessons].sort((a, b) => a.date!.localeCompare(b.date!) || a.slot - b.slot)) {
    const a = idx.assignmentOf(l)!;
    const slot = settings.slots[l.slot];
    ws.addRow([
      fmtDate(l.date!),
      DAY_NAMES[l.day],
      l.slot + 1,
      slot ? `${slot.start}-${slot.end}` : '',
      idx.audienceLabel(a.audience),
      idx.subjects.get(a.subjectId)?.name ?? '',
      TYPE_NAMES[a.type],
      idx.teacherNames(a),
      idx.rooms.get(l.roomId)?.name ?? '',
    ]);
  }
}

async function build(sheets: SheetSpec[], dated: Lesson[], idx: DatasetIndex, settings: Settings): Promise<Workbook> {
  for (const s of sheets) for (const c of s.columns) c.lessons = c.lessons.filter((l) => idx.assignmentOf(l));
  dated = dated.filter((l) => idx.assignmentOf(l));
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduSchedule';
  // Excel sheet names: at most 31 characters, none of []:*?/\\
  for (const spec of sheets) writeGrid(wb.addWorksheet(spec.title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31)), spec, idx, settings);
  if (dated.length) writeSessions(wb.addWorksheet('Sesiuni'), dated, idx, settings);
  return wb;
}

/**
 * Groups side by side by speciality (TI-251, TI-252…), the specialities in a chain where each one follows the
 * one it shares the most classes with, so a lecture of several specialities is one merged cell, as printed.
 */
function bySpeciality(columns: Column[]): Column[] {
  const spec = (c: Column) => c.name.split('-')[0];
  const blocks = new Map<string, Column[]>();
  for (const c of columns) blocks.set(spec(c), [...(blocks.get(spec(c)) ?? []), c]);
  const ids = new Map([...blocks].map(([k, cs]) => [k, new Set(cs.flatMap((c) => c.lessons.map((l) => l.id)))]));
  const shared = (a: string, b: string) => [...ids.get(a)!].filter((id) => ids.get(b)!.has(id)).length;
  const left = [...blocks.keys()];
  const chain = [left.shift()!];
  while (left.length) {
    const tail = chain[chain.length - 1];
    // the closest of the rest (the first one by name on a tie)
    const next = left.reduce((best, k) => (shared(tail, k) > shared(tail, best) ? k : best));
    chain.push(next);
    left.splice(left.indexOf(next), 1);
  }
  return chain.flatMap((k) => blocks.get(k)!);
}

const hasClasses = (l: Lesson[]) => l.some((x) => !x.date);

/**
 * Every group's timetable: a sheet per year of study (licență, then master's),
 * its groups side by side by name, so a torent's lecture spans its groups.
 */
export async function timetableToXlsxAllGroups(
  lessons: Lesson[],
  idx: DatasetIndex,
  settings: Settings,
  groupIds: string[],
): Promise<Workbook> {
  const groups = groupIds
    .map((id) => idx.groups.get(id))
    .filter((g) => !!g)
    .sort((a, b) => a.name.localeCompare(b.name, 'ro', { numeric: true }));
  const sheets = new Map<string, SheetSpec>();
  for (const g of groups) {
    const mine = lessons.filter((l) => {
      const a = idx.assignmentOf(l);
      return !l.date && a && idx.audienceTouchesGroup(a.audience, g.id);
    });
    if (!hasClasses(mine)) continue;
    const master = g.cycle === 'master';
    const year = `ANUL ${ROMAN[g.year - 1] ?? g.year}`;
    const key = `${master ? 1 : 0}:${String(g.year).padStart(2, '0')}`;
    if (!sheets.has(key))
      sheets.set(key, {
        title: `${master ? 'Master ' : ''}Anul ${ROMAN[g.year - 1] ?? g.year}`,
        heading: master ? `MASTER, ${year}` : year,
        columns: [],
        withAudience: false,
      });
    sheets.get(key)!.columns.push({ name: g.name, lessons: mine });
  }
  const ordered = [...sheets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, s]) => ({ ...s, columns: bySpeciality(s.columns) }));
  return build(
    ordered,
    lessons.filter((l) => l.date),
    idx,
    settings,
  );
}

/** One group's, teacher's or room's timetable: the same grid with one column. */
export async function timetableToXlsx(lessons: Lesson[], idx: DatasetIndex, settings: Settings, name: string): Promise<Workbook> {
  // the groups are printed unless this is one group's own timetable
  const groupView = [...idx.groups.values()].some((g) => g.name === name);
  const weekly = lessons.filter((l) => !l.date);
  const sheets =
    hasClasses(weekly) || !lessons.length
      ? [{ title: name || 'Orar', heading: name.toUpperCase(), columns: [{ name, lessons: weekly }], withAudience: !groupView }]
      : [];
  return build(
    sheets,
    lessons.filter((l) => l.date),
    idx,
    settings,
  );
}
