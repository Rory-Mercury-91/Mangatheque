import { useEffect, useState } from "react";
import { CoverImage } from "@/components/common/CoverImage";
import { FormModalCancelButton } from "@/components/common/FormModalActions";
import { Modal } from "@/components/common/Modal";
import type { AdkamiSearchHit } from "@/utils/adkamiSearchParser";
import { formatAdkamiSearchHitLabel } from "@/services/adkamiSearchService";
import { buildAdkamiSearchPageUrl } from "@/services/adkamiSearchService";
import { openExternalUrl } from "@/services/platform/linkService";
import { parseAdkamiUrl } from "@/utils/animeExternalLinks";
import "@/features/works/WorkFormModal.css";
import "@/components/common/ghostActionBtn.css";
import "./AdkamiSearchPickerModal.css";

export interface AdkamiSearchPickerModalProps {
  open: boolean;
  query: string;
  hits: AdkamiSearchHit[];
  /** Libellé de la fiche bibliothèque concernée. */
  animeLabel?: string | null;
  onClose: () => void;
  /**
   * Sélection d'un hit (ou ID saisi manuellement via hit synthétique).
   * L'appelant enchaîne en général sur l'attribution des saisons.
   */
  onSelect: (hit: AdkamiSearchHit) => void;
}

/**
 * @description Modale de choix ADKami → enchaîne ensuite sur l'attribution des saisons.
 */
export function AdkamiSearchPickerModal({
  open,
  query,
  hits,
  animeLabel = null,
  onClose,
  onSelect,
}: AdkamiSearchPickerModalProps) {
  const [manualId, setManualId] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setManualId("");
    setManualError(null);
  }, [open, query]);

  const handleManualApply = () => {
    const raw = manualId.trim();
    if (!raw) {
      setManualError("Saisissez un ID ou une URL ADKami.");
      return;
    }
    const parsed = parseAdkamiUrl(raw);
    if (parsed) {
      onSelect({
        adkamiId: parsed.adkamiId,
        section: parsed.section,
        title: `ID ${parsed.adkamiId} (saisie manuelle)`,
        episodeCount: null,
        seasonHint: null,
        year: null,
        coverUrl: null,
        pageUrl: `https://www.adkami.com/${parsed.section}/${parsed.adkamiId}`,
      });
      return;
    }
    if (/^\d+$/.test(raw)) {
      const id = Number(raw);
      onSelect({
        adkamiId: id,
        section: "anime",
        title: `ID ${id} (saisie manuelle)`,
        episodeCount: null,
        seasonHint: null,
        year: null,
        coverUrl: null,
        pageUrl: `https://www.adkami.com/anime/${id}`,
      });
      return;
    }
    setManualError("ID ou URL ADKami invalide.");
  };

  return (
    <Modal
      open={open}
      title="Choisir la fiche ADKami"
      onClose={onClose}
      wide
      footer={<FormModalCancelButton onClick={onClose} />}
    >
      <div className="adkami-search-picker">
        <p className="adkami-search-picker-hint">
          {animeLabel ? (
            <>
              Fiche : <strong>{animeLabel}</strong>
              <br />
            </>
          ) : null}
          Recherche : <strong>{query || "—"}</strong>
          {" · "}
          {hits.length} résultat{hits.length > 1 ? "s" : ""}.
          Après validation, l&apos;attribution des saisons s&apos;ouvre
          automatiquement (plages Partie 1 / 2, digressions…).
        </p>

        {hits.length === 0 ? (
          <p className="adkami-search-picker-empty" role="status">
            Aucun résultat automatique — saisissez l&apos;ID manuellement ou
            ouvrez la recherche ADKami.
          </p>
        ) : (
          <ul className="adkami-search-picker-list">
            {hits.map((hit) => (
              <li key={hit.adkamiId}>
                <button
                  type="button"
                  className="adkami-search-picker-row"
                  onClick={() => onSelect(hit)}
                >
                  <span className="adkami-search-picker-cover" aria-hidden>
                    <CoverImage
                      url={hit.coverUrl}
                      alt={hit.title}
                      variant="tile"
                    />
                  </span>
                  <span className="adkami-search-picker-meta">
                    <strong>{hit.title}</strong>
                    <span>{formatAdkamiSearchHitLabel(hit)}</span>
                    {hit.seasonHint != null && hit.seasonHint > 1 ? (
                      <span className="adkami-search-picker-seasons">
                        ~{hit.seasonHint} saison(s) ADKami
                      </span>
                    ) : null}
                    <span className="adkami-search-picker-cta">
                      Lier et attribuer les saisons →
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="adkami-search-picker-manual">
          <p>
            Ce n&apos;est pas le bon résultat ? Indiquez l&apos;ID ADKami
            (ou une URL) puis validez pour ouvrir l&apos;attribution.
          </p>
          <div className="adkami-search-picker-manual-row">
            <label className="form-field">
              <span>ID / URL ADKami</span>
              <input
                type="text"
                value={manualId}
                onChange={(e) => {
                  setManualId(e.target.value);
                  setManualError(null);
                }}
                placeholder="4161 ou https://www.adkami.com/anime/4161"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleManualApply();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="ghost-action-btn"
              onClick={handleManualApply}
            >
              Valider → saisons
            </button>
          </div>
          {manualError ? (
            <p className="adkami-search-picker-error" role="alert">
              {manualError}
            </p>
          ) : null}
          {query.trim() ? (
            <button
              type="button"
              className="ghost-action-btn adkami-search-picker-browser"
              onClick={() =>
                void openExternalUrl(buildAdkamiSearchPageUrl(query))
              }
            >
              Ouvrir la recherche dans le navigateur
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
