import { useEffect, useId, useState } from "react";
import { Plus } from "lucide-react";
import { CollapsibleSection } from "@/components/common/CollapsibleSection";
import { CoverImage } from "@/components/common/CoverImage";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { Modal } from "@/components/common/Modal";
import { WORK_STATUS_OPTIONS } from "@/constants/workStatus";
import { VolumeBulkOwnershipBar } from "@/features/works/VolumeBulkOwnershipBar";
import { VolumeFormRow } from "@/features/works/VolumeFormRow";
import { isMobileRuntime } from "@/lib/platform";
import type { Owner, PriceFormat, ScrapePayloadV1, Work, WorkReadingStatus } from "@/types/database";
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
  findChapterSisterWork,
  findWorkByTitle,
  updateWorkWithVolumes,
  workToFormValues,
} from "@/services/workService";
import { parseTagList, applyImportOwnershipToFormValues, applyMihonToFormValues, applyPurchaseOwnersToFormValues } from "@/services/importMapService";
import { shouldHideChapterVolumeGrid } from "@/utils/chapterSeries";
import { buildChapterSisterWorkFormValuesFromForm } from "@/utils/chapterSisterWork";
import {
  canDuplicateVolumeEdition,
  getAlternateEditionType,
  getDuplicateVolumeEditionLabel,
} from "@/utils/volumeIdentity";
import { ImportJsonSection } from "@/features/works/ImportJsonSection";
import "./WorkFormModal.css";

export interface WorkFormModalProps {
  open: boolean;
  workId?: string | null;
  initialValues?: Partial<WorkFormValues>;
  /** Appartenance brute depuis l'import Nautiljon (réappliquée quand owners est chargé). */
  importOwnership?: Pick<ScrapePayloadV1, "ownerNames" | "mihonOwnerName">;
  owners: Owner[];
  onClose: () => void;
  /** @param workId - Identifiant créé ou mis à jour. */
  onSaved: (workId?: string) => void;
  /** @description Navigation vers la série chapitres jumelle déjà existante. */
  onOpenChapterSister?: (chapterWorkId: string) => void;
}

/**
 * @description Modale d'ajout ou modification (sections réductibles série + tomes).
 */
export function WorkFormModal({
  open,
  workId,
  initialValues,
  importOwnership,
  owners,
  onClose,
  onSaved,
  onOpenChapterSister,
}: WorkFormModalProps) {
  const mobile = isMobileRuntime();
  const [form, setForm] = useState<WorkFormValues>(createEmptyWorkFormValues());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSectionOpen, setImportSectionOpen] = useState(true);
  const [workSectionOpen, setWorkSectionOpen] = useState(true);
  const [kindSectionOpen, setKindSectionOpen] = useState(true);
  const [volumesSectionOpen, setVolumesSectionOpen] = useState(true);
  const [volumeExpanded, setVolumeExpanded] = useState<Record<number, boolean>>(
    {},
  );
  const [chapterSister, setChapterSister] = useState<Work | null>(null);
  const [chapterSisterModalOpen, setChapterSisterModalOpen] = useState(false);
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
            const base: WorkFormValues = {
              ...createEmptyWorkFormValues(),
              ...initialValues,
              volumes: initialValues?.volumes ?? [],
            };
            const hasImportOwnership =
              importOwnership &&
              owners.length > 0 &&
              (Boolean(importOwnership.mihonOwnerName) ||
                (importOwnership.ownerNames?.length ?? 0) > 0);
            setForm(
              hasImportOwnership
                ? applyImportOwnershipToFormValues(base, owners, importOwnership)
                : base,
            );
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

  useEffect(() => {
    if (!open || !workId || form.trackingUnit !== "volume") {
      setChapterSister(null);
      return;
    }

    let cancelled = false;
    void findChapterSisterWork({ id: workId, title: form.title })
      .then((result) => {
        if (!cancelled) {
          setChapterSister(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChapterSister(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, workId, form.trackingUnit, form.title]);

  /** @description Réapplique Mihon / achat si les owners arrivent après le premier rendu du formulaire. */
  useEffect(() => {
    if (!open || workId || owners.length === 0 || !importOwnership) {
      return;
    }
    const hasOwnership =
      Boolean(importOwnership.mihonOwnerName) ||
      (importOwnership.ownerNames?.length ?? 0) > 0;
    if (!hasOwnership) {
      return;
    }
    setForm((current) => {
      if (current.volumes.length === 0) {
        return current;
      }
      const first = current.volumes[0];
      const wantsMihon = Boolean(importOwnership.mihonOwnerName);
      const wantsPurchase = (importOwnership.ownerNames?.length ?? 0) > 0;
      const hasMihon = Boolean(first.mihonOwnerId);
      const hasPurchase = first.ownerIds.length > 0;
      if ((!wantsMihon || hasMihon) && (!wantsPurchase || hasPurchase)) {
        return current;
      }
      return applyImportOwnershipToFormValues(current, owners, importOwnership);
    });
  }, [open, workId, owners, importOwnership]);

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
        onSaved(workId);
      } else {
        const createdWorkId = await createWorkWithVolumes(form);
        onSaved(createdWorkId);
      }
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
      volumes: form.volumes.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });
  };

  const removeVolume = (index: number) => {
    patchForm({ volumes: form.volumes.filter((_, i) => i !== index) });
  };

  const duplicateVolumeEdition = (index: number) => {
    const source = form.volumes[index];
    if (!source || !canDuplicateVolumeEdition(source, form.volumes)) {
      return;
    }

    const duplicate: VolumeRow = {
      ...source,
      id: undefined,
      editionType: getAlternateEditionType(source.editionType),
    };

    patchForm({
      volumes: [
        ...form.volumes.slice(0, index + 1),
        duplicate,
        ...form.volumes.slice(index + 1),
      ],
    });

    setVolumeExpanded((previous) => {
      const next: Record<number, boolean> = {};
      for (const [key, value] of Object.entries(previous)) {
        const rowIndex = Number(key);
        next[rowIndex > index ? rowIndex + 1 : rowIndex] = value;
      }
      next[index + 1] = true;
      return next;
    });
  };

  const kindSectionTitle =
    form.trackingUnit === "chapter" ? "Chapitres VF" : "Tomes VF";
  const modalTitle = isEdit
    ? "Modifier la série"
    : `Ajouter une série — ${kindSectionTitle}`;

  const parseOptionalNumber = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

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
      setKindSectionOpen(true);
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
    setKindSectionOpen(true);
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
    setKindSectionOpen(false);
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
      title={modalTitle}
      onClose={onClose}
      wide
      footer={
        loading ? null : (
          <div className="modal-footer-stack">
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              {isEdit && form.trackingUnit === "volume" ? (
                chapterSister ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onOpenChapterSister?.(chapterSister.id)}
                  >
                    Voir suivi chapitres
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setChapterSisterModalOpen(true)}
                  >
                    Créer suivi chapitres
                  </button>
                )
              ) : null}
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
        <LoadingOverlayHost modal>
          <LoadingOverlay message="Chargement de la fiche…" />
        </LoadingOverlayHost>
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
            title="Informations communes"
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
            title={kindSectionTitle}
            open={kindSectionOpen}
            onOpenChange={setKindSectionOpen}
          >
            <div className="form-grid">
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
                      volumesVfCount: parseOptionalNumber(e.target.value),
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
                      volumesVoTotal: parseOptionalNumber(e.target.value),
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
                      defaultPrice: parseOptionalNumber(e.target.value),
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
            <VolumeBulkOwnershipBar
              owners={owners}
              trackingUnit={form.trackingUnit}
              sharedPurchaseOwnerIds={sharedPurchaseOwnerIds}
              sharedMihonOwnerId={sharedMihonOwnerId}
              onTogglePurchaseOwner={toggleBulkPurchaseOwner}
              onApplyMihon={applyBulkMihon}
            />

            {form.volumes.length === 0 ? (
              <p className="volume-empty">
                {form.trackingUnit === "chapter"
                  ? "Aucune appartenance — choisissez achat ou Mihon dans la zone ci-dessus."
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
                      key={`${volume.volumeNumber ?? "x"}-${volume.volumeLabel ?? ""}-${volume.editionType}-${index}`}
                      volume={volume}
                      owners={owners}
                      trackingUnit={form.trackingUnit}
                      defaultPrice={form.defaultPrice}
                      expanded={volumeExpanded[index] ?? true}
                      onExpandedChange={(value) =>
                        setVolumeExpanded((prev) => ({ ...prev, [index]: value }))
                      }
                      onChange={(patch) => updateVolume(index, patch)}
                      onRemove={() => removeVolume(index)}
                      duplicateEditionLabel={
                        canDuplicateVolumeEdition(volume, form.volumes)
                          ? getDuplicateVolumeEditionLabel(volume.editionType)
                          : undefined
                      }
                      onDuplicateEdition={
                        canDuplicateVolumeEdition(volume, form.volumes)
                          ? () => duplicateVolumeEdition(index)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </CollapsibleSection>
        </form>
      )}

      <WorkFormModal
        open={chapterSisterModalOpen}
        initialValues={buildChapterSisterWorkFormValuesFromForm(form)}
        owners={owners}
        onClose={() => setChapterSisterModalOpen(false)}
        onSaved={(createdWorkId) => {
          setChapterSisterModalOpen(false);
          if (createdWorkId) {
            onOpenChapterSister?.(createdWorkId);
          }
        }}
      />
    </Modal>
  );
}
