// Drop-in replacement for <select> with a styled, white option list (native
// menus follow the OS look and can't be styled). Takes the same props and
// <option>/<optgroup> children; onChange receives { target: { value } }.
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface Item {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

interface Props {
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  'aria-label'?: string;
  id?: string;
}

const text = (node: ReactNode): string =>
  Children.toArray(node)
    .map((c) =>
      typeof c === 'string' || typeof c === 'number'
        ? String(c)
        : isValidElement(c)
          ? text((c as ReactElement<{ children?: ReactNode }>).props.children)
          : '',
    )
    .join('');

/** Flatten <option>/<optgroup> children (through fragments and arrays) into items. */
function collect(children: ReactNode, group?: string, out: Item[] = []): Item[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string };
    if (child.type === 'option') {
      const label = text(props.children);
      out.push({ value: String(props.value ?? label), label, disabled: props.disabled, group });
    } else if (child.type === 'optgroup') collect(props.children, props.label, out);
    else collect(props.children, group, out);
  });
  return out;
}

export function Select({ value, onChange, children, className = 'select', style, disabled, id, ...rest }: Props) {
  const items = collect(children);
  const current = String(value ?? '');
  const selected = items.find((i) => i.value === current) ?? items[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 260 && r.top > below;
    setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: Math.max(r.width, 200), up });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const i = items.findIndex((x) => x.value === current);
    setActive(i < 0 ? 0 : i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!btn.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false);
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

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const choose = (item: Item) => {
    if (item.disabled) return;
    setOpen(false);
    btn.current?.focus();
    if (item.value !== current)
      onChange?.({ target: { value: item.value }, currentTarget: { value: item.value } } as ChangeEvent<HTMLSelectElement>);
  };

  const move = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < items.length; n++) {
      i = (i + dir + items.length) % items.length;
      if (!items[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), items[active] && choose(items[active]));
    else if (e.key === 'Escape') {
      e.stopPropagation(); // close only the list, not a surrounding dialog
      setOpen(false);
    } else if (e.key === 'Tab') setOpen(false);
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        className={`${className} select-btn`}
        style={style}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        {...rest}
      >
        <span>{selected?.label ?? ''}</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            className="select-menu"
            style={{
              left: Math.min(pos.left, window.innerWidth - pos.width - 8),
              width: pos.width,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
          >
            {items.map((item, i) => {
              const header = item.group !== lastGroup && item.group ? <div className="select-group">{item.group}</div> : null;
              lastGroup = item.group;
              return (
                <div key={i}>
                  {header}
                  <div
                    role="option"
                    data-i={i}
                    aria-selected={item.value === current}
                    aria-disabled={item.disabled}
                    className={`select-option ${i === active ? 'active' : ''} ${item.value === current ? 'chosen' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                  >
                    <span>{item.label}</span>
                    {item.value === current && <Icon name="check" size={15} />}
                  </div>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
