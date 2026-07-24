import type { ButtonHTMLAttributes } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import "@/components/common/ghostActionBtn.css";

type FormModalCancelButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
>;

/**
 * @description Bouton retour / annuler (icône flèche), style ghost.
 */
export function FormModalCancelButton({
  title = "Retour",
  "aria-label": ariaLabel = "Annuler et revenir en arrière",
  ...props
}: FormModalCancelButtonProps) {
  return (
    <button
      type="button"
      className="ghost-action-btn form-modal-action-btn"
      title={title}
      aria-label={ariaLabel}
      {...props}
    >
      <ArrowLeft size={18} aria-hidden />
    </button>
  );
}

type FormModalSaveButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  saving?: boolean;
};

/**
 * @description Bouton enregistrer (icône disquette), style ghost.
 */
export function FormModalSaveButton({
  saving = false,
  disabled,
  title,
  "aria-label": ariaLabel,
  type = "button",
  ...props
}: FormModalSaveButtonProps) {
  const label = saving ? "Enregistrement…" : "Enregistrer";
  return (
    <button
      type={type}
      className="ghost-action-btn ghost-action-btn--accent form-modal-action-btn form-modal-save-btn"
      title={title ?? label}
      aria-label={ariaLabel ?? label}
      disabled={disabled || saving}
      {...props}
    >
      {saving ? (
        <Loader2 size={18} className="spin" aria-hidden />
      ) : (
        <Save size={18} aria-hidden />
      )}
    </button>
  );
}
