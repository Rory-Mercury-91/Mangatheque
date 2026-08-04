import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  sortMihonQueueWorks,
  type MihonQueueSortDir,
  type MihonQueueSortKey,
} from "@/features/mihon/MihonImportQueueTable";
import { useDevMode } from "@/hooks/useDevMode";
import { useOwners } from "@/hooks/useOwners";
import { isMobileRuntime } from "@/lib/platform";
import {
  importMihonBackupFile,
  type MihonImportProgress,
  type MihonImportResult,
} from "@/services/mihon/mihonBackupImportService";
import {
  enrichPendingMihonFromScrapeJson,
  enrichWorkFromScrapePayloads,
} from "@/services/mihon/mihonEnrichFromJsonService";
import {
  fetchMihonIgnoredEntries,
  ignoreMihonWork,
  unignoreMihonEntry,
  type MihonIgnoredEntry,
} from "@/services/mihon/mihonIgnoreService";
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
  mihonQueueCacheToSourcesMap,
  readMihonQueueCache,
  writeMihonQueueCache,
} from "@/services/mihon/mihonQueueCacheService";
import {
  persistMihonQueueUiPrefs,
  readMihonQueueUiPrefs,
  type MihonQuickFilter,
} from "@/services/mihon/mihonQueueUiPersistence";
import {
  deletePendingMihonWorks,
  deleteWork,
  fetchWorksByEnrichmentStatus,
} from "@/services/workService";
import { formatMihonSourceDisplay, toMihonSourceNameMap } from "@/utils/mihonSourceDisplay";
import { matchesNormalizedSearch } from "@/utils/textNormalize";

export type { MihonQuickFilter };

/**
 * @description État, filtres et handlers du sas d'import Mihon (mode dév).
 */
export function useMihonImportPage() {
  const navigate = useNavigate();
  const [devMode] = useDevMode();
  const { owners } = useOwners();
  const mobile = isMobileRuntime();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialUiPrefs = useMemo(() => readMihonQueueUiPrefs(), []);
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
  /** Compte Mihon associé à la prochaine sauvegarde importée. */
  const [backupMihonOwnerId, setBackupMihonOwnerId] = useState<string | null>(
    () => initialUiPrefs.backupMihonOwnerId,
  );
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
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [unignoringId, setUnignoringId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [quickFilter, setQuickFilter] = useState<MihonQuickFilter>(
    () => initialUiPrefs.quickFilter,
  );
  const [sourceFilterId, setSourceFilterId] = useState(
    () => initialUiPrefs.sourceFilterId,
  );
  const [searchQuery, setSearchQuery] = useState(
    () => initialUiPrefs.searchQuery,
  );
  const [jsonImportingId, setJsonImportingId] = useState<string | null>(null);
  const [resolvingTrackers, setResolvingTrackers] = useState(false);
  const [resolvingTitles, setResolvingTitles] = useState(false);
  const [sortKey, setSortKey] = useState<MihonQueueSortKey>(
    () => initialUiPrefs.sortKey,
  );
  const [sortDir, setSortDir] = useState<MihonQueueSortDir>(
    () => initialUiPrefs.sortDir,
  );
  const [ignoredEntries, setIgnoredEntries] = useState<MihonIgnoredEntry[]>(
    [],
  );

  /**
   * @description Persiste le snapshot file en IndexedDB (affichage instantané au retour).
   */
  const persistQueueCache = useCallback(
    async (
      nextPending: Work[],
      nextSources: Map<string, WorkMihonSource[]>,
      nextIgnored: MihonIgnoredEntry[],
    ) => {
      try {
        await writeMihonQueueCache({
          pending: nextPending,
          sourcesByWorkId: nextSources,
          ignoredEntries: nextIgnored,
        });
      } catch (err) {
        console.warn(
          "Cache sas Mihon non écrit :",
          err instanceof Error ? err.message : err,
        );
      }
    },
    [],
  );

  /**
   * @description Recharge la file depuis Supabase (optionnellement après hydratation cache).
   */
  const reloadPending = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setLoadingList(true);
        setError(null);
      }
      try {
        const [rows, ignored] = await Promise.all([
          fetchWorksByEnrichmentStatus("pending_mihon"),
          fetchMihonIgnoredEntries().catch((ignoredErr) => {
            console.warn(
              "Ignorés Mihon non chargés :",
              ignoredErr instanceof Error ? ignoredErr.message : ignoredErr,
            );
            return [] as MihonIgnoredEntry[];
          }),
        ]);
        let sources = new Map<string, WorkMihonSource[]>();
        try {
          sources = await fetchWorkMihonSourcesByWorkIds(
            rows.map((row) => row.id),
          );
        } catch (sourcesErr) {
          console.warn(
            "Sources Mihon multi non chargées :",
            sourcesErr instanceof Error ? sourcesErr.message : sourcesErr,
          );
        }
        setPending(rows);
        setIgnoredEntries(ignored);
        setSourcesByWorkId(sources);
        await persistQueueCache(rows, sources, ignored);
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossible de charger la file Mihon.",
          );
        } else {
          console.warn(
            "Rafraîchissement silencieux sas Mihon impossible :",
            err instanceof Error ? err.message : err,
          );
        }
      } finally {
        setLoadingList(false);
      }
    },
    [persistQueueCache],
  );

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

  // Hydrate cache local → affichage immédiat, puis refresh réseau silencieux.
  useEffect(() => {
    if (!devMode) return;
    let cancelled = false;
    void (async () => {
      const cached = await readMihonQueueCache();
      if (cancelled) return;
      if (cached) {
        setPending(cached.pending);
        setIgnoredEntries(cached.ignoredEntries ?? []);
        setSourcesByWorkId(mihonQueueCacheToSourcesMap(cached));
        setLoadingList(false);
        await reloadPending({ silent: true });
      } else {
        await reloadPending({ silent: false });
      }
      if (!cancelled) {
        void reloadIndexStats();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [devMode, reloadPending, reloadIndexStats]);

  // Mémorise filtres / tri / compte Mihon entre les visites.
  useEffect(() => {
    persistMihonQueueUiPrefs({
      quickFilter,
      sourceFilterId,
      searchQuery,
      sortKey,
      sortDir,
      backupMihonOwnerId,
    });
  }, [
    quickFilter,
    sourceFilterId,
    searchQuery,
    sortKey,
    sortDir,
    backupMihonOwnerId,
  ]);

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
  // Attendre la fin du chargement pour ne pas écraser la préférence mémorisée.
  useEffect(() => {
    if (!sourceFilterId || loadingList) return;
    if (sourceFilterOptions.some((option) => option.id === sourceFilterId)) {
      return;
    }
    setSourceFilterId("");
  }, [sourceFilterId, sourceFilterOptions, loadingList]);

  const filteredPending = useMemo(() => {
    if (quickFilter === "ignored") {
      return [] as Work[];
    }

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
    if (query) {
      rows = rows.filter((work) => {
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
            ...sourceLabels,
          ],
          query,
        );
      });
    }

    return sortMihonQueueWorks(
      rows,
      sourcesByWorkId,
      knownSourceNames,
      sortKey,
      sortDir,
    );
  }, [
    pending,
    quickFilter,
    sourceFilterId,
    searchQuery,
    sourcesByWorkId,
    knownSourceNames,
    sortKey,
    sortDir,
  ]);

  const filteredIgnored = useMemo(() => {
    if (quickFilter !== "ignored") {
      return [] as MihonIgnoredEntry[];
    }
    const query = searchQuery.trim();
    if (!query) {
      return ignoredEntries;
    }
    return ignoredEntries.filter((entry) =>
      matchesNormalizedSearch(
        [
          entry.title,
          entry.malId != null ? String(entry.malId) : null,
          entry.anilistId != null ? String(entry.anilistId) : null,
          ...entry.catalogKeys,
        ],
        query,
      ),
    );
  }, [quickFilter, ignoredEntries, searchQuery]);

  /**
   * @description Bascule le tri d'une colonne (asc → desc → asc).
   */
  const handleSortChange = (key: MihonQueueSortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const skipDetails = useMemo(
    () => lastResult?.details.filter((d) => d.kind === "skip") ?? [],
    [lastResult],
  );
  const attachDetails = useMemo(
    () => lastResult?.details.filter((d) => d.kind === "attach") ?? [],
    [lastResult],
  );
  const ownershipDetails = useMemo(
    () => lastResult?.details.filter((d) => d.kind === "ownership") ?? [],
    [lastResult],
  );
  const errorDetails = useMemo(
    () => lastResult?.details.filter((d) => d.kind === "error") ?? [],
    [lastResult],
  );

  const selectedBackupOwner = useMemo(
    () => owners.find((owner) => owner.id === backupMihonOwnerId) ?? null,
    [owners, backupMihonOwnerId],
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

    if (!backupMihonOwnerId) {
      setError(
        "Choisissez d'abord le propriétaire du compte Mihon pour cette sauvegarde.",
      );
      return;
    }

    setImporting(true);
    setError(null);
    setLastResult(null);
    setProgress({
      total: 0,
      current: 0,
      created: 0,
      attached: 0,
      ownershipAdded: 0,
      skipped: 0,
      errors: 0,
      item: "Préparation…",
    });

    try {
      const result = await importMihonBackupFile(
        file,
        { mihonOwnerId: backupMihonOwnerId },
        setProgress,
      );
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
   * @description Ferme la modale d'options Nautiljon (sauf pendant l'enrichissement tomes).
   */
  const handleNautiljonOptionsClose = () => {
    if (nautiljonEnrichProgress) return;
    setNautiljonOptionsOpen(false);
    setNautiljonPendingPayload(null);
    setNautiljonPendingWorkId(null);
    void closeNautiljonBrowseWindow();
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
      const emptySources = new Map<string, WorkMihonSource[]>();
      setPending([]);
      setSourcesByWorkId(emptySources);
      setLastResult(null);
      await persistQueueCache([], emptySources, ignoredEntries);
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
   * @description Retire une fiche du sas (suppression définitive, réimportable).
   */
  const handleDelete = async (work: Work) => {
    const confirmed = window.confirm(
      `Supprimer « ${work.title} » du sas Mihon ?\nCette fiche sera effacée.\nUn prochain import backup pourra la recréer.`,
    );
    if (!confirmed) return;

    setDeletingId(work.id);
    setError(null);
    try {
      await deleteWork(work.id, "Retrait du sas Mihon (import involontaire).");
      const nextPending = pending.filter((row) => row.id !== work.id);
      const nextSources = new Map(sourcesByWorkId);
      nextSources.delete(work.id);
      setPending(nextPending);
      setSourcesByWorkId(nextSources);
      await persistQueueCache(nextPending, nextSources, ignoredEntries);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Suppression impossible.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * @description Ignore définitivement une fiche : retirée du sas et bloquée à l'import.
   */
  const handleIgnore = async (work: Work) => {
    const confirmed = window.confirm(
      `Ignorer « ${work.title} » ?\nLa fiche quitte le sas et ne sera plus réinjectée lors d'un import backup.`,
    );
    if (!confirmed) return;

    setIgnoringId(work.id);
    setError(null);
    try {
      const ignored = await ignoreMihonWork(
        work,
        sourcesByWorkId.get(work.id) ?? [],
      );
      await deleteWork(work.id, "Ignorée dans le sas Mihon.");
      const nextPending = pending.filter((row) => row.id !== work.id);
      const nextSources = new Map(sourcesByWorkId);
      nextSources.delete(work.id);
      const nextIgnored = [ignored, ...ignoredEntries];
      setPending(nextPending);
      setSourcesByWorkId(nextSources);
      setIgnoredEntries(nextIgnored);
      await persistQueueCache(nextPending, nextSources, nextIgnored);
      setCopyHint(`« ${work.title} » ignorée — ne sera plus importée`);
      window.setTimeout(() => setCopyHint(null), 3200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible d'ignorer la fiche.",
      );
    } finally {
      setIgnoringId(null);
    }
  };

  /**
   * @description Restaure une entrée ignorée (réimportable au prochain backup).
   */
  const handleUnignore = async (entry: MihonIgnoredEntry) => {
    setUnignoringId(entry.id);
    setError(null);
    try {
      await unignoreMihonEntry(entry.id);
      const nextIgnored = ignoredEntries.filter((row) => row.id !== entry.id);
      setIgnoredEntries(nextIgnored);
      await persistQueueCache(pending, sourcesByWorkId, nextIgnored);
      setCopyHint(`« ${entry.title} » n'est plus ignorée`);
      window.setTimeout(() => setCopyHint(null), 2800);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de restaurer l'entrée ignorée.",
      );
    } finally {
      setUnignoringId(null);
    }
  };

  return {
    navigate,
    devMode,
    owners,
    mobile,
    fileInputId,
    fileInputRef,
    pending,
    sourcesByWorkId,
    knownSourceNames,
    loadingList,
    importing,
    refreshingIndex,
    backupMihonOwnerId,
    setBackupMihonOwnerId,
    progress,
    lastResult,
    setLastResult,
    indexStats,
    error,
    copyHint,
    lastEnriched,
    nautiljonOptionsOpen,
    nautiljonEnrichProgress,
    nautiljonPendingPayload,
    deletingId,
    ignoringId,
    unignoringId,
    promotingId,
    resetting,
    quickFilter,
    setQuickFilter,
    sourceFilterId,
    setSourceFilterId,
    searchQuery,
    setSearchQuery,
    jsonImportingId,
    resolvingTrackers,
    resolvingTitles,
    sortKey,
    sortDir,
    ignoredEntries,
    sourceFilterOptions,
    filteredPending,
    filteredIgnored,
    handleSortChange,
    skipDetails,
    attachDetails,
    ownershipDetails,
    errorDetails,
    selectedBackupOwner,
    missingTrackerCount,
    missingBothTrackerCount,
    handleFileChange,
    handleAttachJsonClick,
    handleEnrichNautiljonBrowse,
    handleNautiljonOptionsConfirm,
    handleNautiljonOptionsClose,
    handleResolveTrackers,
    handleResolveTitles,
    handlePromoteToLibrary,
    handleRefreshIndex,
    handleResetQueue,
    handleDelete,
    handleIgnore,
    handleUnignore,
    reloadPending,
  };
}
