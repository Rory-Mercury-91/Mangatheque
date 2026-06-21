import type { VolumeFormRow } from "@/types/workForm";

type VolumeOwnershipFields = Pick<VolumeFormRow, "ownerIds" | "mihonOwnerId">;

/**
 * @description Indique si un tome entre dans la progression de lecture (possession physique ou Mihon).
 * @param volume - Ligne tome avec propriétaires et Mihon.
 */
export function isVolumeOwnedForReading(volume: VolumeOwnershipFields): boolean {
  return volume.ownerIds.length > 0 || volume.mihonOwnerId != null;
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
