import { useEffect, useState } from "react";
import { CoverImage } from "@/components/common/CoverImage";
import { FormModalCancelButton } from "@/components/common/FormModalActions";
import { Modal } from "@/components/common/Modal";
import { isDesktopRuntime, isTauriRuntime } from "@/lib/platform";
import { openExternalUrl } from "@/services/platform/linkService";
import {
  buildNautiljonWebSearchUrl,
  formatNautiljonSearchHitLabel,
  searchNautiljon,
  type NautiljonSearchHit,
  type NautiljonSearchKind,
} from "@/services/nautiljonSearchService";
import { copyTextToClipboard } from "@/utils/clipboard";
import "@/features/works/WorkFormModal.css";
import "@/components/common/ghostActionBtn.css";
import "./NautiljonSearchModal.css";

export interface NautiljonSearchModalProps {
  open: boolean;
  /** Requête initiale (titre de la fiche). */
  initialQuery?: string;
  /** Catalogue par défaut. */
  initialKind?: NautiljonSearchKind;
  /** Si true, le type manga/anime n'est pas modifiable. */
  lockKind?: boolean;
  /** Libellé contexte (fiche bibliothèque). */
  contextLabel?: string | null;
  onClose: () => void;
  /**
   * Sélection d'une fiche (URL + métadonnées).
   * Peut être async — la modale affiche alors un état de chargement.
   * Si omis, la modale se comporte en mode « aperçu » (copie / navigateur).
   */
  onSelect?: (hit: NautiljonSearchHit) => void | Promise<void>;
  /**
   * Si true, le CTA indique l'ouverture navigateur + handoff Tampermonkey
   * (pas de scrap in-app).
   */
  handoffOnSelect?: boolean;
}

/**
 * @description Modale de recherche Nautiljon (index web → fiches).
 */
export function NautiljonSearchModal({
  open,
  initialQuery = "",
  initialKind = "manga",
  lockKind = false,
  contextLabel = null,
  onClose,
  onSelect,
  handoffOnSelect = false,
}: NautiljonSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<NautiljonSearchKind>(initialKind);
  const [hits, setHits] = useState<NautiljonSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const canSearch = isTauriRuntime();

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setKind(initialKind);
    setHits([]);
    setError(null);
    setInfo(null);
    setCopyHint(null);
    setLoading(false);
    setImporting(false);
    setImportError(null);

    const seed = initialQuery.trim();
    if (!seed || !isTauriRuntime()) return;

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const results = await searchNautiljon(seed, initialKind);
        if (cancelled) return;
        setHits(results);
        setInfo(
          results.length === 0
            ? "Aucun résultat Nautiljon pour cette requête."
            : `${results.length} résultat${results.length > 1 ? "s" : ""} (classés par pertinence). Choisissez la bonne fiche.`,
        );
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Recherche Nautiljon impossible.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialQuery, initialKind]);

  /**
   * @description Lance la recherche Nautiljon via index web (DuckDuckGo).
   */
  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Saisissez un titre à rechercher.");
      return;
    }
    if (!canSearch) {
      setError("Disponible uniquement dans l'application native.");
      return;
    }

    setLoading(true);
    setError(null);
    setImportError(null);
    setInfo(null);
    setHits([]);
    try {
      const results = await searchNautiljon(trimmed, kind);
      setHits(results);
      setInfo(
        results.length === 0
          ? "Aucun résultat Nautiljon pour cette requête."
          : `${results.length} résultat${results.length > 1 ? "s" : ""} (classés par pertinence). Choisissez la bonne fiche.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Recherche Nautiljon impossible.",
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * @description Copie l'URL et affiche un retour court.
   */
  const handleCopy = async (url: string) => {
    const ok = await copyTextToClipboard(url);
    setCopyHint(ok ? "URL copiée" : "Impossible de copier");
    window.setTimeout(() => setCopyHint(null), 1600);
  };

  /**
   * @description Sélection / import d'une fiche (avec retour visuel).
   */
  const handleSelect = async (hit: NautiljonSearchHit) => {
    if (!onSelect) {
      void handleCopy(hit.pageUrl);
      return;
    }
    if (importing || loading) return;

    setImporting(true);
    setImportError(null);
    setInfo(
      handoffOnSelect
        ? isDesktopRuntime()
          ? `Ouverture de « ${hit.title} »… L'ID de votre fiche sera joint à l'import Tampermonkey.`
          : `Ouverture de « ${hit.title} »…`
        : `Liaison de « ${hit.title} »…`,
    );
    try {
      await Promise.resolve(onSelect(hit));
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : "Ouverture Nautiljon impossible.",
      );
      setInfo(null);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Recherche Nautiljon"
      onClose={() => {
        if (!importing) onClose();
      }}
      wide
      stacked
      footer={<FormModalCancelButton onClick={onClose} disabled={importing} />}
    >
      <div className="nautiljon-search">
        {contextLabel ? (
          <p className="nautiljon-search-hint">
            Fiche : <strong>{contextLabel}</strong>
          </p>
        ) : null}
        {handoffOnSelect ? (
          <p className="nautiljon-search-hint">
            {isDesktopRuntime()
              ? "Cliquez une fiche pour ouvrir Nautiljon dans le navigateur. Lancez ensuite le script Tampermonkey : l'ID Mangathèque est joint automatiquement à l'import."
              : "Cliquez une fiche pour ouvrir Nautiljon dans le navigateur."}
          </p>
        ) : null}

        <div className="nautiljon-search-form">
          {!lockKind ? (
            <div className="nautiljon-search-kinds" role="group" aria-label="Type">
              <button
                type="button"
                className={
                  kind === "manga"
                    ? "nautiljon-search-kind is-active"
                    : "nautiljon-search-kind"
                }
                disabled={loading || importing}
                onClick={() => setKind("manga")}
              >
                Mangas
              </button>
              <button
                type="button"
                className={
                  kind === "anime"
                    ? "nautiljon-search-kind is-active"
                    : "nautiljon-search-kind"
                }
                disabled={loading || importing}
                onClick={() => setKind("anime")}
              >
                Animes
              </button>
            </div>
          ) : (
            <p className="nautiljon-search-hint">
              Catalogue :{" "}
              <strong>{kind === "anime" ? "Animes" : "Mangas"}</strong>
            </p>
          )}

          <div className="nautiljon-search-query-row">
            <label className="form-field">
              <span>Titre</span>
              <input
                type="text"
                value={query}
                disabled={loading || importing}
                placeholder="ex. Absolute Regression"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="ghost-action-btn"
              disabled={loading || importing || !canSearch}
              onClick={() => void runSearch()}
            >
              {loading ? "Recherche…" : "Rechercher"}
            </button>
          </div>
        </div>

        {!canSearch ? (
          <p className="nautiljon-search-error" role="status">
            Disponible uniquement dans l&apos;application native.
          </p>
        ) : null}
        {error ? (
          <p className="nautiljon-search-error" role="alert">
            {error}
          </p>
        ) : null}
        {importError ? (
          <p className="nautiljon-search-error" role="alert">
            {importError}
          </p>
        ) : null}
        {info && !error ? (
          <p className="nautiljon-search-info" role="status">
            {info}
          </p>
        ) : null}
        {copyHint ? (
          <p className="nautiljon-search-info" role="status">
            {copyHint}
          </p>
        ) : null}

        {hits.length > 0 ? (
          <ul className="nautiljon-search-list">
            {hits.map((hit, index) => (
              <li key={`${hit.kind}-${hit.slug}-${index}`}>
                <div className="nautiljon-search-row">
                  <button
                    type="button"
                    className="nautiljon-search-main"
                    disabled={importing || loading}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleSelect(hit);
                    }}
                    title={
                      onSelect
                        ? handoffOnSelect
                          ? "Ouvrir Nautiljon et préparer l'import Tampermonkey"
                          : "Utiliser cette fiche"
                        : "Copier l'URL de la fiche"
                    }
                  >
                    <span className="nautiljon-search-cover" aria-hidden>
                      <CoverImage
                        url={hit.coverUrl}
                        alt={hit.title}
                        variant="tile"
                      />
                    </span>
                    <span className="nautiljon-search-meta">
                      <strong>{hit.title}</strong>
                      <span>{formatNautiljonSearchHitLabel(hit)}</span>
                      {hit.description ? (
                        <span className="nautiljon-search-desc">
                          {hit.description}
                        </span>
                      ) : null}
                      <span className="nautiljon-search-cta">
                        {importing
                          ? "Ouverture…"
                          : onSelect
                            ? handoffOnSelect
                              ? "Ouvrir + Tampermonkey →"
                              : "Utiliser cette fiche →"
                            : "Copier l'URL →"}
                      </span>
                    </span>
                  </button>
                  <div className="nautiljon-search-side">
                    <button
                      type="button"
                      className="ghost-action-btn"
                      title="Copier l'URL"
                      disabled={importing}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleCopy(hit.pageUrl);
                      }}
                    >
                      Copier
                    </button>
                    <button
                      type="button"
                      className="ghost-action-btn"
                      title="Ouvrir dans le navigateur"
                      disabled={importing}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void openExternalUrl(hit.pageUrl);
                      }}
                    >
                      Ouvrir
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {query.trim() ? (
          <button
            type="button"
            className="ghost-action-btn nautiljon-search-browser"
            disabled={importing}
            onClick={() =>
              void openExternalUrl(buildNautiljonWebSearchUrl(query, kind))
            }
          >
            Ouvrir la recherche dans le navigateur
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
