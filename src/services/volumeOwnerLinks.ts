import type { VolumeFormRow } from "@/types/workForm";

export interface VolumeOwnerLinkInsert {
  volume_id: string;
  owner_id: string;
  has_mihon: boolean;
  has_purchase: boolean;
  copy_count: number;
}

/**
 * @description Construit les lignes volume_owners à partir d'une ligne formulaire.
 */
export function buildVolumeOwnerLinkRows(
  volumeId: string,
  volume: Pick<VolumeFormRow, "ownerIds" | "mihonOwnerIds">,
): VolumeOwnerLinkInsert[] {
  const purchaseOwnerIds = new Set(volume.ownerIds);
  const mihonOwnerIds = new Set(volume.mihonOwnerIds);
  const ownerIds = new Set([...purchaseOwnerIds, ...mihonOwnerIds]);

  return [...ownerIds]
    .map((ownerId) => ({
      volume_id: volumeId,
      owner_id: ownerId,
      has_mihon: mihonOwnerIds.has(ownerId),
      has_purchase: purchaseOwnerIds.has(ownerId),
      copy_count: 1,
    }))
    .filter((row) => row.has_mihon || row.has_purchase);
}

/**
 * @description Agrège les liens DB en champs formulaire propriétaires.
 */
export function parseVolumeOwnerLinks(
  links: Array<
    Pick<VolumeOwnerLinkInsert, "owner_id" | "has_mihon" | "has_purchase" | "copy_count">
  >,
): Pick<VolumeFormRow, "ownerIds" | "mihonOwnerIds"> {
  const ownerIds: string[] = [];
  const mihonOwnerIds: string[] = [];

  for (const link of links) {
    const hasPurchase = link.has_purchase ?? !link.has_mihon;
    if (hasPurchase) {
      ownerIds.push(link.owner_id);
    }
    if (link.has_mihon) {
      mihonOwnerIds.push(link.owner_id);
    }
  }

  return { ownerIds, mihonOwnerIds };
}

/**
 * @description Convertit les liens DB en parts propriétaires pour le calcul financier.
 */
export function toVolumeOwnerShares(
  links: Array<
    Pick<VolumeOwnerLinkInsert, "owner_id" | "has_mihon" | "has_purchase" | "copy_count">
  >,
): Array<{ ownerId: string; hasMihon: boolean; hasPurchase: boolean }> {
  return links.map((link) => ({
    ownerId: link.owner_id,
    hasMihon: link.has_mihon,
    hasPurchase: link.has_purchase ?? !link.has_mihon,
  }));
}
