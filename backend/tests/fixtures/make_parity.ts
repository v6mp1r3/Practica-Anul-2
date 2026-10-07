// Regenerates parity.json: the frontend's own demo dataset with timetables scored by the TypeScript code.
// tests/test_parity.py checks that the Python port in app/domain gives the same numbers.
// The frontend generator is not deterministic, so every run gives different timetables; the port must match on all.
// Run from the frontend folder:  ./node_modules/.bin/vite-node ../backend/tests/fixtures/make_parity.ts
import { writeFileSync } from 'node:fs';
import { seedDataset } from '../../../frontend/src/data/seed';
import { generateTimetable } from '../../../frontend/src/domain/generator';
import { scoreTimetable } from '../../../frontend/src/domain/score';
import { findHardConflicts } from '../../../frontend/src/domain/validator';

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
  console.log('wrote', cases.length, 'cases');
}
main();
