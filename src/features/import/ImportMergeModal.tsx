import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { BulkSideButtons, DiffTable } from "@/features/import/ImportMergeDiffTable";
import {
  applyMergeFieldChoices,
  type ImportMergePreview,
  type MergeFieldChoices,
  type MergeFieldSide,
} from "@/services/importMergeService";
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
  /** Titre de la modale (défaut : série déjà en bibliothèque). */
  title?: string;
  /**
   * Remplace l'enregistrement par défaut (ex. fusion de deux fiches + suppression).
   * Reçoit l'aperçu confirmé.
   */
  commitMerge?: (preview: ImportMergePreview) => Promise<void>;
  /** Libellé du bouton principal. */
  confirmLabel?: string;
}

const EMPTY_CHOICES: MergeFieldChoices = {
  work: {},
  volumes: {},
  skipNewVolumes: {},
};

/**
 * @description Modale de confirmation lorsqu'un import cible une série déjà en bibliothèque.
 * Chaque différence peut rester en base ou prendre la valeur proposée.
 */
export function ImportMergeModal({
  open,
  preview,
  onClose,
  onMerged,
  onEditBeforeSave,
  title = "Série déjà en bibliothèque",
  commitMerge,
  confirmLabel = "Mettre à jour",
}: ImportMergeModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<MergeFieldChoices>(EMPTY_CHOICES);

  useEffect(() => {
    setChoices(EMPTY_CHOICES);
    setError(null);
  }, [preview]);

  const handleClose = () => {
    if (saving) {
      return;
    }
    setError(null);
    onClose();
  };

  const resolvePreview = (): ImportMergePreview | null => {
    if (!preview) {
      return null;
    }
    return {
      ...preview,
      mergedValues: applyMergeFieldChoices(preview, choices),
    };
  };

  const handleSave = async () => {
    const resolved = resolvePreview();
    if (!resolved) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (commitMerge) {
        await commitMerge(resolved);
      } else {
        await updateWorkWithVolumes(resolved.workId, resolved.mergedValues);
      }
      onMerged(resolved.workId);
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
    const resolved = resolvePreview();
    if (!resolved || !onEditBeforeSave) {
      return;
    }
    onEditBeforeSave(resolved.workId, resolved);
    handleClose();
  };

  const setWorkSide = (fieldKey: string, side: MergeFieldSide) => {
    setChoices((current) => ({
      ...current,
      work: { ...current.work, [fieldKey]: side },
    }));
  };

  const setAllWorkSides = (side: MergeFieldSide) => {
    if (!preview) {
      return;
    }
    const work: Record<string, MergeFieldSide> = {};
    for (const diff of preview.workDiffs) {
      work[diff.fieldKey] = side;
    }
    setChoices((current) => ({ ...current, work }));
  };

  const setVolumeSide = (volumeKey: string, fieldKey: string, side: MergeFieldSide) => {
    setChoices((current) => ({
      ...current,
      volumes: {
        ...current.volumes,
        [volumeKey]: { ...current.volumes[volumeKey], [fieldKey]: side },
      },
    }));
  };

  const setAllVolumeSides = (volumeKey: string, fieldKeys: string[], side: MergeFieldSide) => {
    const fields: Record<string, MergeFieldSide> = {};
    for (const fieldKey of fieldKeys) {
      fields[fieldKey] = side;
    }
    setChoices((current) => ({
      ...current,
      volumes: { ...current.volumes, [volumeKey]: fields },
    }));
  };

  const setSkipNewVolume = (volumeKey: string, skip: boolean) => {
    setChoices((current) => ({
      ...current,
      skipNewVolumes: { ...current.skipNewVolumes, [volumeKey]: skip },
    }));
  };

  if (!preview) {
    return null;
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={handleClose}
      wide
      floating
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
            disabled={saving || (!preview.hasChanges && !commitMerge)}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="spin" aria-hidden />
                Mise à jour…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      }
    >
      <div className="import-merge-content">
        <p className="import-merge-intro">
          {commitMerge ? (
            <>
              Fusion vers « <strong>{preview.workTitle}</strong> ». L&apos;autre
              fiche sera absorbée puis supprimée.
            </>
          ) : (
            <>
              La série « <strong>{preview.workTitle}</strong> » existe déjà.
              Choisissez, pour chaque différence, la valeur à conserver.
            </>
          )}
        </p>
        <p className="import-merge-hint">
          Cliquez sur <strong>En base</strong> pour garder la fiche actuelle, ou
          sur <strong>Proposé</strong> pour prendre la fusion. Par défaut, la
          valeur proposée est retenue.
        </p>

        {!preview.hasChanges ? (
          <p className="import-merge-empty">
            {commitMerge
              ? "Aucune différence de métadonnées — la fusion transfèrera tout de même les sources Mihon puis supprimera le doublon."
              : "Aucune différence détectée : la fiche est déjà à jour par rapport à l'import."}
          </p>
        ) : null}

        {preview.workDiffs.length > 0 ? (
          <section className="import-merge-section">
            <div className="import-merge-section-head">
              <h3>Métadonnées série</h3>
              <BulkSideButtons
                onKeep={() => setAllWorkSides("keep")}
                onTake={() => setAllWorkSides("take")}
              />
            </div>
            <DiffTable
              diffs={preview.workDiffs}
              selected={(fieldKey) => choices.work[fieldKey] ?? "take"}
              onSelect={setWorkSide}
            />
          </section>
        ) : null}

        {preview.volumeChanges.length > 0 ? (
          <section className="import-merge-section">
            <h3>Tomes</h3>
            {preview.volumeChanges.map((change) => {
              const skipped = Boolean(choices.skipNewVolumes[change.volumeKey]);
              return (
                <article
                  key={`${change.kind}-${change.volumeKey}`}
                  className="import-merge-volume"
                >
                  <div className="import-merge-section-head">
                    <h4>
                      {change.kind === "add" ? "Nouveau — " : "Mise à jour — "}
                      {change.label}
                    </h4>
                    {change.kind === "add" ? (
                      <div className="import-merge-bulk" role="group" aria-label={change.label}>
                        <button
                          type="button"
                          className={`import-merge-bulk-btn${skipped ? "" : " import-merge-bulk-btn--active"}`}
                          aria-pressed={!skipped}
                          onClick={() => setSkipNewVolume(change.volumeKey, false)}
                        >
                          Ajouter
                        </button>
                        <button
                          type="button"
                          className={`import-merge-bulk-btn${skipped ? " import-merge-bulk-btn--active" : ""}`}
                          aria-pressed={skipped}
                          onClick={() => setSkipNewVolume(change.volumeKey, true)}
                        >
                          Ne pas ajouter
                        </button>
                      </div>
                    ) : (
                      <BulkSideButtons
                        onKeep={() =>
                          setAllVolumeSides(
                            change.volumeKey,
                            change.diffs.map((diff) => diff.fieldKey),
                            "keep",
                          )
                        }
                        onTake={() =>
                          setAllVolumeSides(
                            change.volumeKey,
                            change.diffs.map((diff) => diff.fieldKey),
                            "take",
                          )
                        }
                      />
                    )}
                  </div>
                  {change.kind === "update" ? (
                    <DiffTable
                      diffs={change.diffs}
                      selected={(fieldKey) =>
                        choices.volumes[change.volumeKey]?.[fieldKey] ?? "take"
                      }
                      onSelect={(fieldKey, side) =>
                        setVolumeSide(change.volumeKey, fieldKey, side)
                      }
                    />
                  ) : skipped ? (
                    <p className="import-merge-skipped">Ce tome ne sera pas créé.</p>
                  ) : (
                    <DiffTable diffs={change.diffs} readOnly />
                  )}
                </article>
              );
            })}
          </section>
        ) : null}

        {error ? <p className="import-merge-error">{error}</p> : null}
      </div>
    </Modal>
  );
}

