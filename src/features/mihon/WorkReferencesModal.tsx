import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { CollapsibleSection } from "@/components/common/CollapsibleSection";
import {
  FormModalCancelButton,
  FormModalSaveButton,
} from "@/components/common/FormModalActions";
import { Modal } from "@/components/common/Modal";
import { NautiljonSearchModal } from "@/features/nautiljon/NautiljonSearchModal";
import { TrackerListPicker } from "@/features/tracker/TrackerListPicker";
import {
  saveWorkMihonSources,
  type WorkMihonSource,
} from "@/services/mihon/workMihonSourceService";
import { isTauriRuntime } from "@/lib/platform";
import { patchWorkReferences } from "@/services/workService";
import type { TrackerProvider } from "@/types/tracker";
import "@/components/common/ghostActionBtn.css";
import "@/features/works/WorkFormModal.css";
import "./WorkReferencesModal.css";

interface WorkMihonSourceDraft {
  sourceId: string;
  sourceName: string;
  catalogUrl: string;
}

interface WorkReferencesModalProps {
  open: boolean;
  workId: string;
  workTitle: string;
  initialSourceUrl: string | null;
  initialMalId: number | null;
  initialAnilistId: number | null;
  initialMihonSources: WorkMihonSource[];
  knownSourceNames?: ReadonlyMap<string, string>;
  onClose: () => void;
  onSaved: () => void;
}

const CUSTOM_SOURCE_VALUE = "__custom__";

function createEmptyDraft(): WorkMihonSourceDraft {
  return {
    sourceId: "",
    sourceName: "",
    catalogUrl: "",
  };
}

/**
 * @description Modale unique de gestion des références d'une œuvre.
 */
export function WorkReferencesModal({
  open,
  workId,
  workTitle,
  initialSourceUrl,
  initialMalId,
  initialAnilistId,
  initialMihonSources,
  knownSourceNames,
  onClose,
  onSaved,
}: WorkReferencesModalProps) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [malId, setMalId] = useState<number | null>(null);
  const [anilistId, setAnilistId] = useState<number | null>(null);
  const [mihonDraft, setMihonDraft] = useState<WorkMihonSourceDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackerPickerProvider, setTrackerPickerProvider] =
    useState<TrackerProvider | null>(null);
  const [nautiljonSearchOpen, setNautiljonSearchOpen] = useState(false);

  const sourceOptions = useMemo(
    () =>
      [...(knownSourceNames?.entries() ?? [])]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" })),
    [knownSourceNames],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTrackerPickerProvider(null);
    setNautiljonSearchOpen(false);
    setSourceUrl(initialSourceUrl?.trim() || "");
    setMalId(initialMalId ?? null);
    setAnilistId(initialAnilistId ?? null);
    setMihonDraft(
      initialMihonSources.length > 0
        ? initialMihonSources.map((source) => ({
            sourceId: source.sourceId,
            sourceName: source.sourceName ?? "",
            catalogUrl: source.catalogUrl ?? "",
          }))
        : [createEmptyDraft()],
    );
  }, [
    open,
    initialAnilistId,
    initialMalId,
    initialMihonSources,
    initialSourceUrl,
  ]);

  /**
   * @description Met à jour une ligne Mihon du brouillon.
   * @param index - Position de la ligne.
   * @param patch - Champs à fusionner.
   */
  const updateMihonRow = (index: number, patch: Partial<WorkMihonSourceDraft>) => {
    setMihonDraft((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const removeMihonRow = (index: number) => {
    setMihonDraft((current) =>
      current.length === 1 ? [createEmptyDraft()] : current.filter((_, i) => i !== index),
    );
  };

  const addMihonRow = () => {
    setMihonDraft((current) => [...current, createEmptyDraft()]);
  };

  const handleSave = async () => {
    const cleanedSourceUrl = sourceUrl.trim();
    if (cleanedSourceUrl) {
      try {
        void new URL(cleanedSourceUrl);
      } catch {
        setError("URL source invalide.");
        return;
      }
    }

    const cleanedSources = mihonDraft
      .map((row) => ({
        sourceId: row.sourceId.trim(),
        sourceName: row.sourceName.trim(),
        catalogUrl: row.catalogUrl.trim(),
      }))
      .filter((row) => row.sourceId || row.sourceName || row.catalogUrl);

    const seen = new Set<string>();
    for (const row of cleanedSources) {
      if (!row.sourceId) {
        setError("Chaque source Mihon doit avoir un identifiant.");
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
      await patchWorkReferences(workId, {
        sourceUrl: cleanedSourceUrl,
        malId,
        anilistId,
      });
      await saveWorkMihonSources(workId, cleanedSources);
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement des références impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        title="Références"
        onClose={onClose}
        wide
        stacked
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
        <div className="work-references-modal">
          <p className="work-references-modal-hint">
            Gérez ici la fiche source, les identifiants trackers et les sources
            Mihon de cette œuvre.
          </p>

          {error ? <p className="form-error">{error}</p> : null}

          <CollapsibleSection title="Fiche source" defaultOpen>
            <div className="work-references-modal-grid">
              <label className="form-field form-field--full">
                <span>URL de l&apos;œuvre</span>
                <div className="work-form-tracker-id-row">
                  <input
                    type="url"
                    value={sourceUrl}
                    disabled={saving}
                    placeholder="https://www.nautiljon.com/mangas/…"
                    onChange={(event) => setSourceUrl(event.target.value)}
                  />
                  {isTauriRuntime() ? (
                    <button
                      type="button"
                      className="ghost-action-btn work-form-tracker-search-btn"
                      title="Rechercher une fiche Nautiljon"
                      aria-label="Rechercher une fiche Nautiljon"
                      disabled={saving || !workTitle.trim()}
                      onClick={() => setNautiljonSearchOpen(true)}
                    >
                      <Search size={16} aria-hidden />
                      <span className="ghost-action-label">Rechercher</span>
                    </button>
                  ) : null}
                </div>
              </label>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Trackers" defaultOpen={false}>
            <div className="work-references-modal-grid">
              <div className="form-field form-field--tracker-id">
                <span>MAL ID</span>
                <div className="work-form-tracker-id-row">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={malId ?? ""}
                    placeholder="ex. 13"
                    disabled={saving}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      setMalId(raw === "" ? null : Number(raw) || null);
                    }}
                  />
                  <button
                    type="button"
                    className="ghost-action-btn work-form-tracker-search-btn"
                    title="Rechercher dans ma liste MyAnimeList"
                    aria-label="Rechercher dans ma liste MyAnimeList"
                    disabled={saving}
                    onClick={() => setTrackerPickerProvider("mal")}
                  >
                    <Search size={16} aria-hidden />
                    <span className="ghost-action-label">Rechercher</span>
                  </button>
                </div>
              </div>

              <div className="form-field form-field--tracker-id">
                <span>AniList ID</span>
                <div className="work-form-tracker-id-row">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={anilistId ?? ""}
                    placeholder="ex. 30013"
                    disabled={saving}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      setAnilistId(raw === "" ? null : Number(raw) || null);
                    }}
                  />
                  <button
                    type="button"
                    className="ghost-action-btn work-form-tracker-search-btn"
                    title="Rechercher dans ma liste AniList"
                    aria-label="Rechercher dans ma liste AniList"
                    disabled={saving}
                    onClick={() => setTrackerPickerProvider("anilist")}
                  >
                    <Search size={16} aria-hidden />
                    <span className="ghost-action-label">Rechercher</span>
                  </button>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Sources Mihon"
            defaultOpen={initialMihonSources.length > 0}
          >
            <div className="work-references-modal-mihon-list">
              {mihonDraft.map((row, index) => {
                const knownLabel =
                  row.sourceId.trim()
                    ? knownSourceNames?.get(row.sourceId.trim())?.trim() || ""
                    : "";
                const selectValue =
                  row.sourceId.trim() && sourceOptions.some((item) => item.id === row.sourceId.trim())
                    ? row.sourceId.trim()
                    : CUSTOM_SOURCE_VALUE;

                return (
                  <div
                    key={`mihon-reference-${index}`}
                    className="work-references-modal-mihon-row"
                  >
                    <label className="form-field">
                      <span>Source</span>
                      <select
                        value={selectValue}
                        disabled={saving}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          if (nextId === CUSTOM_SOURCE_VALUE) {
                            updateMihonRow(index, {
                              sourceId: selectValue === CUSTOM_SOURCE_VALUE ? row.sourceId : "",
                            });
                            return;
                          }
                          updateMihonRow(index, {
                            sourceId: nextId,
                            sourceName:
                              row.sourceName.trim() || knownSourceNames?.get(nextId) || "",
                          });
                        }}
                      >
                        {sourceOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                        <option value={CUSTOM_SOURCE_VALUE}>Autre…</option>
                      </select>
                    </label>

                    {selectValue === CUSTOM_SOURCE_VALUE ? (
                      <label className="form-field">
                        <span>ID source</span>
                        <input
                          type="text"
                          value={row.sourceId}
                          disabled={saving}
                          placeholder="ex. eu.kanade.tachiyomi.extension.fr…"
                          onChange={(event) =>
                            updateMihonRow(index, { sourceId: event.target.value })
                          }
                        />
                      </label>
                    ) : null}

                    <label className="form-field">
                      <span>Nom affiché</span>
                      <input
                        type="text"
                        value={row.sourceName}
                        disabled={saving}
                        placeholder={knownLabel || "ex. Manga-Scantrad"}
                        onChange={(event) =>
                          updateMihonRow(index, { sourceName: event.target.value })
                        }
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
                          onChange={(event) =>
                            updateMihonRow(index, { catalogUrl: event.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="ghost-action-btn ghost-action-btn--danger"
                          title="Supprimer cette source"
                          aria-label="Supprimer cette source Mihon"
                          disabled={saving}
                          onClick={() => removeMihonRow(index)}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="work-references-modal-actions">
              <button
                type="button"
                className="ghost-action-btn"
                disabled={saving}
                onClick={addMihonRow}
                title="Ajouter une source Mihon"
                aria-label="Ajouter une source Mihon"
              >
                <Plus size={16} aria-hidden />
                <span className="ghost-action-label">Ajouter une source</span>
              </button>
            </div>
          </CollapsibleSection>
        </div>
      </Modal>

      <TrackerListPicker
        open={trackerPickerProvider != null}
        provider={trackerPickerProvider ?? "anilist"}
        initialQuery={workTitle}
        onClose={() => setTrackerPickerProvider(null)}
        onSelect={(selection) => {
          if (selection.malId != null) {
            setMalId(selection.malId);
          }
          if (selection.anilistId != null) {
            setAnilistId(selection.anilistId);
          }
        }}
      />

      <NautiljonSearchModal
        open={nautiljonSearchOpen}
        initialQuery={workTitle.trim()}
        initialKind="manga"
        lockKind
        contextLabel={workTitle.trim() || null}
        onClose={() => setNautiljonSearchOpen(false)}
        onSelect={(hit) => {
          setSourceUrl(hit.pageUrl);
          setNautiljonSearchOpen(false);
        }}
      />
    </>
  );
}
