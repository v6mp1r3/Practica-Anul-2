// Clusters ("Year 1", "FAF · Year 1"): the same rule as the backend, for the browser-only mock and as a fallback.
import type { Cluster, Group, StudyCycle } from './types';

/** FAF-261 → FAF: the group name without its number. */
export const specialityOf = (groupName: string) => groupName.replace(/-\d+$/, '').toUpperCase();

const nameOf = (cycle: StudyCycle, year: number, speciality?: string) =>
  `${cycle === 'master' ? 'Master · ' : ''}${speciality ? `${speciality} · ` : ''}Year ${year}`;

/**
 * Every year of study (licență 1–4, master's 1–2, and any other year a group has) and every speciality within a
 * year that has a group. The id is stable, built from the cycle, the year and the speciality.
 */
export function deriveClusters(groups: Group[]): Cluster[] {
  const map = new Map<string, Cluster>();
  const add = (cycle: StudyCycle, year: number, speciality: string | undefined, groupId?: string) => {
    const id = `${cycle}:${year}${speciality ? `:${speciality}` : ''}`;
    let c = map.get(id);
    if (!c) {
      c = {
        id,
        kind: speciality ? 'speciality' : 'year',
        cycle,
        year,
        ...(speciality ? { speciality } : {}),
        name: nameOf(cycle, year, speciality),
        groupIds: [],
      };
      map.set(id, c);
    }
    if (groupId) c.groupIds.push(groupId);
  };
  for (let y = 1; y <= 4; y++) add('licenta', y, undefined);
  for (let y = 1; y <= 2; y++) add('master', y, undefined);
  for (const g of groups) {
    const cycle = g.cycle ?? 'licenta';
    add(cycle, g.year, undefined, g.id);
    add(cycle, g.year, specialityOf(g.name), g.id);
  }
  return [...map.values()].sort(
    (a, b) =>
      Number(a.cycle !== 'licenta') - Number(b.cycle !== 'licenta') ||
      a.year - b.year ||
      Number(a.kind !== 'year') - Number(b.kind !== 'year') ||
      (a.speciality ?? '').localeCompare(b.speciality ?? ''),
  );
}
