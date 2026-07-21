import type { VolumeFormRow } from "@/types/workForm";

type VolumeOwnershipFields = Partial<
  Pick<VolumeFormRow, "ownerIds" | "mihonOwnerIds">
>;

/**
 * @description Normalise les listes d'appartenance (évite les crashs si undefined).
 */
function normalizeOwnerIds(ids: string[] | null | undefined): string[] {
  return Array.isArray(ids) ? ids : [];
}

/**
 * @description Indique si un propriétaire possède le tome (achat ou Mihon).
 * @param volume - Ligne tome avec propriétaires et Mihon.
 * @param ownerId - Propriétaire à vérifier.
 */
export function volumeHasOwner(
  volume: VolumeOwnershipFields,
  ownerId: string,
): boolean {
  const ownerIds = normalizeOwnerIds(volume.ownerIds);
  const mihonOwnerIds = normalizeOwnerIds(volume.mihonOwnerIds);
  return ownerIds.includes(ownerId) || mihonOwnerIds.includes(ownerId);
}

/**
 * @description Indique si un tome est suivable en lecture (possession foyer).
 * Un achat physique ou une entrée Mihon de n'importe quel propriétaire
 * rend le tome lisible par tous les comptes connectés.
 * @param volume - Ligne tome avec propriétaires et Mihon.
 * @param ownerId - Si fourni, ne compte que ce propriétaire (filtre stats).
 */
export function isVolumeOwnedForReading(
  volume: VolumeOwnershipFields,
  ownerId?: string | null,
): boolean {
  if (ownerId) {
    return volumeHasOwner(volume, ownerId);
  }
  const ownerIds = normalizeOwnerIds(volume.ownerIds);
  const mihonOwnerIds = normalizeOwnerIds(volume.mihonOwnerIds);
  return ownerIds.length > 0 || mihonOwnerIds.length > 0;
}

/**
 * @description Filtre les tomes possédés pour le suivi de lecture.
 * @param volumes - Tomes physiques de la série (hors placeholder chapitres).
 * @param ownerId - Filtre propriétaire optionnel.
 */
export function filterOwnedVolumesForReading<
  T extends VolumeOwnershipFields & { id?: string },
>(volumes: T[], ownerId?: string | null): T[] {
  return volumes.filter((volume) => isVolumeOwnedForReading(volume, ownerId));
}

/**
 * @description Identifiants Supabase des tomes possédés, suivables en lecture.
 * @param volumes - Tomes physiques de la série.
 * @param ownerId - Filtre propriétaire optionnel.
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
 * @description Indique si le suivi chapitres est disponible.
 * @param ownership - Appartenance de la série numérique (placeholder).
 * @param ownerId - Filtre propriétaire optionnel.
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
