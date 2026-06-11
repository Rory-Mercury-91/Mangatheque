import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { isDesktopFeaturesAvailable } from "@/lib/appLifecycle";
import { downloadTampermonkeyScript } from "@/services/tampermonkeyDownloadService";
import "./TampermonkeyDownloadButton.css";

type TampermonkeyDownloadButtonProps = {
  compact?: boolean;
};

/**
 * @description Bouton d'enregistrement du script Tampermonkey (dialogue « Enregistrer sous »).
 */
export function TampermonkeyDownloadButton({
  compact = false,
}: TampermonkeyDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  if (!isDesktopFeaturesAvailable()) {
    return null;
  }

  async function handleClick() {
    setLoading(true);
    try {
      const result = await downloadTampermonkeyScript();
      if (!result.ok) {
        window.alert(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={`tampermonkey-download-btn${compact ? " tampermonkey-download-btn--compact" : ""}`}
      title="Enregistrer le script userscript pour Tampermonkey"
      disabled={loading}
      onClick={() => void handleClick()}
    >
      {loading ? (
        <Loader2 size={18} className="spin" aria-hidden />
      ) : (
        <Download size={18} aria-hidden />
      )}
      {compact ? "Script Tampermonkey" : "Script Nautiljon"}
    </button>
  );
}
