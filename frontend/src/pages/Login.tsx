import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { API_MODE } from '../api';
import { IntroVideo } from '../components/IntroVideo';
import { Logo } from '../components/Logo';
import { Field, LanguageSwitch } from '../components/ui';
import { seedUsers } from '../data/seed';
import type { Role } from '../domain/types';
import { useI18n } from '../i18n';
import { useAuth } from '../state/auth';

export const homeFor = (role: Role) => `/${role}`;

export default function Login() {
  const { user, login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // While signing in we show the intro video before entering the platform;
  // `entering` keeps the already-signed-in redirect from skipping it.
  const [entering, setEntering] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  if (target) return <IntroVideo onDone={() => navigate(target, { replace: true })} />;
  if (user && !entering) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e: FormEvent, u = username, p = password) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setEntering(true);
    try {
      const me = await login(u, p);
      setTarget(homeFor(me.role));
    } catch {
      setEntering(false);
      setError(t('login.invalid'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-form">
        <form className="stack" onSubmit={submit}>
          <Link to="/" aria-label="EduSchedule" style={{ color: 'var(--text)', alignSelf: 'center' }}>
            <Logo height={40} />
          </Link>
          <h2 style={{ marginTop: 12, textAlign: 'center' }}>{t('login.title')}</h2>
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
          <div style={{ alignSelf: 'center' }}>
            <LanguageSwitch />
          </div>

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
