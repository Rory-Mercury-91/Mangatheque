import { Modal } from "@/components/common/Modal";
import "./NavConfirmModal.css";

export type NavConfirmKind = "logout" | "quit";

export interface NavConfirmModalProps {
  kind: NavConfirmKind | null;
  onClose: () => void;
  onConfirm: () => void;
}

const COPY: Record<
  NavConfirmKind,
  { title: string; message: string; confirm: string; danger?: boolean }
> = {
  logout: {
    title: "Se déconnecter ?",
    message: "Vous devrez vous reconnecter pour accéder à votre bibliothèque.",
    confirm: "Se déconnecter",
    danger: true,
  },
  quit: {
    title: "Quitter l'application ?",
    message: "Mangathèque sera fermée. Vos données restent synchronisées en ligne.",
    confirm: "Quitter",
    danger: true,
  },
};

/**
 * @description Modale de confirmation pour déconnexion ou fermeture de l'app.
 */
export function NavConfirmModal({ kind, onClose, onConfirm }: NavConfirmModalProps) {
  if (!kind) {
    return null;
  }

  const copy = COPY[kind];

  return (
    <Modal
      open
      title={copy.title}
      onClose={onClose}
      footer={
        <div className="nav-confirm-actions">
          <button type="button" className="nav-confirm-btn nav-confirm-btn--secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className={`nav-confirm-btn${copy.danger ? " nav-confirm-btn--danger" : " nav-confirm-btn--primary"}`}
            onClick={onConfirm}
          >
            {copy.confirm}
          </button>
        </div>
      }
    >
      <p className="nav-confirm-message">{copy.message}</p>
    </Modal>
  );
}
