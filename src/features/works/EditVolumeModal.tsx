import { type FormEvent, useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { VolumeFormRow } from "@/features/works/VolumeFormRow";
import { addVolumeToWork, updateVolumeInWork } from "@/services/workService";
import type { Owner, TrackingUnit } from "@/types/database";
import type { VolumeFormRow as VolumeRow } from "@/types/workForm";
import { formatVolumeTitle } from "@/utils/volumeDisplay";
import { formatEditionLabel } from "@/utils/ownerDisplay";
import {
  canDuplicateVolumeEdition,
  getAlternateEditionType,
  getDuplicateVolumeEditionLabel,
} from "@/utils/volumeIdentity";
import "./WorkFormModal.css";

export interface EditVolumeModalProps {
  open: boolean;
  workId: string;
  workTitle: string;
  volume: VolumeRow | null;
  allVolumes: VolumeRow[];
  owners: Owner[];
  trackingUnit?: TrackingUnit;
  defaultPrice?: number | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * @description Modale d'édition d'un seul tome sans ouvrir le formulaire série complet.
 */
export function EditVolumeModal({
  open,
  workId,
  workTitle,
  volume,
  allVolumes,
  owners,
  trackingUnit = "volume",
  defaultPrice = null,
  onClose,
  onSaved,
}: EditVolumeModalProps) {
  const formId = useId();
  const [draft, setDraft] = useState<VolumeRow | null>(volume);
  const [isDuplicateMode, setIsDuplicateMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !volume) {
      return;
    }
    setDraft({ ...volume });
    setIsDuplicateMode(false);
    setError(null);
  }, [open, volume]);

  if (!volume || !draft) {
    return null;
  }

  const volumeTitle = formatVolumeTitle(
    draft.volumeNumber,
    draft.volumeLabel,
    trackingUnit,
  );

  const canDuplicate =
    !isDuplicateMode && canDuplicateVolumeEdition(volume, allVolumes);

  const handleDuplicateEdition = () => {
    if (!canDuplicate) {
      return;
    }

    setDraft({
      ...draft,
      id: undefined,
      editionType: getAlternateEditionType(draft.editionType),
    });
    setIsDuplicateMode(true);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setSaving(true);
    setError(null);
    try {
      if (isDuplicateMode || !draft.id) {
        await addVolumeToWork(workId, draft, allVolumes, workTitle);
      } else {
        await updateVolumeInWork(
          workId,
          draft.id,
          draft,
          allVolumes,
          workTitle,
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur à l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = isDuplicateMode
    ? `Dupliquer ${volumeTitle} en ${formatEditionLabel(draft.editionType)} — ${workTitle}`
    : `Modifier ${volumeTitle} — ${workTitle}`;

  return (
    <Modal
      open={open}
      title={modalTitle}
      onClose={onClose}
      wide
      footer={
        <div className="modal-footer-stack">
          {error ? <p className="form-error">{error}</p> : null}
          {isDuplicateMode ? (
            <p className="volume-duplicate-edition-hint" role="status">
              Nouveau tome — les informations sont copiées, l&apos;édition est
              passée en {formatEditionLabel(draft.editionType)}. Ajustez si besoin
              puis enregistrez.
            </p>
          ) : null}
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button
              type="submit"
              form={formId}
              className="btn-primary"
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="spin" aria-hidden />
                  Enregistrement…
                </>
              ) : isDuplicateMode ? (
                "Ajouter le tome"
              ) : (
                "Enregistrer le tome"
              )}
            </button>
          </div>
        </div>
      }
    >
      <form
        id={formId}
        className="work-form work-form--modal"
        onSubmit={handleSubmit}
      >
        <VolumeFormRow
          volume={draft}
          owners={owners}
          trackingUnit={trackingUnit}
          defaultPrice={defaultPrice}
          defaultExpanded
          removable={false}
          duplicateEditionLabel={
            canDuplicate ? getDuplicateVolumeEditionLabel(volume.editionType) : undefined
          }
          onDuplicateEdition={canDuplicate ? handleDuplicateEdition : undefined}
          onChange={(patch) => setDraft((current) => ({ ...current!, ...patch }))}
        />
      </form>
    </Modal>
  );
}
