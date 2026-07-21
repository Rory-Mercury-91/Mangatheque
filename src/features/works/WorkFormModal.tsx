import { useCallback, useEffect, useId, useRef, useState } from "react";
import { HelpCircle, Plus } from "lucide-react";
import { CollapsibleSection } from "@/components/common/CollapsibleSection";
import {
  CommaSeparatedTagInput,
  type CommaSeparatedTagInputHandle,
} from "@/components/common/CommaSeparatedTagInput";
import { CoverImage } from "@/components/common/CoverImage";
import { LoadingOverlay, LoadingOverlayHost } from "@/components/common/LoadingOverlay";
import { Modal } from "@/components/common/Modal";
import { WORK_STATUS_OPTIONS } from "@/constants/workStatus";
import { VolumeBulkOwnershipBar } from "@/features/works/VolumeBulkOwnershipBar";
import { VolumeFormRow } from "@/features/works/VolumeFormRow";
import {
  WorkFormHelpModal,
  type WorkFormHelpSection,
} from "@/features/works/WorkFormHelpModal";
import { useTouchPhoneLayout } from "@/hooks/useTouchTabletLayout";
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
  updateWorkWithVolumes,
  workToFormValues,
} from "@/services/workService";
import { applyImportOwnershipToFormValues, applyMihonToFormValues, applyPurchaseOwnersToFormValues } from "@/services/importMapService";
import {
  isChapterSeriesPlaceholder,
} from "@/utils/chapterSeries";
import {
  canDuplicateVolumeEdition,
  getAlternateEditionType,
  getDuplicateVolumeEditionLabel,
} from "@/utils/volumeIdentity";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import { OwnerOwnershipPill } from "@/components/common/OwnerOwnershipPill";
import { ImportMergeModal } from "@/features/import/ImportMergeModal";
import { ImportJsonSection } from "@/features/works/ImportJsonSection";
import {
  prepareImportMergeIfDuplicate,
  type ImportMergePreview,
} from "@/services/importMergeService";
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
  const touchPhoneLayout = useTouchPhoneLayout(mobile);
  const [form, setForm] = useState<WorkFormValues>(createEmptyWorkFormValues());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workSectionOpen, setWorkSectionOpen] = useState(true);
  const [kindSectionOpen, setKindSectionOpen] = useState(false);
  const [volumesSectionOpen, setVolumesSectionOpen] = useState(false);
  const [volumeExpanded, setVolumeExpanded] = useState<Record<number, boolean>>(
    {},
  );
  const formId = useId();
  const [mergePreview, setMergePreview] = useState<ImportMergePreview | null>(
    null,
  );
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSection, setHelpSection] = useState<WorkFormHelpSection>("general");
  /** Permet d'enregistrer en édition après fusion manuelle depuis un import. */
  const [importMergeWorkId, setImportMergeWorkId] = useState<string | null>(
    null,
  );
  const effectiveWorkId = workId ?? importMergeWorkId;
  const isEdit = Boolean(effectiveWorkId);
  const importDuplicateCheckedRef = useRef(false);
  const genresInputRef = useRef<CommaSeparatedTagInputHandle>(null);
  const themesInputRef = useRef<CommaSeparatedTagInputHandle>(null);

  const buildIncomingImportForm = useCallback((): WorkFormValues | null => {
    if (!initialValues?.title?.trim()) {
      return null;
    }

    const base: WorkFormValues = {
      ...createEmptyWorkFormValues(),
      ...initialValues,
      volumes: initialValues.volumes ?? [],
    };

    if (
      importOwnership &&
      owners.length > 0 &&
      (Boolean(importOwnership.mihonOwnerName) ||
        (importOwnership.ownerNames?.length ?? 0) > 0)
    ) {
      return applyImportOwnershipToFormValues(base, owners, importOwnership);
    }

    return base;
  }, [initialValues, importOwnership, owners]);

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

    setWorkSectionOpen(true);
    setKindSectionOpen(false);
    setVolumesSectionOpen(false);
  }, [open]);

  /** @description Une seule section ouverte à la fois (accordéon). */
  const handleWorkSectionOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setWorkSectionOpen(true);
      setKindSectionOpen(false);
      setVolumesSectionOpen(false);
      return;
    }
    setWorkSectionOpen(false);
  };

  const handleKindSectionOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setWorkSectionOpen(false);
      setKindSectionOpen(true);
      setVolumesSectionOpen(false);
      return;
    }
    setKindSectionOpen(false);
  };

  const handleVolumesSectionOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setWorkSectionOpen(false);
      setKindSectionOpen(false);
      setVolumesSectionOpen(true);
      return;
    }
    setVolumesSectionOpen(false);
  };

  const openAllSectionsAfterImport = () => {
    setWorkSectionOpen(true);
    setKindSectionOpen(false);
    setVolumesSectionOpen(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setError(null);
      setLoading(true);
      setMergePreview(null);
      setMergeModalOpen(false);
      setImportMergeWorkId(null);
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
            const importedForm = hasImportOwnership
              ? applyImportOwnershipToFormValues(base, owners, importOwnership)
              : base;
            setForm(importedForm);
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

  /** @description Propose la fusion si l'import Nautiljon cible une série existante. */
  useEffect(() => {
    if (!open) {
      importDuplicateCheckedRef.current = false;
      return;
    }
    if (
      workId ||
      importDuplicateCheckedRef.current ||
      loading ||
      owners.length === 0 ||
      !initialValues?.title?.trim()
    ) {
      return;
    }

    const incoming = buildIncomingImportForm();
    if (!incoming) {
      return;
    }

    importDuplicateCheckedRef.current = true;

    void (async () => {
      try {
        const preview = await prepareImportMergeIfDuplicate(incoming, owners);
        if (preview?.hasChanges) {
          setMergePreview(preview);
          setMergeModalOpen(true);
        } else if (preview) {
          setImportMergeWorkId(preview.workId);
          setForm(preview.mergedValues);
        }
      } catch {
        // L'utilisateur peut continuer en ajout manuel.
      }
    })();
  }, [
    open,
    workId,
    loading,
    owners,
    initialValues?.title,
    buildIncomingImportForm,
  ]);

  const patchTrackingFlag = (
    key: "hasVolumeTracking" | "hasChapterTracking",
    next: boolean,
  ) => {
    setForm((current) => {
      const hasVolumeTracking =
        key === "hasVolumeTracking" ? next : current.hasVolumeTracking;
      const hasChapterTracking =
        key === "hasChapterTracking" ? next : current.hasChapterTracking;

      if (!hasVolumeTracking && !hasChapterTracking) {
        return current;
      }

      return {
        ...current,
        hasVolumeTracking,
        hasChapterTracking,
        trackingUnit:
          hasChapterTracking && !hasVolumeTracking ? "chapter" : "volume",
      };
    });
  };

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
      const genres = genresInputRef.current?.commit() ?? form.genres;
      const themes = themesInputRef.current?.commit() ?? form.themes;
      const formToSave = { ...form, genres, themes };

      if (effectiveWorkId) {
        await updateWorkWithVolumes(effectiveWorkId, formToSave);
        onSaved(effectiveWorkId);
      } else {
        const createdWorkId = await createWorkWithVolumes(formToSave);
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
    handleVolumesSectionOpenChange(true);
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

  const openWorkFormHelp = useCallback((section: WorkFormHelpSection = "general") => {
    setHelpSection(section);
    setHelpOpen(true);
  }, []);

  useEffect(() => {
    if (!helpOpen) {
      return;
    }
    const sectionId =
      helpSection === "general"
        ? "work-form-help-general"
        : `work-form-help-${helpSection}`;
    requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: "nearest" });
    });
  }, [helpOpen, helpSection]);

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
      handleVolumesSectionOpenChange(true);
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
    handleVolumesSectionOpenChange(true);
  };

  const handleImportApply = async (values: WorkFormValues) => {
    setError(null);
    try {
      const preview = await prepareImportMergeIfDuplicate(values, owners);
      if (preview?.hasChanges) {
        setMergePreview(preview);
        setMergeModalOpen(true);
        return;
      }
      if (preview) {
        setImportMergeWorkId(preview.workId);
        setForm(preview.mergedValues);
        openAllSectionsAfterImport();
        return;
      }
      setForm(values);
      openAllSectionsAfterImport();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Vérification du doublon impossible.",
      );
    }
  };

  const closeMergeModal = () => {
    setMergeModalOpen(false);
  };

  const handleMergeSaved = (mergedWorkId: string) => {
    onSaved(mergedWorkId);
    onClose();
  };

  const handleMergeEditBeforeSave = (
    mergedWorkId: string,
    preview: ImportMergePreview,
  ) => {
    setImportMergeWorkId(mergedWorkId);
    setForm(preview.mergedValues);
    setWorkSectionOpen(true);
    setKindSectionOpen(false);
    setVolumesSectionOpen(false);
  };

  const expandAll = () => {
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
    <>
    <Modal
      open={open}
      title={modalTitle}
      onClose={onClose}
      wide
      headerActions={
        <button
          type="button"
          className="modal-header-help-btn"
          title="Aide sur le formulaire"
          aria-label="Aide sur le formulaire série"
          onClick={() => openWorkFormHelp("general")}
        >
          <HelpCircle size={18} aria-hidden />
        </button>
      }
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
          className={[
            "work-form",
            "work-form--modal",
            touchPhoneLayout ? "work-form--touch-phone" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onSubmit={handleSubmit}
        >
          <div className="form-expand-toolbar">
            {!isEdit ? (
              <ImportJsonSection
                owners={owners}
                onApply={(values) => void handleImportApply(values)}
              />
            ) : null}
            <div className="form-expand-toolbar__end">
              <button type="button" className="btn-secondary btn-sm" onClick={expandAll}>
                Tout déplier
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={collapseAll}>
                Tout plier
              </button>
            </div>
          </div>

          <CollapsibleSection
            title="Informations communes"
            open={workSectionOpen}
            onOpenChange={handleWorkSectionOpenChange}
          >
            <div className="work-general-layout">
              <div className="work-cover-block">
                <CoverImage
                  url={form.coverUrl}
                  alt={form.title || "Couverture"}
                  variant="fill"
                />
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
                  <CommaSeparatedTagInput
                    ref={genresInputRef}
                    value={form.genres}
                    onChange={(genres) => patchForm({ genres })}
                    disabled={saving}
                    aria-label="Genres, séparés par des virgules"
                  />
                </label>
                <label className="form-field">
                  <span>Thèmes (virgules)</span>
                  <CommaSeparatedTagInput
                    ref={themesInputRef}
                    value={form.themes}
                    onChange={(themes) => patchForm({ themes })}
                    disabled={saving}
                    aria-label="Thèmes, séparés par des virgules"
                  />
                </label>
                <label className="form-field form-field--full">
                  <span>URL source</span>
                  <input
                    value={form.sourceUrl}
                    onChange={(e) => patchForm({ sourceUrl: e.target.value })}
                  />
                </label>
                <label className="form-field">
                  <span>MAL ID</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.malId ?? ""}
                    placeholder="ex. 13"
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      patchForm({
                        malId: raw === "" ? null : Number(raw) || null,
                      });
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>AniList ID</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.anilistId ?? ""}
                    placeholder="ex. 30013"
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      patchForm({
                        anilistId: raw === "" ? null : Number(raw) || null,
                      });
                    }}
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
            onOpenChange={handleKindSectionOpenChange}
          >
            <div className="work-form-tracking-blocks">
              <section
                className="work-form-tracking-block"
                aria-labelledby="work-form-volume-tracking-title"
              >
                <div className="work-form-tracking-block-head">
                  <span
                    id="work-form-volume-tracking-title"
                    className="work-form-tracking-block-title"
                  >
                    Suivi tomes
                  </span>
                  <ToggleSwitch
                    checked={form.hasVolumeTracking}
                    disabled={
                      form.hasVolumeTracking && !form.hasChapterTracking
                    }
                    title={
                      form.hasVolumeTracking && !form.hasChapterTracking
                        ? "Au moins un mode de suivi doit rester actif"
                        : form.hasVolumeTracking
                          ? "Désactiver le suivi tomes"
                          : "Activer le suivi tomes"
                    }
                    onChange={(checked) =>
                      patchTrackingFlag("hasVolumeTracking", checked)
                    }
                  />
                </div>

                {form.hasVolumeTracking ? (
                  <div className="form-grid work-form-tracking-block-body">
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
                        onChange={(e) =>
                          patchForm({ publisherVf: e.target.value })
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
                            volumesVfCount: parseOptionalNumber(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span>Tomes VO parus</span>
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
                          patchForm({
                            priceFormat: e.target.value as PriceFormat,
                          })
                        }
                      >
                        <option value="broche">Broché</option>
                        <option value="numerique">Numérique</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </section>

              <section
                className="work-form-tracking-block"
                aria-labelledby="work-form-chapter-tracking-title"
              >
                <div className="work-form-tracking-block-head">
                  <span
                    id="work-form-chapter-tracking-title"
                    className="work-form-tracking-block-title"
                  >
                    Suivi chapitres
                  </span>
                  <ToggleSwitch
                    checked={form.hasChapterTracking}
                    disabled={
                      form.hasChapterTracking && !form.hasVolumeTracking
                    }
                    title={
                      form.hasChapterTracking && !form.hasVolumeTracking
                        ? "Au moins un mode de suivi doit rester actif"
                        : form.hasChapterTracking
                          ? "Désactiver le suivi chapitres"
                          : "Activer le suivi chapitres"
                    }
                    onChange={(checked) =>
                      patchTrackingFlag("hasChapterTracking", checked)
                    }
                  />
                </div>

                {form.hasChapterTracking ? (
                  <div className="form-grid work-form-tracking-block-body">
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
                        value={form.publisherVfChapter}
                        onChange={(e) =>
                          patchForm({ publisherVfChapter: e.target.value })
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span>Chapitres VF parus</span>
                      <input
                        type="number"
                        min={0}
                        value={form.chaptersVfCount ?? ""}
                        onChange={(e) =>
                          patchForm({
                            chaptersVfCount: parseOptionalNumber(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span>Chapitres VO parus</span>
                      <input
                        type="number"
                        min={0}
                        value={form.chaptersVoTotal ?? ""}
                        onChange={(e) =>
                          patchForm({
                            chaptersVoTotal: parseOptionalNumber(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span>Format</span>
                      <select
                        value={form.chapterPriceFormat}
                        onChange={(e) =>
                          patchForm({
                            chapterPriceFormat: e.target.value as PriceFormat,
                          })
                        }
                      >
                        <option value="broche">Broché</option>
                        <option value="numerique">Numérique</option>
                      </select>
                    </label>
                    <div className="form-field">
                      <span>Compte Mihon</span>
                      <div className="toggle-pill-group work-form-mihon-pills">
                        {owners.map((owner) => (
                          <OwnerOwnershipPill
                            key={`chapter-mihon-${owner.id}`}
                            owner={owner}
                            variant="mihon"
                            mihonNameOnly
                            active={chapterMihonOwnerId === owner.id}
                            onClick={() =>
                              applyChapterMihon(
                                chapterMihonOwnerId === owner.id
                                  ? null
                                  : owner.id,
                              )
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </CollapsibleSection>

          {form.hasVolumeTracking ? (
          <CollapsibleSection
            className="work-form-volumes-section"
            title="Tomes"
            open={volumesSectionOpen}
            onOpenChange={handleVolumesSectionOpenChange}
            actions={
              <button type="button" className="btn-secondary btn-sm" onClick={addVolume}>
                <Plus size={14} aria-hidden />
                Ajouter
              </button>
            }
          >
            <div className="volume-list-scroll app-scroll-themed app-scroll-themed-y">
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
              )}
            </div>
          </CollapsibleSection>
          ) : null}
        </form>
      )}
    </Modal>
    <WorkFormHelpModal
      open={helpOpen}
      section={helpSection}
      onClose={() => setHelpOpen(false)}
    />
    <ImportMergeModal
      open={mergeModalOpen}
      preview={mergePreview}
      onClose={closeMergeModal}
      onMerged={handleMergeSaved}
      onEditBeforeSave={handleMergeEditBeforeSave}
    />
    </>
  );
}
