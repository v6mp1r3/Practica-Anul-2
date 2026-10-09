// Importing a timetable the faculty already has: our own CSV export, or the
// rows the backend read from a UTM PDF / Excel sheet. Each row (groups, day,
// time, week, type, subject, teacher, room) is matched to a load (Sarcina
// didactică) by its groups, subject, type and teacher, and becomes a lesson of
// a draft timetable, which can also be the example a generation follows.
import { splitCsvLine } from './csv';
import type { DatasetIndex } from './indexes';
import type { ActivityType, Assignment, Dataset, Day, Lesson, Parity, Room } from './types';

export interface ImportRow {
  /** Where it came from (CSV line, PDF page and time, Excel cell) for the report. */
  source: string;
  /** Group names as written ("TI-231"); empty when only `audience` says who. */
  groups: string[];
  /** "TI-231/1", "FAF-231, FAF-232" (our CSV's Studenți column). */
  audience?: string;
  day: Day;
  /** Pair index when the file says it (our CSV), otherwise found from `start`. */
  pair?: number;
  start?: string;
  type?: ActivityType | null;
  code?: string;
  subject: string;
  teacher?: string;
  room?: string;
  parity: Parity;
  date?: string;
}

export type RowStatus = 'ok' | 'merged' | 'group' | 'time' | 'subject';

export interface RowResult {
  row: ImportRow;
  status: RowStatus;
  assignmentId?: string;
  /** The room was not found by name: another free room that fits was used. */
  roomGuessed?: boolean;
  /** Group names in the file that are not in the app. */
  unknownGroups?: string[];
}

export interface ImportResult {
  lessons: Lesson[];
  groupIds: string[];
  results: RowResult[];
}

// ---------------------------------------------------------------- our CSV export

const DAY_WORDS: Record<string, Day> = {
  luni: 0,
  marti: 1,
  miercuri: 2,
  joi: 3,
  vineri: 4,
  sambata: 5,
  duminica: 6,
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};
const TYPE_WORDS: Record<string, ActivityType> = {
  curs: 'lecture',
  lecture: 'lecture',
  seminar: 'seminar',
  laborator: 'lab',
  lab: 'lab',
  proiect: 'project',
  project: 'project',
  'lucrari practice': 'seminar',
  'lucrari de laborator': 'lab',
};

export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Our own CSV export (one group, or "every group" with a Grupa column) read back into rows. */
export function parseTimetableCsv(text: string): { rows: ImportRow[]; error?: 'header' } {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return { rows: [], error: 'header' };
  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitCsvLine(lines[0], delimiter).map(fold);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const c = {
    group: col('grupa', 'group'),
    day: col('ziua', 'day'),
    pair: col('perechea', 'pair'),
    start: col('inceput', 'start'),
    code: col('cod', 'code'),
    subject: col('disciplina', 'subject'),
    type: col('tip', 'type'),
    teacher: col('profesor', 'teacher'),
    audience: col('studenti', 'students'),
    room: col('sala', 'room'),
    parity: col('paritate', 'week'),
    date: col('data', 'date'),
  };
  if (c.day < 0 || (c.pair < 0 && c.start < 0) || (c.subject < 0 && c.code < 0)) return { rows: [], error: 'header' };
  const rows: ImportRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const v = splitCsvLine(line, delimiter);
    const get = (k: number) => (k >= 0 ? (v[k] ?? '').trim() : '');
    const day = DAY_WORDS[fold(get(c.day))];
    if (day === undefined) return;
    const pair = Number(get(c.pair));
    const parity = fold(get(c.parity));
    rows.push({
      source: `${i + 2}`,
      groups: get(c.group) ? [get(c.group)] : [],
      audience: get(c.audience) || undefined,
      day,
      pair: Number.isFinite(pair) && pair > 0 ? pair - 1 : undefined,
      start: get(c.start) || undefined,
      type: TYPE_WORDS[fold(get(c.type))] ?? null,
      code: get(c.code) || undefined,
      subject: get(c.subject) || get(c.code),
      teacher: get(c.teacher) || undefined,
      room: get(c.room) || undefined,
      parity: parity.startsWith('impar') || parity === 'odd' ? 'odd' : parity.startsWith('par') || parity === 'even' ? 'even' : 'weekly',
      date: get(c.date) || undefined,
    });
  });
  return { rows };
}

// ---------------------------------------------------------------- matching

const STOP = new Set(['si', 'de', 'a', 'al', 'ale', 'in', 'la', 'pentru', 'cu', 'din', 'si', 'the', 'of', 'and', 'partea']);
const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6' };

/** Words of a name, each marked when it was shortened ("T.U." → t, u both shortened). */
function words(s: string): { w: string; short: boolean }[] {
  const out: { w: string; short: boolean }[] = [];
  for (const m of fold(s).matchAll(/([a-z0-9]+)(\.)?/g)) {
    const w = ROMAN[m[1]] ?? m[1];
    if (!STOP.has(w)) out.push({ w, short: !!m[2] || w.length === 1 });
  }
  return out;
}

const fits = (a: { w: string; short: boolean }, b: { w: string; short: boolean }) =>
  a.w === b.w ||
  (a.short && b.w.startsWith(a.w)) ||
  (b.short && a.w.startsWith(b.w)) ||
  (Math.min(a.w.length, b.w.length) >= 5 && (a.w.startsWith(b.w) || b.w.startsWith(a.w)));

/** 0…1: how well two names agree, word by word in order ("Planificarea și Infrastructura T.U." ≈ "… transportului urban"). */
export function nameSimilarity(x: string, y: string): number {
  const a = words(x);
  const b = words(y);
  if (!a.length || !b.length) return 0;
  let j = 0;
  let hit = 0;
  for (const wa of a) {
    const k = b.findIndex((wb, i) => i >= j && fits(wa, wb));
    if (k >= 0) {
      hit++;
      j = k + 1;
    }
  }
  return hit / Math.max(a.length, b.length);
}

const initials = (s: string) =>
  words(s)
    .filter((x) => !/^\d+$/.test(x.w))
    .map((x) => x.w[0])
    .join('');

function subjectScore(row: ImportRow, s: { code: string; name: string; abbreviation?: string }): number {
  const plain = fold(row.subject).replace(/[^a-z0-9]/g, '');
  if (row.code && fold(row.code) === fold(s.code)) return 1;
  if (
    plain &&
    (plain === fold(s.code).replace(/[^a-z0-9]/g, '') || (s.abbreviation && plain === fold(s.abbreviation).replace(/[^a-z0-9]/g, '')))
  )
    return 1;
  // "MFAHP", "VEPS": the initials of the name
  if (/^[A-ZĂÂÎȘȚ.]{2,8}$/.test(row.subject.replace(/\s/g, '')) && plain === initials(s.name)) return 0.95;
  return nameSimilarity(row.subject, s.name);
}

/** 0…1: the surname matches, and the first name or initial does not contradict. */
export function teacherSimilarity(x: string, y: string): number {
  const a = words(x);
  const b = words(y);
  const full = a.filter((w) => !w.short && w.w.length >= 3);
  if (!full.some((w) => b.some((v) => v.w === w.w))) return 0;
  const rest = a.filter((w) => !b.some((v) => v.w === w.w));
  return rest.every((w) => b.some((v) => fits(w, v))) ? 1 : 0.6;
}

const roomKey = (s: string) =>
  fold(s)
    .replace(/^(aud|sala|cab)\.?\s*/, '')
    .replace(/[\s.]/g, '')
    .toUpperCase();
const groupKey = (s: string) =>
  fold(s)
    .replace(/\s+/g, '')
    .replace(/^([a-z]+)-?(\d)/, '$1-$2')
    .toUpperCase();

export function matchImport(rows: ImportRow[], ds: Dataset, idx: DatasetIndex): ImportResult {
  const groupsByKey = new Map(ds.groups.map((g) => [groupKey(g.name), g]));
  const roomsByKey = new Map(ds.rooms.map((r) => [roomKey(r.name), r]));
  const streamsByName = new Map(ds.streams.filter((st) => st.name).map((st) => [fold(st.name!), st]));
  const slots = ds.settings.slots;
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(/[:.]/).map(Number);
    return h * 60 + (m || 0);
  };
  const lessons: Lesson[] = [];
  const taken = new Set<string>();
  const results: RowResult[] = [];

  for (const row of rows) {
    // who: the groups written in the file, or found in its "students" text
    // (a torent with a name of its own is written by that name)
    const stream = !row.groups.length && row.audience ? streamsByName.get(fold(row.audience)) : undefined;
    const names = stream
      ? stream.groupIds.map((id) => idx.groups.get(id)?.name ?? '')
      : row.groups.length
        ? row.groups
        : (row.audience?.split(/[,;]\s*|\s+/) ?? []);
    const known = names.map((n) => groupsByKey.get(groupKey(n.replace(/\/\d+$/, '')))).filter((g) => !!g);
    const unknown = names.filter((n) => /\d/.test(n) && !groupsByKey.get(groupKey(n.replace(/\/\d+$/, ''))));
    if (!known.length) {
      results.push({ row, status: 'group', unknownGroups: unknown });
      continue;
    }
    const subgroup = Number(row.audience?.match(/\/(\d)\b/)?.[1]) || null;
    // when: the pair, or the slot starting closest to the time written (within 20 minutes)
    let slot = row.pair !== undefined && row.pair < slots.length ? row.pair : -1;
    if (slot < 0 && row.start) {
      const t = toMin(row.start);
      const best = slots.map((s, i) => ({ i, d: Math.abs(toMin(s.start) - t) })).sort((a, b) => a.d - b.d)[0];
      if (best && best.d <= 20) slot = best.i;
    }
    if (slot < 0) {
      results.push({ row, status: 'time' });
      continue;
    }
    // what: the load of these groups whose subject, type and teacher agree best; the whole audience,
    // when the file says it, picks between a seminar of one group and one held for two together
    const fromAudience = () => {
      if (!row.groups.length || !row.audience) return [];
      const st = streamsByName.get(fold(row.audience));
      const list = st ? st.groupIds.map((id) => idx.groups.get(id)?.name ?? '') : row.audience.split(/[,;]\s*|\s+/);
      return list.map((n) => groupsByKey.get(groupKey(n.replace(/\/\d+$/, '')))?.id).filter((id): id is string => !!id);
    };
    const audienceIds = fromAudience();
    const ids = new Set(audienceIds.length ? audienceIds : known.map((g) => g.id));
    let best: { a: Assignment; score: number } | null = null;
    for (const a of ds.assignments) {
      const cohorts = idx.cohorts(a.audience);
      const shared = cohorts.filter((c) => ids.has(c.groupId)).length;
      if (!shared) continue;
      const subject = idx.subjects.get(a.subjectId);
      if (!subject) continue;
      const sim = subjectScore(row, subject);
      if (sim < 0.5) continue;
      const teacher = row.teacher ? teacherSimilarity(row.teacher, idx.teachers.get(a.teacherId)?.name ?? '') : 0;
      let score = 3 * sim + 1.5 * teacher + shared / Math.max(cohorts.length, ids.size);
      score += row.type ? (row.type === a.type ? 1 : -2) : 0;
      if (a.audience.kind === 'subgroup') score += subgroup === a.audience.subgroup ? 0.5 : subgroup ? -1 : 0;
      if (!best || score > best.score) best = { a, score };
    }
    if (!best) {
      results.push({ row, status: 'subject', unknownGroups: unknown.length ? unknown : undefined });
      continue;
    }
    const a = best.a;
    const parity = row.date ? 'weekly' : row.parity;
    // a lecture listed under each of its groups is one lesson
    const key = `${a.id}|${row.date ?? row.day}|${slot}|${parity}`;
    if (taken.has(key)) {
      results.push({ row, status: 'merged', assignmentId: a.id });
      continue;
    }
    taken.add(key);
    // where: the room by name, otherwise a free room that fits
    let room: Room | undefined = row.room ? roomsByKey.get(roomKey(row.room)) : undefined;
    let roomGuessed = false;
    if (!room) {
      const size = idx.audienceSize(a.audience);
      const busy = new Set(
        lessons.filter((l) => l.day === row.day && l.slot === slot && (l.date ?? '') === (row.date ?? '')).map((l) => l.roomId),
      );
      const preferred = new Set(idx.preferredRooms(a).map((r) => r.id));
      room = ds.rooms
        .filter((r) => !busy.has(r.id) && r.capacity >= size && idx.roomFits(a, r) && idx.hasEquipment(a, r))
        .sort((x, y) => Number(preferred.has(y.id)) - Number(preferred.has(x.id)) || x.capacity - y.capacity)[0];
      roomGuessed = true;
    }
    if (!room) room = ds.rooms[0];
    lessons.push({
      id: `imp${lessons.length + 1}`,
      assignmentId: a.id,
      day: row.day,
      slot,
      roomId: room.id,
      parity,
      ...(row.date ? { date: row.date } : {}),
    });
    results.push({ row, status: 'ok', assignmentId: a.id, roomGuessed, unknownGroups: unknown.length ? unknown : undefined });
  }

  const groupIds = [...new Set(lessons.flatMap((l) => idx.cohorts(idx.assignments.get(l.assignmentId)!.audience).map((c) => c.groupId)))];
  return { lessons, groupIds, results };
}
