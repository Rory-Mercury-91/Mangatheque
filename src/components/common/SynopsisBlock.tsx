import { Languages } from "lucide-react";
import { useSynopsisTranslation } from "@/hooks/useSynopsisTranslation";
import "@/components/common/ghostActionBtn.css";
import "./SynopsisBlock.css";

type SynopsisBlockProps = {
  synopsis: string | null | undefined;
  /** Autotraduction si le synopsis ne semble pas français (animés MAL). */
  autoTranslate?: boolean;
  /** Persiste le résultat (nettoyage / traduction) en base. */
  onPersist?: (text: string) => Promise<void>;
};

/**
 * @description Affiche un synopsis nettoyé avec bouton de traduction Google.
 */
export function SynopsisBlock({
  synopsis,
  autoTranslate = false,
  onPersist,
}: SynopsisBlockProps) {
  const { displayText, translating, error, translate, canTranslate } =
    useSynopsisTranslation({ synopsis, autoTranslate, onPersist });

  if (!displayText && !translating) {
    return null;
  }

  return (
    <section
      className="work-detail-synopsis-block"
      aria-labelledby="work-detail-synopsis-heading"
    >
      <div className="synopsis-block-header">
        <h2 id="work-detail-synopsis-heading" className="work-detail-synopsis-label">
          Synopsis
        </h2>
        {canTranslate ? (
          <button
            type="button"
            className="ghost-action-btn synopsis-translate-btn"
            onClick={() => void translate()}
            disabled={translating}
            title="Traduire en français"
            aria-label="Traduire le synopsis en français"
          >
            <Languages size={16} aria-hidden />
            <span className="ghost-action-label">
              {translating ? "Traduction…" : "Traduire"}
            </span>
          </button>
        ) : null}
      </div>
      {translating && !displayText ? (
        <p className="work-detail-synopsis synopsis-block-pending">
          Traduction en cours…
        </p>
      ) : (
        <p className="work-detail-synopsis">{displayText}</p>
      )}
      {error ? <p className="synopsis-block-error">{error}</p> : null}
    </section>
  );
}
