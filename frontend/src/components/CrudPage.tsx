// Generic list + create/edit/delete page used by teachers, rooms, groups,
// streams, subjects and assignments.
import { useMemo, useState, type ReactNode } from 'react';
import { api, type CollectionName, type Collections } from '../api';
import { useI18n } from '../i18n';
import { useData } from '../state/data';
import { useToast } from '../state/toast';
import { Icon } from './Icon';
import { Empty, Modal, PageHeader } from './ui';

export interface Column<T> {
  label: string;
  render: (item: T) => ReactNode;
  width?: number | string;
}

export interface CrudProps<K extends CollectionName> {
  collection: K;
  title: string;
  subtitle?: string;
  itemLabel: (item: Collections[K]) => string;
  items: Collections[K][];
  columns: Column<Collections[K]>[];
  searchText: (item: Collections[K]) => string;
  newItem: () => Omit<Collections[K], 'id'>;
  renderForm: (draft: Omit<Collections[K], 'id'>, set: (patch: Partial<Collections[K]>) => void) => ReactNode;
  /** Returns an error message, or null when the draft is valid. */
  validate?: (draft: Omit<Collections[K], 'id'>) => string | null;
  headerActions?: ReactNode;
  /** Render without the page wrapper (to embed several on one page). */
  embedded?: boolean;
  wideForm?: boolean;
}

type Draft<K extends CollectionName> = Omit<Collections[K], 'id'> & { id?: string };

export function CrudPage<K extends CollectionName>(p: CrudProps<K>) {
  const { t } = useI18n();
  const { refresh } = useData();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft<K> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? p.items.filter((i) => p.searchText(i).toLowerCase().includes(q)) : p.items;
  }, [p, query]);

  async function save() {
    if (!draft) return;
    const msg = p.validate?.(draft) ?? null;
    if (msg) {
      setError(msg);
      return;
    }
    setSaving(true);
    try {
      if (draft.id) await api.update(p.collection, draft as Collections[K]);
      else await api.create(p.collection, draft);
      await refresh();
      setDraft(null);
      toast(t('common.saved'));
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Collections[K]) {
    if (!confirm(t('common.confirmDelete', { name: p.itemLabel(item) }))) return;
    await api.remove(p.collection, item.id);
    await refresh();
  }

  const open = (d: Draft<K>) => {
    setError(null);
    setDraft(structuredClone(d));
  };

  const body = (
    <>
      <div className="card">
        <div className="card-header">
          {p.embedded && <h2>{p.title}</h2>}
          <input className="input" style={{ maxWidth: 280 }} placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className="spacer" />
          <span className="small muted">{filtered.length}</span>
          {p.embedded && (
            <button className="btn primary sm" onClick={() => open(p.newItem() as Draft<K>)}>
              <Icon name="plus" size={14} />
              {t('common.add')}
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {p.columns.map((c) => (
                    <th key={c.label} style={{ width: c.width }}>
                      {c.label}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    {p.columns.map((c) => (
                      <td key={c.label}>{c.render(item)}</td>
                    ))}
                    <td className="actions">
                      <button className="btn ghost sm icon" onClick={() => open(item as Draft<K>)} aria-label={t('common.edit')}>
                        <Icon name="edit" size={15} />
                      </button>
                      <button className="btn ghost sm icon danger" onClick={() => remove(item)} aria-label={t('common.delete')}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {draft && (
        <Modal
          title={draft.id ? `${t('common.edit')}: ${p.itemLabel(draft as Collections[K])}` : `${t('common.add')} — ${p.title}`}
          onClose={() => setDraft(null)}
          wide={p.wideForm}
          footer={
            <>
              {error && <span className="badge danger" style={{ marginRight: 'auto' }}>{error}</span>}
              <button className="btn" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" onClick={save} disabled={saving}>
                {t('common.save')}
              </button>
            </>
          }
        >
          {p.renderForm(draft, (patch) => setDraft((d) => (d ? { ...d, ...patch } : d)))}
        </Modal>
      )}
    </>
  );

  if (p.embedded) return body;

  return (
    <div className="page">
      <PageHeader
        title={p.title}
        subtitle={p.subtitle}
        actions={
          <>
            {p.headerActions}
            <button className="btn primary" onClick={() => open(p.newItem() as Draft<K>)}>
              <Icon name="plus" />
              {t('common.add')}
            </button>
          </>
        }
      />
      {body}
    </div>
  );
}
