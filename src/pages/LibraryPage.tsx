import { useCallback, useState } from "react";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { WorkCard } from "@/features/works/WorkCard";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import { useImportListener, clearPendingImport } from "@/hooks/useImportListener";
import { useOwners } from "@/hooks/useOwners";
import { useWorks } from "@/hooks/useWorks";
import { scrapePayloadToFormValues } from "@/services/importMapService";
import type { ScrapePayloadV1 } from "@/types/database";
import type { WorkFormValues } from "@/types/workForm";
import { useSupabaseHealth } from "@/hooks/useSupabaseHealth";
import "./LibraryPage.css";

/**
 * @description Page principale : bibliothèque et ajout d'œuvres.
 */
export function LibraryPage() {
  const health = useSupabaseHealth();
  const { owners } = useOwners();
  const { works, loading, error, reload } = useWorks();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [importInitial, setImportInitial] = useState<Partial<WorkFormValues> | undefined>();

  const openCreate = () => {
    setEditingWorkId(null);
    setImportInitial(undefined);
    setModalOpen(true);
  };

  const openEdit = (workId: string) => {
    setEditingWorkId(workId);
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
          Chargement de la bibliothèque…
        </p>
      ) : error ? (
        <p className="library-error">{error}</p>
      ) : works.length === 0 ? (
        <section className="library-empty">
          <p>Aucune œuvre pour l'instant.</p>
          <p>
            Ajoutez manuellement ou importez depuis Nautiljon avec le script
            Tampermonkey (app bureau ouverte).
          </p>
        </section>
      ) : (
        <section className="work-grid">
          {works.map((work) => (
            <WorkCard key={work.id} work={work} onEdit={openEdit} />
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
