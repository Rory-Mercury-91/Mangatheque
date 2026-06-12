import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { TampermonkeyDownloadButton } from "@/components/import/TampermonkeyDownloadButton";
import { LibraryFilters } from "@/features/library/LibraryFilters";
import { LibraryPagination } from "@/features/library/LibraryPagination";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import { WorkTile } from "@/features/works/WorkTile";
import { clearPendingImport } from "@/hooks/useImportListener";
import { useOwners } from "@/hooks/useOwners";
import { useWorks } from "@/hooks/useWorks";
import { isDesktopFeaturesAvailable } from "@/lib/appLifecycle";
import {
  collectLibraryFilterOptions,
  fetchLibraryWorkMeta,
  filterAndSortLibraryWorks,
} from "@/services/libraryService";
import type { LibraryWorkMeta } from "@/types/libraryFilters";
import {
  DEFAULT_LIBRARY_FILTERS,
  LIBRARY_PAGE_SIZE,
  type LibraryFiltersState,
} from "@/types/libraryFilters";
import type { WorkFormValues } from "@/types/workForm";
import { isSameData } from "@/utils/stateSync";
import "./LibraryPage.css";

/**
 * @description Bibliothèque principale — grille de tuiles avec recherche et filtres.
 */
export function LibraryPage() {
  const navigate = useNavigate();
  const { owners } = useOwners();
  const { works, loading, error, reload } = useWorks();
  const desktopFeatures = isDesktopFeaturesAvailable();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [importInitial, setImportInitial] = useState<Partial<WorkFormValues>>();
  const [filters, setFilters] = useState<LibraryFiltersState>(
    DEFAULT_LIBRARY_FILTERS,
  );
  const [metaByWork, setMetaByWork] = useState<Map<string, LibraryWorkMeta>>(
    new Map(),
  );
  const [metaLoading, setMetaLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const metaLoadedOnceRef = useRef(false);
  const listAnchorRef = useRef<HTMLDivElement>(null);

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
    if (works.length === 0) {
      setMetaByWork(new Map());
      metaLoadedOnceRef.current = false;
      return;
    }

    let cancelled = false;
    if (!metaLoadedOnceRef.current) {
      setMetaLoading(true);
    }

    void fetchLibraryWorkMeta()
      .then((meta) => {
        if (!cancelled) {
          setMetaByWork((previous) =>
            isSameData(
              [...previous.entries()].sort(([a], [b]) => a.localeCompare(b)),
              [...meta.entries()].sort(([a], [b]) => a.localeCompare(b)),
            )
              ? previous
              : meta,
          );
        }
      })
      .catch(() => {
        if (!cancelled && !metaLoadedOnceRef.current) {
          setMetaByWork(new Map());
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
  }, [worksSyncKey]);

  const filterOptions = useMemo(
    () => collectLibraryFilterOptions(works),
    [works],
  );

  const filteredWorks = useMemo(
    () => filterAndSortLibraryWorks(works, metaByWork, filters),
    [works, metaByWork, filters],
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
          <TampermonkeyDownloadButton inline />
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
              ? "Installez le script Tampermonkey, ouvrez une fiche sur Nautiljon puis importez, ou ajoutez une série manuellement."
              : "Installez le script Tampermonkey dans Firefox, exportez le JSON depuis Nautiljon, puis utilisez « Importer JSON » dans la modale d'ajout."}
          </p>
          <TampermonkeyDownloadButton compact />
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
            onChange={setFilters}
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
