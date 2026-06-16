import type { TrackingUnit } from "@/types/database";
import {
  createEmptyVolumeRow,
  type VolumeFormRow,
} from "@/types/workForm";

/** Libellé de la ligne unique d'appartenance pour une série en chapitres. */
export const CHAPTER_SERIES_VOLUME_LABEL = "Série numérique";

/**
 * @description Indique si la ligne représente l'appartenance globale (pas un chapitre isolé).
 */
export function isChapterSeriesPlaceholder(
  volume: Pick<VolumeFormRow, "volumeNumber" | "volumeLabel">,
): boolean {
  return (
    volume.volumeNumber == null &&
    volume.volumeLabel === CHAPTER_SERIES_VOLUME_LABEL
  );
}

/**
 * @description Liste numérotée 1…N générée automatiquement (legacy import).
 */
export function isChapterBulkNumberedList(
  volumes: Array<Pick<VolumeFormRow, "volumeNumber" | "volumeLabel">>,
  trackingUnit: TrackingUnit,
): boolean {
  if (trackingUnit !== "chapter" || volumes.length <= 1) {
    return false;
  }
  return volumes.every(
    (volume) =>
      volume.volumeNumber != null && !volume.volumeLabel?.trim(),
  );
}

/**
 * @description Crée la ligne unique d'appartenance pour une série suivie par chapitres.
 */
export function createChapterSeriesPlaceholderRow(options: {
  mihonOwnerId?: string | null;
  ownerIds?: string[];
}): VolumeFormRow {
  return {
    ...createEmptyVolumeRow(1),
    volumeNumber: null,
    volumeLabel: CHAPTER_SERIES_VOLUME_LABEL,
    mihonOwnerId: options.mihonOwnerId ?? null,
    ownerIds: [...(options.ownerIds ?? [])],
  };
}

/**
 * @description Retourne la ligne portant l'appartenance globale d'une série chapitres.
 */
export function getChapterSeriesOwnershipSource(
  volumes: VolumeFormRow[],
): VolumeFormRow | null {
  const placeholder = volumes.find(isChapterSeriesPlaceholder);
  if (placeholder) {
    return placeholder;
  }
  return (
    volumes.find(
      (volume) => volume.mihonOwnerId != null || volume.ownerIds.length > 0,
    ) ?? null
  );
}

/**
 * @description Masque la grille chapitre-par-chapitre (suivi au niveau série).
 */
export function shouldHideChapterVolumeGrid(
  volumes: VolumeFormRow[],
  trackingUnit: TrackingUnit,
): boolean {
  if (trackingUnit !== "chapter") {
    return false;
  }
  if (volumes.length === 0) {
    return true;
  }
  if (volumes.length === 1 && isChapterSeriesPlaceholder(volumes[0]!)) {
    return true;
  }
  return isChapterBulkNumberedList(volumes, trackingUnit);
}

/**
 * @description Remplace une liste 1…N auto-générée par la ligne série unique.
 */
export function collapseChapterBulkVolumesIfNeeded(
  volumes: VolumeFormRow[],
  trackingUnit: TrackingUnit,
): VolumeFormRow[] {
  if (trackingUnit !== "chapter") {
    return volumes;
  }

  const placeholder = volumes.find(isChapterSeriesPlaceholder);
  if (placeholder && !isChapterBulkNumberedList(volumes, trackingUnit)) {
    return volumes;
  }

  if (!isChapterBulkNumberedList(volumes, trackingUnit)) {
    return volumes;
  }

  if (placeholder) {
    return [placeholder];
  }

  const ownerSource =
    getChapterSeriesOwnershipSource(volumes) ?? volumes[0] ?? null;
  if (!ownerSource) {
    return [];
  }

  return [
    createChapterSeriesPlaceholderRow({
      mihonOwnerId: ownerSource.mihonOwnerId,
      ownerIds: ownerSource.ownerIds,
    }),
  ];
}

/**
 * @description Retient une seule ligne d'appartenance ou les chapitres importés individuellement.
 */
export function normalizeChapterOwnershipVolumes(
  volumes: VolumeFormRow[],
  trackingUnit: TrackingUnit,
  options: { mihonOwnerId?: string | null; ownerIds?: string[] },
): VolumeFormRow[] {
  if (trackingUnit !== "chapter") {
    return volumes;
  }

  const explicitChapters = volumes.filter(
    (volume) => !isChapterSeriesPlaceholder(volume),
  );

  if (explicitChapters.length > 0) {
    if (options.mihonOwnerId) {
      return explicitChapters.map((volume) => ({
        ...volume,
        mihonOwnerId: options.mihonOwnerId ?? null,
      }));
    }
    if (options.ownerIds && options.ownerIds.length > 0) {
      return explicitChapters.map((volume) => ({
        ...volume,
        ownerIds: [...options.ownerIds!],
      }));
    }
    return explicitChapters;
  }

  if (!options.mihonOwnerId && !(options.ownerIds && options.ownerIds.length > 0)) {
    return [];
  }

  return [createChapterSeriesPlaceholderRow(options)];
}
