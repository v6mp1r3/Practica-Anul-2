// Study plan import. Expected columns (header row optional, `,` or `;`):
//   code, name, credits, year, lecture, seminar, lab
// Pair counts accept a decimal comma ("0,5") because spreadsheets exported in
// Romanian locale write them that way.
import type { Subject } from './types';

export interface CsvResult {
  subjects: Omit<Subject, 'id'>[];
  errors: { line: number; message: string }[];
}

/** Split one CSV line, honouring double-quoted fields. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const num = (s: string | undefined) => (s === undefined || s === '' ? 0 : Number(s.replace(',', '.')));

export function parseStudyPlan(text: string): CsvResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const first = lines.find((l) => l.trim()) ?? '';
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const result: CsvResult = { subjects: [], errors: [] };

  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const cols = splitCsvLine(raw, delimiter);
    // Skip a header row: its "credits" column is not a number
    if (i === lines.indexOf(first) && Number.isNaN(num(cols[2]))) return;
    const [code, name, credits, year, lecture, seminar, lab] = cols;
    const values = [credits, year, lecture, seminar, lab].map(num);
    if (!code || !name) {
      result.errors.push({ line: i + 1, message: 'code/name' });
      return;
    }
    if (values.some((v) => Number.isNaN(v) || v < 0)) {
      result.errors.push({ line: i + 1, message: 'number' });
      return;
    }
    result.subjects.push({
      code: code.toUpperCase(),
      name,
      credits: values[0],
      year: values[1] || 1,
      lecturePairs: values[2],
      seminarPairs: values[3],
      labPairs: values[4],
    });
  });
  return result;
}

export const STUDY_PLAN_TEMPLATE =
  'code,name,credits,year,lecture,seminar,lab\nAM,Analiză matematică,6,1,2,1,0\nMD,Matematică discretă,5,1,1,1,0\n';
