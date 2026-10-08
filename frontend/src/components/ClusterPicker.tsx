import type { Cluster, StudyCycle } from '../domain/types';
import { useI18n } from '../i18n';

/** "Anul 1" or "FAF · Anul 1", in the viewer's language. */
export function useClusterLabel() {
  const { t } = useI18n();
  return (c: Pick<Cluster, 'year' | 'speciality'>) => (c.speciality ? `${c.speciality} · ` : '') + t('clusters.year', { n: c.year });
}

/**
 * Tags for a subject: toggle the years and the specialities (within a year) it is taught to. Specialities are
 * those that have groups; one already chosen is shown even if its groups are gone.
 */
export function ClusterPicker({
  clusters,
  cycle,
  value,
  onChange,
}: {
  clusters: Cluster[];
  cycle: StudyCycle;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const mine = clusters.filter((c) => c.cycle === cycle);
  const years = mine.filter((c) => c.kind === 'year');
  const specs = mine.filter((c) => c.kind === 'speciality' && (c.groupIds.length > 0 || value.includes(c.id)));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const tag = (c: Cluster, text: string) => (
    <button key={c.id} type="button" className="tag" aria-pressed={value.includes(c.id)} onClick={() => toggle(c.id)}>
      {text}
    </button>
  );
  return (
    <div className="tag-picker">
      <div className="tag-row">
        <span className="tag-label">{t('subjects.clustersYears')}</span>
        {years.map((c) => tag(c, t('clusters.year', { n: c.year })))}
      </div>
      {years.map((y) => {
        const inYear = specs.filter((c) => c.year === y.year);
        return inYear.length ? (
          <div className="tag-row" key={y.id}>
            <span className="tag-label">{t('clusters.year', { n: y.year })}</span>
            {inYear.map((c) => tag(c, c.speciality ?? ''))}
          </div>
        ) : null;
      })}
    </div>
  );
}
