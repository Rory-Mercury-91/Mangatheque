import type {
  OwnerFinancialResult,
  OwnerSeriesTotals,
  SeriesFinancials,
  SeriesVolumeInput,
  VolumeFinancials,
  VolumeOwnerShare,
} from "@/types/database";

/**
 * @description Détermine le prix effectif d'un tome (manuel ou prix par défaut de l'œuvre).
 */
export function resolveEffectiveVolumePrice(
  defaultPrice: number | null,
  manualPrice: number | null,
  priceManualOverride: boolean,
): number {
  if (priceManualOverride && manualPrice != null) {
    return manualPrice;
  }
  return defaultPrice ?? 0;
}

/**
 * @description Indique si le propriétaire participe au coût d'achat physique.
 */
export function resolvesHasPurchase(owner: VolumeOwnerShare): boolean {
  return owner.hasPurchase ?? !owner.hasMihon;
}

/**
 * @description Indique si le tome est Mihon sans achat physique associé.
 */
export function isMihonOnlyOwner(owner: VolumeOwnerShare): boolean {
  return owner.hasMihon && !resolvesHasPurchase(owner);
}

/**
 * @description Nombre d'acheteurs physiques sur un tome.
 */
export function countVolumePurchasingOwners(owners: VolumeOwnerShare[]): number {
  return owners.filter(resolvesHasPurchase).length;
}

/**
 * @description Indique si le coût doit être divisé entre les acheteurs (co-achat partagé).
 */
export function shouldUseSharedPurchaseSplit(
  sharedPurchase: boolean,
  owners: VolumeOwnerShare[],
): boolean {
  return sharedPurchase && countVolumePurchasingOwners(owners) > 1;
}

/**
 * @description Indique si le tome entre dans la valeur catalogue.
 */
export function isVolumeCountedInCatalog(volume: SeriesVolumeInput): boolean {
  return volume.owners.length > 0;
}

/**
 * @description Unités catalogue d'un tome (1 en co-achat partagé, sinon 1 par acheteur).
 */
export function resolveVolumeCatalogUnits(
  owners: VolumeOwnerShare[],
  sharedPurchase = true,
): number {
  const payingCount = countVolumePurchasingOwners(owners);

  if (payingCount === 0) {
    return owners.some(isMihonOnlyOwner) ? 1 : 0;
  }

  if (shouldUseSharedPurchaseSplit(sharedPurchase, owners)) {
    return 1;
  }

  return payingCount;
}

/**
 * @description Somme des prix catalogue des tomes possédés.
 */
export function computeOwnedCatalogValue(volumes: SeriesVolumeInput[]): number {
  const total = volumes.reduce((sum, volume) => {
    const units = resolveVolumeCatalogUnits(
      volume.owners,
      volume.sharedPurchase ?? true,
    );
    return units > 0 ? sum + volume.effectivePrice * units : sum;
  }, 0);

  return roundCurrency(total);
}

/**
 * @description Calcule la répartition financière d'un tome.
 *
 * Règles :
 * - **1 acheteur** : prix entier du tome.
 * - **Co-achat partagé** (2+ acheteurs, toggle « Partagé ») : prix ÷ nombre d'acheteurs.
 * - **Achats distincts** (2+ acheteurs, « Partagé » off) : chacun paie le prix plein (1 tome / personne).
 * - **Mihon seul** (1 ou plusieurs comptes) : 0 € dépensé, économie Mihon = prix du tome (une seule fois).
 */
export function computeVolumeFinancials(
  effectivePrice: number,
  owners: VolumeOwnerShare[],
  sharedPurchase = true,
): VolumeFinancials {
  if (owners.length === 0) {
    return {
      effectivePrice,
      perOwner: [],
      totalPaid: 0,
      totalMihonSavings: 0,
    };
  }

  const payingOwners = owners.filter(resolvesHasPurchase);

  if (payingOwners.length > 0) {
    const useSharedSplit = shouldUseSharedPurchaseSplit(sharedPurchase, owners);

    const perOwner: OwnerFinancialResult[] = owners.map((owner) => {
      if (!resolvesHasPurchase(owner)) {
        return { ownerId: owner.ownerId, amountPaid: 0, mihonSavings: 0 };
      }

      const amountPaid = useSharedSplit
        ? roundCurrency(effectivePrice / payingOwners.length)
        : roundCurrency(effectivePrice);

      return { ownerId: owner.ownerId, amountPaid, mihonSavings: 0 };
    });

    const totalPaid = perOwner.reduce((sum, row) => sum + row.amountPaid, 0);

    return {
      effectivePrice,
      perOwner,
      totalPaid: roundCurrency(totalPaid),
      totalMihonSavings: 0,
    };
  }

  const perOwner: OwnerFinancialResult[] = owners.map((owner) => ({
    ownerId: owner.ownerId,
    amountPaid: 0,
    mihonSavings: 0,
  }));

  return {
    effectivePrice,
    perOwner,
    totalPaid: 0,
    totalMihonSavings: roundCurrency(effectivePrice),
  };
}

/**
 * @description Agrège les totaux financiers d'une œuvre sur tous ses tomes.
 */
export function computeSeriesFinancials(
  volumes: SeriesVolumeInput[],
): SeriesFinancials {
  const ownerTotals = new Map<string, OwnerSeriesTotals>();

  let catalogValue = 0;
  let totalPaid = 0;
  let totalMihonSavings = 0;

  for (const volume of volumes) {
    const sharedPurchase = volume.sharedPurchase ?? true;
    const catalogUnits = resolveVolumeCatalogUnits(volume.owners, sharedPurchase);
    if (catalogUnits > 0) {
      catalogValue += volume.effectivePrice * catalogUnits;
    }

    const financials = computeVolumeFinancials(
      volume.effectivePrice,
      volume.owners,
      sharedPurchase,
    );
    totalPaid += financials.totalPaid;
    totalMihonSavings += financials.totalMihonSavings;

    for (const row of financials.perOwner) {
      const current = ownerTotals.get(row.ownerId) ?? {
        ownerId: row.ownerId,
        amountPaid: 0,
        mihonSavings: 0,
      };
      ownerTotals.set(row.ownerId, {
        ownerId: row.ownerId,
        amountPaid: roundCurrency(current.amountPaid + row.amountPaid),
        mihonSavings: roundCurrency(current.mihonSavings + row.mihonSavings),
      });
    }
  }

  return {
    catalogValue: roundCurrency(catalogValue),
    totalPaid: roundCurrency(totalPaid),
    totalMihonSavings: roundCurrency(totalMihonSavings),
    perOwner: [...ownerTotals.values()],
  };
}

/**
 * @description Valeur catalogue des tomes avec achat physique.
 */
export function computePurchasedCatalogValue(
  volumes: SeriesVolumeInput[],
): number {
  const total = volumes.reduce((sum, volume) => {
    const sharedPurchase = volume.sharedPurchase ?? true;
    const units = resolveVolumeCatalogUnits(volume.owners, sharedPurchase);
    const hasPurchase = volume.owners.some((owner) => resolvesHasPurchase(owner));
    return hasPurchase && units > 0 ? sum + volume.effectivePrice * units : sum;
  }, 0);

  return roundCurrency(total);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
