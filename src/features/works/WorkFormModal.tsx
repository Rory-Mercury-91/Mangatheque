import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { CollapsibleSection } from "@/components/common/CollapsibleSection";
import { CoverImage } from "@/components/common/CoverImage";
import { Modal } from "@/components/common/Modal";
import { VolumeFormRow } from "@/features/works/VolumeFormRow";
import type { Owner, PriceFormat } from "@/types/database";
import {
  createEmptyWorkFormValues,
  type VolumeFormRow as VolumeRow,
  type WorkFormValues,
} from "@/types/workForm";
import {
  createWorkWithVolumes,
  fetchWorkForEdit,
  updateWorkWithVolumes,
  workToFormValues,
} from "@/services/workService";
import { parseTagList } from "@/services/importMapService";
import "./WorkFormModal.css";

export interface WorkFormModalProps {
  open: boolean;
  workId?: string | null;
  initialValues?: Partial<WorkFormValues>;
  owners: Owner[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * @description Modale d'ajout ou modification (sections réductibles œuvre + tomes).
 */
export function WorkFormModal({
  open,
  workId,
  initialValues,
  owners,
  onClose,
  onSaved,
}: WorkFormModalProps) {
  const [form, setForm] = useState<WorkFormValues>(createEmptyWorkFormValues());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(workId);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setError(null);
      setLoading(true);
      try {
        if (workId) {
          const { work, volumes } = await fetchWorkForEdit(workId);
          if (!cancelled) {
            setForm(workToFormValues(work, volumes));
          }
        } else {
          if (!cancelled) {
            setForm({
              ...createEmptyWorkFormValues(),
              ...initialValues,
              volumes: initialValues?.volumes ?? [],
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur de chargement.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // initialValues lu à l'ouverture (import Nautiljon)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workId]);

  const patchForm = (patch: Partial<WorkFormValues>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }

    setSaving(true);
    try {
      if (workId) {
        await updateWorkWithVolumes(workId, form);
      } else {
        await createWorkWithVolumes(form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur à l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const addVolume = () => {
    const nextNumber =
      form.volumes.length === 0
        ? 1
        : Math.max(...form.volumes.map((v) => v.volumeNumber)) + 1;
    patchForm({
      volumes: [
        ...form.volumes,
        {
          volumeNumber: nextNumber,
          coverUrl: "",
          releaseDate: "",
          purchaseDate: "",
          editionType: "classic",
          ownerIds: [],
          mihonOwnerId: null,
        },
      ],
    });
  };

  const updateVolume = (index: number, patch: Partial<VolumeRow>) => {
    patchForm({
      volumes: form.volumes.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });
  };

  const removeVolume = (index: number) => {
    patchForm({ volumes: form.volumes.filter((_, i) => i !== index) });
  };

  return (
    <Modal
      open={open}
      title={isEdit ? "Modifier l'œuvre" : "Ajouter une œuvre"}
      onClose={onClose}
      wide
    >
      {loading ? (
        <p className="form-loading">
          <Loader2 size={18} className="spin" aria-hidden />
          Chargement…
        </p>
      ) : (
        <form className="work-form" onSubmit={handleSubmit}>
          <CollapsibleSection title="Œuvre — informations générales">
            <div className="work-general-layout">
              <div className="work-cover-block">
                <CoverImage url={form.coverUrl} alt={form.title || "Couverture"} />
                <label className="form-field">
                  <span>Couverture (URL)</span>
                  <input
                    value={form.coverUrl}
                    onChange={(e) => patchForm({ coverUrl: e.target.value })}
                  />
                </label>
              </div>

              <div className="form-grid">
                <label className="form-field form-field--full">
                  <span>Titre</span>
                  <input
                    value={form.title}
                    onChange={(e) => patchForm({ title: e.target.value })}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Type (démographie)</span>
                  <input
                    value={form.demographicType}
                    onChange={(e) => patchForm({ demographicType: e.target.value })}
                  />
                </label>
                <label className="form-field">
                  <span>Éditeur VF</span>
                  <input
                    value={form.publisherVf}
                    onChange={(e) => patchForm({ publisherVf: e.target.value })}
                  />
                </label>
                <label className="form-field">
                  <span>Genres (virgules)</span>
                  <input
                    value={form.genres.join(", ")}
                    onChange={(e) =>
                      patchForm({ genres: parseTagList(e.target.value) })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Thèmes (virgules)</span>
                  <input
                    value={form.themes.join(", ")}
                    onChange={(e) =>
                      patchForm({ themes: parseTagList(e.target.value) })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Tomes VF parus</span>
                  <input
                    type="number"
                    min={0}
                    value={form.volumesVfCount ?? ""}
                    onChange={(e) =>
                      patchForm({
                        volumesVfCount: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Tomes VO total</span>
                  <input
                    type="number"
                    min={0}
                    value={form.volumesVoTotal ?? ""}
                    onChange={(e) =>
                      patchForm({
                        volumesVoTotal: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Prix par défaut (€)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.defaultPrice ?? ""}
                    onChange={(e) =>
                      patchForm({
                        defaultPrice: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Format</span>
                  <select
                    value={form.priceFormat}
                    onChange={(e) =>
                      patchForm({ priceFormat: e.target.value as PriceFormat })
                    }
                  >
                    <option value="broche">Broché</option>
                    <option value="numerique">Numérique</option>
                  </select>
                </label>
                <label className="form-field form-field--full">
                  <span>URL source</span>
                  <input
                    value={form.sourceUrl}
                    onChange={(e) => patchForm({ sourceUrl: e.target.value })}
                  />
                </label>
                <label className="form-field form-field--full">
                  <span>Synopsis</span>
                  <textarea
                    rows={5}
                    value={form.synopsis}
                    onChange={(e) => patchForm({ synopsis: e.target.value })}
                  />
                </label>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={`Tomes — informations (${form.volumes.length} VF)`}
            actions={
              <button type="button" className="btn-secondary btn-sm" onClick={addVolume}>
                <Plus size={14} aria-hidden />
                Ajouter
              </button>
            }
          >
            {form.volumes.length === 0 ? (
              <p className="volume-empty">
                Aucun tome VF — importez depuis Nautiljon ou ajoutez manuellement.
              </p>
            ) : (
              <div className="volume-list">
                {form.volumes.map((volume, index) => (
                  <VolumeFormRow
                    key={`${volume.volumeNumber}-${index}`}
                    volume={volume}
                    owners={owners}
                    onChange={(patch) => updateVolume(index, patch)}
                    onRemove={() => removeVolume(index)}
                  />
                ))}
              </div>
            )}
          </CollapsibleSection>

          {error && <p className="form-error">{error}</p>}

          <footer className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
