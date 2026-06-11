import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import { WorkTile } from "@/features/works/WorkTile";
import { useImportListener, clearPendingImport } from "@/hooks/useImportListener";
import { useOwners } from "@/hooks/useOwners";
import { useWorks } from "@/hooks/useWorks";
import { useSupabaseHealth } from "@/hooks/useSupabaseHealth";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import type { ScrapePayloadV1 } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";
import "./LibraryPage.css";

/**
 * @description Bibliothèque principale — grille de tuiles couverture + titre.
 */
export function LibraryPage() {
  const navigate = useNavigate();
  const health = useSupabaseHealth();
  const { owners } = useOwners();
  const { works, loading, error, reload } = useWorks();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [importInitial, setImportInitial] = useState<Partial<WorkFormValues>>();

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

  useImportListener({ onImport: openFromImport });

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
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus size={18} aria-hidden />
          Ajouter une œuvre
        </button>
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
          <p>Importez depuis Nautiljon (Tampermonkey) ou ajoutez manuellement.</p>
        </section>
      ) : (
        <section className="library-grid">
          {works.map((work) => (
            <WorkTile
              key={work.id}
              work={work}
              onClick={(id) => navigate(`/work/${id}`)}
            />
          ))}
        </section>
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
