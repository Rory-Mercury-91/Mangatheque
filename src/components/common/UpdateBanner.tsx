import { Download, X } from "lucide-react";
import "./UpdateBanner.css";

type UpdateBannerProps = {
  version: string;
  platformLabel: string;
  installing: boolean;
  onApply: () => void;
  onDismiss: () => void;
};

/**
 * @description Bandeau de notification pour une mise a jour disponible.
 */
export function UpdateBanner({
  version,
  platformLabel,
  installing,
  onApply,
  onDismiss,
}: UpdateBannerProps) {
  return (
    <div className="update-banner" role="status">
      <div className="update-banner-text">
        <strong>Mise a jour {version}</strong>
        <span> — {platformLabel}</span>
      </div>
      <div className="update-banner-actions">
        <button
          type="button"
          className="update-banner-apply"
          disabled={installing}
          onClick={onApply}
        >
          <Download size={16} aria-hidden />
          {installing ? "Installation…" : "Mettre a jour"}
        </button>
        <button
          type="button"
          className="update-banner-dismiss"
          aria-label="Ignorer cette mise a jour"
          onClick={onDismiss}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
