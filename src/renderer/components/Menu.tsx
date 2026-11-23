import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface MenuProps {
  open: boolean;
  anchor: DOMRect | null;
  onClose: () => void;
  align?: 'start' | 'end';
  width?: number;
  label?: string;
  children: ReactNode;
}

export function Menu({ open, anchor, onClose, align = 'start', width = 220, label, children }: MenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [open, onClose]);

  if (!open || !anchor) return null;

  const margin = 8;
  const left = Math.min(
    Math.max(margin, align === 'end' ? anchor.right - width : anchor.left),
    window.innerWidth - width - margin,
  );
  const openAbove = anchor.bottom + 310 > window.innerHeight && anchor.top > 320;
  const style = openAbove
    ? { left, bottom: window.innerHeight - anchor.top + 6, width }
    : { left, top: anchor.bottom + 6, width };

  return createPortal(
    <>
      <div
        className="menu-scrim"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={panelRef}
        className="menu-panel"
        style={style}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

interface MenuItemProps {
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  checked?: boolean;
  shortcut?: string;
  disabled?: boolean;
}

export function MenuItem({ icon, label, onSelect, destructive, checked, shortcut, disabled }: MenuItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      className={`menu-item${destructive ? ' is-destructive' : ''}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="menu-item-icon">{icon ?? null}</span>
      <span className="menu-item-label">{label}</span>
      {checked ? <span className="menu-check">✓</span> : null}
      {shortcut ? <span className="menu-item-shortcut">{shortcut}</span> : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-separator" role="separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu-label">{children}</div>;
}
