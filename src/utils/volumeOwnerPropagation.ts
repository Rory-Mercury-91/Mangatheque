import type { VolumeFormRow } from "@/types/workForm";

/**
 * @description Indique si le patch modifie les propriétaires d'un tome.
 */
function isOwnerPatch(patch: Partial<VolumeFormRow>): boolean {
  return "ownerIds" in patch || "mihonOwnerId" in patch;
}

/**
 * @description Retourne l'index du tome n°1 dans la liste.
 */
export function findVolumeOneIndex(volumes: VolumeFormRow[]): number {
  return volumes.findIndex((volume) => volume.volumeNumber === 1);
}

/**
 * @description Applique les propriétaires du tome 1 sur les autres tomes.
 * @param volumes - Liste complète des tomes.
 * @param vol1 - Tome 1 après modification.
 */
export function propagateVolumeOneOwners(
  volumes: VolumeFormRow[],
  vol1: VolumeFormRow,
): VolumeFormRow[] {
  return volumes.map((row) => {
    if (row.volumeNumber === 1) {
      return vol1;
    }
    if (vol1.mihonOwnerId) {
      return { ...row, mihonOwnerId: vol1.mihonOwnerId, ownerIds: [] };
    }
    return { ...row, mihonOwnerId: null, ownerIds: [...vol1.ownerIds] };
  });
}

/**
 * @description Met à jour un tome et propage les propriétaires si le tome 1 est modifié.
 */
export function updateVolumeWithPropagation(
  volumes: VolumeFormRow[],
  index: number,
  patch: Partial<VolumeFormRow>,
): VolumeFormRow[] {
  const vol1Index = findVolumeOneIndex(volumes);
  const shouldPropagate =
    isOwnerPatch(patch) && index === vol1Index && vol1Index >= 0;

  if (!shouldPropagate) {
    return volumes.map((row, i) => (i === index ? { ...row, ...patch } : row));
  }

  const updatedVol1 = { ...volumes[vol1Index], ...patch };
  return propagateVolumeOneOwners(
    volumes.map((row, i) => (i === index ? updatedVol1 : row)),
    updatedVol1,
  );
}
