import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { isDesktopFeaturesAvailable } from "@/lib/appLifecycle";
import { isMobileRuntime } from "@/lib/platform";
import { downloadTampermonkeyScript } from "@/services/tampermonkeyDownloadService";
import "./TampermonkeyDownloadButton.css";

type TampermonkeyDownloadButtonProps = {
  compact?: boolean;
};

/**
 * @description Télécharge le userscript Nautiljon (import direct desktop, export JSON mobile).
 */
export function TampermonkeyDownloadButton({
  compact = false,
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

  const label = compact
    ? mobile
      ? "Script Tampermonkey"
      : "Script Tampermonkey"
    : mobile
      ? "Installer le script"
      : desktop
        ? "Script Nautiljon"
        : "Script Nautiljon";

  return (
    <button
      type="button"
      className={`tampermonkey-download-btn${compact ? " tampermonkey-download-btn--compact" : ""}`}
      title={
        mobile
          ? "Userscript export JSON pour Firefox + Tampermonkey"
          : "Enregistrer le script userscript pour Tampermonkey"
      }
      disabled={loading}
      onClick={() => void handleClick()}
    >
      {loading ? (
        <Loader2 size={18} className="spin" aria-hidden />
      ) : (
        <Download size={18} aria-hidden />
      )}
      {label}
    </button>
  );
}
