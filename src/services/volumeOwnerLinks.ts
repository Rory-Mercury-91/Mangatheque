import type { VolumeFormRow } from "@/types/workForm";

export interface VolumeOwnerLinkInsert {
  volume_id: string;
  owner_id: string;
  has_mihon: boolean;
  has_purchase: boolean;
}

/**
 * @description Construit les lignes volume_owners à partir d'une ligne formulaire.
 * Mihon et achat physique peuvent coexister sur le même tome (même propriétaire).
 * @param volumeId - Identifiant du tome en base.
 * @param volume - Ligne formulaire (ownerIds + mihonOwnerId).
 */
export function buildVolumeOwnerLinkRows(
  volumeId: string,
  volume: Pick<VolumeFormRow, "ownerIds" | "mihonOwnerId">,
): VolumeOwnerLinkInsert[] {
  const purchaseOwnerIds = new Set(volume.ownerIds);
  const ownerIds = new Set(purchaseOwnerIds);

  if (volume.mihonOwnerId) {
    ownerIds.add(volume.mihonOwnerId);
  }

  return [...ownerIds]
    .map((ownerId) => ({
      volume_id: volumeId,
      owner_id: ownerId,
      has_mihon: volume.mihonOwnerId === ownerId,
      has_purchase: purchaseOwnerIds.has(ownerId),
    }))
    .filter((row) => row.has_mihon || row.has_purchase);
}

/**
 * @description Agrège les liens DB en ownerIds et mihonOwnerId pour le formulaire.
 * @param links - Liens volume_owners d'un même tome.
 */
export function parseVolumeOwnerLinks(
  links: Array<Pick<VolumeOwnerLinkInsert, "owner_id" | "has_mihon" | "has_purchase">>,
): Pick<VolumeFormRow, "ownerIds" | "mihonOwnerId"> {
  const ownerIds: string[] = [];
  let mihonOwnerId: string | null = null;

  for (const link of links) {
    const hasPurchase = link.has_purchase ?? !link.has_mihon;
    if (hasPurchase) {
      ownerIds.push(link.owner_id);
    }
    if (link.has_mihon) {
      mihonOwnerId = link.owner_id;
    }
  }

  return { ownerIds, mihonOwnerId };
}

/**
 * @description Convertit les liens DB en parts propriétaires pour le calcul financier.
 */
export function toVolumeOwnerShares(
  links: Array<Pick<VolumeOwnerLinkInsert, "owner_id" | "has_mihon" | "has_purchase">>,
): Array<{ ownerId: string; hasMihon: boolean; hasPurchase: boolean }> {
  return links.map((link) => ({
    ownerId: link.owner_id,
    hasMihon: link.has_mihon,
    hasPurchase: link.has_purchase ?? !link.has_mihon,
  }));
}
