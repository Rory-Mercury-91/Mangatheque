import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { LibraryFilters } from "@/features/library/LibraryFilters";
import { LibraryPagination } from "@/features/library/LibraryPagination";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import { WorkTile } from "@/features/works/WorkTile";
import { clearPendingImport } from "@/hooks/useImportListener";
import { useLibraryDefaultSort } from "@/hooks/useLibraryDefaultSort";
import { useOwners } from "@/hooks/useOwners";
import { useWorks } from "@/hooks/useWorks";
import { useAuth } from "@/contexts/AuthContext";
import { isDesktopFeaturesAvailable } from "@/lib/appLifecycle";
import {
  collectLibraryFilterOptions,
  fetchLibraryWorkMeta,
  filterAndSortLibraryWorks,
} from "@/services/libraryService";
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
import { fetchLibraryUserReadingMeta } from "@/services/readingProgressService";
import {
  libraryCacheBundleToMaps,
  readLibraryCacheBundle,
  writeLibraryCacheBundle,
} from "@/services/libraryCacheService";
import { fetchWorkFavoritesByWork } from "@/services/workFavoriteService";
import type { LibraryUserReadingMeta, LibraryWorkMeta } from "@/types/libraryFilters";
import {
  DEFAULT_LIBRARY_FILTERS,
  LIBRARY_PAGE_SIZE,
  type LibraryFiltersState,
  type LibrarySortKey,
} from "@/types/libraryFilters";
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
  const { owners } = useOwners();
  const { works, loading, error, reload } = useWorks();
  const desktopFeatures = isDesktopFeaturesAvailable();
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
      persistLibraryFilters(userId, preset);
      return;
    }

    const stored = readStoredLibraryFilters(userId);
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
      persistLibraryFilters(session?.user?.id ?? null, next);
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
        persistLibraryFilters(session?.user?.id ?? null, next);
        return next;
      });
      setCurrentPage(1);
    },
    [session?.user?.id],
  );

  const handleFiltersReset = useCallback(() => {
    clearStoredLibraryFilters(session?.user?.id ?? null);
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
        const [meta, readingMeta, favorites] = await Promise.all([
          fetchLibraryWorkMeta(),
          fetchLibraryUserReadingMeta(works),
          fetchWorkFavoritesByWork(),
        ]);

        if (!cancelled) {
          setMetaError(null);
          setFavoritesByWork(favorites);
          setMetaByWork((previous) =>
            isSameData(
              [...previous.entries()].sort(([a], [b]) => a.localeCompare(b)),
              [...meta.entries()].sort(([a], [b]) => a.localeCompare(b)),
            )
              ? previous
              : meta,
          );
          setReadingMetaByWork((previous) =>
            isSameData(
              [...previous.entries()].sort(([a], [b]) => a.localeCompare(b)),
              [...readingMeta.entries()].sort(([a], [b]) => a.localeCompare(b)),
            )
              ? previous
              : readingMeta,
          );
          await writeLibraryCacheBundle(userId, worksSyncKey, {
            metaByWork: meta,
            readingMetaByWork: readingMeta,
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

  const filteredWorks = useMemo(
    () =>
      filterAndSortLibraryWorks(
        works,
        metaByWork,
        filters,
        readingMetaByWork,
        favoritesByWork,
      ),
    [works, metaByWork, filters, readingMetaByWork, favoritesByWork],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredWorks.length / LIBRARY_PAGE_SIZE),
  );

  const paginatedWorks = useMemo(() => {
    const start = (currentPage - 1) * LIBRARY_PAGE_SIZE;
    return filteredWorks.slice(start, start + LIBRARY_PAGE_SIZE);
  }, [filteredWorks, currentPage]);

  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (!pending || loading || !metaReady) {
      return;
    }

    pendingNavigationRef.current = null;
    clearLibraryNavigationState();

    const maxPage = Math.max(
      1,
      Math.ceil(filteredWorks.length / LIBRARY_PAGE_SIZE),
    );
    const targetPage = Math.min(pending.page, maxPage);
    setCurrentPage(targetPage);
    pendingScrollRef.current = pending.scrollTop;
  }, [loading, metaReady, filteredWorks.length]);

  useEffect(() => {
    if (pendingNavigationRef.current) {
      return;
    }
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

  return (
    <main className="library-page library-page--with-overlay">
      <header className="library-header">
        <div className="library-title">
          <h1>Mangathèque</h1>
        </div>
        <div className="library-header-actions">
          <button type="button" className="btn-primary library-add-btn" onClick={openCreate}>
            <Plus size={18} aria-hidden />
            Ajouter
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
              : "Téléchargez le script via le bouton « Script » en haut, installez-le dans Firefox + Tampermonkey, exportez le JSON depuis Nautiljon, puis utilisez « Importer JSON » dans la modale d'ajout."}
          </p>
        </section>
      ) : (
        <div className="library-page-body loading-overlay-host">
          <LibraryFilters
            filters={filters}
            owners={owners}
            demographics={filterOptions.demographics}
            tags={filterOptions.tags}
            resultCount={filteredWorks.length}
            totalCount={works.length}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={LIBRARY_PAGE_SIZE}
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
                Aucune série ne correspond aux filtres.
              </p>
            ) : (
              <>
                <div ref={listAnchorRef} className="library-list-anchor" />
                <section className="library-grid">
                  {paginatedWorks.map((work) => (
                    <WorkTile
                      key={work.id}
                      work={work}
                      isFavorite={(favoritesByWork.get(work.id)?.length ?? 0) > 0}
                      onClick={openWorkDetail}
                    />
                  ))}
                </section>
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
