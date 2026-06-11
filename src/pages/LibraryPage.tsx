import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { TampermonkeyDownloadButton } from "@/components/import/TampermonkeyDownloadButton";
import { LibraryFilters } from "@/features/library/LibraryFilters";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import { WorkTile } from "@/features/works/WorkTile";
import { useImportListener, clearPendingImport } from "@/hooks/useImportListener";
import { useOwners } from "@/hooks/useOwners";
import { useWorks } from "@/hooks/useWorks";
import { useSupabaseHealth } from "@/hooks/useSupabaseHealth";
import { isDesktopFeaturesAvailable } from "@/lib/appLifecycle";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import {
  collectLibraryFilterOptions,
  fetchLibraryWorkMeta,
  filterAndSortLibraryWorks,
} from "@/services/libraryService";
import type { ScrapePayloadV1 } from "@/types/database";
import type { LibraryWorkMeta } from "@/types/libraryFilters";
import {
  DEFAULT_LIBRARY_FILTERS,
  type LibraryFiltersState,
} from "@/types/libraryFilters";
import type { WorkFormValues } from "@/types/workForm";
import "./LibraryPage.css";

/**
 * @description Bibliothèque principale — grille de tuiles avec recherche et filtres.
 */
export function LibraryPage() {
  const navigate = useNavigate();
  const health = useSupabaseHealth();
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

  const openCreate = () => {
    setEditingWorkId(null);
    setImportInitial(undefined);
    setModalOpen(true);
  };

  const openFromImport = useCallback((payload: ScrapePayloadV1) => {
    setEditingWorkId(null);
    setImportInitial(scrapePayloadToFormValues(payload));
    setModalOpen(true);
  }, []);

  useImportListener({
    onImport: desktopFeatures ? openFromImport : undefined,
  });

  useEffect(() => {
    if (works.length === 0) {
      setMetaByWork(new Map());
      return;
    }

    let cancelled = false;
    setMetaLoading(true);

    void fetchLibraryWorkMeta()
      .then((meta) => {
        if (!cancelled) {
          setMetaByWork(meta);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMetaByWork(new Map());
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMetaLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [works]);

  const filterOptions = useMemo(
    () => collectLibraryFilterOptions(works),
    [works],
  );

  const filteredWorks = useMemo(
    () => filterAndSortLibraryWorks(works, metaByWork, filters),
    [works, metaByWork, filters],
  );

  const closeModal = () => {
    setModalOpen(false);
    setEditingWorkId(null);
    setImportInitial(undefined);
    void clearPendingImport();
  };

  const handleSaved = () => {
    void reload();
    void clearPendingImport();
  };

  return (
    <main className="library-page">
      <header className="library-header">
        <div className="library-title">
          <BookOpen size={28} aria-hidden />
          <div>
            <h1>Mangathèque</h1>
            {health.state === "connected" && (
              <p className="library-subtitle">
                {health.owners.map((o) => o.name).join(", ")}
              </p>
            )}
          </div>
        </div>
        <div className="library-header-actions">
          <TampermonkeyDownloadButton />
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus size={18} aria-hidden />
            Ajouter une œuvre
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
          <p>Aucune œuvre pour l'instant.</p>
          <p>
            {desktopFeatures
              ? "Installez le script Tampermonkey, ouvrez une fiche sur Nautiljon puis importez, ou ajoutez une œuvre manuellement."
              : "Ajoutez une œuvre manuellement depuis le bouton ci-dessus."}
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
              Aucune œuvre ne correspond aux filtres.
            </p>
          ) : (
            <section className="library-grid">
              {filteredWorks.map((work) => (
                <WorkTile
                  key={work.id}
                  work={work}
                  onClick={(id) => navigate(`/work/${id}`)}
                />
              ))}
            </section>
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
