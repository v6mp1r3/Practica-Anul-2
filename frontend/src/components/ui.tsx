// Small presentational building blocks shared by every page.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LANGS, useI18n } from '../i18n';
import { fmtDate, parseDateInput } from '../domain/changes';
import { fmtTime, parseTime } from '../domain/slots';
import { Icon } from './Icon';

export function PageHeader({
  title,
  subtitle,
  actions,
  stacked,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Always put the actions on their own line under the title (they don't jump up when they get narrower). */
  stacked?: boolean;
}) {
  return (
    <div className={`page-header ${stacked ? 'stacked' : ''}`}>
      <div className="titles">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row wrap no-print">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="card-header">
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="btn ghost icon" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="x" />
          </button>
        </div>
        <div className="card-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="empty">{children ?? t('common.empty')}</div>;
}

export function Loading() {
  const { t } = useI18n();
  return <div className="empty">{t('common.loading')}</div>;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** RO / EN / RU switch. */
export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('nav.language')}>
      {LANGS.map((l) => (
        <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** The current time as "HH:MM", refreshed every 20 seconds (for live examples). */
export function useClock(): string {
  const now = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const [time, setTime] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setTime(now()), 20_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/**
 * Time field in the app's own format (24h "17:30" or 12h "05:30 PM"). The browser's
 * <input type="time"> follows the computer's clock setting instead, so it isn't used.
 */
/**
 * A date written day/month/year whatever the browser's language (the browser's own date box follows the
 * computer's settings, often month/day/year). Type it, or pick it from the calendar. The value stays
 * "YYYY-MM-DD"; onChange gets it as `e.target.value`, like a plain date input.
 */
export function DateInput({
  value,
  onChange,
  min,
  style,
  'aria-label': label,
}: {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  min?: string;
  style?: CSSProperties;
  className?: string;
  'aria-label'?: string;
}) {
  const { t } = useI18n();
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => (value ? fmtDate(value) : ''));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value ? fmtDate(value) : '');
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const parsed = parseDateInput(text);
    if (parsed && parsed !== value && (!min || parsed >= min)) onChange({ target: { value: parsed } });
    else setText(value ? fmtDate(value) : '');
  };
  return (
    <span className="date-input" style={style}>
      <input
        className="input"
        inputMode="numeric"
        value={text}
        aria-label={label}
        placeholder={t('date.placeholder')}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
      <button
        type="button"
        className="date-input-btn"
        aria-label={t('date.pick')}
        title={t('date.pick')}
        onClick={() => {
          const el = picker.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
      >
        <Icon name="calendar" size={16} />
      </button>
      <input
        ref={picker}
        className="date-input-native"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        onChange={(e) => e.target.value && onChange({ target: { value: e.target.value } })}
      />
    </span>
  );
}

export function TimeInput({
  value,
  onChange,
  format = '24h',
  'aria-label': label,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  format?: '24h' | '12h';
  'aria-label'?: string;
}) {
  const [text, setText] = useState(() => fmtTime(value, format));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(fmtTime(value, format));
  }, [value, format, editing]);
  const commit = () => {
    setEditing(false);
    const parsed = parseTime(text);
    if (parsed && parsed !== value) onChange(parsed);
    else setText(fmtTime(value, format));
  };
  return (
    <input
      className="input"
      inputMode="text"
      value={text}
      aria-label={label}
      placeholder={format === '12h' ? '08:00 AM' : '08:00'}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
