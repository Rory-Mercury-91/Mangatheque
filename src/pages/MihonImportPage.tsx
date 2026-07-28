import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { NautiljonSearchModal } from "@/features/nautiljon/NautiljonSearchModal";
import { useDevMode } from "@/hooks/useDevMode";
import { armImportTargetContext } from "@/services/importContextService";
import {
  importMihonBackupFile,
  type MihonImportProgress,
  type MihonImportResult,
} from "@/services/mihon/mihonBackupImportService";
import {
  getMihonSourceIndexStats,
  refreshMihonSourceIndex,
} from "@/services/mihon/mihonSourceIndexService";
import { openExternalUrl } from "@/services/platform/linkService";
import {
  deletePendingMihonWorks,
  deleteWork,
  fetchWorksByEnrichmentStatus,
} from "@/services/workService";
import type { Work } from "@/types/database";
import { copyTextToClipboard } from "@/utils/clipboard";
import "@/components/common/ghostActionBtn.css";
import "./MihonImportPage.css";

/**
 * @description Sas d'import Mihon (mode dév) : backup → fiches pending → enrichissement Nautiljon.
 */
export function MihonImportPage() {
  const [devMode] = useDevMode();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Work[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [importing, setImporting] = useState(false);
  const [refreshingIndex, setRefreshingIndex] = useState(false);
  const [progress, setProgress] = useState<MihonImportProgress | null>(null);
  const [lastResult, setLastResult] = useState<MihonImportResult | null>(null);
  const [indexStats, setIndexStats] = useState<{
    total: number;
    lastFetchedAt: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [enrichWork, setEnrichWork] = useState<Work | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const reloadPending = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const rows = await fetchWorksByEnrichmentStatus("pending_mihon");
      setPending(rows);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger la file Mihon.",
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  const reloadIndexStats = useCallback(async () => {
    try {
      setIndexStats(await getMihonSourceIndexStats());
    } catch {
      setIndexStats(null);
    }
  }, []);

  useEffect(() => {
    if (!devMode) return;
    void reloadPending();
    void reloadIndexStats();
  }, [devMode, reloadPending, reloadIndexStats]);

  const skipDetails = useMemo(
    () => lastResult?.details.filter((d) => d.kind === "skip") ?? [],
    [lastResult],
  );
  const errorDetails = useMemo(
    () => lastResult?.details.filter((d) => d.kind === "error") ?? [],
    [lastResult],
  );

  /**
   * @description Lance l'import du fichier backup sélectionné.
   */
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setError(null);
    setLastResult(null);
    setProgress({
      total: 0,
      current: 0,
      created: 0,
      skipped: 0,
      errors: 0,
      item: "Préparation…",
    });

    try {
      const result = await importMihonBackupFile(file, setProgress);
      setLastResult(result);
      await reloadPending();
      await reloadIndexStats();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Import Mihon impossible.",
      );
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  /**
   * @description Met à jour l'index Keiyoushi des sources Mihon.
   */
  const handleRefreshIndex = async () => {
    setRefreshingIndex(true);
    setError(null);
    try {
      const { imported } = await refreshMihonSourceIndex();
      await reloadIndexStats();
      setCopyHint(`Index sources : ${imported} entrées`);
      window.setTimeout(() => setCopyHint(null), 2200);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Mise à jour de l'index Mihon impossible.",
      );
    } finally {
      setRefreshingIndex(false);
    }
  };

  /**
   * @description Copie l'UUID interne dans le presse-papiers.
   */
  const handleCopyId = async (workId: string) => {
    const ok = await copyTextToClipboard(workId);
    setCopyHint(ok ? "ID copié" : "Copie impossible");
    window.setTimeout(() => setCopyHint(null), 1600);
  };

  /**
   * @description Vide entièrement la file d'attente pending_mihon.
   */
  const handleResetQueue = async () => {
    if (pending.length === 0) return;
    const confirmed = window.confirm(
      `Réinitialiser le sas Mihon ?\n${pending.length} fiche${pending.length > 1 ? "s" : ""} en attente seront supprimées définitivement.\nLes séries déjà enrichies (bibliothèque) ne sont pas touchées.`,
    );
    if (!confirmed) return;

    setResetting(true);
    setError(null);
    try {
      const deleted = await deletePendingMihonWorks();
      setPending([]);
      setLastResult(null);
      setCopyHint(
        deleted > 0
          ? `Sas réinitialisé : ${deleted} fiche${deleted > 1 ? "s" : ""} supprimée${deleted > 1 ? "s" : ""}`
          : "Sas déjà vide",
      );
      window.setTimeout(() => setCopyHint(null), 2800);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Réinitialisation du sas impossible.",
      );
    } finally {
      setResetting(false);
    }
  };

  /**
   * @description Retire une fiche du sas (suppression définitive).
   */
  const handleDelete = async (work: Work) => {
    const confirmed = window.confirm(
      `Supprimer « ${work.title} » du sas Mihon ?\nCette fiche sera effacée de la bibliothèque.`,
    );
    if (!confirmed) return;

    setDeletingId(work.id);
    setError(null);
    try {
      await deleteWork(work.id, "Retrait du sas Mihon (import involontaire).");
      setPending((rows) => rows.filter((row) => row.id !== work.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Suppression impossible.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (!devMode) {
    return (
      <div className="mihon-import-page">
        <p className="mihon-import-hint" role="status">
          Activez le <strong>mode dév</strong> (Journal → Contrôle) pour accéder
          au sas d&apos;import Mihon.
        </p>
      </div>
    );
  }

  return (
    <div className="mihon-import-page">
      <header className="mihon-import-header">
        <div>
          <h1>Sas Mihon</h1>
          <p className="mihon-import-hint">
            Importez une sauvegarde Mihon (.tachibk). Les fiches restent ici
            jusqu&apos;à enrichissement Nautiljon. Utilisez le catalogue source
            pour vérifier, ou supprimez les imports involontaires.
          </p>
          {indexStats ? (
            <p className="mihon-import-index-stats">
              Index sources : {indexStats.total} entrée
              {indexStats.total > 1 ? "s" : ""}
              {indexStats.lastFetchedAt
                ? ` · maj ${new Date(indexStats.lastFetchedAt).toLocaleString("fr-FR")}`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="mihon-import-actions">
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".tachibk,.gz,application/gzip,application/octet-stream"
            hidden
            disabled={importing}
            onChange={(e) => void handleFileChange(e)}
          />
          <button
            type="button"
            className="ghost-action-btn"
            disabled={importing || refreshingIndex}
            onClick={() => void handleRefreshIndex()}
          >
            {refreshingIndex ? "Index…" : "MAJ index sources"}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? "Import…" : "Importer un backup"}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={importing || loadingList}
            onClick={() => void reloadPending()}
          >
            Actualiser
          </button>
          <button
            type="button"
            className="ghost-action-btn mihon-import-delete"
            disabled={
              importing ||
              resetting ||
              loadingList ||
              pending.length === 0
            }
            onClick={() => void handleResetQueue()}
          >
            {resetting ? "Réinit…" : "Réinitialiser"}
          </button>
        </div>
      </header>

      {error ? (
        <p className="mihon-import-error" role="alert">
          {error}
        </p>
      ) : null}
      {copyHint ? (
        <p className="mihon-import-info" role="status">
          {copyHint}
        </p>
      ) : null}

      {progress ? (
        <div className="mihon-import-progress" role="status">
          <p>
            {progress.current}/{progress.total || "…"} — {progress.item}
          </p>
          <p className="mihon-import-progress-stats">
            Créés {progress.created} · Ignorés {progress.skipped} · Erreurs{" "}
            {progress.errors}
          </p>
          {progress.total > 0 ? (
            <div className="mihon-import-progress-bar">
              <span
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((progress.current / progress.total) * 100),
                  )}%`,
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {lastResult && !progress ? (
        <div className="mihon-import-result" role="status">
          <div className="mihon-import-result-head">
            <p>
              Dernier import terminé :{" "}
              <strong>{lastResult.created}</strong> créées ·{" "}
              <strong>{lastResult.skipped}</strong> ignorées ·{" "}
              <strong>{lastResult.errors}</strong> erreurs
              {" "}sur {lastResult.total}
            </p>
            <button
              type="button"
              className="ghost-action-btn"
              onClick={() => setLastResult(null)}
            >
              Fermer
            </button>
          </div>
          <p className="mihon-import-progress-stats">
            {lastResult.withMalId} avec MAL · {lastResult.withoutTrackerIds} sans
            ID tracker · {lastResult.withCatalogUrl} avec URL catalogue
          </p>
          {errorDetails.length > 0 ? (
            <details className="mihon-import-details mihon-import-details--error">
              <summary>Erreurs ({errorDetails.length})</summary>
              <ul>
                {errorDetails.slice(0, 100).map((row, index) => (
                  <li key={`err-${row.title}-${index}`}>
                    <strong>{row.title}</strong> — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {skipDetails.length > 0 ? (
            <details className="mihon-import-details">
              <summary>Ignorées — déjà en bibliothèque ({skipDetails.length})</summary>
              <ul>
                {skipDetails.slice(0, 100).map((row, index) => (
                  <li key={`skip-${row.title}-${index}`}>
                    <strong>{row.title}</strong> — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="mihon-import-list-head">
        <h2>
          File d&apos;attente
          {!loadingList ? ` (${pending.length})` : ""}
        </h2>
      </div>

      {loadingList ? (
        <LoadingOverlayHost compact>
          <LoadingOverlay message="Chargement de la file…" />
        </LoadingOverlayHost>
      ) : null}

      {!loadingList && pending.length === 0 ? (
        <p className="mihon-import-hint">
          Aucune fiche en attente d&apos;enrichissement.
        </p>
      ) : null}

      {!loadingList && pending.length > 0 ? (
        <ul className="mihon-import-list">
          {pending.map((work) => {
            const catalogUrl = work.mihon_catalog_url?.trim() || null;
            return (
              <li key={work.id} className="mihon-import-row">
                <span className="mihon-import-cover" aria-hidden>
                  <CoverImage
                    url={work.cover_url}
                    alt={work.title}
                    variant="tile"
                  />
                </span>
                <div className="mihon-import-meta">
                  <Link to={`/work/${work.id}`} className="mihon-import-title">
                    {work.title}
                  </Link>
                  <span className="mihon-import-ids">
                    {work.mal_id != null ? `MAL ${work.mal_id}` : "Sans MAL"}
                    {" · "}
                    {work.anilist_id != null
                      ? `AniList ${work.anilist_id}`
                      : "Sans AniList"}
                    {work.mihon_source_name
                      ? ` · ${work.mihon_source_name}`
                      : work.mihon_source_id
                        ? ` · source ${work.mihon_source_id}`
                        : ""}
                  </span>
                  <code className="mihon-import-uuid" title="ID interne">
                    {work.id}
                  </code>
                </div>
                <div className="mihon-import-row-actions">
                  {catalogUrl ? (
                    <button
                      type="button"
                      className="ghost-action-btn"
                      title={catalogUrl}
                      onClick={() => void openExternalUrl(catalogUrl)}
                    >
                      Ouvrir catalogue
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost-action-btn"
                    onClick={() => void handleCopyId(work.id)}
                  >
                    Copier ID
                  </button>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    onClick={() => setEnrichWork(work)}
                  >
                    Enrichir Nautiljon
                  </button>
                  <button
                    type="button"
                    className="ghost-action-btn mihon-import-delete"
                    disabled={deletingId === work.id}
                    onClick={() => void handleDelete(work)}
                  >
                    {deletingId === work.id ? "Suppression…" : "Supprimer"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <NautiljonSearchModal
        open={Boolean(enrichWork)}
        initialQuery={enrichWork?.title?.trim() || ""}
        initialKind="manga"
        lockKind
        contextLabel={enrichWork?.title ?? null}
        handoffOnSelect
        onClose={() => setEnrichWork(null)}
        onSelect={async (hit) => {
          if (!enrichWork) return;
          await armImportTargetContext({
            workId: enrichWork.id,
            sourceUrl: hit.pageUrl,
            title: enrichWork.title,
          });
          await openExternalUrl(hit.pageUrl);
          setEnrichWork(null);
        }}
      />
    </div>
  );
}
