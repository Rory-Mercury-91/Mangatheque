import type { VolumeFormRow } from "@/types/workForm";

type VolumeOwnershipFields = Pick<VolumeFormRow, "ownerIds" | "mihonOwnerIds">;

/**
 * @description Indique si un propriétaire possède le tome (achat ou Mihon).
 * @param volume - Ligne tome avec propriétaires et Mihon.
 * @param ownerId - Propriétaire à vérifier.
 */
export function volumeHasOwner(
  volume: VolumeOwnershipFields,
  ownerId: string,
): boolean {
  return (
    volume.ownerIds.includes(ownerId) || volume.mihonOwnerIds.includes(ownerId)
  );
}

/**
 * @description Indique si un tome entre dans la progression de lecture.
 * Sans `ownerId`, toute possession foyer (achat ou Mihon) compte.
 * Avec `ownerId`, uniquement les tomes de ce propriétaire / compte Mihon.
 * @param volume - Ligne tome avec propriétaires et Mihon.
 * @param ownerId - Propriétaire lié au compte (optionnel).
 */
export function isVolumeOwnedForReading(
  volume: VolumeOwnershipFields,
  ownerId?: string | null,
): boolean {
  if (ownerId) {
    return volumeHasOwner(volume, ownerId);
  }
  return volume.ownerIds.length > 0 || volume.mihonOwnerIds.length > 0;
}

/**
 * @description Filtre les tomes possédés pour le suivi de lecture.
 * @param volumes - Tomes physiques de la série (hors placeholder chapitres).
 * @param ownerId - Propriétaire lié au compte (optionnel).
 */
export function filterOwnedVolumesForReading<
  T extends VolumeOwnershipFields & { id?: string },
>(volumes: T[], ownerId?: string | null): T[] {
  return volumes.filter((volume) => isVolumeOwnedForReading(volume, ownerId));
}

/**
 * @description Identifiants Supabase des tomes possédés, suivables en lecture.
 * @param volumes - Tomes physiques de la série.
 * @param ownerId - Propriétaire lié au compte (optionnel).
 */
export function getOwnedTrackableVolumeIds(
  volumes: Array<VolumeOwnershipFields & { id?: string }>,
  ownerId?: string | null,
): string[] {
  return filterOwnedVolumesForReading(volumes, ownerId)
    .map((volume) => volume.id)
    .filter((id): id is string => Boolean(id));
}

/**
 * @description Indique si le suivi chapitres est disponible pour un propriétaire.
 * @param ownership - Appartenance de la série numérique (placeholder).
 * @param ownerId - Propriétaire lié au compte (optionnel).
 */
export function isChapterSeriesOwnedForReading(
  ownership: VolumeOwnershipFields | null | undefined,
  ownerId?: string | null,
): boolean {
  if (!ownership) {
    return false;
  }
  return isVolumeOwnedForReading(ownership, ownerId);
}
