import { useEffect, useId, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { CollapsibleSection } from "@/components/common/CollapsibleSection";
import { CoverImage } from "@/components/common/CoverImage";
import { Modal } from "@/components/common/Modal";
import { TogglePill } from "@/components/common/TogglePill";
import { WORK_STATUS_OPTIONS } from "@/constants/workStatus";
import {
  getOwnerBadgeLabel,
  getOwnerColor,
  MIHON_COLOR,
} from "@/constants/ownerColors";
import { VolumeFormRow } from "@/features/works/VolumeFormRow";
import { isMobileRuntime } from "@/lib/platform";
import type { Owner, PriceFormat, WorkReadingStatus } from "@/types/database";
import {
  createEmptyVolumeRow,
  createEmptyWorkFormValues,
  getNextVolumeNumber,
  type VolumeFormRow as VolumeRow,
  type WorkFormValues,
} from "@/types/workForm";
import {
  createWorkWithVolumes,
  fetchWorkForEdit,
  findWorkByTitle,
  updateWorkWithVolumes,
  workToFormValues,
} from "@/services/workService";
import { parseTagList, applyMihonToFormValues, applyPurchaseOwnersToFormValues } from "@/services/importMapService";
import { shouldHideChapterVolumeGrid } from "@/utils/chapterSeries";
import { ImportJsonSection } from "@/features/works/ImportJsonSection";
import { updateVolumeWithPropagation } from "@/utils/volumeOwnerPropagation";
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
 * @description Modale d'ajout ou modification (sections réductibles série + tomes).
 */
export function WorkFormModal({
  open,
  workId,
  initialValues,
  owners,
  onClose,
  onSaved,
}: WorkFormModalProps) {
  const mobile = isMobileRuntime();
  const [form, setForm] = useState<WorkFormValues>(createEmptyWorkFormValues());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSectionOpen, setImportSectionOpen] = useState(true);
  const [workSectionOpen, setWorkSectionOpen] = useState(true);
  const [volumesSectionOpen, setVolumesSectionOpen] = useState(true);
  const [volumeExpanded, setVolumeExpanded] = useState<Record<number, boolean>>(
    {},
  );
  const formId = useId();
  const isEdit = Boolean(workId);

  useEffect(() => {
    setVolumeExpanded((prev) => {
      const next = { ...prev };
      form.volumes.forEach((_, index) => {
        if (next[index] === undefined) {
          next[index] = true;
        }
      });
      return next;
    });
  }, [form.volumes.length]);

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
    const nextNumber = getNextVolumeNumber(form.volumes);
    patchForm({
      volumes: [...form.volumes, createEmptyVolumeRow(nextNumber)],
    });
  };

  const updateVolume = (index: number, patch: Partial<VolumeRow>) => {
    patchForm({
      volumes: updateVolumeWithPropagation(form.volumes, index, patch),
    });
  };

  const removeVolume = (index: number) => {
    patchForm({ volumes: form.volumes.filter((_, i) => i !== index) });
  };

  const unitLabel = form.trackingUnit === "chapter" ? "chapitres" : "tomes";
  const unitLabelSingular = form.trackingUnit === "chapter" ? "chapitre" : "tome";
  const hideChapterVolumeList = shouldHideChapterVolumeGrid(
    form.volumes,
    form.trackingUnit,
  );
  const sharedMihonOwnerId =
    form.volumes.length > 0 &&
    form.volumes.every((volume) => volume.mihonOwnerId === form.volumes[0]?.mihonOwnerId)
      ? form.volumes[0]?.mihonOwnerId ?? null
      : null;
  const sharedPurchaseOwnerIds =
    form.volumes.length > 0 &&
    form.volumes.every(
      (volume) =>
        volume.mihonOwnerId == null &&
        volume.ownerIds.length === form.volumes[0]?.ownerIds.length &&
        volume.ownerIds.every((id) => form.volumes[0]?.ownerIds.includes(id)),
    )
      ? [...(form.volumes[0]?.ownerIds ?? [])]
      : [];

  const applyBulkMihon = (ownerId: string | null) => {
    setForm((current) => applyMihonToFormValues(current, ownerId));
    if (ownerId) {
      setVolumesSectionOpen(true);
    }
  };

  const toggleBulkPurchaseOwner = (ownerId: string) => {
    setForm((current) => {
      const baseIds = sharedPurchaseOwnerIds;
      const nextIds = baseIds.includes(ownerId)
        ? baseIds.filter((id) => id !== ownerId)
        : [...baseIds, ownerId];
      return applyPurchaseOwnersToFormValues(current, nextIds);
    });
    setVolumesSectionOpen(true);
  };

  const handleImportApply = async (values: WorkFormValues) => {
    setError(null);
    try {
      const existing = await findWorkByTitle(values.title.trim());
      if (existing) {
        setError(
          `La série « ${existing.title} » existe déjà dans la bibliothèque.`,
        );
        return;
      }
      setForm(values);
      setWorkSectionOpen(true);
      setVolumesSectionOpen(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Vérification du doublon impossible.",
      );
    }
  };

  const expandAll = () => {
    if (!isEdit && mobile) {
      setImportSectionOpen(true);
    }
    setWorkSectionOpen(true);
    setVolumesSectionOpen(true);
    const all: Record<number, boolean> = {};
    form.volumes.forEach((_, index) => {
      all[index] = true;
    });
    setVolumeExpanded(all);
  };

  const collapseAll = () => {
    if (!isEdit && mobile) {
      setImportSectionOpen(false);
    }
    setWorkSectionOpen(false);
    setVolumesSectionOpen(false);
    const all: Record<number, boolean> = {};
    form.volumes.forEach((_, index) => {
      all[index] = false;
    });
    setVolumeExpanded(all);
  };

  return (
    <Modal
      open={open}
      title={isEdit ? "Modifier la série" : "Ajouter une série"}
      onClose={onClose}
      wide
      footer={
        loading ? null : (
          <div className="modal-footer-stack">
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Annuler
              </button>
              <button
                type="submit"
                form={formId}
                className="btn-primary"
                disabled={saving}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        )
      }
    >
      {loading ? (
        <p className="form-loading">
          <Loader2 size={18} className="spin" aria-hidden />
          Chargement…
        </p>
      ) : (
        <form
          id={formId}
          className="work-form work-form--modal"
          onSubmit={handleSubmit}
        >
          <div className="form-expand-toolbar">
            <button type="button" className="btn-secondary btn-sm" onClick={expandAll}>
              Tout déplier
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={collapseAll}>
              Tout plier
            </button>
          </div>

          {!isEdit && mobile ? (
            <CollapsibleSection
              title="Import Json"
              open={importSectionOpen}
              onOpenChange={setImportSectionOpen}
              className="work-form-import-section"
            >
              <ImportJsonSection
                compactMobile
                owners={owners}
                onApply={(v) => void handleImportApply(v)}
              />
            </CollapsibleSection>
          ) : null}

          {!isEdit && !mobile ? (
            <ImportJsonSection owners={owners} onApply={(v) => void handleImportApply(v)} />
          ) : null}

          <CollapsibleSection
            title="Informations générales"
            open={workSectionOpen}
            onOpenChange={setWorkSectionOpen}
          >
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
                  <span>Statut de la série</span>
                  <select
                    value={form.readingStatus}
                    onChange={(e) =>
                      patchForm({
                        readingStatus: e.target.value as WorkReadingStatus,
                      })
                    }
                  >
                    {WORK_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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
                  <span>Suivi par</span>
                  <select
                    value={form.trackingUnit}
                    onChange={(e) =>
                      patchForm({
                        trackingUnit: e.target.value as WorkFormValues["trackingUnit"],
                      })
                    }
                  >
                    <option value="volume">Tomes</option>
                    <option value="chapter">Chapitres</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>
                    {form.trackingUnit === "chapter"
                      ? "Chapitres VF parus"
                      : "Tomes VF parus"}
                  </span>
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
                  <span>
                    {form.trackingUnit === "chapter"
                      ? "Chapitres VO total"
                      : "Tomes VO total"}
                  </span>
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
            className="work-form-volumes-section"
            title={form.trackingUnit === "chapter" ? "Chapitres" : "Tomes"}
            open={volumesSectionOpen}
            onOpenChange={setVolumesSectionOpen}
            actions={
              <button type="button" className="btn-secondary btn-sm" onClick={addVolume}>
                <Plus size={14} aria-hidden />
                Ajouter
              </button>
            }
          >
            <div className="volume-bulk-mihon">
              <span className="volume-owners-label">Achat — tous les {unitLabel}</span>
              <div className="toggle-pill-group">
                {owners.map((owner) => (
                  <TogglePill
                    key={`bulk-purchase-${owner.id}`}
                    label={getOwnerBadgeLabel(owner.name)}
                    color={getOwnerColor(owner.name)}
                    active={sharedPurchaseOwnerIds.includes(owner.id)}
                    disabled={sharedMihonOwnerId != null}
                    onClick={() => toggleBulkPurchaseOwner(owner.id)}
                  />
                ))}
              </div>
            </div>
            <div className="volume-bulk-mihon">
              <span className="volume-owners-label">Mihon — tous les {unitLabel}</span>
              <div className="toggle-pill-group">
                {owners.map((owner) => (
                  <TogglePill
                    key={`bulk-mihon-${owner.id}`}
                    label={getOwnerBadgeLabel(owner.name)}
                    color={MIHON_COLOR}
                    active={sharedMihonOwnerId === owner.id}
                    onClick={() =>
                      applyBulkMihon(
                        sharedMihonOwnerId === owner.id ? null : owner.id,
                      )
                    }
                  />
                ))}
              </div>
              <p className="volume-bulk-mihon-hint">
                {form.trackingUnit === "chapter"
                  ? "Une seule ligne « Série numérique » — le compteur VF reste sur la fiche série."
                  : `Applique le compte Mihon à chaque ${unitLabelSingular} listé.`}
              </p>
            </div>
            {form.volumes.length === 0 ? (
              <p className="volume-empty">
                {form.trackingUnit === "chapter"
                  ? "Aucune appartenance — choisissez achat ou Mihon ci-dessus."
                  : "Aucun tome VF — importez depuis Nautiljon ou ajoutez manuellement."}
              </p>
            ) : hideChapterVolumeList ? (
              <p className="volume-empty">
                Appartenance renseignée au niveau série
                {form.volumesVfCount ? ` (${form.volumesVfCount} ch. VF)` : ""}.
              </p>
            ) : (
              <div className="volume-list-scroll">
                <div className="volume-list">
                  {form.volumes.map((volume, index) => (
                    <VolumeFormRow
                      key={`${volume.volumeNumber ?? "x"}-${volume.volumeLabel ?? ""}-${index}`}
                      volume={volume}
                      owners={owners}
                      trackingUnit={form.trackingUnit}
                      expanded={volumeExpanded[index] ?? true}
                      onExpandedChange={(value) =>
                        setVolumeExpanded((prev) => ({ ...prev, [index]: value }))
                      }
                      onChange={(patch) => updateVolume(index, patch)}
                      onRemove={() => removeVolume(index)}
                    />
                  ))}
                </div>
              </div>
            )}
          </CollapsibleSection>
        </form>
      )}
    </Modal>
  );
}
