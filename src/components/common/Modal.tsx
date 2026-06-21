import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./Modal.css";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pied de page fixe (actions Enregistrer / Annuler, etc.). */
  footer?: ReactNode;
  /** Actions complémentaires dans l'en-tête (aide, etc.). */
  headerActions?: ReactNode;
  /** Au-dessus d'une autre modale (aide contextuelle). */
  stacked?: boolean;
  wide?: boolean;
}

/**
 * @description Modale accessible : en-tête et pied fixes, corps défilable.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  headerActions,
  stacked = false,
  wide,
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={`modal-overlay${stacked ? " modal-overlay--stacked" : ""}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`modal-panel${wide ? " modal-panel--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <div className="modal-header-actions">
            {headerActions}
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className={`modal-body${footer ? " modal-body--scroll" : ""}`}>
          {children}
        </div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
