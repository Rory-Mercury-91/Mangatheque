import { type FormEvent, useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { VolumeFormRow } from "@/features/works/VolumeFormRow";
import { addVolumeToWork } from "@/services/workService";
import type { Owner } from "@/types/database";
import {
  createEmptyVolumeRow,
  getNextVolumeNumber,
  type VolumeFormRow as VolumeRow,
} from "@/types/workForm";
import "./WorkFormModal.css";

export interface AddVolumeModalProps {
  open: boolean;
  workId: string;
  workTitle: string;
  existingVolumes: VolumeRow[];
  owners: Owner[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * @description Modale d'ajout d'un tome sans modifier le reste de l'œuvre.
 */
export function AddVolumeModal({
  open,
  workId,
  workTitle,
  existingVolumes,
  owners,
  onClose,
  onSaved,
}: AddVolumeModalProps) {
  const formId = useId();
  const [volume, setVolume] = useState<VolumeRow>(() =>
    createEmptyVolumeRow(getNextVolumeNumber(existingVolumes)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setVolume(createEmptyVolumeRow(getNextVolumeNumber(existingVolumes)));
    setError(null);
  }, [open, existingVolumes]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await addVolumeToWork(
        workId,
        volume,
        existingVolumes.map((row) => row.volumeNumber),
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur à l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Ajouter un tome — ${workTitle}`}
      onClose={onClose}
      wide
      footer={
        <div className="modal-footer-stack">
          {error ? <p className="form-error">{error}</p> : null}
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
              ) : (
                "Ajouter le tome"
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
          volume={volume}
          owners={owners}
          defaultExpanded
          removable={false}
          onChange={(patch) => setVolume((current) => ({ ...current, ...patch }))}
        />
      </form>
    </Modal>
  );
}
