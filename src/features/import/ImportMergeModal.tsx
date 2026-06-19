import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import type { ImportMergePreview } from "@/services/importMergeService";
import { updateWorkWithVolumes } from "@/services/workService";
import "./ImportMergeModal.css";

export interface ImportMergeModalProps {
  open: boolean;
  preview: ImportMergePreview | null;
  onClose: () => void;
  /** Fusion appliquée puis enregistrement réussi. */
  onMerged: (workId: string) => void;
  /** Ouvre le formulaire complet avec les valeurs fusionnées pour retouche manuelle. */
  onEditBeforeSave?: (workId: string, preview: ImportMergePreview) => void;
}

/**
 * @description Modale de confirmation lorsqu'un import cible une série déjà en bibliothèque.
 */
export function ImportMergeModal({
  open,
  preview,
  onClose,
  onMerged,
  onEditBeforeSave,
}: ImportMergeModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (saving) {
      return;
    }
    setError(null);
    onClose();
  };

  const handleSave = async () => {
    if (!preview) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateWorkWithVolumes(preview.workId, preview.mergedValues);
      onMerged(preview.workId);
      handleClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de mettre à jour la série.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    if (!preview || !onEditBeforeSave) {
      return;
    }
    onEditBeforeSave(preview.workId, preview);
    handleClose();
  };

  if (!preview) {
    return null;
  }

  return (
    <Modal
      open={open}
      title="Série déjà en bibliothèque"
      onClose={handleClose}
      wide
      footer={
        <div className="import-merge-footer">
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={handleClose}
          >
            Annuler
          </button>
          {onEditBeforeSave ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={handleEdit}
            >
              Modifier avant enregistrement
            </button>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !preview.hasChanges}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="spin" aria-hidden />
                Mise à jour…
              </>
            ) : (
              "Mettre à jour"
            )}
          </button>
        </div>
      }
    >
      <div className="import-merge-content">
        <p className="import-merge-intro">
          La série « <strong>{preview.workTitle}</strong> » existe déjà. Voici
          les changements qui seraient appliqués en fusionnant les données
          Nautiljon avec votre fiche actuelle.
        </p>

        {!preview.hasChanges ? (
          <p className="import-merge-empty">
            Aucune différence détectée : la fiche est déjà à jour par rapport à
            l&apos;import.
          </p>
        ) : null}

        {preview.workDiffs.length > 0 ? (
          <section className="import-merge-section">
            <h3>Métadonnées série</h3>
            <DiffTable diffs={preview.workDiffs} />
          </section>
        ) : null}

        {preview.volumeChanges.length > 0 ? (
          <section className="import-merge-section">
            <h3>Tomes</h3>
            {preview.volumeChanges.map((change) => (
              <article key={`${change.kind}-${change.label}`} className="import-merge-volume">
                <h4>
                  {change.kind === "add" ? "Nouveau — " : "Mise à jour — "}
                  {change.label}
                </h4>
                <DiffTable diffs={change.diffs} />
              </article>
            ))}
          </section>
        ) : null}

        {error ? <p className="import-merge-error">{error}</p> : null}
      </div>
    </Modal>
  );
}

function DiffTable({
  diffs,
}: {
  diffs: ImportMergePreview["workDiffs"];
}) {
  return (
    <div className="import-merge-table-wrap">
      <table className="import-merge-table">
        <thead>
          <tr>
            <th scope="col">Champ</th>
            <th scope="col">Avant</th>
            <th scope="col">Après</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff) => (
            <tr key={diff.label}>
              <th scope="row">{diff.label}</th>
              <td className="import-merge-before">{diff.before}</td>
              <td className="import-merge-after">{diff.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
