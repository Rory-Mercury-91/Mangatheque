import type {
  Owner,
  PriceFormat,
  ScrapePayloadV1,
  WorkReadingStatus,
} from "@/types/database";
import { resolveOwnerIdByName } from "@/constants/ownerColors";
import {
  createChapterSeriesPlaceholderRow,
  isChapterSeriesPlaceholder,
  normalizeChapterOwnershipVolumes,
} from "@/utils/chapterSeries";
import {
  createEmptyWorkFormValues,
  type VolumeFormRow,
  type WorkFormValues,
} from "@/types/workForm";

/**
 * @description Résout plusieurs propriétaires depuis leurs noms (import overlay).
 */
export function resolveOwnerIdsByNames(
  owners: Owner[],
  names: string[] | null | undefined,
): string[] {
  if (!names?.length) {
    return [];
  }
  const ids = names
    .map((name) => resolveOwnerIdByName(owners, name))
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

/**
 * @description Génère des lignes chapitre numérotées avec compte Mihon (legacy).
 * @deprecated Préférer createChapterSeriesPlaceholderRow pour le suivi par chapitres.
 */
export function generateChapterRowsWithMihon(
  _count: number,
  mihonOwnerId: string,
): VolumeFormRow[] {
  return [createChapterSeriesPlaceholderRow({ mihonOwnerId })];
}

/**
 * @description Applique un compte Mihon à toutes les lignes ou à la série (chapitres).
 */
export function applyMihonToFormValues(
  values: WorkFormValues,
  mihonOwnerId: string | null,
): WorkFormValues {
  if (!mihonOwnerId) {
    return {
      ...values,
      volumes: values.volumes
        .filter(
          (volume) =>
            values.trackingUnit !== "chapter" ||
            !isChapterSeriesPlaceholder(volume),
        )
        .map((volume) => ({
          ...volume,
          mihonOwnerId: null,
        })),
    };
  }

  if (values.trackingUnit === "chapter") {
    return {
      ...values,
      volumes: normalizeChapterOwnershipVolumes(values.volumes, values.trackingUnit, {
        mihonOwnerId,
      }),
    };
  }

  if (values.volumes.length === 0) {
    return values;
  }

  return {
    ...values,
    volumes: values.volumes.map((volume) => ({
      ...volume,
      mihonOwnerId,
    })),
  };
}

/**
 * @description Applique l'achat physique à toutes les lignes ou à la série (chapitres).
 */
export function applyPurchaseOwnersToFormValues(
  values: WorkFormValues,
  ownerIds: string[],
): WorkFormValues {
  if (ownerIds.length === 0) {
    return {
      ...values,
      volumes: values.volumes
        .filter(
          (volume) =>
            values.trackingUnit !== "chapter" ||
            !isChapterSeriesPlaceholder(volume),
        )
        .map((volume) => ({
          ...volume,
          ownerIds: [],
        })),
    };
  }

  if (values.trackingUnit === "chapter") {
    return {
      ...values,
      volumes: normalizeChapterOwnershipVolumes(values.volumes, values.trackingUnit, {
        ownerIds,
      }),
    };
  }

  if (values.volumes.length === 0) {
    return values;
  }

  return {
    ...values,
    volumes: values.volumes.map((volume) => ({
      ...volume,
      ownerIds: [...ownerIds],
    })),
  };
}

/**
 * @description Indique si au moins un tome du payload porte une appartenance explicite.
 */
function payloadHasPerVolumeOwnership(
  volumes: NonNullable<ScrapePayloadV1["volumes"]>,
): boolean {
  return volumes.some(
    (volume) =>
      Boolean(volume.mihonOwnerName?.trim()) ||
      (volume.ownerNames?.length ?? 0) > 0,
  );
}

/**
 * @description Applique l'appartenance tome par tome lorsqu'elle est fournie dans le payload.
 */
export function applyPerVolumeOwnershipToFormValues(
  values: WorkFormValues,
  owners: Owner[],
  payloadVolumes: NonNullable<ScrapePayloadV1["volumes"]>,
  globalOwnership: Pick<ScrapePayloadV1, "mihonOwnerName" | "ownerNames"> = {},
): WorkFormValues {
  const sourceByKey = new Map<string, (typeof payloadVolumes)[number]>();
  for (const volume of payloadVolumes) {
    const key =
      volume.volumeLabel?.trim() ||
      (volume.volumeNumber != null ? `num:${volume.volumeNumber}` : "");
    if (key) {
      sourceByKey.set(key, volume);
    }
  }

  const globalMihonOwnerId = resolveOwnerIdByName(owners, globalOwnership.mihonOwnerName);
  const globalOwnerIds = resolveOwnerIdsByNames(owners, globalOwnership.ownerNames);

  return {
    ...values,
    volumes: values.volumes.map((row) => {
      const key =
        row.volumeLabel?.trim() ||
        (row.volumeNumber != null ? `num:${row.volumeNumber}` : "");
      const source = key ? sourceByKey.get(key) : undefined;

      const perVolumeMihon = resolveOwnerIdByName(owners, source?.mihonOwnerName);
      const perVolumeOwners = resolveOwnerIdsByNames(owners, source?.ownerNames);

      if (perVolumeMihon || perVolumeOwners.length > 0) {
        return {
          ...row,
          mihonOwnerId: perVolumeMihon ?? null,
          ownerIds: perVolumeOwners,
        };
      }

      if (globalMihonOwnerId || globalOwnerIds.length > 0) {
        return {
          ...row,
          mihonOwnerId: globalMihonOwnerId ?? null,
          ownerIds: [...globalOwnerIds],
        };
      }

      return row;
    }),
  };
}

/**
 * @description Applique Mihon ou achat physique depuis le payload d'import overlay.
 */
export function applyImportOwnershipToFormValues(
  values: WorkFormValues,
  owners: Owner[],
  payload: Pick<ScrapePayloadV1, "mihonOwnerName" | "ownerNames" | "volumes">,
): WorkFormValues {
  const payloadVolumes = payload.volumes ?? [];
  if (payloadVolumes.length > 0 && payloadHasPerVolumeOwnership(payloadVolumes)) {
    return applyPerVolumeOwnershipToFormValues(values, owners, payloadVolumes, payload);
  }

  const mihonOwnerId = resolveOwnerIdByName(owners, payload.mihonOwnerName);
  const ownerIds = resolveOwnerIdsByNames(owners, payload.ownerNames);

  let result = values;
  if (mihonOwnerId) {
    result = applyMihonToFormValues(result, mihonOwnerId);
  }
  if (ownerIds.length > 0) {
    result = applyPurchaseOwnersToFormValues(result, ownerIds);
  }
  return result;
}

/**
 * @description Convertit un payload Tampermonkey (v1) en valeurs de formulaire.
 * @param payload - Données normalisées issues du script Nautiljon.
 * @param owners - Propriétaires du foyer (résolution compte Mihon).
 * @returns Valeurs pré-remplies pour la modale d'ajout.
 */
export function scrapePayloadToFormValues(
  payload: ScrapePayloadV1,
  owners: Owner[] = [],
): WorkFormValues {
  const base = createEmptyWorkFormValues();

  const values: WorkFormValues = {
    ...base,
    title: payload.title,
    demographicType: payload.demographicType ?? "",
    genres: payload.genres ?? [],
    themes: payload.themes ?? [],
    publisherVf: payload.publisherVf ?? "",
    volumesVfCount: payload.volumesVfCount ?? null,
    volumesVoTotal: payload.volumesVoTotal ?? null,
    defaultPrice: payload.defaultPrice ?? null,
    priceFormat: payload.priceFormat ?? "broche",
    synopsis: payload.synopsis ?? "",
    coverUrl: payload.coverUrl ?? "",
    sourceUrl: payload.sourceUrl,
    readingStatus: payload.readingStatus ?? base.readingStatus,
    trackingUnit: payload.trackingUnit ?? base.trackingUnit,
    volumes: filterVfVolumes(payload.volumes ?? [], payload.volumesVfCount, owners),
  };

  return applyImportOwnershipToFormValues(values, owners, payload);
}

/**
 * @description Convertit le libellé de statut VF Nautiljon vers le code applicatif.
 * @param label - Texte entre parenthèses (ex. « En cours », « Terminé »).
 */
export function mapNautiljonReadingStatus(
  label: string | null | undefined,
): WorkReadingStatus | null {
  const normalized = String(label ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }
  if (normalized.includes("termin")) {
    return "completed";
  }
  if (normalized.includes("abandon")) {
    return "dropped";
  }
  if (normalized.includes("attente")) {
    return "on_hold";
  }
  if (normalized.includes("cours")) {
    return "ongoing";
  }
  return null;
}

/**
 * @description Ne conserve que les tomes VF (limite au nombre VF connu).
 * @param volumes - Tomes scrapés.
 * @param volumesVfCount - Nombre de tomes VF parus selon Nautiljon.
 * @returns Lignes formulaire pour tomes VF uniquement.
 */
function filterVfVolumes(
  volumes: NonNullable<ScrapePayloadV1["volumes"]>,
  volumesVfCount?: number,
  owners: Owner[] = [],
): WorkFormValues["volumes"] {
  const maxVf =
    volumesVfCount != null && volumesVfCount > 0
      ? volumesVfCount
      : undefined;

  const filtered = maxVf
    ? volumes.filter(
        (v) =>
          Boolean(v.volumeLabel?.trim()) ||
        (v.volumeNumber != null && v.volumeNumber <= maxVf),
      )
    : volumes;

  return filtered.map((volume) => {
    const mihonOwnerId = resolveOwnerIdByName(owners, volume.mihonOwnerName);
    const ownerIds = resolveOwnerIdsByNames(owners, volume.ownerNames);

    return {
      volumeNumber: volume.volumeNumber ?? null,
      volumeLabel: volume.volumeLabel?.trim() || undefined,
      coverUrl: volume.coverUrl ?? "",
      releaseDate: volume.releaseDate ?? "",
      catalogPrice: volume.catalogPrice ?? null,
      editionType: volume.editionType ?? "classic",
      ownerIds,
      mihonOwnerId: mihonOwnerId ?? null,
    };
  });
}

/**
 * @description Déduit le format de prix depuis le libellé Nautiljon.
 * @param typeVolume - Texte type volume (Broché, Kindle, etc.).
 * @returns `broche` ou `numerique`.
 */
export function mapNautiljonPriceFormat(typeVolume: string): PriceFormat {
  const lower = typeVolume.toLowerCase();
  if (lower.includes("kindle") || lower.includes("numérique") || lower.includes("numerique")) {
    return "numerique";
  }
  return "broche";
}

/**
 * @description Parse une liste séparée par des virgules (genres, thèmes).
 * @param value - Chaîne brute ou tableau déjà parsé.
 * @returns Tableau de libellés nettoyés.
 */
export function parseTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
