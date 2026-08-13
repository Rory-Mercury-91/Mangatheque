import { Check, Circle, Loader2, SkipForward, XCircle } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { TrackerSyncReportButton } from "@/components/layout/TrackerSyncReportButton";
import type {
  StartupSyncProgress,
  StartupSyncStepState,
  StartupSyncStepStatus,
} from "@/services/startupSyncService";
import "@/features/works/WorkFormModal.css";
import "./StartupSyncModal.css";

export interface StartupSyncModalProps {
  open: boolean;
  progress: StartupSyncProgress | null;
  onClose: () => void;
}

function statusIcon(status: StartupSyncStepStatus) {
  switch (status) {
    case "running":
      return <Loader2 size={16} className="startup-sync-spin" aria-hidden />;
    case "done":
      return <Check size={16} aria-hidden />;
    case "skipped":
      return <SkipForward size={16} aria-hidden />;
    case "error":
      return <XCircle size={16} aria-hidden />;
    default:
      return <Circle size={16} aria-hidden />;
  }
}

function statusLabel(status: StartupSyncStepStatus): string {
  switch (status) {
    case "running":
      return "En cours";
    case "done":
      return "Terminé";
    case "skipped":
      return "Ignoré";
    case "error":
      return "Erreur";
    default:
      return "En attente";
  }
}

function stepPercent(step: StartupSyncStepState): number {
  const total = step.progressTotal ?? 0;
  const current = step.progressCurrent ?? 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

/**
 * @description Affiche une étape de la pipeline de sync démarrage.
 */
function StartupSyncStepRow({ step }: { step: StartupSyncStepState }) {
  const showBar = step.status === "running";
  const indeterminate =
    showBar &&
    (step.progressPhase === "loading" ||
      !step.progressTotal ||
      step.progressTotal <= 0);
  const percent = stepPercent(step);

  return (
    <li
      className={`startup-sync-step startup-sync-step--${step.status}`}
      aria-current={step.status === "running" ? "step" : undefined}
    >
      <span className="startup-sync-step-icon" aria-hidden>
        {statusIcon(step.status)}
      </span>
      <div className="startup-sync-step-body">
        <div className="startup-sync-step-head">
          <strong>{step.label}</strong>
          <span className="startup-sync-step-status">
            {statusLabel(step.status)}
            {showBar && !indeterminate ? ` · ${percent}%` : ""}
          </span>
        </div>
        {step.detail ? (
          <p className="startup-sync-step-detail">{step.detail}</p>
        ) : null}
        {showBar ? (
          <div
            className="startup-sync-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indeterminate ? undefined : percent}
            aria-label={`Progression ${step.label}`}
          >
            <span
              className={
                indeterminate
                  ? "startup-sync-progress-fill startup-sync-progress-fill--indeterminate"
                  : "startup-sync-progress-fill"
              }
              style={indeterminate ? undefined : { width: `${percent}%` }}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * @description Modale de suivi temps réel de la sync auto au démarrage.
 */
export function StartupSyncModal({
  open,
  progress,
  onClose,
}: StartupSyncModalProps) {
  const finished = progress?.finished ?? false;
  const steps = progress?.steps ?? [];

  return (
    <Modal
      open={open}
      title="Synchronisation automatique"
      onClose={finished ? onClose : () => undefined}
      footer={
        finished ? (
          <>
            <TrackerSyncReportButton variant="footer" />
            <button type="button" className="btn-primary" onClick={onClose}>
              Fermer
            </button>
          </>
        ) : (
          <p className="startup-sync-footer-hint" role="status">
            Progression en cours… ne fermez pas l&apos;application.
          </p>
        )
      }
    >
      <p className="startup-sync-intro">
        Étapes au démarrage — les étapes déjà exécutées récemment sont ignorées.
      </p>
      <ol className="startup-sync-list">
        {steps.map((step) => (
          <StartupSyncStepRow key={step.id} step={step} />
        ))}
      </ol>
    </Modal>
  );
}
