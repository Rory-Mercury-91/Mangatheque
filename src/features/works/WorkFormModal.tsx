import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import type { Owner, PriceFormat } from "@/types/database";
import {
  createEmptyWorkFormValues,
  type VolumeFormRow,
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
 * @description Modale d'ajout ou modification d'une œuvre et de ses tomes.
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
          const merged = {
            ...createEmptyWorkFormValues(),
            ...initialValues,
            volumes: initialValues?.volumes ?? [],
          };
          if (!cancelled) {
            setForm(merged);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erreur de chargement.",
          );
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
    // initialValues appliqué uniquement à l'ouverture (import Nautiljon)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workId]);

  /**
   * @description Met à jour un champ simple du formulaire œuvre.
   */
  const patchForm = (patch: Partial<WorkFormValues>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  /**
   * @description Enregistre l'œuvre et ferme la modale.
   */
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
          <section className="form-grid">
            <label className="form-field form-field--full">
              <span>Titre</span>
              <input
                value={form.title}
                onChange={(e) => patchForm({ title: e.target.value })}
                placeholder="Titre VF"
                required
              />
            </label>

            <label className="form-field">
              <span>Type (démographie)</span>
              <input
                value={form.demographicType}
                onChange={(e) => patchForm({ demographicType: e.target.value })}
                placeholder="Shonen, Seinen…"
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
                placeholder="https://www.nautiljon.com/…"
              />
            </label>

            <label className="form-field form-field--full">
              <span>Couverture (URL)</span>
              <input
                value={form.coverUrl}
                onChange={(e) => patchForm({ coverUrl: e.target.value })}
              />
            </label>

            <label className="form-field form-field--full">
              <span>Synopsis</span>
              <textarea
                rows={4}
                value={form.synopsis}
                onChange={(e) => patchForm({ synopsis: e.target.value })}
              />
            </label>
          </section>

          <VolumeSection
            volumes={form.volumes}
            owners={owners}
            onChange={(volumes) => patchForm({ volumes })}
          />

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

interface VolumeSectionProps {
  volumes: VolumeFormRow[];
  owners: Owner[];
  onChange: (volumes: VolumeFormRow[]) => void;
}

/**
 * @description Section tomes dans le formulaire œuvre.
 */
function VolumeSection({ volumes, owners, onChange }: VolumeSectionProps) {
  const addVolume = () => {
    const nextNumber =
      volumes.length === 0
        ? 1
        : Math.max(...volumes.map((v) => v.volumeNumber)) + 1;
    onChange([
      ...volumes,
      {
        volumeNumber: nextNumber,
        coverUrl: "",
        releaseDate: "",
        purchaseDate: "",
        editionType: "classic",
        ownerIds: [],
        mihonOwnerId: null,
      },
    ]);
  };

  const updateVolume = (index: number, patch: Partial<VolumeFormRow>) => {
    onChange(
      volumes.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const removeVolume = (index: number) => {
    onChange(volumes.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <section className="volume-section">
      <div className="volume-section-header">
        <h3>Tomes</h3>
        <button type="button" className="btn-secondary" onClick={addVolume}>
          <Plus size={16} aria-hidden />
          Ajouter un tome
        </button>
      </div>

      {volumes.length === 0 ? (
        <p className="volume-empty">Aucun tome — importez depuis Nautiljon ou ajoutez manuellement.</p>
      ) : (
        <div className="volume-list">
          {volumes.map((volume, index) => (
            <VolumeRow
              key={`${volume.volumeNumber}-${index}`}
              volume={volume}
              owners={owners}
              onChange={(patch) => updateVolume(index, patch)}
              onRemove={() => removeVolume(index)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface VolumeRowProps {
  volume: VolumeFormRow;
  owners: Owner[];
  onChange: (patch: Partial<VolumeFormRow>) => void;
  onRemove: () => void;
}

/**
 * @description Ligne d'édition d'un tome (propriétaires, Mihon, dates).
 */
function VolumeRow({ volume, owners, onChange, onRemove }: VolumeRowProps) {
  const isMihon = volume.mihonOwnerId != null;

  const toggleOwner = (ownerId: string, checked: boolean) => {
    const next = checked
      ? [...volume.ownerIds, ownerId]
      : volume.ownerIds.filter((id) => id !== ownerId);
    onChange({ ownerIds: next, mihonOwnerId: null });
  };

  const setMihonOwner = (ownerId: string | null) => {
    onChange({
      mihonOwnerId: ownerId,
      ownerIds: ownerId ? [] : volume.ownerIds,
    });
  };

  return (
    <article className="volume-row">
      <div className="volume-row-top">
        <strong>Tome {volume.volumeNumber}</strong>
        <button
          type="button"
          className="btn-icon"
          onClick={onRemove}
          aria-label={`Supprimer le tome ${volume.volumeNumber}`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="form-grid form-grid--compact">
        <label className="form-field">
          <span>N°</span>
          <input
            type="number"
            min={1}
            value={volume.volumeNumber}
            onChange={(e) =>
              onChange({ volumeNumber: Number(e.target.value) || 1 })
            }
          />
        </label>
        <label className="form-field">
          <span>Sortie</span>
          <input
            type="date"
            value={volume.releaseDate}
            onChange={(e) => onChange({ releaseDate: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Achat</span>
          <input
            type="date"
            value={volume.purchaseDate}
            onChange={(e) => onChange({ purchaseDate: e.target.value })}
            disabled={isMihon}
          />
        </label>
        <label className="form-field">
          <span>Édition</span>
          <select
            value={volume.editionType}
            onChange={(e) =>
              onChange({
                editionType: e.target.value as VolumeFormRow["editionType"],
              })
            }
          >
            <option value="classic">Classique</option>
            <option value="collector">Collector</option>
          </select>
        </label>
      </div>

      <label className="form-field form-field--full">
        <span>Couverture (URL)</span>
        <input
          value={volume.coverUrl}
          onChange={(e) => onChange({ coverUrl: e.target.value })}
        />
      </label>

      <fieldset className="owner-fieldset">
        <legend>Achat physique</legend>
        <div className="owner-checkboxes">
          {owners.map((owner) => (
            <label key={owner.id} className="owner-check">
              <input
                type="checkbox"
                checked={volume.ownerIds.includes(owner.id)}
                disabled={isMihon}
                onChange={(e) => toggleOwner(owner.id, e.target.checked)}
              />
              <span style={{ borderColor: owner.color }}>{owner.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="form-field">
        <span>Sur le Mihon de…</span>
        <select
          value={volume.mihonOwnerId ?? ""}
          onChange={(e) => setMihonOwner(e.target.value || null)}
        >
          <option value="">— Achat physique —</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}
