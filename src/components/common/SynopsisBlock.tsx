import { Languages } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSynopsisTranslation } from "@/hooks/useSynopsisTranslation";
import "@/components/common/ghostActionBtn.css";
import "./SynopsisBlock.css";

type SynopsisBlockProps = {
  synopsis: string | null | undefined;
  /** Autotraduction si le synopsis ne semble pas français (animés MAL). */
  autoTranslate?: boolean;
  /** Persiste le résultat (nettoyage / traduction) en base. */
  onPersist?: (text: string) => Promise<void>;
  /**
   * Replie le texte (≈ 3 lignes) avec « Voir plus » si trop long.
   */
  collapsible?: boolean;
  /** Identifiant d'ancre pour la navigation de fiche. */
  sectionId?: string;
};

/**
 * @description Affiche un synopsis nettoyé avec bouton de traduction Google.
 */
export function SynopsisBlock({
  synopsis,
  autoTranslate = false,
  onPersist,
  collapsible = false,
  sectionId = "work-detail-synopsis",
}: SynopsisBlockProps) {
  const { displayText, translating, error, translate, canTranslate } =
    useSynopsisTranslation({ synopsis, autoTranslate, onPersist });
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [displayText]);

  useLayoutEffect(() => {
    if (!collapsible || !displayText) {
      setShowToggle(false);
      return;
    }
    if (expanded) {
      setShowToggle(true);
      return;
    }
    const el = textRef.current;
    if (!el) {
      setShowToggle(false);
      return;
    }
    setShowToggle(el.scrollHeight > el.clientHeight + 1);
  }, [collapsible, displayText, expanded, translating]);

  if (!displayText && !translating) {
    return null;
  }

  return (
    <section
      id={sectionId}
      className="work-detail-synopsis-block work-detail-section"
      aria-labelledby="work-detail-synopsis-heading"
    >
      <div className="work-detail-section-header synopsis-block-header">
        <div className="work-detail-section-header-main">
          <h2 id="work-detail-synopsis-heading">Synopsis</h2>
        </div>
        {canTranslate ? (
          <div className="work-detail-section-actions">
            <button
              type="button"
              className="ghost-action-btn"
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
          </div>
        ) : null}
      </div>
      {translating && !displayText ? (
        <p className="work-detail-synopsis synopsis-block-pending">
          Traduction en cours…
        </p>
      ) : (
        <p
          ref={textRef}
          className={`work-detail-synopsis${
            collapsible && !expanded ? " is-collapsed" : ""
          }`}
        >
          {displayText}
        </p>
      )}
      {collapsible && showToggle ? (
        <button
          type="button"
          className="synopsis-block-toggle"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Réduire" : "Voir plus"}
        </button>
      ) : null}
      {error ? <p className="synopsis-block-error">{error}</p> : null}
    </section>
  );
}
