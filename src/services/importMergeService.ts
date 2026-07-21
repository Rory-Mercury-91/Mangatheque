import { getWorkStatusLabel } from "@/constants/workStatus";
import {
  fetchWorkForEdit,
  findWorkByTitle,
  workToFormValues,
} from "@/services/workService";
import type { Owner, PriceFormat } from "@/types/database";
import type { VolumeFormRow, WorkFormValues } from "@/types/workForm";
import { isChapterSeriesPlaceholder } from "@/utils/chapterSeries";
import { formatEditionLabel } from "@/utils/ownerDisplay";
import { formatVolumeTitle } from "@/utils/volumeDisplay";
import { buildVolumeIdentityKey } from "@/utils/volumeIdentity";

/** Diff d'un champ série ou tome pour l'aperçu avant / après. */
export interface ImportFieldDiff {
  label: string;
  before: string;
  after: string;
}

/** Changement prévu sur un tome lors d'une fusion d'import. */
export interface ImportVolumeChange {
  kind: "add" | "update";
  label: string;
  diffs: ImportFieldDiff[];
}

/** Aperçu complet d'une fusion import → série existante. */
export interface ImportMergePreview {
  workId: string;
  workTitle: string;
  workDiffs: ImportFieldDiff[];
  volumeChanges: ImportVolumeChange[];
  mergedValues: WorkFormValues;
  hasChanges: boolean;
}

const PRICE_FORMAT_LABELS: Record<PriceFormat, string> = {
  broche: "Broché",
  numerique: "Numérique",
};

const WORK_FIELD_DEFS: Array<{
  key: keyof WorkFormValues;
  label: string;
  format: (value: unknown, owners?: Owner[]) => string;
}> = [
  { key: "demographicType", label: "Démographie", format: formatOptionalText },
  {
    key: "readingStatus",
    label: "Statut de lecture",
    format: (value) => getWorkStatusLabel(value as WorkFormValues["readingStatus"]),
  },
  { key: "genres", label: "Genres", format: formatStringList },
  { key: "themes", label: "Thèmes", format: formatStringList },
  { key: "publisherVf", label: "Éditeur VF (tomes)", format: formatOptionalText },
  {
    key: "publisherVfChapter",
    label: "Éditeur VF (chapitres)",
    format: formatOptionalText,
  },
  { key: "volumesVfCount", label: "Nb tomes VF", format: formatOptionalNumber },
  { key: "volumesVoTotal", label: "Nb tomes VO", format: formatOptionalNumber },
  {
    key: "chaptersVfCount",
    label: "Nb chapitres VF",
    format: formatOptionalNumber,
  },
  {
    key: "chaptersVoTotal",
    label: "Nb chapitres VO",
    format: formatOptionalNumber,
  },
  {
    key: "hasVolumeTracking",
    label: "Suivi tomes",
    format: formatBoolean,
  },
  {
    key: "hasChapterTracking",
    label: "Suivi chapitres",
    format: formatBoolean,
  },
  { key: "defaultPrice", label: "Prix par défaut", format: formatOptionalPrice },
  {
    key: "priceFormat",
    label: "Format prix (tomes)",
    format: (value) =>
      PRICE_FORMAT_LABELS[value as PriceFormat] ?? String(value ?? "—"),
  },
  {
    key: "chapterPriceFormat",
    label: "Format prix (chapitres)",
    format: (value) =>
      PRICE_FORMAT_LABELS[value as PriceFormat] ?? String(value ?? "—"),
  },
  { key: "synopsis", label: "Synopsis", format: formatOptionalText },
  { key: "coverUrl", label: "Couverture (URL)", format: formatOptionalText },
  { key: "sourceUrl", label: "URL Nautiljon", format: formatOptionalText },
];

const VOLUME_FIELD_DEFS: Array<{
  key: keyof VolumeFormRow;
  label: string;
  format: (value: unknown, owners?: Owner[]) => string;
}> = [
  { key: "coverUrl", label: "Couverture", format: formatOptionalText },
  { key: "releaseDate", label: "Date de sortie", format: formatOptionalText },
  { key: "catalogPrice", label: "Prix catalogue", format: formatOptionalPrice },
  {
    key: "ownerIds",
    label: "Acheteurs",
    format: (value, owners) => formatOwnerIds(value as string[], owners),
  },
  {
    key: "mihonOwnerIds",
    label: "Comptes Mihon",
    format: (value, owners) => formatOwnerIds(value as string[], owners),
  },
  {
    key: "sharedPurchase",
    label: "Co-achat partagé",
    format: formatBoolean,
  },
];

function formatOptionalText(value: unknown): string {
  const text = String(value ?? "").trim();
  return text || "—";
}

function formatOptionalNumber(value: unknown): string {
  if (value == null || value === "") {
    return "—";
  }
  return String(value);
}

function formatOptionalPrice(value: unknown): string {
  if (value == null || value === "") {
    return "—";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return `${amount.toLocaleString("fr-FR")} €`;
}

function formatBoolean(value: unknown): string {
  return value ? "Oui" : "Non";
}

function formatStringList(value: unknown): string {
  const list = value as string[] | undefined;
  if (!list?.length) {
    return "—";
  }
  return list.join(", ");
}

function formatOwnerId(ownerId: string | null, owners?: Owner[]): string {
  if (!ownerId) {
    return "—";
  }
  return owners?.find((owner) => owner.id === ownerId)?.name ?? ownerId;
}

function formatOwnerIds(ownerIds: string[], owners?: Owner[]): string {
  if (!ownerIds.length) {
    return "—";
  }
  return ownerIds
    .map((id) => formatOwnerId(id, owners))
    .join(", ");
}

function mergeStringLists(existing: string[], incoming: string[]): string[] {
  if (!incoming.length) {
    return [...existing];
  }
  return [...new Set([...existing, ...incoming])];
}

function pickIncomingText(incoming: string, existing: string): string {
  const next = incoming.trim();
  return next || existing;
}

function pickIncomingNumber(
  incoming: number | null,
  existing: number | null,
): number | null {
  return incoming ?? existing;
}

/**
 * @description Fusionne les propriétaires d'un tome (union sans doublon).
 */
function mergeVolumeOwners(
  existing: VolumeFormRow,
  incoming: VolumeFormRow,
): Pick<VolumeFormRow, "ownerIds" | "mihonOwnerIds" | "sharedPurchase"> {
  const ownerIds =
    incoming.ownerIds.length > 0
      ? [...new Set([...existing.ownerIds, ...incoming.ownerIds])]
      : [...existing.ownerIds];

  const mihonOwnerIds =
    incoming.mihonOwnerIds.length > 0
      ? [...new Set([...existing.mihonOwnerIds, ...incoming.mihonOwnerIds])]
      : [...existing.mihonOwnerIds];

  return {
    ownerIds,
    mihonOwnerIds,
    sharedPurchase:
      ownerIds.length >= 2
        ? incoming.ownerIds.length >= 2
          ? incoming.sharedPurchase
          : existing.sharedPurchase
        : existing.sharedPurchase,
  };
}

/**
 * @description Fusionne une ligne tome existante avec les données importées.
 */
function mergeVolumeRow(
  existing: VolumeFormRow,
  incoming: VolumeFormRow,
): VolumeFormRow {
  const ownership = mergeVolumeOwners(existing, incoming);

  return {
    ...existing,
    coverUrl: pickIncomingText(incoming.coverUrl, existing.coverUrl),
    releaseDate: pickIncomingText(incoming.releaseDate, existing.releaseDate),
    catalogPrice: incoming.catalogPrice ?? existing.catalogPrice,
    ...ownership,
  };
}

/**
 * @description Fusionne les tomes physiques et conserve les placeholders chapitres.
 */
function mergeVolumeLists(
  existingVolumes: VolumeFormRow[],
  incomingVolumes: VolumeFormRow[],
): VolumeFormRow[] {
  const chapterRows = existingVolumes.filter(isChapterSeriesPlaceholder);
  const existingPhysical = existingVolumes.filter(
    (volume) => !isChapterSeriesPlaceholder(volume),
  );
  const incomingPhysical = incomingVolumes.filter(
    (volume) => !isChapterSeriesPlaceholder(volume),
  );

  const incomingByKey = new Map<string, VolumeFormRow>();
  for (const volume of incomingPhysical) {
    const key = buildVolumeIdentityKey(volume);
    if (key) {
      incomingByKey.set(key, volume);
    }
  }

  const mergedPhysical = existingPhysical.map((existing) => {
    const key = buildVolumeIdentityKey(existing);
    const incoming = key ? incomingByKey.get(key) : undefined;
    if (!incoming) {
      return existing;
    }
    incomingByKey.delete(key);
    return mergeVolumeRow(existing, incoming);
  });

  const added = [...incomingByKey.values()].map((volume) => ({
    ...volume,
    id: undefined,
  }));

  return [...mergedPhysical, ...added, ...chapterRows];
}

/**
 * @description Fusionne les métadonnées série et tomes importés dans une fiche existante.
 */
export function mergeImportFormValues(
  existing: WorkFormValues,
  incoming: WorkFormValues,
): WorkFormValues {
  return {
    ...existing,
    demographicType: pickIncomingText(
      incoming.demographicType,
      existing.demographicType,
    ),
    readingStatus: incoming.readingStatus,
    genres: mergeStringLists(existing.genres, incoming.genres),
    themes: mergeStringLists(existing.themes, incoming.themes),
    publisherVf: pickIncomingText(incoming.publisherVf, existing.publisherVf),
    publisherVfChapter: pickIncomingText(
      incoming.publisherVfChapter,
      existing.publisherVfChapter,
    ),
    volumesVfCount: pickIncomingNumber(
      incoming.volumesVfCount,
      existing.volumesVfCount,
    ),
    volumesVoTotal: pickIncomingNumber(
      incoming.volumesVoTotal,
      existing.volumesVoTotal,
    ),
    chaptersVfCount: pickIncomingNumber(
      incoming.chaptersVfCount,
      existing.chaptersVfCount,
    ),
    chaptersVoTotal: pickIncomingNumber(
      incoming.chaptersVoTotal,
      existing.chaptersVoTotal,
    ),
    hasVolumeTracking:
      existing.hasVolumeTracking || incoming.hasVolumeTracking,
    hasChapterTracking:
      existing.hasChapterTracking || incoming.hasChapterTracking,
    trackingUnit:
      (existing.hasChapterTracking || incoming.hasChapterTracking) &&
      !(existing.hasVolumeTracking || incoming.hasVolumeTracking)
        ? "chapter"
        : "volume",
    defaultPrice: incoming.defaultPrice ?? existing.defaultPrice,
    priceFormat: incoming.priceFormat ?? existing.priceFormat,
    chapterPriceFormat:
      incoming.chapterPriceFormat ?? existing.chapterPriceFormat,
    synopsis: pickIncomingText(incoming.synopsis, existing.synopsis),
    coverUrl: pickIncomingText(incoming.coverUrl, existing.coverUrl),
    sourceUrl: pickIncomingText(incoming.sourceUrl, existing.sourceUrl),
    volumes: mergeVolumeLists(existing.volumes, incoming.volumes),
  };
}

function createEmptyVolumeDiffRow(): VolumeFormRow {
  return {
    volumeNumber: null,
    coverUrl: "",
    releaseDate: "",
    editionType: "classic",
    sharedPurchase: true,
    ownerIds: [],
    mihonOwnerIds: [],
  };
}

function buildFieldDiffs<T extends object>(
  defs: Array<{
    key: keyof T;
    label: string;
    format: (value: unknown, owners?: Owner[]) => string;
  }>,
  before: T,
  after: T,
  owners?: Owner[],
): ImportFieldDiff[] {
  const diffs: ImportFieldDiff[] = [];

  for (const def of defs) {
    const beforeValue = def.format(before[def.key], owners);
    const afterValue = def.format(after[def.key], owners);
    if (beforeValue !== afterValue) {
      diffs.push({
        label: def.label,
        before: beforeValue,
        after: afterValue,
      });
    }
  }

  return diffs;
}

function formatVolumeChangeLabel(volume: VolumeFormRow): string {
  const title = formatVolumeTitle(volume.volumeNumber, volume.volumeLabel);
  const edition = formatEditionLabel(volume.editionType);
  return `${title} (${edition})`;
}

/**
 * @description Construit l'aperçu avant / après d'une fusion import.
 */
export function buildImportMergePreview(
  workId: string,
  existing: WorkFormValues,
  incoming: WorkFormValues,
  owners: Owner[] = [],
): ImportMergePreview {
  const mergedValues = mergeImportFormValues(existing, incoming);
  const workDiffs = buildFieldDiffs(
    WORK_FIELD_DEFS,
    existing,
    mergedValues,
    owners,
  );

  const existingPhysical = existing.volumes.filter(
    (volume) => !isChapterSeriesPlaceholder(volume),
  );
  const mergedPhysical = mergedValues.volumes.filter(
    (volume) => !isChapterSeriesPlaceholder(volume),
  );

  const existingKeys = new Set(
    existingPhysical
      .map((volume) => buildVolumeIdentityKey(volume))
      .filter(Boolean),
  );

  const volumeChanges: ImportVolumeChange[] = [];

  for (const merged of mergedPhysical) {
    const key = buildVolumeIdentityKey(merged);
    if (!key) {
      continue;
    }

    if (!existingKeys.has(key)) {
      volumeChanges.push({
        kind: "add",
        label: formatVolumeChangeLabel(merged),
        diffs: buildFieldDiffs(
          VOLUME_FIELD_DEFS,
          createEmptyVolumeDiffRow(),
          merged,
          owners,
        ).map((diff) => ({
          ...diff,
          before: "—",
        })),
      });
      continue;
    }

    const before = existingPhysical.find(
      (volume) => buildVolumeIdentityKey(volume) === key,
    );
    if (!before) {
      continue;
    }

    const diffs = buildFieldDiffs(VOLUME_FIELD_DEFS, before, merged, owners);
    if (diffs.length > 0) {
      volumeChanges.push({
        kind: "update",
        label: formatVolumeChangeLabel(merged),
        diffs,
      });
    }
  }

  return {
    workId,
    workTitle: existing.title.trim() || incoming.title.trim(),
    workDiffs,
    volumeChanges,
    mergedValues,
    hasChanges: workDiffs.length > 0 || volumeChanges.length > 0,
  };
}

/**
 * @description Prépare l'aperçu de fusion si une série porte déjà le même titre.
 * @returns Aperçu ou null si aucun doublon.
 */
export async function prepareImportMergeIfDuplicate(
  incoming: WorkFormValues,
  owners: Owner[] = [],
): Promise<ImportMergePreview | null> {
  const existing = await findWorkByTitle(incoming.title.trim());
  if (!existing) {
    return null;
  }

  const { work, volumes } = await fetchWorkForEdit(existing.id);
  const existingForm = workToFormValues(work, volumes);
  return buildImportMergePreview(existing.id, existingForm, incoming, owners);
}
