import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
  dismissible?: boolean;
}

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  width = 420,
  dismissible = true,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const frame = window.requestAnimationFrame(() => {
      const field = cardRef.current?.querySelector<HTMLElement>(
        '.modal-content input:not([type="hidden"]), .modal-content textarea, .modal-content select, .modal-content button, .modal-footer .modal-button-primary, .modal-footer .modal-button-danger, .modal-footer button',
      );
      field?.focus();
    });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.cancelAnimationFrame(frame);
      previousActive?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={cardRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{ width }}
      >
        {dismissible ? (
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            <X size={15} strokeWidth={2} />
          </button>
        ) : null}
        <h2 id="modal-title" className="modal-title">
          {title}
        </h2>
        {description ? <div className="modal-description">{description}</div> : null}
        {children ? <div className="modal-content">{children}</div> : null}
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
