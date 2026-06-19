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
import type { Owner, PriceFormat, ScrapePayloadV1, WorkReadingStatus } from "@/types/database";
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
import { parseTagList, applyImportOwnershipToFormValues, applyMihonToFormValues, applyPurchaseOwnersToFormValues } from "@/services/importMapService";
import {
  isChapterSeriesPlaceholder,
} from "@/utils/chapterSeries";
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
    setForm((current) => {
      const next = { ...current, ...patch };
      if ("hasVolumeTracking" in patch || "hasChapterTracking" in patch) {
        next.trackingUnit =
          next.hasChapterTracking && !next.hasVolumeTracking
            ? "chapter"
            : "volume";
      }
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    if (!form.hasVolumeTracking && !form.hasChapterTracking) {
      setError("Activez au moins le suivi tomes ou chapitres.");
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

  const modalTitle = isEdit ? "Modifier la série" : "Ajouter une série";

  const parseOptionalNumber = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const physicalVolumes = form.volumes.filter(
    (volume) => !isChapterSeriesPlaceholder(volume),
  );
  const chapterPlaceholder = form.volumes.find(isChapterSeriesPlaceholder) ?? null;

  const sharedMihonOwnerId =
    physicalVolumes.length > 0 &&
    physicalVolumes.every(
      (volume) => volume.mihonOwnerId === physicalVolumes[0]?.mihonOwnerId,
    )
      ? physicalVolumes[0]?.mihonOwnerId ?? null
      : null;
  const sharedPurchaseOwnerIds =
    physicalVolumes.length > 0 &&
    physicalVolumes.every(
      (volume) =>
        volume.ownerIds.length === physicalVolumes[0]?.ownerIds.length &&
        volume.ownerIds.every((id) => physicalVolumes[0]?.ownerIds.includes(id)),
    )
      ? [...(physicalVolumes[0]?.ownerIds ?? [])]
      : [];
  const chapterMihonOwnerId = chapterPlaceholder?.mihonOwnerId ?? null;

  const applyBulkMihon = (ownerId: string | null) => {
    setForm((current) => applyMihonToFormValues(current, ownerId, "volume"));
    if (ownerId) {
      setVolumesSectionOpen(true);
    }
  };

  const applyChapterMihon = (ownerId: string | null) => {
    setForm((current) => applyMihonToFormValues(current, ownerId, "chapter"));
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
            title="Suivi et édition"
            open={kindSectionOpen}
            onOpenChange={setKindSectionOpen}
          >
            <div className="form-grid">
              <label className="form-field form-field--checkbox">
                <span>Suivi tomes</span>
                <input
                  type="checkbox"
                  checked={form.hasVolumeTracking}
                  onChange={(e) =>
                    patchForm({ hasVolumeTracking: e.target.checked })
                  }
                />
              </label>
              <label className="form-field form-field--checkbox">
                <span>Suivi chapitres (numérique / Mihon)</span>
                <input
                  type="checkbox"
                  checked={form.hasChapterTracking}
                  onChange={(e) =>
                    patchForm({ hasChapterTracking: e.target.checked })
                  }
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
                  disabled={!form.hasVolumeTracking}
                  placeholder={form.hasVolumeTracking ? undefined : "—"}
                  onChange={(e) => patchForm({ publisherVf: e.target.value })}
                />
              </label>
              <label className="form-field">
                <span>Tomes VF parus</span>
                <input
                  type="number"
                  min={0}
                  disabled={!form.hasVolumeTracking}
                  placeholder={form.hasVolumeTracking ? undefined : "—"}
                  value={form.hasVolumeTracking ? (form.volumesVfCount ?? "") : "—"}
                  onChange={(e) =>
                    patchForm({
                      volumesVfCount: parseOptionalNumber(e.target.value),
                    })
                  }
                />
              </label>
              <label className="form-field">
                <span>Tomes VO total</span>
                <input
                  type="number"
                  min={0}
                  disabled={!form.hasVolumeTracking}
                  placeholder={form.hasVolumeTracking ? undefined : "—"}
                  value={form.hasVolumeTracking ? (form.volumesVoTotal ?? "") : "—"}
                  onChange={(e) =>
                    patchForm({
                      volumesVoTotal: parseOptionalNumber(e.target.value),
                    })
                  }
                />
              </label>
              <label className="form-field">
                <span>Chapitres VF parus</span>
                <input
                  type="number"
                  min={0}
                  disabled={!form.hasChapterTracking}
                  placeholder={form.hasChapterTracking ? undefined : "—"}
                  value={form.hasChapterTracking ? (form.chaptersVfCount ?? "") : "—"}
                  onChange={(e) =>
                    patchForm({
                      chaptersVfCount: parseOptionalNumber(e.target.value),
                    })
                  }
                />
              </label>
              <label className="form-field">
                <span>Chapitres VO total</span>
                <input
                  type="number"
                  min={0}
                  disabled={!form.hasChapterTracking}
                  placeholder={form.hasChapterTracking ? undefined : "—"}
                  value={form.hasChapterTracking ? (form.chaptersVoTotal ?? "") : "—"}
                  onChange={(e) =>
                    patchForm({
                      chaptersVoTotal: parseOptionalNumber(e.target.value),
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
                  disabled={!form.hasVolumeTracking}
                  placeholder={form.hasVolumeTracking ? undefined : "—"}
                  value={form.hasVolumeTracking ? (form.defaultPrice ?? "") : "—"}
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
                  disabled={!form.hasVolumeTracking}
                  onChange={(e) =>
                    patchForm({ priceFormat: e.target.value as PriceFormat })
                  }
                >
                  <option value="broche">Broché</option>
                  <option value="numerique">Numérique</option>
                </select>
              </label>
            </div>

            {form.hasChapterTracking ? (
              <VolumeBulkOwnershipBar
                owners={owners}
                trackingUnit="chapter"
                purchaseEnabled={false}
                sharedPurchaseOwnerIds={[]}
                sharedMihonOwnerId={chapterMihonOwnerId}
                onTogglePurchaseOwner={() => undefined}
                onApplyMihon={applyChapterMihon}
              />
            ) : null}
          </CollapsibleSection>

          {form.hasVolumeTracking ? (
          <CollapsibleSection
            className="work-form-volumes-section"
            title="Tomes"
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
              trackingUnit="volume"
              sharedPurchaseOwnerIds={sharedPurchaseOwnerIds}
              sharedMihonOwnerId={sharedMihonOwnerId}
              onTogglePurchaseOwner={toggleBulkPurchaseOwner}
              onApplyMihon={applyBulkMihon}
            />

            {physicalVolumes.length === 0 ? (
              <p className="volume-empty">
                Aucun tome VF — importez depuis Nautiljon ou ajoutez manuellement.
              </p>
            ) : (
              <div className="volume-list-scroll">
                <div className="volume-list">
                  {physicalVolumes.map((volume, index) => (
                    <VolumeFormRow
                      key={`${volume.volumeNumber ?? "x"}-${volume.volumeLabel ?? ""}-${volume.editionType}-${index}`}
                      volume={volume}
                      owners={owners}
                      trackingUnit="volume"
                      defaultPrice={form.defaultPrice}
                      expanded={volumeExpanded[index] ?? true}
                      onExpandedChange={(value) =>
                        setVolumeExpanded((prev) => ({ ...prev, [index]: value }))
                      }
                      onChange={(patch) => {
                        const realIndex = form.volumes.findIndex((row) => row === volume);
                        if (realIndex >= 0) {
                          updateVolume(realIndex, patch);
                        }
                      }}
                      onRemove={() => {
                        const realIndex = form.volumes.findIndex((row) => row === volume);
                        if (realIndex >= 0) {
                          removeVolume(realIndex);
                        }
                      }}
                      duplicateEditionLabel={
                        canDuplicateVolumeEdition(volume, form.volumes)
                          ? getDuplicateVolumeEditionLabel(volume.editionType)
                          : undefined
                      }
                      onDuplicateEdition={
                        canDuplicateVolumeEdition(volume, form.volumes)
                          ? () => {
                              const realIndex = form.volumes.findIndex((row) => row === volume);
                              if (realIndex >= 0) {
                                duplicateVolumeEdition(realIndex);
                              }
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </CollapsibleSection>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
