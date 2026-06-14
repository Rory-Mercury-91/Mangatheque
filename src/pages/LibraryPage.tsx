import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { LibraryFilters } from "@/features/library/LibraryFilters";
import { LibraryPagination } from "@/features/library/LibraryPagination";
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
  persistLibraryFilters,
  readStoredLibraryFilters,
} from "@/services/libraryFiltersPersistence";
import { fetchLibraryUserReadingMeta } from "@/services/readingProgressService";
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
  const [metaLoading, setMetaLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
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
      persistLibraryFilters(session?.user?.id ?? null, next);
    },
    [session?.user?.id],
  );

  const handleFiltersReset = useCallback(() => {
    clearStoredLibraryFilters(session?.user?.id ?? null);
    hasStoredFiltersRef.current = false;
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
      metaLoadedOnceRef.current = false;
      return;
    }

    let cancelled = false;
    if (!metaLoadedOnceRef.current) {
      setMetaLoading(true);
    }

    void Promise.all([fetchLibraryWorkMeta(), fetchLibraryUserReadingMeta(works)])
      .then(([meta, readingMeta]) => {
        if (!cancelled) {
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
        }
      })
      .catch(() => {
        if (!cancelled && !metaLoadedOnceRef.current) {
          setMetaByWork(new Map());
          setReadingMetaByWork(new Map());
        }
      })
      .finally(() => {
        if (!cancelled) {
          metaLoadedOnceRef.current = true;
          setMetaLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [worksSyncKey, works]);

  const filterOptions = useMemo(
    () => collectLibraryFilterOptions(works),
    [works],
  );

  const filteredWorks = useMemo(
    () => filterAndSortLibraryWorks(works, metaByWork, filters, readingMetaByWork),
    [works, metaByWork, filters, readingMetaByWork],
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
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

  return (
    <main className="library-page">
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

      {loading ? (
        <p className="library-status">
          <Loader2 size={18} className="spin" aria-hidden />
          Chargement…
        </p>
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
        <>
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
            onReset={handleFiltersReset}
            onSaveDefaultSort={session ? handleSaveDefaultSort : undefined}
          />
          {metaLoading ? (
            <p className="library-status library-status--inline">
              <Loader2 size={16} className="spin" aria-hidden />
              Mise à jour des filtres…
            </p>
          ) : null}
          {filteredWorks.length === 0 ? (
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
                    onClick={(id) => navigate(`/work/${id}`)}
                  />
                ))}
              </section>
              <LibraryPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
              />
            </>
          )}
        </>
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
