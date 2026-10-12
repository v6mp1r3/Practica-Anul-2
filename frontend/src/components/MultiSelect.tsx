// A dropdown where several options can be ticked (e.g. a room's equipment).
// Looks like Select; the list stays open while ticking.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { matches, SEARCH_FROM } from './searchText';
import { useI18n } from '../i18n';

export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = '',
  'aria-label': ariaLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  /** `short` is what the chip of a chosen option shows (a code), `label` is what the list shows and searches. */
  options: { value: string; label: string; short?: string }[];
  placeholder?: string;
  'aria-label'?: string;
}) {
  // values saved before the list existed stay visible, so they can be removed
  const { t } = useI18n();
  const all = [...options, ...value.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v }))];
  const [query, setQuery] = useState('');
  const searchable = all.length > SEARCH_FROM;
  const items = query ? all.filter((i) => matches(i.label, query)) : all;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const btn = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 300 && r.top > below;
    setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: Math.max(r.width, 220), up });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open, value.length]);

  useEffect(() => {
    if (open && searchable) setTimeout(() => input.current?.focus(), 0);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!btn.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const reflow = () => place();
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open]);

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const label = (v: string) => {
    const o = items.find((i) => i.value === v) as { label: string; short?: string } | undefined;
    return o?.short ?? o?.label ?? v;
  };

  const onKey = (e: React.KeyboardEvent) => {
    // typing on a closed list opens it with those letters in the search box
    if (!open && searchable && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey) {
      setQuery(e.key);
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === ' ' && e.target === input.current) return;
    if (!items.length) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        setQuery('');
      }
      return;
    }
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => (i + 1) % items.length));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => (i - 1 + items.length) % items.length));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), items[active] && toggle(items[active].value));
    else if (e.key === 'Escape') {
      e.stopPropagation(); // close only the list, not a surrounding dialog
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <>
      <div
        ref={btn}
        role="combobox"
        tabIndex={0}
        className="select select-btn multi-select"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        {value.length === 0 ? (
          <span className="muted">{placeholder}</span>
        ) : (
          <span className="multi-chips">
            {value.map((v) => (
              <span key={v} className="badge primary">
                {label(v)}
                <button
                  type="button"
                  className="chip-x"
                  aria-label={`- ${label(v)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(v);
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </span>
        )}
      </div>
      {open &&
        pos &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            className="select-menu"
            style={{
              left: Math.min(pos.left, window.innerWidth - pos.width - 8),
              width: pos.width,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
          >
            {searchable && (
              <input
                ref={input}
                className="select-search"
                value={query}
                placeholder={t('common.search')}
                aria-label={t('common.search')}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKey}
              />
            )}
            {items.length === 0 && <div className="select-empty">{t('common.noResults')}</div>}
            {items.map((item, i) => {
              const on = value.includes(item.value);
              return (
                <div
                  key={item.value}
                  role="option"
                  aria-selected={on}
                  className={`select-option ${i === active ? 'active' : ''} ${on ? 'chosen' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(item.value)}
                >
                  <span className={`multi-box ${on ? 'on' : ''}`} aria-hidden="true">
                    {on && <Icon name="check" size={12} />}
                  </span>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
