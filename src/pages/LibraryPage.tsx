import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { LibraryFilters } from "@/features/library/LibraryFilters";
import { LibraryPagination } from "@/features/library/LibraryPagination";
import {
  getLibraryBufferedPages,
  getLibraryPageWorks,
} from "@/features/library/libraryPageSlice";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import "@/components/common/ghostActionBtn.css";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import { WorkTile } from "@/features/works/WorkTile";
import { clearPendingImport } from "@/hooks/useImportListener";
import { useLibraryDefaultSort } from "@/hooks/useLibraryDefaultSort";
import { useOwners } from "@/hooks/useOwners";
import { useWorks } from "@/hooks/useWorks";
import { useDevMode } from "@/hooks/useDevMode";
import { useLinkedOwnerForUser } from "@/hooks/useLinkedOwnerForUser";
import { useAuth } from "@/contexts/AuthContext";
import { isDesktopFeaturesAvailable } from "@/lib/appLifecycle";
import {
  collectLibraryFilterOptions,
  collectLibraryMihonSourceOptions,
  filterAndSortLibraryWorks,
} from "@/services/libraryService";
import {
  fetchLocalArchiveLibraryMetaByWorkId,
  type LocalArchiveLibraryMeta,
} from "@/services/workLocalArchiveService";
import { fetchLibraryMetaBundle } from "@/services/libraryMetaBundleService";
import { fetchMihonSourceMap } from "@/services/mihon/mihonSourceIndexService";
import { toMihonSourceNameMap } from "@/utils/mihonSourceDisplay";
import {
  clearStoredLibraryFilters,
  consumeLibraryFilterPreset,
  persistLibraryFilters,
  readStoredLibraryFilters,
} from "@/services/libraryFiltersPersistence";
import {
  clearLibraryNavigationState,
  readLibraryNavigationState,
  restoreAppMainScroll,
  saveLibraryNavigationState,
} from "@/services/libraryNavigationPersistence";
import {
  libraryCacheBundleToMaps,
  readLibraryCacheBundle,
  writeLibraryCacheBundle,
} from "@/services/libraryCacheService";
import {
  prefetchWorkDetails,
  pruneWorkDetailCache,
} from "@/services/workDetailCacheService";
import { fetchWorkFavoritesByWork } from "@/services/workFavoriteService";
import { fetchHiddenWorkIdsForUser } from "@/services/workHiddenService";
import type { LibraryUserReadingMeta, LibraryWorkMeta } from "@/types/libraryFilters";
import {
  DEFAULT_LIBRARY_FILTERS,
  type LibraryFiltersState,
  type LibrarySortKey,
} from "@/types/libraryFilters";
import { useLibraryPageSize } from "@/hooks/useLibraryPageSize";
import type { WorkFormValues } from "@/types/workForm";
import { isSameData } from "@/utils/stateSync";
import { resolveErrorMessage } from "@/utils/errorMessage";
import "./LibraryPage.css";

/**
 * @description Bibliothèque principale — grille de tuiles avec recherche et filtres.
 */
export function LibraryPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [devMode] = useDevMode();
  const { linkedOwner } = useLinkedOwnerForUser();
  const { owners } = useOwners();
  const { works, loading, error, reload } = useWorks();
  const desktopFeatures = isDesktopFeaturesAvailable();
  const pageSize = useLibraryPageSize();
  const {
    defaultSort,
    preferencesLoaded,
    savingDefaultSort,
    saveDefaultSort,
  } = useLibraryDefaultSort();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [importInitial, setImportInitial] = useState<Partial<WorkFormValues>>();
  const [filters, setFilters] = useState<LibraryFiltersState>(
    DEFAULT_LIBRARY_FILTERS,
  );
  const [sortSaveMessage, setSortSaveMessage] = useState<string | null>(null);
  const [metaByWork, setMetaByWork] = useState<Map<string, LibraryWorkMeta>>(
    new Map(),
  );
  const [readingMetaByWork, setReadingMetaByWork] = useState<
    Map<string, LibraryUserReadingMeta>
  >(new Map());
  const [favoritesByWork, setFavoritesByWork] = useState<Map<string, string[]>>(
    new Map(),
  );
  const [hiddenWorkIds, setHiddenWorkIds] = useState(() => new Set<string>());
  const [localArchiveMetaByWork, setLocalArchiveMetaByWork] = useState(
    () => new Map<string, LocalArchiveLibraryMeta>(),
  );
  const [metaReady, setMetaReady] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pendingNavigationRef = useRef(
    readLibraryNavigationState(),
  );
  const pendingScrollRef = useRef<number | null>(null);
  const metaLoadedOnceRef = useRef(false);
  const listAnchorRef = useRef<HTMLDivElement>(null);
  const sortPreferenceAppliedRef = useRef<string | null>(null);
  const hasStoredFiltersRef = useRef(false);
  const filtersHydratedForUserRef = useRef<string | null>(null);
  const [knownMihonSourceNames, setKnownMihonSourceNames] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());

  const worksSyncKey = useMemo(
    () => works.map((work) => `${work.id}:${work.updated_at}`).join("|"),
    [works],
  );

  const openCreate = () => {
    setEditingWorkId(null);
    setImportInitial(undefined);
    setModalOpen(true);
  };

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    const userKey = userId ?? "anonymous";

    if (filtersHydratedForUserRef.current === userKey) {
      return;
    }

    filtersHydratedForUserRef.current = userKey;
    sortPreferenceAppliedRef.current = null;

    const preset = consumeLibraryFilterPreset();
    if (preset) {
      hasStoredFiltersRef.current = true;
      setFilters(preset);
      setCurrentPage(1);
      persistLibraryFilters(userId, preset, "lectures");
      return;
    }

    const stored = readStoredLibraryFilters(userId, "lectures");
    if (stored) {
      hasStoredFiltersRef.current = true;
      setFilters(stored);
      return;
    }

    hasStoredFiltersRef.current = false;
    setFilters(DEFAULT_LIBRARY_FILTERS);
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id ?? "anonymous";
    if (!preferencesLoaded || sortPreferenceAppliedRef.current === userId) {
      return;
    }

    sortPreferenceAppliedRef.current = userId;
    if (defaultSort && !hasStoredFiltersRef.current) {
      setFilters((previous) => ({ ...previous, sort: defaultSort }));
    }
  }, [defaultSort, preferencesLoaded, session?.user?.id]);

  const handleFiltersChange = useCallback(
    (next: LibraryFiltersState) => {
      setFilters(next);
      setCurrentPage(1);
      persistLibraryFilters(session?.user?.id ?? null, next, "lectures");
    },
    [session?.user?.id],
  );

  const handleSearchCommit = useCallback(
    (search: string) => {
      setFilters((previous) => {
        if (previous.search === search) {
          return previous;
        }
        const next = { ...previous, search };
        persistLibraryFilters(session?.user?.id ?? null, next, "lectures");
        return next;
      });
      setCurrentPage(1);
    },
    [session?.user?.id],
  );

  const handleFiltersReset = useCallback(() => {
    clearStoredLibraryFilters(session?.user?.id ?? null, "lectures");
    hasStoredFiltersRef.current = false;
    setCurrentPage(1);
  }, [session?.user?.id]);

  const handleSaveDefaultSort = useCallback(
    async (sort: LibrarySortKey) => {
      setSortSaveMessage(null);
      try {
        await saveDefaultSort(sort);
        setSortSaveMessage("Tri par défaut enregistré pour votre compte.");
      } catch (saveError) {
        setSortSaveMessage(
          resolveErrorMessage(saveError, "Enregistrement impossible."),
        );
      }

      window.setTimeout(() => setSortSaveMessage(null), 2800);
    },
    [saveDefaultSort],
  );

  useEffect(() => {
    if (works.length === 0) {
      setMetaByWork(new Map());
      setReadingMetaByWork(new Map());
      setFavoritesByWork(new Map());
      setHiddenWorkIds(new Set());
      metaLoadedOnceRef.current = false;
      setMetaReady(false);
      return;
    }

    let cancelled = false;
    const userId = session?.user?.id ?? null;

    void (async () => {
      if (!metaLoadedOnceRef.current) {
        setMetaError(null);
        const cached = await readLibraryCacheBundle(userId, worksSyncKey);
        if (cached && !cancelled) {
          const maps = libraryCacheBundleToMaps(cached);
          setMetaByWork(maps.metaByWork);
          setReadingMetaByWork(maps.readingMetaByWork);
          setFavoritesByWork(maps.favoritesByWork);
          metaLoadedOnceRef.current = true;
          setMetaReady(true);
        }
      }

      try {
        const [bundle, favorites, hidden] = await Promise.all([
          fetchLibraryMetaBundle(works, { targetUserId: userId }),
          fetchWorkFavoritesByWork(),
          userId
            ? fetchHiddenWorkIdsForUser(userId)
            : Promise.resolve(new Set<string>()),
        ]);

        if (!cancelled) {
          setMetaError(null);
          setFavoritesByWork(favorites);
          setHiddenWorkIds(hidden);
          setMetaByWork((previous) =>
            isSameData(
              [...previous.entries()].sort(([a], [b]) => a.localeCompare(b)),
              [...bundle.workMeta.entries()].sort(([a], [b]) =>
                a.localeCompare(b),
              ),
            )
              ? previous
              : bundle.workMeta,
          );
          setReadingMetaByWork((previous) =>
            isSameData(
              [...previous.entries()].sort(([a], [b]) => a.localeCompare(b)),
              [...bundle.readingMeta.entries()].sort(([a], [b]) =>
                a.localeCompare(b),
              ),
            )
              ? previous
              : bundle.readingMeta,
          );
          await writeLibraryCacheBundle(userId, worksSyncKey, {
            metaByWork: bundle.workMeta,
            readingMetaByWork: bundle.readingMeta,
            favoritesByWork: favorites,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setMetaError(
            resolveErrorMessage(
              err,
              "Impossible de charger les métadonnées bibliothèque.",
            ),
          );
          if (!metaLoadedOnceRef.current) {
            setMetaByWork(new Map());
            setReadingMetaByWork(new Map());
            setHiddenWorkIds(new Set());
          }
        }
      } finally {
        if (!cancelled) {
          metaLoadedOnceRef.current = true;
          setMetaReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [worksSyncKey, works, session?.user?.id]);

  const filterOptions = useMemo(
    () => collectLibraryFilterOptions(works),
    [works],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const map = await fetchMihonSourceMap();
        if (!cancelled) {
          setKnownMihonSourceNames(toMihonSourceNameMap(map));
        }
      } catch {
        if (!cancelled) {
          setKnownMihonSourceNames(new Map());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mihonSourceOptions = useMemo(
    () => collectLibraryMihonSourceOptions(metaByWork, knownMihonSourceNames),
    [metaByWork, knownMihonSourceNames],
  );

  // Source filtrée absente de la biblio → revenir à « Toutes ».
  useEffect(() => {
    const selected = filters.mihonSourceId?.trim() ?? "";
    if (!selected) return;
    if (mihonSourceOptions.some((option) => option.id === selected)) return;
    setFilters((previous) => {
      const next = { ...previous, mihonSourceId: "" };
      persistLibraryFilters(session?.user?.id ?? null, next, "lectures");
      return next;
    });
  }, [filters.mihonSourceId, mihonSourceOptions, session?.user?.id]);

  useEffect(() => {
    if (!devMode) {
      setLocalArchiveMetaByWork(new Map());
      return;
    }
    let cancelled = false;
    void fetchLocalArchiveLibraryMetaByWorkId(linkedOwner?.id ?? null)
      .then((map) => {
        if (!cancelled) {
          setLocalArchiveMetaByWork(map);
        }
      })
      .catch((err) => {
        console.warn(
          resolveErrorMessage(
            err,
            "Chargement des dossiers d'archive impossible.",
          ),
        );
        if (!cancelled) {
          setLocalArchiveMetaByWork(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [devMode, linkedOwner?.id, works.length]);

  // Filtre archive actif hors mode dév → le désactiver.
  useEffect(() => {
    if (devMode) return;
    if (!(filters.localArchiveStatusFolder ?? "").trim()) return;
    setFilters((previous) => {
      const next = { ...previous, localArchiveStatusFolder: "" };
      persistLibraryFilters(session?.user?.id ?? null, next, "lectures");
      return next;
    });
  }, [devMode, filters.localArchiveStatusFolder, session?.user?.id]);

  const localArchiveStatusByWork = useMemo(() => {
    const map = new Map<string, string>();
    for (const [workId, meta] of localArchiveMetaByWork) {
      map.set(workId, meta.statusFolder);
    }
    return map;
  }, [localArchiveMetaByWork]);

  const filteredWorks = useMemo(
    () =>
      filterAndSortLibraryWorks(
        works,
        metaByWork,
        filters,
        readingMetaByWork,
        favoritesByWork,
        hiddenWorkIds,
        localArchiveStatusByWork,
      ),
    [
      works,
      metaByWork,
      filters,
      readingMetaByWork,
      favoritesByWork,
      hiddenWorkIds,
      localArchiveStatusByWork,
      devMode,
    ],
  );

  const visibleTotalCount = filters.showHiddenWorks
    ? hiddenWorkIds.size
    : Math.max(0, works.length - hiddenWorkIds.size);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredWorks.length / pageSize),
  );

  const bufferedPages = useMemo(
    () => getLibraryBufferedPages(currentPage, totalPages),
    [currentPage, totalPages],
  );

  /** Prefetch réseau : page suivante uniquement (la courante est déjà affichée). */
  const prefetchTargets = useMemo(() => {
    if (currentPage >= totalPages) {
      return [] as Array<{ id: string; updatedAt: string }>;
    }
    return getLibraryPageWorks(
      filteredWorks,
      currentPage + 1,
      pageSize,
    ).map((work) => ({
      id: work.id,
      updatedAt: work.updated_at,
    }));
  }, [currentPage, totalPages, filteredWorks, pageSize]);

  useEffect(() => {
    if (works.length === 0) {
      return;
    }
    void pruneWorkDetailCache(works);
  }, [worksSyncKey, works]);

  const paginatedWorks = useMemo(
    () => getLibraryPageWorks(filteredWorks, currentPage, pageSize),
    [filteredWorks, currentPage, pageSize],
  );

  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (!pending || loading || !metaReady) {
      return;
    }

    pendingNavigationRef.current = null;
    clearLibraryNavigationState();

    const maxPage = Math.max(
      1,
      Math.ceil(filteredWorks.length / pageSize),
    );
    const targetPage = Math.min(pending.page, maxPage);
    setCurrentPage(targetPage);
    pendingScrollRef.current = pending.scrollTop;
  }, [loading, metaReady, filteredWorks.length, pageSize]);

  useEffect(() => {
    if (pendingNavigationRef.current) {
      return;
    }
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, pageSize]);

  useEffect(() => {
    if (pendingScrollRef.current == null || loading || !metaReady) {
      return;
    }
    const scrollTop = pendingScrollRef.current;
    pendingScrollRef.current = null;
    restoreAppMainScroll(scrollTop);
  }, [loading, metaReady, currentPage, paginatedWorks.length, filteredWorks.length]);

  const openWorkDetail = useCallback(
    (workId: string) => {
      saveLibraryNavigationState({
        page: currentPage,
        scrollTop: document.querySelector(".app-main")?.scrollTop ?? 0,
      });
      navigate(`/work/${workId}`);
    },
    [currentPage, navigate],
  );

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    requestAnimationFrame(() => {
      listAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const closeModal = () => {
    setModalOpen(false);
    setEditingWorkId(null);
    setImportInitial(undefined);
    void clearPendingImport();
  };

  const handleSaved = () => {
    void reload({ silent: true });
    void clearPendingImport();
  };

  const filtersMetaReady = metaReady && !metaError;
  const showInitialLoading = loading;
  const showMetaOverlay =
    !loading && works.length > 0 && !metaReady && !metaError;

  useEffect(() => {
    if (!filtersMetaReady || prefetchTargets.length === 0) {
      return;
    }
    void prefetchWorkDetails(prefetchTargets, {
      favoritesByWork,
    });
  }, [filtersMetaReady, prefetchTargets, favoritesByWork]);

  return (
    <main className="library-page library-page--with-overlay">
      <header className="library-header">
        <div className="library-title">
          <h1>Mangathèque</h1>
        </div>
        <div className="library-header-actions">
          <button
            type="button"
            className="ghost-action-btn ghost-action-btn--accent library-add-btn"
            title="Ajouter une série"
            aria-label="Ajouter une série"
            onClick={openCreate}
          >
            <Plus size={18} aria-hidden />
            <span className="ghost-action-label">Ajouter</span>
          </button>
        </div>
      </header>

      {showInitialLoading ? (
        <LoadingOverlayHost className="library-page-body">
          <LoadingOverlay message="Chargement de la bibliothèque…" />
        </LoadingOverlayHost>
      ) : error ? (
        <p className="library-error">{error}</p>
      ) : works.length === 0 ? (
        <section className="library-empty">
          <p>Aucune série pour l'instant.</p>
          <p>
            {desktopFeatures
              ? "Téléchargez le script via le bouton « Script » en haut, ouvrez une fiche sur Nautiljon puis importez, ou ajoutez une série manuellement."
              : "Téléchargez le script via le bouton « Script » en haut, installez-le dans Firefox + Tampermonkey, exportez le JSON depuis Nautiljon, puis « Importer .json » dans la modale d'ajout."}
          </p>
        </section>
      ) : (
        <div className="library-page-body loading-overlay-host">
          <LibraryFilters
            filters={filters}
            owners={owners}
            demographics={filterOptions.demographics}
            tags={filterOptions.tags}
            mihonSourceOptions={mihonSourceOptions}
            resultCount={filteredWorks.length}
            totalCount={visibleTotalCount}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            defaultSort={session ? defaultSort : null}
            savingDefaultSort={savingDefaultSort}
            sortSaveMessage={sortSaveMessage}
            onChange={handleFiltersChange}
            onSearchCommit={handleSearchCommit}
            onReset={handleFiltersReset}
            onSaveDefaultSort={session ? handleSaveDefaultSort : undefined}
            ownerFiltersDisabled={!filtersMetaReady}
            showResultCount={filtersMetaReady}
          />
          {metaError ? (
            <p className="library-error library-error--inline">{metaError}</p>
          ) : null}
          {showMetaOverlay ? (
            <LoadingOverlay message="Chargement des filtres propriétaire…" />
          ) : null}
          {filtersMetaReady ? (
            filteredWorks.length === 0 ? (
              <p className="library-empty-inline">
                {filters.showHiddenWorks
                  ? "Aucune série masquée."
                  : "Aucune série ne correspond aux filtres."}
              </p>
            ) : (
              <>
                <div ref={listAnchorRef} className="library-list-anchor" />
                <div className="library-pages">
                  <section className="library-grid" aria-label="Page courante">
                    {paginatedWorks.map((work) => (
                      <WorkTile
                        key={work.id}
                        work={work}
                        isFavorite={
                          (favoritesByWork.get(work.id)?.length ?? 0) > 0
                        }
                        archiveMissingCount={
                          devMode
                            ? (localArchiveMetaByWork.get(work.id)
                                ?.missingCount ?? null)
                            : null
                        }
                        onClick={openWorkDetail}
                      />
                    ))}
                  </section>
                </div>
                {bufferedPages
                  .filter((page) => page !== currentPage)
                  .map((page) => {
                    const pageWorks = getLibraryPageWorks(
                      filteredWorks,
                      page,
                      pageSize,
                    );

                    return (
                      <div
                        key={page}
                        className="library-preload-rail"
                        aria-hidden
                      >
                        <section className="library-grid">
                          {pageWorks.map((work) => (
                            <WorkTile
                              key={work.id}
                              work={work}
                              isFavorite={
                                (favoritesByWork.get(work.id)?.length ?? 0) > 0
                              }
                              archiveMissingCount={
                                devMode
                                  ? (localArchiveMetaByWork.get(work.id)
                                      ?.missingCount ?? null)
                                  : null
                              }
                              coverLoading="eager"
                              onClick={openWorkDetail}
                            />
                          ))}
                        </section>
                      </div>
                    );
                  })}
                <LibraryPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                />
              </>
            )
          ) : null}
        </div>
      )}

      <WorkFormModal
        open={modalOpen}
        workId={editingWorkId}
        initialValues={importInitial}
        owners={owners}
        onClose={closeModal}
        onSaved={handleSaved}
      />
    </main>
  );
}
