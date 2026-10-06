// "Contul meu": every role can edit their own profile, picture, password and
// preferences. Role details (group, department) are read-only — the
// administration manages those.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api';
import { Icon } from '../../components/Icon';
import { Field, PageHeader, Switch, initials, useClock } from '../../components/ui';
import { fmtTime } from '../../domain/slots';
import { LANGS, useI18n, type Lang } from '../../i18n';
import { useAuth } from '../../state/auth';
import { useData } from '../../state/data';
import { useToast } from '../../state/toast';

/** Resize a picked image to a small square data URL (keeps storage light). */
function toAvatar(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const emailOk = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function Avatar({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  return src ? (
    <img src={src} alt="" className="avatar" style={{ width: size, height: size, objectFit: 'cover' }} />
  ) : (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  );
}

export default function Account() {
  const { t, lang, setLang } = useI18n();
  const { user, setUser, logout } = useAuth();
  const { index, myTimeFormat, setMyTimeFormat, institutionTimeFormat } = useData();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const clock = useClock();

  const [first, setFirst] = useState(() => user?.name.split(' ')[0] ?? '');
  const [last, setLast] = useState(() => user?.name.split(' ').slice(1).join(' ') ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatar);
  const [notify, setNotify] = useState(!!user?.emailNotifications);
  const [saving, setSaving] = useState(false);
  // preferences wait for "Salvează" (the button shows only after a change, then "Salvat")
  const [prefLang, setPrefLang] = useState<Lang>(lang);
  const [prefTime, setPrefTime] = useState<'24h' | '12h'>(myTimeFormat || institutionTimeFormat);
  const [prefNotify, setPrefNotify] = useState(!!user?.emailNotifications);
  const [prefSaved, setPrefSaved] = useState(false);
  // the language switch in the menu changes it too
  useEffect(() => setPrefLang(lang), [lang]);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pwError, setPwError] = useState('');

  if (!user) return null;
  const group = user.groupId ? index?.groups.get(user.groupId) : undefined;
  const teacher = user.teacherId ? index?.teachers.get(user.teacherId) : undefined;
  const fullName = `${first.trim()} ${last.trim()}`.trim();
  const prefDirty = prefLang !== lang || prefTime !== (myTimeFormat || institutionTimeFormat) || prefNotify !== !!user.emailNotifications;

  async function savePreferences() {
    try {
      if (prefNotify !== !!user!.emailNotifications)
        setUser(await api.updateProfile({ name: user!.name, email: user!.email, phone: user!.phone, emailNotifications: prefNotify }));
      setMyTimeFormat(prefTime === institutionTimeFormat ? '' : prefTime);
      setLang(prefLang);
      setNotify(prefNotify);
      setPrefSaved(true);
    } catch {
      toast(t('common.error'), 'error');
    }
  }
  const changePref = (fn: () => void) => {
    fn();
    setPrefSaved(false);
  };

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!first.trim()) return toast(t('account.nameRequired'), 'error');
    if (!emailOk(email.trim())) return toast(t('account.emailInvalid'), 'error');
    setSaving(true);
    try {
      setUser(await api.updateProfile({ name: fullName, email, phone, avatar: avatar ?? null, emailNotifications: notify }));
      toast(t('common.saved'));
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwError('');
    if (next.length < 8) return setPwError(t('account.pwShort'));
    if (next !== repeat) return setPwError(t('account.pwMismatch'));
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      toast(t('account.pwChanged'));
    } catch (err) {
      setPwError(err instanceof ApiError && err.status === 400 ? t('account.pwWrong') : t('common.error'));
    }
  }

  return (
    <div className="page">
      <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />
      <div className="account-grid">
        {/* Profile */}
        <form className="card" onSubmit={saveProfile}>
          <div className="card-header">
            <h2>{t('account.profile')}</h2>
          </div>
          <div className="card-body stack">
            <div className="row wrap" style={{ gap: 18 }}>
              <Avatar name={fullName || user.name} src={avatar} size={76} />
              <div className="stack" style={{ gap: 6 }}>
                <div className="row wrap">
                  <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" size={14} />
                    {t('account.uploadPhoto')}
                  </button>
                  {avatar && (
                    <button type="button" className="btn ghost sm danger" onClick={() => setAvatar(undefined)}>
                      {t('account.removePhoto')}
                    </button>
                  )}
                </div>
                <span className="small muted">{t('account.photoHint')}</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setAvatar(await toAvatar(f));
                  e.target.value = '';
                }}
              />
            </div>
            <div className="form-grid">
              <Field label={t('account.firstName')}>
                <input className="input" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" required />
              </Field>
              <Field label={t('account.lastName')}>
                <input className="input" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
              </Field>
              <Field label={t('account.email')}>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label={t('account.phone')}>
                <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </Field>
            </div>
            <div>
              <button className="btn primary" type="submit" disabled={saving}>
                <Icon name="check" size={15} />
                {t('common.save')}
              </button>
            </div>
          </div>
        </form>

        {/* Preferences */}
        <section className="card">
          <div className="card-header">
            <h2>{t('account.preferences')}</h2>
          </div>
          <div className="card-body stack">
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{t('nav.language')}</strong>
                <div className="small muted">{t('account.languageHint')}</div>
              </div>
              <div className="segmented" role="group" aria-label={t('nav.language')}>
                {LANGS.map((l) => (
                  <button key={l} type="button" aria-pressed={prefLang === l} onClick={() => changePref(() => setPrefLang(l))}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{t('setup.timeFormat')}</strong>
                <div className="small muted">{t('account.timeFormatHint')}</div>
              </div>
              <div className="segmented" role="group" aria-label={t('setup.timeFormat')}>
                {(['24h', '12h'] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={prefTime === f} onClick={() => changePref(() => setPrefTime(f))}>
                    {fmtTime(clock, f)}
                  </button>
                ))}
              </div>
            </div>
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{t('account.emailNotifications')}</strong>
                <div className="small muted">{t('account.emailNotificationsHint')}</div>
              </div>
              <Switch checked={prefNotify} label={t('account.emailNotifications')} onChange={(v) => changePref(() => setPrefNotify(v))} />
            </div>
            {(prefDirty || prefSaved) && (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {prefDirty ? (
                  <button type="button" className="btn primary" onClick={savePreferences}>
                    <Icon name="check" />
                    {t('common.save')}
                  </button>
                ) : (
                  <span className="saved-note">
                    <Icon name="check" size={15} />
                    {t('common.saved')}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Password */}
        <form className="card" onSubmit={changePassword}>
          <div className="card-header">
            <h2>{t('account.password')}</h2>
          </div>
          <div className="card-body stack">
            <div className="form-grid">
              <Field label={t('account.currentPassword')}>
                <input
                  className="input"
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Field label={t('account.newPassword')} hint={t('account.pwRule')}>
                <input
                  className="input"
                  type="password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label={t('account.repeatPassword')}>
                <input
                  className="input"
                  type="password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>
            </div>
            {pwError && (
              <div className="badge danger" style={{ alignSelf: 'flex-start' }}>
                {pwError}
              </div>
            )}
            <div>
              <button className="btn" type="submit">
                <Icon name="lock" size={15} />
                {t('account.changePassword')}
              </button>
            </div>
          </div>
        </form>

        {/* Role details — read-only */}
        <section className="card">
          <div className="card-header">
            <h2>{t('account.details')}</h2>
          </div>
          <div className="card-body">
            <dl className="account-details">
              <dt>{t('login.username')}</dt>
              <dd>{user.username}</dd>
              <dt>{t('account.role')}</dt>
              <dd>{t(`role.${user.role}`)}</dd>
              {group && (
                <>
                  <dt>{t('view.group')}</dt>
                  <dd>
                    {group.name} · {group.program} · {t(`form.${group.studyForm}`)}
                  </dd>
                </>
              )}
              {teacher && (
                <>
                  <dt>{t('teachers.department')}</dt>
                  <dd>
                    {teacher.title} · {teacher.department}
                  </dd>
                </>
              )}
            </dl>
            <p className="small muted" style={{ marginTop: 10 }}>
              {t('account.detailsHint')}
            </p>
          </div>
        </section>

        <div className="account-full">
          <button className="btn danger" onClick={logout}>
            <Icon name="logout" size={15} />
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
