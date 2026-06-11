import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import "./Modal.css";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

/**
 * @description Modale accessible avec fermeture Échap et bouton.
 */
export function Modal({ open, title, onClose, children, wide }: ModalProps) {
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

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className={`modal-panel${wide ? " modal-panel--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
