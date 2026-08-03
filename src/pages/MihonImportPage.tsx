import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  ExternalLink,
  FileJson,
  FileUp,
  Link2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
} from "lucide-react";
import { CoverImage } from "@/components/common/CoverImage";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { NautiljonSearchModal } from "@/features/nautiljon/NautiljonSearchModal";
import { NautiljonImportOptionsModal } from "@/features/nautiljon/NautiljonImportOptionsModal";
import { useDevMode } from "@/hooks/useDevMode";
import { useOwners } from "@/hooks/useOwners";
import { isMobileRuntime } from "@/lib/platform";
import { armImportTargetContext } from "@/services/importContextService";
import {
  importMihonBackupFile,
  type MihonImportProgress,
  type MihonImportResult,
} from "@/services/mihon/mihonBackupImportService";
import {
  enrichPendingMihonFromScrapeJson,
  enrichWorkFromScrapePayloads,
} from "@/services/mihon/mihonEnrichFromJsonService";
import { promotePendingMihonToLibrary } from "@/services/mihon/mihonPromoteService";
import {
  getMihonSourceIndexStats,
  fetchMihonSourceMap,
  refreshMihonSourceIndex,
  backfillMihonSourceNamesFromIndex,
} from "@/services/mihon/mihonSourceIndexService";
import { resolvePendingMihonTrackerIds } from "@/services/mihon/mihonTrackerResolveService";
import { resolvePendingMihonTitlesViaJikan } from "@/services/mihon/mihonTitleResolveService";
import {
  fetchWorkMihonSourcesByWorkIds,
  type WorkMihonSource,
} from "@/services/mihon/workMihonSourceService";
import { browseNautiljonScrapePayload, enrichNautiljonVolumeDetails } from "@/services/nautiljonSearchService";
import {
  canUseGuidedNautiljonWebview,
  closeNautiljonBrowseWindow,
  openCatalogLink,
} from "@/services/platform/linkService";
import {
  applyNautiljonImportOptionsToPayload,
  type NautiljonImportOptions,
} from "@/utils/nautiljonImportOptions";
import { buildNautiljonSearchUrl } from "@/utils/nautiljonSearchParser";
import type { ScrapePayloadV1, Work } from "@/types/database";
import {
  deletePickedJsonFile,
  pickJsonFile,
} from "@/services/platform/jsonFilePickService";
import {
  isTrackerSyncBusy,
  runExclusiveTrackerSync,
  TrackerSyncBusyError,
} from "@/services/tracker/trackerAutoSync";
import {
  deletePendingMihonWorks,
  deleteWork,
  fetchWorksByEnrichmentStatus,
} from "@/services/workService";
import { copyTextToClipboard } from "@/utils/clipboard";
import { formatMihonSourceDisplay, toMihonSourceNameMap } from "@/utils/mihonSourceDisplay";
import { matchesNormalizedSearch } from "@/utils/textNormalize";
import "@/components/common/ghostActionBtn.css";
import "./MihonImportPage.css";

type MihonQuickFilter =
  | "all"
  | "sans-mal"
  | "avec-mal"
  | "sans-anilist"
  | "avec-anilist";

/**
 * @description Sas d'import Mihon (mode dév) : backup → fiches pending → enrichissement Nautiljon.
 */
export function MihonImportPage() {
  const navigate = useNavigate();
  const [devMode] = useDevMode();
  const { owners } = useOwners();
  const mobile = isMobileRuntime();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Work[]>([]);
  const [sourcesByWorkId, setSourcesByWorkId] = useState<
    Map<string, WorkMihonSource[]>
  >(new Map());
  const [knownSourceNames, setKnownSourceNames] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
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
  const [lastEnriched, setLastEnriched] = useState<{
    workId: string;
    title: string;
  } | null>(null);
  const [enrichWork, setEnrichWork] = useState<Work | null>(null);
  const [nautiljonOptionsOpen, setNautiljonOptionsOpen] = useState(false);
  const [nautiljonEnrichProgress, setNautiljonEnrichProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [nautiljonPendingPayload, setNautiljonPendingPayload] =
    useState<ScrapePayloadV1 | null>(null);
  const [nautiljonPendingWorkId, setNautiljonPendingWorkId] = useState<
    string | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [quickFilter, setQuickFilter] = useState<MihonQuickFilter>("all");
  const [sourceFilterId, setSourceFilterId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [jsonImportingId, setJsonImportingId] = useState<string | null>(null);
  const [resolvingTrackers, setResolvingTrackers] = useState(false);
  const [resolvingTitles, setResolvingTitles] = useState(false);

  const reloadPending = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const rows = await fetchWorksByEnrichmentStatus("pending_mihon");
      setPending(rows);
      try {
        const sources = await fetchWorkMihonSourcesByWorkIds(
          rows.map((row) => row.id),
        );
        setSourcesByWorkId(sources);
      } catch (sourcesErr) {
        console.warn(
          "Sources Mihon multi non chargées :",
          sourcesErr instanceof Error ? sourcesErr.message : sourcesErr,
        );
        setSourcesByWorkId(new Map());
      }
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
      const map = await fetchMihonSourceMap();
      setKnownSourceNames(toMihonSourceNameMap(map));
    } catch {
      setIndexStats(null);
      setKnownSourceNames(new Map());
    }
  }, []);

  useEffect(() => {
    if (!devMode) return;
    void reloadPending();
    void reloadIndexStats();
  }, [devMode, reloadPending, reloadIndexStats]);

  /**
   * @description Sources présentes dans la file (pour le select de filtre).
   */
  const sourceFilterOptions = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; label: string; count: number }
    >();

    const bump = (
      sourceId: string | null | undefined,
      sourceName: string | null | undefined,
    ) => {
      const id = sourceId?.trim() || "";
      if (!id) return;
      const display = formatMihonSourceDisplay(id, sourceName, knownSourceNames);
      const existing = byId.get(id);
      if (existing) {
        existing.count += 1;
        return;
      }
      byId.set(id, { id, label: display.label, count: 1 });
    };

    for (const work of pending) {
      const sources = sourcesByWorkId.get(work.id) ?? [];
      if (sources.length > 0) {
        for (const source of sources) {
          bump(source.sourceId, source.sourceName);
        }
      } else {
        bump(work.mihon_source_id, work.mihon_source_name);
      }
    }

    return [...byId.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "fr", { sensitivity: "base" }),
    );
  }, [pending, sourcesByWorkId, knownSourceNames]);

  // Si la source filtrée disparaît de la file, revenir à « Toutes ».
  useEffect(() => {
    if (!sourceFilterId) return;
    if (sourceFilterOptions.some((option) => option.id === sourceFilterId)) {
      return;
    }
    setSourceFilterId("");
  }, [sourceFilterId, sourceFilterOptions]);

  const filteredPending = useMemo(() => {
    let rows = pending;
    switch (quickFilter) {
      case "sans-mal":
        rows = rows.filter((work) => work.mal_id == null);
        break;
      case "avec-mal":
        rows = rows.filter((work) => work.mal_id != null);
        break;
      case "sans-anilist":
        rows = rows.filter((work) => work.anilist_id == null);
        break;
      case "avec-anilist":
        rows = rows.filter((work) => work.anilist_id != null);
        break;
      default:
        break;
    }

    if (sourceFilterId) {
      rows = rows.filter((work) => {
        const sources = sourcesByWorkId.get(work.id) ?? [];
        if (sources.length > 0) {
          return sources.some(
            (source) => source.sourceId.trim() === sourceFilterId,
          );
        }
        return (work.mihon_source_id ?? "").trim() === sourceFilterId;
      });
    }

    const query = searchQuery.trim();
    if (!query) {
      return rows;
    }
    return rows.filter((work) => {
      const sources = sourcesByWorkId.get(work.id) ?? [];
      const sourceLabels = sources.flatMap((source) => [
        source.sourceName,
        source.sourceId,
      ]);
      return matchesNormalizedSearch(
        [
          work.title,
          work.mihon_source_name,
          work.mihon_source_id,
          work.mal_id != null ? String(work.mal_id) : null,
          work.anilist_id != null ? String(work.anilist_id) : null,
          work.id,
          ...sourceLabels,
        ],
        query,
      );
    });
  }, [
    pending,
    quickFilter,
    sourceFilterId,
    searchQuery,
    sourcesByWorkId,
  ]);

  const skipDetails = useMemo(
    () => lastResult?.details.filter((d) => d.kind === "skip") ?? [],
    [lastResult],
  );
  const attachDetails = useMemo(
    () => lastResult?.details.filter((d) => d.kind === "attach") ?? [],
    [lastResult],
  );
  const errorDetails = useMemo(
    () => lastResult?.details.filter((d) => d.kind === "error") ?? [],
    [lastResult],
  );

  const missingTrackerCount = useMemo(
    () =>
      pending.filter(
        (work) =>
          (work.mal_id != null && work.anilist_id == null) ||
          (work.anilist_id != null && work.mal_id == null),
      ).length,
    [pending],
  );

  const missingBothTrackerCount = useMemo(
    () =>
      pending.filter(
        (work) => work.mal_id == null && work.anilist_id == null,
      ).length,
    [pending],
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
      attached: 0,
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
   * @description Ouvre un JSON Nautiljon et enrichit la fiche pending ciblée.
   * Sur desktop Tauri, le fichier source est supprimé après succès.
   */
  const handleAttachJsonClick = async (workId: string) => {
    setError(null);
    const picked = await pickJsonFile();
    if (!picked) return;

    setJsonImportingId(workId);
    try {
      const result = await enrichPendingMihonFromScrapeJson(
        workId,
        picked.text,
        owners,
      );
      const deleted = await deletePickedJsonFile(picked.path);
      await reloadPending();
      setLastEnriched({ workId: result.workId, title: result.title });
      const baseHint = result.clearedFromSas
        ? `« ${result.title} » enrichie et sortie du sas`
        : `« ${result.title} » enrichie (toujours en attente)`;
      setCopyHint(
        deleted
          ? `${baseHint} — fichier JSON supprimé`
          : picked.path
            ? `${baseHint} — suppression JSON impossible`
            : `${baseHint}`,
      );
      window.setTimeout(() => setCopyHint(null), 3600);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Import JSON Nautiljon impossible.",
      );
    } finally {
      setJsonImportingId(null);
    }
  };

  /**
   * @description Enrichit via Nautiljon : WebView guidée si la préférence
   * Journal → Contrôle est « WebView », sinon recherche dans le navigateur
   * (scrape Tampermonkey / JSON).
   */
  const handleEnrichNautiljonBrowse = async (work: Work) => {
    if (jsonImportingId) return;
    const title = work.title.trim();
    if (!title) {
      setError("Titre manquant pour la recherche Nautiljon.");
      return;
    }

    setError(null);

    // Navigateur (préférence Contrôle, mobile, hors Tauri) : pas de WebView guidée.
    if (!canUseGuidedNautiljonWebview()) {
      setJsonImportingId(work.id);
      try {
        await openCatalogLink(buildNautiljonSearchUrl(title, "manga"), "Nautiljon");
        setCopyHint(
          `Recherche Nautiljon ouverte pour « ${work.title} » — scrappez puis joignez le JSON.`,
        );
        window.setTimeout(() => setCopyHint(null), 5200);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossible d'ouvrir Nautiljon.",
        );
      } finally {
        setJsonImportingId(null);
      }
      return;
    }

    setJsonImportingId(work.id);
    try {
      const payload = await browseNautiljonScrapePayload(title, "manga");
      setNautiljonPendingPayload(payload);
      setNautiljonPendingWorkId(work.id);
      setNautiljonOptionsOpen(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Enrichissement Nautiljon impossible.";
      if (!/annul|fermée|fermee/i.test(message)) {
        setError(message);
      }
    } finally {
      setJsonImportingId(null);
    }
  };

  /**
   * @description Applique le payload choisi (chapitres / tomes) sur la fiche sas.
   */
  const handleNautiljonOptionsConfirm = async (
    options: NautiljonImportOptions,
  ) => {
    if (!nautiljonPendingPayload || !nautiljonPendingWorkId) return;
    const workId = nautiljonPendingWorkId;
    const pendingPayload = nautiljonPendingPayload;
    setError(null);
    setJsonImportingId(workId);
    try {
      let adjusted = applyNautiljonImportOptionsToPayload(
        pendingPayload,
        options,
      );
      if (options.includeVolumeList && (adjusted.volumes?.length ?? 0) > 0) {
        adjusted = await enrichNautiljonVolumeDetails(
          adjusted,
          (progress) => {
            flushSync(() => setNautiljonEnrichProgress(progress));
          },
        );
      }
      setNautiljonOptionsOpen(false);
      setNautiljonEnrichProgress(null);
      await closeNautiljonBrowseWindow();
      const result = await enrichWorkFromScrapePayloads(
        workId,
        [adjusted],
        owners,
      );
      await reloadPending();
      setLastEnriched({ workId: result.workId, title: result.title });
      setCopyHint(
        result.clearedFromSas
          ? `« ${result.title} » enrichie et sortie du sas`
          : `« ${result.title} » enrichie (toujours en attente)`,
      );
      window.setTimeout(() => setCopyHint(null), 3600);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Enrichissement Nautiljon impossible.",
      );
    } finally {
      setJsonImportingId(null);
      setNautiljonPendingPayload(null);
      setNautiljonPendingWorkId(null);
      setNautiljonEnrichProgress(null);
      setNautiljonOptionsOpen(false);
    }
  };

  /**
   * @description Résout les IDs MAL ↔ AniList manquants sur la file pending.
   */
  const handleResolveTrackers = async () => {
    if (missingTrackerCount === 0 || resolvingTrackers) return;
    setResolvingTrackers(true);
    setError(null);
    try {
      const result = await resolvePendingMihonTrackerIds();
      await reloadPending();
      setCopyHint(
        result.resolved > 0
          ? `IDs résolus : ${result.resolved} · inchangés ${result.unchanged}${
              result.errors > 0 ? ` · erreurs ${result.errors}` : ""
            }`
          : result.total === 0
            ? "Aucun ID tracker manquant à résoudre"
            : `Aucun ID trouvé (${result.unchanged} inchangé${result.unchanged > 1 ? "s" : ""})`,
      );
      window.setTimeout(() => setCopyHint(null), 3200);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Résolution des IDs trackers impossible.",
      );
    } finally {
      setResolvingTrackers(false);
    }
  };

  /**
   * @description Phase 2 : recherche MAL par titre (Jikan) + fusion des doublons.
   */
  const handleResolveTitles = async () => {
    if (missingBothTrackerCount === 0 || resolvingTitles) return;
    setResolvingTitles(true);
    setError(null);
    try {
      const result = await resolvePendingMihonTitlesViaJikan();
      await reloadPending();
      setCopyHint(
        `Titres : ${result.linked} liés · ${result.merged} fusionnés · ${result.ambiguous} ambigus · ${result.unchanged} sans match`,
      );
      window.setTimeout(() => setCopyHint(null), 4200);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Résolution des titres impossible.",
      );
    } finally {
      setResolvingTitles(false);
    }
  };

  /**
   * @description Sort du sas vers la bibliothèque (enrichissement Jikan si MAL connu).
   */
  const handlePromoteToLibrary = async (work: Work) => {
    const confirmed = window.confirm(
      `Déplacer « ${work.title} » dans la bibliothèque ?\n` +
        `La fiche sera enrichie via MAL/Jikan si un ID est connu (sans Nautiljon).`,
    );
    if (!confirmed) return;

    setPromotingId(work.id);
    setError(null);
    try {
      const result = await promotePendingMihonToLibrary(work.id);
      await reloadPending();
      setLastEnriched({ workId: result.workId, title: result.title });
      setCopyHint(
        result.enrichedFromJikan
          ? `« ${result.title} » promue et enrichie via Jikan`
          : `« ${result.title} » promue dans la bibliothèque`,
      );
      window.setTimeout(() => setCopyHint(null), 3600);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Promotion vers la bibliothèque impossible.",
      );
    } finally {
      setPromotingId(null);
    }
  };

  /**
   * @description Met à jour l'index Keiyoushi des sources Mihon.
   */
  const handleRefreshIndex = async () => {
    if (isTrackerSyncBusy()) {
      setError("Une synchronisation est déjà en cours.");
      return;
    }
    setRefreshingIndex(true);
    setError(null);
    try {
      const { imported } = await runExclusiveTrackerSync(() =>
        refreshMihonSourceIndex(),
      );
      const map = await fetchMihonSourceMap();
      setKnownSourceNames(toMihonSourceNameMap(map));
      setIndexStats(await getMihonSourceIndexStats());
      const backfill = await backfillMihonSourceNamesFromIndex(map);
      await reloadPending();
      const parts = [`Index sources : ${imported} entrées`];
      if (backfill.updatedLinks > 0 || backfill.updatedWorks > 0) {
        parts.push(
          `${backfill.updatedLinks} lien${backfill.updatedLinks > 1 ? "s" : ""} et ${backfill.updatedWorks} fiche${backfill.updatedWorks > 1 ? "s" : ""} renommé${backfill.updatedLinks + backfill.updatedWorks > 1 ? "s" : ""}`,
        );
      }
      setCopyHint(parts.join(" · "));
      window.setTimeout(() => setCopyHint(null), 4200);
    } catch (err) {
      setError(
        err instanceof TrackerSyncBusyError
          ? err.message
          : err instanceof Error
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
            disabled={
              importing ||
              refreshingIndex ||
              resolvingTrackers ||
              resolvingTitles ||
              missingTrackerCount === 0
            }
            title="Résoudre les IDs MAL ↔ AniList manquants"
            aria-label="Résoudre les IDs trackers manquants"
            onClick={() => void handleResolveTrackers()}
          >
            <Link2
              size={16}
              className={resolvingTrackers ? "mihon-import-spin" : undefined}
              aria-hidden
            />
            {mobile ? null : (
              <span className="ghost-action-label">
                {resolvingTrackers
                  ? "Résolution…"
                  : `Résoudre IDs (${missingTrackerCount})`}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={
              importing ||
              refreshingIndex ||
              resolvingTrackers ||
              resolvingTitles ||
              missingBothTrackerCount === 0
            }
            title="Rechercher les MAL manquants via le titre (Jikan)"
            aria-label="Résoudre les titres sans tracker"
            onClick={() => void handleResolveTitles()}
          >
            <Search
              size={16}
              className={resolvingTitles ? "mihon-import-spin" : undefined}
              aria-hidden
            />
            {mobile ? null : (
              <span className="ghost-action-label">
                {resolvingTitles
                  ? "Titres…"
                  : `Résoudre titres (${missingBothTrackerCount})`}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={
              importing ||
              refreshingIndex ||
              resolvingTrackers ||
              resolvingTitles
            }
            title="Télécharge l'index Keiyoushi et résout les noms de sources manquants"
            aria-label="Mise à jour Index Mihon"
            onClick={() => void handleRefreshIndex()}
          >
            <RefreshCw
              size={16}
              className={refreshingIndex ? "mihon-import-spin" : undefined}
              aria-hidden
            />
            {mobile ? null : (
              <span className="ghost-action-label">
                {refreshingIndex ? "Index…" : "MAJ index sources"}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={importing}
            title="Importer Backup"
            aria-label="Importer Backup"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={16} aria-hidden />
            {mobile ? null : (
              <span className="ghost-action-label">
                {importing ? "Import…" : "Importer un backup"}
              </span>
            )}
          </button>
          <button
            type="button"
            className="ghost-action-btn"
            disabled={importing || loadingList}
            title="Actualiser"
            aria-label="Actualiser"
            onClick={() => void reloadPending()}
          >
            <RotateCw size={16} aria-hidden />
            {mobile ? null : (
              <span className="ghost-action-label">Actualiser</span>
            )}
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
            title="Réinitialiser"
            aria-label="Réinitialiser"
            onClick={() => void handleResetQueue()}
          >
            <RotateCcw size={16} aria-hidden />
            {mobile ? null : (
              <span className="ghost-action-label">
                {resetting ? "Réinit…" : "Réinitialiser"}
              </span>
            )}
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
      {lastEnriched ? (
        <div className="mihon-import-open-bar" role="status">
          <p>
            Dernière fiche enrichie : <strong>{lastEnriched.title}</strong>
          </p>
          <button
            type="button"
            className="ghost-action-btn"
            title="Ouvrir la fiche"
            aria-label={`Ouvrir la fiche ${lastEnriched.title}`}
            onClick={() => navigate(`/work/${lastEnriched.workId}`)}
          >
            <ExternalLink size={16} aria-hidden />
            <span className="ghost-action-label">Ouvrir la fiche</span>
          </button>
        </div>
      ) : null}

      {progress ? (
        <div className="mihon-import-progress" role="status">
          <p>
            {progress.current}/{progress.total || "…"} — {progress.item}
          </p>
          <p className="mihon-import-progress-stats">
            Créés {progress.created} · Rattachés {progress.attached} · Ignorés{" "}
            {progress.skipped} · Erreurs {progress.errors}
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
              <strong>{lastResult.attached}</strong> rattachées ·{" "}
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
          {attachDetails.length > 0 ? (
            <details className="mihon-import-details">
              <summary>
                Sources rattachées à une fiche existante ({attachDetails.length})
              </summary>
              <ul>
                {attachDetails.slice(0, 100).map((row, index) => (
                  <li key={`attach-${row.title}-${index}`}>
                    <strong>{row.title}</strong> — {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {skipDetails.length > 0 ? (
            <details className="mihon-import-details">
              <summary>Ignorées ({skipDetails.length})</summary>
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
          {!loadingList ? ` (${filteredPending.length})` : ""}
        </h2>
        <div className="mihon-import-list-tools">
          <label className="mihon-import-search">
            <span className="sr-only">Rechercher dans la file</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher un titre, source, ID…"
              autoComplete="off"
            />
          </label>
          <label className="mihon-import-source-filter">
            <span className="sr-only">Filtrer par source Mihon</span>
            <select
              value={sourceFilterId}
              onChange={(event) => setSourceFilterId(event.target.value)}
              aria-label="Filtrer par source Mihon"
            >
              <option value="">Toutes les sources</option>
              {sourceFilterOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <div className="mihon-import-filters" role="group" aria-label="Filtres rapides">
            <button
              type="button"
              className={quickFilter === "all" ? "is-active" : ""}
              onClick={() => setQuickFilter("all")}
            >
              Tous
            </button>
            <button
              type="button"
              className={quickFilter === "sans-mal" ? "is-active" : ""}
              onClick={() => setQuickFilter("sans-mal")}
            >
              Sans MAL
            </button>
            <button
              type="button"
              className={quickFilter === "avec-mal" ? "is-active" : ""}
              onClick={() => setQuickFilter("avec-mal")}
            >
              Avec MAL
            </button>
            <button
              type="button"
              className={quickFilter === "sans-anilist" ? "is-active" : ""}
              onClick={() => setQuickFilter("sans-anilist")}
            >
              Sans AniList
            </button>
            <button
              type="button"
              className={quickFilter === "avec-anilist" ? "is-active" : ""}
              onClick={() => setQuickFilter("avec-anilist")}
            >
              Avec AniList
            </button>
          </div>
        </div>
      </div>

      {loadingList ? (
        <LoadingOverlayHost compact>
          <LoadingOverlay message="Chargement de la file…" />
        </LoadingOverlayHost>
      ) : null}

      {!loadingList && filteredPending.length === 0 ? (
        <p className="mihon-import-hint" role="status">
          {pending.length === 0
            ? "Aucune fiche en attente d'enrichissement."
            : searchQuery.trim() || sourceFilterId || quickFilter !== "all"
              ? "Aucune fiche pour ce filtre."
              : "Aucune fiche pour ce filtre."}
        </p>
      ) : null}

      {!loadingList && filteredPending.length > 0 ? (
        <ul className="mihon-import-list">
          {filteredPending.map((work) => {
            const sources = sourcesByWorkId.get(work.id) ?? [];
            const displaySources =
              sources.length > 0
                ? sources.map((source) => {
                    const display = formatMihonSourceDisplay(
                      source.sourceId,
                      source.sourceName,
                      knownSourceNames,
                    );
                    return {
                      key: source.id,
                      label: display.label,
                      title: display.title,
                      obsolete: display.obsolete,
                      url: display.obsolete
                        ? null
                        : source.catalogUrl?.trim() || null,
                    };
                  })
                : work.mihon_source_id || work.mihon_source_name
                  ? (() => {
                      const display = formatMihonSourceDisplay(
                        work.mihon_source_id,
                        work.mihon_source_name,
                        knownSourceNames,
                      );
                      return [
                        {
                          key: "legacy",
                          label: display.label,
                          title: display.title,
                          obsolete: display.obsolete,
                          url: display.obsolete
                            ? null
                            : work.mihon_catalog_url?.trim() || null,
                        },
                      ];
                    })()
                  : [];

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
                  <div className="mihon-import-ids">
                    <span>
                      {work.mal_id != null ? `MAL ${work.mal_id}` : "Sans MAL"}
                    </span>
                    <span aria-hidden> · </span>
                    <span>
                      {work.anilist_id != null
                        ? `AniList ${work.anilist_id}`
                        : "Sans AniList"}
                    </span>
                    {displaySources.map((source) => (
                      <span key={source.key} className="mihon-import-id-source">
                        <span aria-hidden> · </span>
                        {source.url ? (
                          <button
                            type="button"
                            className="mihon-import-source-link"
                            title={source.title}
                            aria-label={`Ouvrir sur ${source.label}`}
                            onClick={() =>
                              void openCatalogLink(
                                source.url!,
                                source.label,
                              )
                            }
                          >
                            {source.label}
                          </button>
                        ) : (
                          <span
                            className={
                              source.obsolete
                                ? "mihon-import-source-obsolete"
                                : undefined
                            }
                            title={source.title}
                          >
                            {source.label}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mihon-import-uuid"
                    title="Cliquer pour copier l'ID"
                    aria-label={`Copier l'ID ${work.id}`}
                    onClick={() => void handleCopyId(work.id)}
                  >
                    {work.id}
                  </button>
                </div>
                <div className="mihon-import-row-actions">
                  <button
                    type="button"
                    className="ghost-action-btn"
                    disabled={
                      jsonImportingId != null ||
                      resolvingTrackers ||
                      resolvingTitles
                    }
                    title="Joindre un JSON Nautiljon"
                    aria-label="Joindre un JSON Nautiljon"
                    onClick={() => void handleAttachJsonClick(work.id)}
                  >
                    <FileJson size={14} aria-hidden />
                    {jsonImportingId === work.id
                      ? "Import JSON…"
                      : "Joindre JSON"}
                  </button>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    disabled={jsonImportingId === work.id}
                    title={
                      canUseGuidedNautiljonWebview()
                        ? "Ouvrir Nautiljon (WebView) puis Importer"
                        : "Ouvrir la recherche Nautiljon dans le navigateur (scrape manuel)"
                    }
                    onClick={() => void handleEnrichNautiljonBrowse(work)}
                  >
                    {jsonImportingId === work.id
                      ? "Nautiljon…"
                      : "Enrichir Nautiljon"}
                  </button>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    disabled={jsonImportingId === work.id}
                    title="Ancienne méthode (liste + Tampermonkey)"
                    onClick={() => setEnrichWork(work)}
                  >
                    Liste
                  </button>
                  <button
                    type="button"
                    className="ghost-action-btn"
                    disabled={promotingId === work.id}
                    title="Sortir du sas vers la bibliothèque (sans Nautiljon)"
                    onClick={() => void handlePromoteToLibrary(work)}
                  >
                    {promotingId === work.id
                      ? "Promotion…"
                      : "Vers bibliothèque"}
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
          await openCatalogLink(hit.pageUrl, hit.title);
          setEnrichWork(null);
        }}
      />
      <NautiljonImportOptionsModal
        open={nautiljonOptionsOpen}
        payload={nautiljonPendingPayload}
        owners={owners}
        enrichProgress={nautiljonEnrichProgress}
        onClose={() => {
          if (nautiljonEnrichProgress) return;
          setNautiljonOptionsOpen(false);
          setNautiljonPendingPayload(null);
          setNautiljonPendingWorkId(null);
          void closeNautiljonBrowseWindow();
        }}
        onConfirm={(options) => {
          void handleNautiljonOptionsConfirm(options);
        }}
      />
    </div>
  );
}
