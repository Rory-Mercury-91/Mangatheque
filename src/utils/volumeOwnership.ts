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
 * @description Indique si un tome est suivable en lecture (possession foyer).
 * Un achat physique ou une entrée Mihon de n'importe quel propriétaire
 * rend le tome lisible par tous les comptes connectés.
 * @param volume - Ligne tome avec propriétaires et Mihon.
 */
export function isVolumeOwnedForReading(
  volume: VolumeOwnershipFields,
): boolean {
  return volume.ownerIds.length > 0 || volume.mihonOwnerIds.length > 0;
}

/**
 * @description Filtre les tomes possédés pour le suivi de lecture.
 * @param volumes - Tomes physiques de la série (hors placeholder chapitres).
 */
export function filterOwnedVolumesForReading<
  T extends VolumeOwnershipFields & { id?: string },
>(volumes: T[]): T[] {
  return volumes.filter(isVolumeOwnedForReading);
}

/**
 * @description Identifiants Supabase des tomes possédés, suivables en lecture.
 * @param volumes - Tomes physiques de la série.
 */
export function getOwnedTrackableVolumeIds(
  volumes: Array<VolumeOwnershipFields & { id?: string }>,
): string[] {
  return filterOwnedVolumesForReading(volumes)
    .map((volume) => volume.id)
    .filter((id): id is string => Boolean(id));
}

/**
 * @description Indique si le suivi chapitres est disponible (série présente au foyer).
 * @param ownership - Appartenance de la série numérique (placeholder).
 */
export function isChapterSeriesOwnedForReading(
  ownership: VolumeOwnershipFields | null | undefined,
): boolean {
  if (!ownership) {
    return false;
  }
  return isVolumeOwnedForReading(ownership);
}
