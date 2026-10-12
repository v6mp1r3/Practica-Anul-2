// Clusters ("Year 1", "FAF · Year 1"): the same rule as the backend, for the browser-only mock and as a fallback.
import { LANGUAGES, STUDY_FORMS, type Cluster, type Group, type StudyCycle } from './types';

/** FAF-261 → FAF: the group name without its number. */
export const specialityOf = (groupName: string) => groupName.replace(/-\d+$/, '').toUpperCase();

const nameOf = (cycle: StudyCycle, year: number, speciality?: string) =>
  `${cycle === 'master' ? 'Master · ' : ''}${speciality ? `${speciality} · ` : ''}Year ${year}`;

/**
 * A subject tagged with every speciality of a year (those that have groups) is for the whole year: the speciality
 * tags become the year's ("Year 1"). The server does the same when it saves.
 */
export function collapseClusters(ids: string[], clusters: Cluster[]): string[] {
  const out = new Set(ids);
  for (const y of clusters.filter((c) => c.kind === 'year')) {
    const specs = clusters.filter((c) => c.kind === 'speciality' && c.cycle === y.cycle && c.year === y.year && c.groupIds.length > 0);
    if (specs.length && specs.every((c) => out.has(c.id))) {
      for (const c of specs) out.delete(c.id);
      out.add(y.id);
    }
  }
  return [...out];
}

/**
 * The groups a subject can be given to, from its tags: a subject tagged "Year 1" is not for a group of year 2, one
 * tagged "FAF · Year 1" only for that speciality's groups. Tags of one kind (years, specialities, languages, forms,
 * own clusters) add up; tags of different kinds all have to fit. Without tags the subject's own year decides.
 */
export function groupsForSubject<G extends Pick<Group, 'id' | 'year'>>(
  subject: { year: number; clusterIds?: string[] },
  groups: G[],
  clusters: Cluster[],
): G[] {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const tags = (subject.clusterIds ?? []).map((id) => byId.get(id)).filter((c): c is Cluster => !!c);
  if (!tags.length) return groups.filter((g) => g.year === subject.year);
  const byKind = new Map<Cluster['kind'], Set<string>>();
  for (const c of tags) {
    const set = byKind.get(c.kind) ?? new Set<string>();
    c.groupIds.forEach((id) => set.add(id));
    byKind.set(c.kind, set);
  }
  return groups.filter((g) => [...byKind.values()].every((set) => set.has(g.id)));
}

/**
 * Whether a subject is for a speciality, judging by its tags: a tag of that speciality, or of a whole year in which
 * the speciality has groups. A subject with no year or speciality tag is for every speciality.
 */
export function subjectInSpeciality(clusterIds: string[] | undefined, speciality: string, clusters: Cluster[]): boolean {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const tags = (clusterIds ?? [])
    .map((id) => byId.get(id))
    .filter((c): c is Cluster => !!c && (c.kind === 'year' || c.kind === 'speciality'));
  if (!tags.length) return true;
  return tags.some((t) =>
    t.kind === 'speciality'
      ? t.speciality === speciality
      : clusters.some(
          (c) =>
            c.kind === 'speciality' && c.speciality === speciality && c.cycle === t.cycle && c.year === t.year && c.groupIds.length > 0,
        ),
  );
}

/**
 * The automatic clusters: every year of study (licență 1–4, master's 1–2, and any other year a group has) and every speciality within a
 * year that has a group, and every language and form of study. The id is stable, built from the cycle, the year
 * and the speciality. Custom clusters (made by an administrator) are not here; the server or the mock store keeps them.
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
  const years = [...map.values()].sort(
    (a, b) =>
      Number(a.cycle !== 'licenta') - Number(b.cycle !== 'licenta') ||
      a.year! - b.year! ||
      Number(a.kind !== 'year') - Number(b.kind !== 'year') ||
      (a.speciality ?? '').localeCompare(b.speciality ?? ''),
  );
  const languages: Cluster[] = LANGUAGES.map((language) => ({
    id: `lang:${language}`,
    kind: 'language',
    language,
    name: `Language · ${language.toUpperCase()}`,
    groupIds: groups.filter((g) => (g.language ?? 'ro') === language).map((g) => g.id),
  }));
  const forms: Cluster[] = STUDY_FORMS.map((studyForm) => ({
    id: `form:${studyForm}`,
    kind: 'form',
    studyForm,
    name: { full: 'Full-time', reduced: 'Reduced attendance', dual: 'Dual' }[studyForm],
    groupIds: groups.filter((g) => g.studyForm === studyForm).map((g) => g.id),
  }));
  return [...years, ...languages, ...forms];
}
