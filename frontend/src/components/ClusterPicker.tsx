import { useState } from 'react';
import { api } from '../api';
import { collapseClusters } from '../domain/clusters';
import type { Cluster, Dataset, StudyCycle } from '../domain/types';
import { useI18n } from '../i18n';
import { useData } from '../state/data';
import { useToast } from '../state/toast';
import { Icon } from './Icon';
import { MultiSelect } from './MultiSelect';
import { Field, Modal } from './ui';

/** "Year 1", "FAF · Year 1", "Română", "Frecvență redusă" or a custom name, in the viewer's language. */
export function useClusterLabel() {
  const { t } = useI18n();
  return (c: Pick<Cluster, 'kind' | 'year' | 'speciality' | 'language' | 'studyForm' | 'name'>) => {
    if (c.kind === 'language' && c.language) return t(`language.${c.language}`);
    if (c.kind === 'form' && c.studyForm) return t(`form.${c.studyForm}`);
    if (c.kind === 'custom') return c.name;
    return (c.speciality ? `${c.speciality} · ` : '') + t('clusters.year', { n: c.year ?? 1 });
  };
}

/**
 * Tags for a subject: toggle the years and the specialities (within a year), the languages, the forms of study and
 * the custom clusters it belongs to. Specialities are those that have groups; one already chosen is shown even if
 * its groups are gone.
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
  const label = useClusterLabel();
  const mine = clusters.filter((c) => c.cycle === cycle);
  const years = mine.filter((c) => c.kind === 'year');
  const specs = mine.filter((c) => c.kind === 'speciality' && (c.groupIds.length > 0 || value.includes(c.id)));
  const other = (kind: Cluster['kind']) => clusters.filter((c) => c.kind === kind);
  const toggle = (id: string) => onChange(collapseClusters(value.includes(id) ? value.filter((x) => x !== id) : [...value, id], clusters));
  const tag = (c: Cluster, text: string) => (
    <button key={c.id} type="button" className="tag" aria-pressed={value.includes(c.id)} onClick={() => toggle(c.id)}>
      {text}
    </button>
  );
  const row = (key: string, title: string, items: Cluster[], text: (c: Cluster) => string) =>
    items.length ? (
      <div className="tag-row" key={key}>
        <span className="tag-label">{title}</span>
        {items.map((c) => tag(c, text(c)))}
      </div>
    ) : null;
  return (
    <div className="tag-picker">
      {row('years', t('subjects.clustersYears'), years, (c) => t('clusters.year', { n: c.year ?? 1 }))}
      {years.map((y) =>
        row(
          y.id,
          t('clusters.year', { n: y.year ?? 1 }),
          specs.filter((c) => c.year === y.year),
          (c) => c.speciality ?? '',
        ),
      )}
      {row('lang', t('language.label'), other('language'), label)}
      {row('form', t('groups.studyForm'), other('form'), label)}
      {row('custom', t('clusters.custom'), other('custom'), label)}
    </div>
  );
}

/** Make, rename and remove the clusters of your own (e.g. one for the reduced-attendance groups of a faculty). */
export function ClusterManager({ dataset, onClose }: { dataset: Dataset; onClose: () => void }) {
  const { t } = useI18n();
  const { refresh } = useData();
  const toast = useToast();
  const [draft, setDraft] = useState<{ id?: string; name: string; groupIds: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const custom = (dataset.clusters ?? []).filter((c) => c.kind === 'custom');
  const groups = dataset.groups.map((g) => ({ value: g.id, label: g.name }));
  const names = new Map(groups.map((g) => [g.value, g.label]));

  async function run(job: () => Promise<unknown>, done?: () => void) {
    try {
      await job();
      await refresh();
      setError(null);
      done?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const save = () =>
    run(
      () => api.saveCluster(draft!),
      () => {
        toast(t('common.saved'));
        setDraft(null);
      },
    );
  const remove = (c: Cluster) => {
    if (window.confirm(t('clusters.confirmDelete', { name: c.name }))) void run(() => api.deleteCluster(c.id));
  };

  return (
    <Modal
      title={t('clusters.manage')}
      onClose={onClose}
      wide
      footer={
        draft ? (
          <>
            <button className="btn" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" onClick={save} disabled={!draft.name.trim()}>
              {t('common.save')}
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => setDraft({ name: '', groupIds: [] })}>
            <Icon name="plus" /> {t('clusters.new')}
          </button>
        )
      }
    >
      {error && <p className="error">{error}</p>}
      {draft ? (
        <div className="stack">
          <Field label={t('common.name')} hint={t('clusters.nameHint')}>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
          </Field>
          <Field label={t('clusters.groups')}>
            <MultiSelect
              value={draft.groupIds}
              onChange={(groupIds) => setDraft({ ...draft, groupIds })}
              options={groups}
              placeholder={t('clusters.pickGroups')}
            />
          </Field>
        </div>
      ) : custom.length === 0 ? (
        <p className="muted">{t('clusters.none')}</p>
      ) : (
        <ul className="plain-list">
          {custom.map((c) => (
            <li key={c.id} className="row" style={{ gap: 8, padding: '6px 0' }}>
              <strong>{c.name}</strong>
              <span className="small muted">{c.groupIds.map((g) => names.get(g) ?? g).join(', ') || t('clusters.noGroups')}</span>
              <span className="spacer" />
              <button className="btn ghost" onClick={() => setDraft({ id: c.id, name: c.name, groupIds: c.groupIds })}>
                {t('common.edit')}
              </button>
              <button className="btn ghost" onClick={() => remove(c)}>
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
