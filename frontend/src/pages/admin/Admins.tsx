// "Administratori": the institution administrator creates one account per
// faculty (and can add more institution administrators). Each faculty
// administrator then manages only their own faculty.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { Icon } from '../../components/Icon';
import { Select } from '../../components/Select';
import { Empty, Field, Modal, PageHeader } from '../../components/ui';
import type { User } from '../../domain/types';
import { useI18n } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useDataset } from '../../state/data';
import { useToast } from '../../state/toast';
import { Avatar } from '../shared/Account';

interface Draft {
  id?: string;
  name: string;
  username: string;
  email: string;
  faculty: string;
  password: string;
}

const empty: Draft = { name: '', username: '', email: '', faculty: '', password: '' };

export default function Admins() {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const { dataset } = useDataset();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const load = () => api.listUsers().then((list) => setUsers(list.filter((u) => u.role === 'admin')));
  useEffect(() => {
    load();
  }, []);

  const covered = new Set(users.map((u) => u.faculty).filter(Boolean));
  const missing = dataset.settings.faculties.filter((f) => !covered.has(f));

  async function save() {
    if (!draft) return;
    setError('');
    if (!draft.name.trim() || !draft.username.trim()) return setError(t('admins.required'));
    try {
      if (draft.id) {
        const u = users.find((x) => x.id === draft.id)!;
        await api.updateUser({
          ...u,
          name: draft.name.trim(),
          email: draft.email.trim() || undefined,
          faculty: draft.faculty || undefined,
        });
      } else {
        if (draft.password.length < 8) return setError(t('account.pwShort'));
        await api.createUser({
          role: 'admin',
          name: draft.name.trim(),
          username: draft.username,
          email: draft.email.trim() || undefined,
          faculty: draft.faculty || undefined,
          password: draft.password,
        });
      }
      setDraft(null);
      await load();
      toast(t('common.saved'));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? t('admins.usernameTaken') : t('common.error'));
    }
  }

  async function remove(u: User) {
    if (!confirm(t('common.confirmDelete', { name: u.name }))) return;
    await api.deleteUser(u.id);
    await load();
  }

  return (
    <div className="page">
      <PageHeader
        title={t('nav.admins')}
        subtitle={t('admins.subtitle')}
        actions={
          <button className="btn primary" onClick={() => (setError(''), setDraft({ ...empty, faculty: missing[0] ?? '' }))}>
            <Icon name="plus" />
            {t('common.add')}
          </button>
        }
      />
      <div className="stack">
        {missing.length > 0 && (
          <div className="badge warning" style={{ alignSelf: 'flex-start', padding: '7px 14px', whiteSpace: 'normal' }}>
            {t('admins.missing', { list: missing.join(', ') })}
          </div>
        )}
        <div className="card">
          {users.length === 0 ? (
            <Empty />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('login.username')}</th>
                    <th>{t('admins.scope')}</th>
                    <th>{t('account.email')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="row">
                          <Avatar name={u.name} src={u.avatar} size={30} />
                          <strong>{u.name}</strong>
                        </div>
                      </td>
                      <td className="muted">{u.username}</td>
                      <td>
                        {u.faculty ? (
                          <span className="small">{u.faculty}</span>
                        ) : (
                          <span className="badge primary">{t('admins.institution')}</span>
                        )}
                      </td>
                      <td className="small muted">{u.email || '—'}</td>
                      <td className="actions">
                        <button
                          className="btn ghost sm icon"
                          aria-label={t('common.edit')}
                          onClick={() => (
                            setError(''),
                            setDraft({
                              id: u.id,
                              name: u.name,
                              username: u.username,
                              email: u.email ?? '',
                              faculty: u.faculty ?? '',
                              password: '',
                            })
                          )}
                        >
                          <Icon name="edit" size={15} />
                        </button>
                        {u.id !== me?.id && (
                          <button className="btn ghost sm icon danger" aria-label={t('common.delete')} onClick={() => remove(u)}>
                            <Icon name="trash" size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {draft && (
        <Modal
          title={draft.id ? `${t('common.edit')}: ${draft.name}` : t('admins.new')}
          onClose={() => setDraft(null)}
          footer={
            <>
              {error && (
                <span className="badge danger" style={{ marginRight: 'auto' }}>
                  {error}
                </span>
              )}
              <button className="btn" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" onClick={save}>
                {t('common.save')}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label={t('common.name')}>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t('login.username')}>
              <input
                className="input"
                value={draft.username}
                disabled={!!draft.id}
                onChange={(e) => setDraft({ ...draft, username: e.target.value.toLowerCase().replace(/\s+/g, '.') })}
              />
            </Field>
            <Field label={t('account.email')}>
              <input className="input" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </Field>
            <Field label={t('admins.scope')} hint={t('admins.scopeHint')}>
              <Select value={draft.faculty} onChange={(e) => setDraft({ ...draft, faculty: e.target.value })}>
                <option value="">{t('admins.institution')}</option>
                {dataset.settings.faculties.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>
            {!draft.id && (
              <Field label={t('admins.password')} hint={t('admins.passwordHint')}>
                <input
                  className="input"
                  type="text"
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  autoComplete="new-password"
                />
              </Field>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
