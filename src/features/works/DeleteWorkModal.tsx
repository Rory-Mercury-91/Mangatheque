import { useId, useState } from "react";
import { Modal } from "@/components/common/Modal";
import { deleteWork } from "@/services/workService";
import "./DeleteWorkModal.css";

export interface DeleteWorkModalProps {
  open: boolean;
  workId: string;
  workTitle: string;
  onClose: () => void;
  onDeleted: () => void;
}

const MIN_REASON_LENGTH = 10;

/**
 * @description Modale de suppression avec justification écrite obligatoire.
 */
export function DeleteWorkModal({
  open,
  workId,
  workTitle,
  onClose,
  onDeleted,
}: DeleteWorkModalProps) {
  const formId = useId();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setReason("");
    setError(null);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON_LENGTH) {
      setError(
        `La justification doit contenir au moins ${MIN_REASON_LENGTH} caractères.`,
      );
      return;
    }

    setSaving(true);
    try {
      await deleteWork(workId, trimmed);
      onDeleted();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur à la suppression.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Supprimer la série"
      onClose={handleClose}
      footer={
        <div className="modal-footer-stack">
          {error ? <p className="delete-work-error">{error}</p> : null}
          <footer className="delete-work-actions">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Annuler
            </button>
            <button
              type="submit"
              form={formId}
              className="btn-danger"
              disabled={saving}
            >
              {saving ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </footer>
        </div>
      }
    >
      <form id={formId} className="delete-work-form" onSubmit={handleSubmit}>
        <p className="delete-work-warning">
          Vous allez supprimer définitivement <strong>{workTitle}</strong> et
          tous ses tomes. Cette action est irréversible.
        </p>

        <label className="delete-work-field">
          <span>Justification (obligatoire)</span>
          <textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Expliquez pourquoi vous supprimez cette série…"
            required
            minLength={MIN_REASON_LENGTH}
          />
          <small>{reason.trim().length} / {MIN_REASON_LENGTH} caractères minimum</small>
        </label>

      </form>
    </Modal>
  );
}
