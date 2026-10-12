// A teacher's login (in the teacher's form, Profesori): the administration
// creates it with a first password and gives both to the teacher, who can then
// set their own availability. A forgotten password is replaced here.
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { User } from '../domain/types';
import { useI18n } from '../i18n';
import { useToast } from '../state/toast';
import { Field } from './ui';

export function TeacherAccount({ teacherId, name, email }: { teacherId?: string; name: string; email: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [account, setAccount] = useState<User | null | undefined>(undefined);
  const [mode, setMode] = useState<'idle' | 'create' | 'password'>('idle');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!teacherId) return;
    let live = true;
    api
      .listUsers()
      .then((users) => live && setAccount(users.find((u) => u.teacherId === teacherId) ?? null))
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, [teacherId]);

  // a saved teacher only: the account points to them
  if (!teacherId) return <p className="small muted">{t('teacherAccount.saveFirst')}</p>;
  if (account === undefined) return <p className="small muted">{t('common.loading')}</p>;

  async function run(job: () => Promise<void>) {
    setBusy(true);
    try {
      await job();
      setMode('idle');
      setPassword('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast(
        /taken|already/i.test(msg) ? t('teacherAccount.taken') : /short/i.test(msg) ? t('teacherAccount.short') : t('common.error'),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  const create = () =>
    run(async () => {
      const u = await api.createUser({ username, name, role: 'teacher', teacherId, email: email || undefined, password });
      setAccount(u);
      toast(t('teacherAccount.created', { username: u.username }));
    });
  const reset = () =>
    run(async () => {
      await api.updateUser(account!.id, { password });
      toast(t('teacherAccount.passwordSet'));
    });
  const remove = () =>
    run(async () => {
      if (!window.confirm(t('teacherAccount.confirmDelete', { username: account!.username }))) return;
      await api.deleteUser(account!.id);
      setAccount(null);
    });

  const passwordField = (
    <Field label={t('teacherAccount.password')} hint={t('teacherAccount.passwordHint')}>
      <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
    </Field>
  );

  return (
    <div className="stack" style={{ gap: 10 }}>
      {account ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="badge success">{t('teacherAccount.has')}</span>
          <span>
            {t('login.username')}: <strong>{account.username}</strong>
          </span>
          <span className="spacer" />
          {mode === 'idle' && (
            <>
              <button type="button" className="btn sm" onClick={() => setMode('password')}>
                {t('teacherAccount.newPassword')}
              </button>
              <button type="button" className="btn sm danger" onClick={remove} disabled={busy}>
                {t('teacherAccount.delete')}
              </button>
            </>
          )}
        </div>
      ) : (
        mode === 'idle' && (
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="small muted">{t('teacherAccount.none')}</span>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setUsername(email || name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.'));
                setMode('create');
              }}
            >
              {t('teacherAccount.create')}
            </button>
          </div>
        )
      )}
      {mode !== 'idle' && (
        <div className="form-grid">
          {mode === 'create' && (
            <Field label={t('login.username')}>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </Field>
          )}
          {passwordField}
          <div className="row" style={{ gap: 8, alignSelf: 'end' }}>
            <button type="button" className="btn" onClick={() => setMode('idle')} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={mode === 'create' ? create : reset}
              disabled={busy || password.length < 8 || (mode === 'create' && !username.trim())}
            >
              {mode === 'create' ? t('teacherAccount.create') : t('common.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
