import { useCallback, useEffect, useState } from "react";
import {
  FormModalCancelButton,
  FormModalSaveButton,
} from "@/components/common/FormModalActions";
import { Modal } from "@/components/common/Modal";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import { WorkReleaseScheduleSection } from "@/features/works/WorkReleaseScheduleSection";
import type { WorkMihonSource } from "@/services/mihon/workMihonSourceService";
import {
  fetchWorkReleaseScheduleForm,
  upsertWorkReleaseSchedule,
} from "@/services/workReleaseScheduleService";
import type { WorkReleaseSchedule } from "@/types/database";
import type { WorkReleaseScheduleFormValues } from "@/types/workForm";
import {
  ensureReleaseScheduleForm,
  scheduleToFormValues,
} from "@/utils/workReleaseSchedule/mappers";
import { resolveErrorMessage } from "@/utils/errorMessage";
import "@/features/works/WorkFormModal.css";
import "./WorkReleaseScheduleSection.css";

export interface WorkReleaseScheduleModalProps {
  open: boolean;
  workId: string;
  workTitle: string;
  /** Calendrier déjà chargé sur la fiche (évite le flash de chargement). */
  initialSchedule?: WorkReleaseSchedule | null;
  mihonSources?: WorkMihonSource[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * @description Modale de saisie du calendrier / attente de parution plateforme.
 */
export function WorkReleaseScheduleModal({
  open,
  workId,
  workTitle,
  initialSchedule = null,
  mihonSources = [],
  onClose,
  onSaved,
}: WorkReleaseScheduleModalProps) {
  const [form, setForm] = useState<WorkReleaseScheduleFormValues>(() =>
    ensureReleaseScheduleForm(scheduleToFormValues(initialSchedule)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    // Affiche tout de suite les données déjà connues (pas de swap Chargement → form).
    setForm(ensureReleaseScheduleForm(scheduleToFormValues(initialSchedule)));
    setError(null);
    setSaving(false);

    let cancelled = false;
    void fetchWorkReleaseScheduleForm(workId)
      .then((schedule) => {
        if (!cancelled) {
          setForm(ensureReleaseScheduleForm(schedule));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            resolveErrorMessage(err, "Impossible de charger le calendrier."),
          );
        }
      });

    return () => {
      cancelled = true;
    };
    // initialSchedule : figé à l’ouverture via open / workId
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed volontaire à chaque open
  }, [open, workId]);

  const handleClose = useCallback(() => {
    if (saving) {
      return;
    }
    onClose();
  }, [onClose, saving]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await upsertWorkReleaseSchedule(workId, form);
      onSaved();
      onClose();
    } catch (err) {
      setError(
        resolveErrorMessage(err, "Impossible d'enregistrer le calendrier."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Parution — ${workTitle}`}
      onClose={handleClose}
      wide
      footer={
        <div className="form-actions">
          <FormModalCancelButton disabled={saving} onClick={handleClose} />
          {form.scheduleStatus === "ongoing" ? (
            <div
              className="work-release-schedule-footer-control"
              title="Avancement automatique (signaler les chapitres parus)"
            >
              <ToggleSwitch
                checked={form.chapterControlEnabled}
                disabled={saving}
                onChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    chapterControlEnabled: checked,
                  }))
                }
              />
              <span>Avancement auto</span>
            </div>
          ) : null}
          <FormModalSaveButton
            disabled={saving}
            saving={saving}
            onClick={() => void handleSave()}
          />
        </div>
      }
    >
      <WorkReleaseScheduleSection
        value={form}
        disabled={saving}
        mihonSources={mihonSources}
        onChange={setForm}
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
