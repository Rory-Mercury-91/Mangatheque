import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAppMainScrollLock } from "@/hooks/useAppMainScrollLock";
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
  /**
   * Modale flottante : déplaçable, ne bloque pas les clics derrière,
   * ne se ferme pas au clic overlay / Escape (Annuler / X uniquement).
   * Le scroll de la page reste verrouillé pour éviter les sauts de position.
   */
  floating?: boolean;
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
  floating = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  useAppMainScrollLock(open);

  useEffect(() => {
    if (!open) {
      setOffset({ x: 0, y: 0 });
      return;
    }

    if (floating) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, floating]);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      setOffset({
        x: event.clientX - dragOffset.current.x,
        y: event.clientY - dragOffset.current.y,
      });
    };
    const onUp = () => setDragging(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  if (!open) {
    return null;
  }

  const overlayClass = [
    "modal-overlay",
    stacked ? "modal-overlay--stacked" : "",
    floating ? "modal-overlay--floating" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const panelClass = [
    "modal-panel",
    wide ? "modal-panel--wide" : "",
    floating ? "modal-panel--floating" : "",
    dragging ? "modal-panel--dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className={overlayClass}
      role="presentation"
      onClick={floating ? undefined : onClose}
    >
      <div
        ref={panelRef}
        className={panelClass}
        role="dialog"
        aria-modal={!floating}
        aria-label={title}
        style={
          floating
            ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className={`modal-header${floating ? " modal-header--draggable" : ""}`}
          onPointerDown={
            floating
              ? (event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("button")) {
                    return;
                  }
                  dragOffset.current = {
                    x: event.clientX - offset.x,
                    y: event.clientY - offset.y,
                  };
                  setDragging(true);
                }
              : undefined
          }
        >
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
        <div
          className={`modal-body app-scroll-lock-allow${footer ? " modal-body--scroll" : ""}`}
        >
          {children}
        </div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
