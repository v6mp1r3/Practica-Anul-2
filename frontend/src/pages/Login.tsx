import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { API_MODE } from '../api';
import { Logo } from '../components/Logo';
import { Field } from '../components/ui';
import { seedUsers } from '../data/seed';
import type { Role } from '../domain/types';
import { useI18n } from '../i18n';
import { useAuth } from '../state/auth';

export const homeFor = (role: Role) => `/${role}`;

export default function Login() {
  const { user, login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e: FormEvent, u = username, p = password) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const me = await login(u, p);
      navigate(homeFor(me.role), { replace: true });
    } catch {
      setError(t('login.invalid'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-hero">
        <span className="hero-kicker">{t('login.kicker')}</span>
        <div className="stack">
          <h1>{t('app.tagline')}</h1>
          <ul>
            <li>{t('login.feature1')}</li>
            <li>{t('login.feature2')}</li>
            <li>{t('login.feature3')}</li>
          </ul>
        </div>
        <button className="btn ghost sm" style={{ color: '#fff', alignSelf: 'flex-start' }} onClick={() => setLang(lang === 'ro' ? 'en' : 'ro')}>
          {t('nav.language')}
        </button>
      </section>

      <section className="login-form">
        <form className="stack" onSubmit={submit}>
          <Logo height={44} />
          <h2 style={{ marginTop: 12 }}>{t('login.title')}</h2>
          <Field label={t('login.username')}>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label={t('login.password')}>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <div className="badge danger">{error}</div>}
          <button className="btn primary" type="submit" disabled={busy}>
            {t('login.submit')}
          </button>

          {API_MODE === 'mock' && (
            <div className="stack demo-accounts" style={{ gap: 6, marginTop: 12 }}>
              <span className="small muted">{t('login.demo')}</span>
              {seedUsers.map((u) => (
                <button key={u.id} type="button" className="btn" onClick={(e) => submit(e, u.username, 'demo')}>
                  <span style={{ flex: 1 }}>
                    <strong>{u.name}</strong>
                    <br />
                    <span className="small muted">{u.username}</span>
                  </span>
                  <span className="badge primary">{t(`role.${u.role}`)}</span>
                </button>
              ))}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
