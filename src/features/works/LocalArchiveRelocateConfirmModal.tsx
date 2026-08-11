import { Modal } from "@/components/common/Modal";
import "@/components/layout/NavConfirmModal.css";
import "./LocalArchiveRelocateConfirmModal.css";
import type { LocalArchiveRelocateReason } from "@/services/localArchiveRelocateOffer";

export interface LocalArchiveRelocateConfirmModalProps {
  open: boolean;
  reasons: LocalArchiveRelocateReason[];
  fromStatusLabel: string;
  toStatusLabel: string;
  previousTitle: string;
  nextTitle: string;
  currentPath: string;
  destinationPath: string;
  saving?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * @description Construit le résumé des changements pour la modale.
 */
function buildChangeMessages(props: {
  reasons: LocalArchiveRelocateReason[];
  fromStatusLabel: string;
  toStatusLabel: string;
  previousTitle: string;
  nextTitle: string;
}): string[] {
  const messages: string[] = [];
  if (props.reasons.includes("status")) {
    messages.push(
      `Statut série : ${props.fromStatusLabel} → ${props.toStatusLabel}.`,
    );
  }
  if (props.reasons.includes("title")) {
    if (
      props.previousTitle &&
      props.nextTitle &&
      props.previousTitle !== props.nextTitle
    ) {
      messages.push(
        `Titre série : « ${props.previousTitle} » → « ${props.nextTitle} ».`,
      );
    } else {
      messages.push("Le nom du dossier série a changé.");
    }
  }
  if (props.reasons.includes("path") && messages.length === 0) {
    messages.push(
      "Le classement de l'archive a changé (démographie ou dossier).",
    );
  }
  return messages;
}

/**
 * @description Modale custom : proposer le déplacement / renommage d'archive.
 */
export function LocalArchiveRelocateConfirmModal({
  open,
  reasons,
  fromStatusLabel,
  toStatusLabel,
  previousTitle,
  nextTitle,
  currentPath,
  destinationPath,
  saving = false,
  onClose,
  onConfirm,
}: LocalArchiveRelocateConfirmModalProps) {
  const messages = buildChangeMessages({
    reasons,
    fromStatusLabel,
    toStatusLabel,
    previousTitle,
    nextTitle,
  });
  const mostlyRename =
    reasons.includes("title") && !reasons.includes("status");
  const confirmLabel = mostlyRename ? "Renommer le dossier" : "Déplacer";
  const savingLabel = mostlyRename ? "Renommage…" : "Déplacement…";

  return (
    <Modal
      open={open}
      title={
        mostlyRename
          ? "Renommer le dossier d'archive ?"
          : "Mettre à jour l'archive locale ?"
      }
      stacked
      onClose={saving ? () => undefined : onClose}
      footer={
        <div className="nav-confirm-actions">
          <button
            type="button"
            className="nav-confirm-btn nav-confirm-btn--secondary"
            disabled={saving}
            onClick={onClose}
          >
            Garder l&apos;emplacement
          </button>
          <button
            type="button"
            className="nav-confirm-btn nav-confirm-btn--primary"
            disabled={saving}
            onClick={onConfirm}
          >
            {saving ? savingLabel : confirmLabel}
          </button>
        </div>
      }
    >
      {messages.map((message) => (
        <p key={message} className="nav-confirm-message">
          {message}
        </p>
      ))}
      <p className="nav-confirm-message">
        {mostlyRename
          ? "Souhaitez-vous aussi renommer le dossier lié pour le retrouver plus facilement ?"
          : "Souhaitez-vous mettre à jour le dossier d'archive lié ?"}
      </p>
      <p className="local-archive-relocate-label">Nouvel emplacement</p>
      <p className="local-archive-relocate-path" title={destinationPath}>
        {destinationPath}
      </p>
      <p className="local-archive-relocate-label">Emplacement actuel</p>
      <p className="local-archive-relocate-path is-muted" title={currentPath}>
        {currentPath}
      </p>
    </Modal>
  );
}
