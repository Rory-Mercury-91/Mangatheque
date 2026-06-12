import { useId, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { wipeAllApplicationData } from "@/services/resetDataService";
import "./ResetAllDataModal.css";

const CONFIRM_PHRASE = "EFFACER";

export interface ResetAllDataModalProps {
  open: boolean;
  onClose: () => void;
  onReset: () => void;
}

/**
 * @description Modale de réinitialisation totale avec double confirmation (tests).
 */
export function ResetAllDataModal({
  open,
  onClose,
  onReset,
}: ResetAllDataModalProps) {
  const inputId = useId();
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setStep(1);
    setConfirmText("");
    setError(null);
    onClose();
  };

  const handleContinue = () => {
    setError(null);
    setStep(2);
  };

  const handleReset = async () => {
    if (confirmText.trim() !== CONFIRM_PHRASE) {
      return;
    }

    setResetting(true);
    setError(null);
    try {
      await wipeAllApplicationData();
      onReset();
      handleClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Réinitialisation impossible.",
      );
    } finally {
      setResetting(false);
    }
  };

  const phraseMatches = confirmText.trim() === CONFIRM_PHRASE;

  return (
    <Modal
      open={open}
      title={
        step === 1
          ? "Réinitialiser toutes les données ?"
          : "Confirmation finale"
      }
      onClose={handleClose}
      footer={
        <div className="reset-data-modal-footer">
          {error ? <p className="reset-data-modal-error">{error}</p> : null}
          <div className="reset-data-modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClose}
              disabled={resetting}
            >
              Annuler
            </button>
            {step === 1 ? (
              <button
                type="button"
                className="btn-danger"
                onClick={handleContinue}
              >
                Je comprends, continuer
              </button>
            ) : (
              <button
                type="button"
                className="btn-danger"
                disabled={!phraseMatches || resetting}
                onClick={() => void handleReset()}
              >
                {resetting ? (
                  <>
                    <Loader2 size={16} className="spin" aria-hidden />
                    Réinitialisation…
                  </>
                ) : (
                  "Confirmer la réinitialisation"
                )}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="reset-data-modal-body">
        <p className="reset-data-modal-warning" role="alert">
          <AlertTriangle size={20} aria-hidden />
          Action irréversible — réservée aux tests.
        </p>

        {step === 1 ? (
          <>
            <p>Cette opération va supprimer définitivement :</p>
            <ul>
              <li>Toutes les séries et tous les tomes</li>
              <li>Tout le journal d&apos;activité</li>
            </ul>
            <p className="reset-data-modal-kept">
              Les propriétaires (Céline, Sébastien, Alexandre) et les comptes
              utilisateurs sont conservés.
            </p>
          </>
        ) : (
          <>
            <p>
              Pour confirmer, saisissez{" "}
              <strong>{CONFIRM_PHRASE}</strong> ci-dessous :
            </p>
            <label className="reset-data-modal-input" htmlFor={inputId}>
              <input
                id={inputId}
                type="text"
                value={confirmText}
                autoComplete="off"
                spellCheck={false}
                placeholder={CONFIRM_PHRASE}
                onChange={(event) => setConfirmText(event.target.value)}
              />
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
