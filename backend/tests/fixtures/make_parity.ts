// Regenerates parity.json: the frontend's own demo dataset with timetables scored by the TypeScript code.
// tests/test_parity.py checks that the Python port in app/domain gives the same numbers.
// The frontend generator is not deterministic, so every run gives different timetables; the port must match on all.
// It also records exam and atestari generation runs (exam_parity.json) with fixed seeds: tests/test_exam_parity.py
// checks that the Python port in app/solver/exams.py gives the same events.
// Run from the frontend folder:  ./node_modules/.bin/vite-node ../backend/tests/fixtures/make_parity.ts
import { writeFileSync } from 'node:fs';
import { seedDataset } from '../../../frontend/src/data/seed';
import { generateTimetable } from '../../../frontend/src/domain/generator';
import { scoreTimetable } from '../../../frontend/src/domain/score';
import { findHardConflicts } from '../../../frontend/src/domain/validator';
import { generateExams, generateMidterms } from '../../../frontend/src/domain/exams';
import { DatasetIndex } from '../../../frontend/src/domain/indexes';
import { createRng } from '../../../frontend/src/domain/rng';

const ds = seedDataset;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

async function main() {
  const groupIds = ds.groups.map((g) => g.id);
  const cases: any[] = [];
  const base = await generateTimetable(ds, { groupIds, seed: 7, iterations: 40, fixed: [], keep: [] });
  const record = (name: string, lessons: any[]) => {
    const score = scoreTimetable(ds, lessons);
    const kinds: Record<string, number> = {};
    for (const c of findHardConflicts(ds, lessons)) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    cases.push({ name, lessons, score, kinds });
  };
  record('generated', base.lessons);
  // broken variants: move pairs around, change rooms and weeks, drop and duplicate pairs
  for (let k = 0; k < 6; k++) {
    const ls = base.lessons.map((l: any) => ({ ...l }));
    const n = 8 + k * 6;
    for (let i = 0; i < n; i++) {
      const l = ls[Math.floor(rnd() * ls.length)];
      const what = rnd();
      if (what < 0.35) {
        l.day = Math.floor(rnd() * ds.settings.workingDays);
        l.slot = Math.floor(rnd() * ds.settings.slots.length);
      } else if (what < 0.65) l.roomId = ds.rooms[Math.floor(rnd() * ds.rooms.length)].id;
      else if (what < 0.8) l.parity = ['weekly', 'odd', 'even'][Math.floor(rnd() * 3)];
      else if (what < 0.9) ls.splice(ls.indexOf(l), 1);
      else ls.push({ ...l, id: 'dup' + i, slot: (l.slot + 1) % ds.settings.slots.length });
    }
    record('broken-' + k, ls);
  }
  record('empty', []);
  writeFileSync(new URL('./parity.json', import.meta.url), JSON.stringify({ dataset: ds, cases }));

  // exam and atestari generation with fixed seeds, on the timetable above
  const idx = new DatasetIndex(ds);
  const classes = base.lessons;
  const strip = (e: any) => ({ ...e, id: undefined });
  const runs: any[] = [];
  const keep = (events: any[]) => events.map(strip);
  const run = (round: string, seedN: number, ids: string[], busy: any[]) => {
    const rng = createRng(seedN);
    const res =
      round === 'session' || round === 'reexam'
        ? generateExams(ds, idx, ids, round, busy, rng, classes)
        : generateMidterms(ds, idx, ids, round.endsWith('1') ? 1 : 2, classes, busy, rng, round.startsWith('re'));
    runs.push({ round, seed: seedN, groupIds: ids, busy: keep(busy), events: keep(res.events), warnings: res.warnings });
    return res.events;
  };
  const session = run('session', 5, groupIds, []);
  run('reexam', 6, groupIds, session);
  const m1 = run('midterm1', 7, groupIds, []);
  run('midterm2', 8, groupIds, m1);
  run('remidterm1', 9, groupIds, []);
  run('remidterm2', 10, groupIds, []);
  run('session', 11, groupIds.slice(0, 6), session.slice(0, 10));
  writeFileSync(new URL('./exam_parity.json', import.meta.url), JSON.stringify({ classes, runs }));
  console.log('exam runs', runs.map((r) => `${r.round}:${r.events.length}/${r.warnings.length}`).join(' '));
  console.log('wrote', cases.length, 'cases');
}
main();
