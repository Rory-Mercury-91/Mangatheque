import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  FormModalCancelButton,
  FormModalSaveButton,
} from "@/components/common/FormModalActions";
import { Modal } from "@/components/common/Modal";
import {
  saveWorkMihonSources,
  type WorkMihonSource,
} from "@/services/mihon/workMihonSourceService";
import "@/components/common/ghostActionBtn.css";
import "@/features/works/WorkFormModal.css";
import "./WorkMihonSourcesModal.css";

interface WorkMihonSourceDraft {
  sourceId: string;
  sourceName: string;
  catalogUrl: string;
}

interface WorkMihonSourcesModalProps {
  open: boolean;
  workId: string;
  initialSources: WorkMihonSource[];
  knownSourceNames?: ReadonlyMap<string, string>;
  onClose: () => void;
  onSaved: (sources: WorkMihonSource[]) => void;
}

function createEmptyDraft(): WorkMihonSourceDraft {
  return {
    sourceId: "",
    sourceName: "",
    catalogUrl: "",
  };
}

/**
 * @description Modale d'édition manuelle des sources Mihon d'une œuvre.
 */
export function WorkMihonSourcesModal({
  open,
  workId,
  initialSources,
  knownSourceNames,
  onClose,
  onSaved,
}: WorkMihonSourcesModalProps) {
  const [draft, setDraft] = useState<WorkMihonSourceDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      initialSources.length > 0
        ? initialSources.map((source) => ({
            sourceId: source.sourceId,
            sourceName: source.sourceName ?? "",
            catalogUrl: source.catalogUrl ?? "",
          }))
        : [createEmptyDraft()],
    );
  }, [open, initialSources]);

  /**
   * @description Met à jour une ligne du brouillon.
   * @param index - Index de la ligne.
   * @param patch - Champs à fusionner.
   */
  const updateRow = (index: number, patch: Partial<WorkMihonSourceDraft>) => {
    setDraft((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const removeRow = (index: number) => {
    setDraft((current) =>
      current.length === 1 ? [createEmptyDraft()] : current.filter((_, i) => i !== index),
    );
  };

  const addRow = () => {
    setDraft((current) => [...current, createEmptyDraft()]);
  };

  const handleSave = async () => {
    const cleaned = draft
      .map((row) => ({
        sourceId: row.sourceId.trim(),
        sourceName: row.sourceName.trim(),
        catalogUrl: row.catalogUrl.trim(),
      }))
      .filter((row) => row.sourceId || row.sourceName || row.catalogUrl);

    const seen = new Set<string>();
    for (const row of cleaned) {
      if (!row.sourceId) {
        setError("Chaque ligne doit contenir un identifiant de source Mihon.");
        return;
      }
      if (row.catalogUrl) {
        try {
          void new URL(row.catalogUrl);
        } catch {
          setError(`URL catalogue invalide pour « ${row.sourceId} ».`);
          return;
        }
      }
      if (seen.has(row.sourceId)) {
        setError(`La source Mihon « ${row.sourceId} » est en double.`);
        return;
      }
      seen.add(row.sourceId);
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await saveWorkMihonSources(workId, cleaned);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement des sources impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Sources Mihon"
      onClose={onClose}
      wide
      footer={
        <div className="form-actions">
          <FormModalCancelButton onClick={onClose} disabled={saving} />
          <FormModalSaveButton
            saving={saving}
            disabled={saving}
            onClick={() => void handleSave()}
          />
        </div>
      }
    >
      <p className="work-mihon-sources-modal-hint">
        Modifiez les sources rattachées à cette fiche, supprimez celles devenues
        obsolètes, ou ajoutez-en manuellement.
      </p>
      {error ? <p className="form-error">{error}</p> : null}

      <div className="work-mihon-sources-modal-list">
        {draft.map((row, index) => {
          const resolvedName =
            row.sourceId.trim() && !row.sourceName.trim()
              ? knownSourceNames?.get(row.sourceId.trim())?.trim() || ""
              : "";
          return (
            <div
              key={`mihon-source-${index}`}
              className="work-mihon-sources-modal-row"
            >
              <label className="form-field">
                <span>ID source</span>
                <input
                  type="text"
                  value={row.sourceId}
                  disabled={saving}
                  placeholder="ex. eu.kanade.tachiyomi.extension.fr..."
                  onChange={(e) => updateRow(index, { sourceId: e.target.value })}
                />
              </label>

              <label className="form-field">
                <span>Nom affiché</span>
                <input
                  type="text"
                  value={row.sourceName}
                  disabled={saving}
                  placeholder={resolvedName || "ex. Manga-Scantrad"}
                  onChange={(e) => updateRow(index, { sourceName: e.target.value })}
                />
              </label>

              <label className="form-field">
                <span>URL catalogue</span>
                <div className="form-field-row">
                  <input
                    type="url"
                    value={row.catalogUrl}
                    disabled={saving}
                    placeholder="https://…"
                    onChange={(e) => updateRow(index, { catalogUrl: e.target.value })}
                  />
                  <button
                    type="button"
                    className="ghost-action-btn ghost-action-btn--danger"
                    title="Supprimer cette source"
                    aria-label="Supprimer cette source Mihon"
                    disabled={saving}
                    onClick={() => removeRow(index)}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </label>
            </div>
          );
        })}
      </div>

      <div className="work-mihon-sources-modal-actions">
        <button
          type="button"
          className="ghost-action-btn"
          disabled={saving}
          onClick={addRow}
          title="Ajouter une source Mihon"
          aria-label="Ajouter une source Mihon"
        >
          <Plus size={16} aria-hidden />
          <span className="ghost-action-label">Ajouter une source</span>
        </button>
      </div>
    </Modal>
  );
}
