// A section that opens and closes smoothly: its height grows from nothing (and back) while it fades in.
// The content is only rendered once it has been opened, and goes away after it finished closing.
import { useEffect, useState, type ReactNode } from 'react';

export function Collapse({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  return (
    <div
      className={`collapse ${open ? 'open' : ''} ${className}`}
      aria-hidden={!open}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget && e.propertyName === 'grid-template-rows') setMounted(false);
      }}
    >
      <div className="collapse-inner">{(open || mounted) && children}</div>
    </div>
  );
}
