import { useId, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import "./StickyAlert.css";

export type StickyAlertVariant = "error" | "info" | "warning";

export interface StickyAlertProps {
  variant?: StickyAlertVariant;
  /** Titre court au-dessus du contenu. */
  title?: string;
  children: ReactNode;
  /** Texte brut pour copie / zone sélectionnable (évite le freeze WebView sur `<pre>`). */
  copyText?: string;
  /** Fermeture manuelle — l'alerte ne disparaît pas toute seule. */
  onDismiss: () => void;
  className?: string;
}

/**
 * @description Bandeau d'alerte persistant jusqu'à fermeture explicite (erreurs de sync, etc.).
 */
export function StickyAlert({
  variant = "error",
  title,
  children,
  copyText,
  onDismiss,
  className = "",
}: StickyAlertProps) {
  const areaId = useId();
  const [copied, setCopied] = useState(false);
  const classes = ["sticky-alert", `sticky-alert--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  const handleCopy = async () => {
    const text =
      copyText ?? (typeof children === "string" ? children : null);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const area = document.getElementById(areaId) as HTMLTextAreaElement | null;
      if (area) {
        area.focus();
        area.select();
      }
    }
  };

  return (
    <div className={classes} role={variant === "error" ? "alert" : "status"}>
      <div className="sticky-alert-body">
        <div className="sticky-alert-head">
          {title ? <strong className="sticky-alert-title">{title}</strong> : null}
          <div className="sticky-alert-actions">
            {copyText || typeof children === "string" ? (
              <button
                type="button"
                className="sticky-alert-action"
                onClick={() => void handleCopy()}
                title="Copier le message"
                aria-label="Copier le message"
              >
                {copied ? (
                  <Check size={15} aria-hidden />
                ) : (
                  <Copy size={15} aria-hidden />
                )}
                <span>{copied ? "Copié" : "Copier"}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="sticky-alert-dismiss"
              onClick={onDismiss}
              aria-label="Fermer le message"
              title="Fermer"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
        {copyText ? (
          <textarea
            id={areaId}
            className="sticky-alert-textarea"
            readOnly
            value={copyText}
            rows={Math.min(12, Math.max(4, copyText.split("\n").length))}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
          />
        ) : (
          <div className="sticky-alert-content">{children}</div>
        )}
      </div>
    </div>
  );
}
