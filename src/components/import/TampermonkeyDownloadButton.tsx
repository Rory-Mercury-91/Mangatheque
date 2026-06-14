import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { isDesktopFeaturesAvailable } from "@/lib/appLifecycle";
import { isMobileRuntime } from "@/lib/platform";
import { downloadTampermonkeyScript } from "@/services/tampermonkeyDownloadService";
import "./TampermonkeyDownloadButton.css";

type TampermonkeyDownloadButtonProps = {
  compact?: boolean;
  /** Bouton compact sur une ligne avec libellé court (bibliothèque mobile). */
  inline?: boolean;
  /** Style barre de navigation globale (icône seule sur mobile). */
  header?: boolean;
};

/**
 * @description Télécharge le userscript Nautiljon (import direct desktop, export JSON mobile).
 */
export function TampermonkeyDownloadButton({
  compact = false,
  inline = false,
  header = false,
}: TampermonkeyDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const mobile = isMobileRuntime();
  const desktop = isDesktopFeaturesAvailable();

  async function handleClick() {
    setLoading(true);
    try {
      const result = await downloadTampermonkeyScript();
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      if (result.saved) {
        window.alert(
          mobile
            ? "Le script s'ouvre dans Firefox. Dans Tampermonkey : menu ⋮ → Installer depuis une URL (collez l'adresse affichée), ou enregistrez la page puis installez le fichier .user.js."
            : "Script enregistré. Ouvrez le fichier .user.js dans Tampermonkey pour l'installer.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const title = mobile
    ? "Userscript export JSON pour Firefox + Tampermonkey"
    : "Enregistrer le script userscript pour Tampermonkey";

  const label = header
    ? "Script"
    : inline
      ? "Script"
      : compact
        ? "Script Tampermonkey"
        : mobile
          ? "Installer le script"
          : desktop
            ? "Script Nautiljon"
            : "Script Nautiljon";

  return (
    <button
      type="button"
      className={`tampermonkey-download-btn${compact ? " tampermonkey-download-btn--compact" : ""}${inline ? " tampermonkey-download-btn--inline" : ""}${header ? " tampermonkey-download-btn--header app-nav-tampermonkey" : ""}`}
      title={title}
      aria-label={header ? title : undefined}
      disabled={loading}
      onClick={() => void handleClick()}
    >
      {loading ? (
        <Loader2 size={18} className="spin" aria-hidden />
      ) : (
        <Download size={18} aria-hidden />
      )}
      <span className={header ? "app-nav-link-label" : undefined}>{label}</span>
    </button>
  );
}
