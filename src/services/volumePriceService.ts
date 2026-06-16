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
 * @param defaultPrice - Prix par défaut de l'œuvre.
 * @param manualPrice - Prix manuel du tome, si renseigné.
 * @param priceManualOverride - Indique si le prix du tome a été modifié manuellement.
 * @returns Le prix effectif en euros.
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
 * @description Indique si un tome entre dans la valeur catalogue (au moins un propriétaire).
 */
export function isVolumeCountedInCatalog(volume: SeriesVolumeInput): boolean {
  return volume.owners.length > 0;
}

/**
 * @description Somme des prix catalogue des tomes possédés (Mihon ou achat physique).
 * @param volumes - Tomes avec prix effectif et propriétaires.
 */
export function computeOwnedCatalogValue(volumes: SeriesVolumeInput[]): number {
  const total = volumes.reduce((sum, volume) => {
    return isVolumeCountedInCatalog(volume) ? sum + volume.effectivePrice : sum;
  }, 0);

  return roundCurrency(total);
}

/**
 * @description Calcule la répartition financière d'un tome.
 *
 * Règles :
 * - **1 acheteur physique** : paie le prix entier (ex. 10 €).
 * - **Co-achat** (2 ou 3 acheteurs) : prix ÷ nombre d'acheteurs (5 € ou 3,33 €).
 * - **Mihon seul** (aucun achat physique) : 0 € dépensé, économie Mihon = prix du tome (une seule fois).
 * - **Mihon + achat physique** : seuls les acheteurs physiques comptent ; pas d'économie Mihon.
 * - **Même personne Mihon + achat** : traité comme achat physique uniquement.
 *
 * @param effectivePrice - Prix du tome (manuel ou hérité de l'œuvre).
 * @param owners - Liste des propriétaires avec indicateurs Mihon / achat.
 * @returns Détail financier par propriétaire et totaux du tome.
 */
export function computeVolumeFinancials(
  effectivePrice: number,
  owners: VolumeOwnerShare[],
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
    const sharePerPayingOwner = effectivePrice / payingOwners.length;
    const perOwner: OwnerFinancialResult[] = owners.map((owner) => ({
      ownerId: owner.ownerId,
      amountPaid: resolvesHasPurchase(owner)
        ? roundCurrency(sharePerPayingOwner)
        : 0,
      mihonSavings: 0,
    }));

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
 * @param volumes - Liste des tomes avec prix effectif et propriétaires.
 * @returns Valeur catalogue, dépenses totales, économies Mihon et détail par personne.
 */
export function computeSeriesFinancials(
  volumes: SeriesVolumeInput[],
): SeriesFinancials {
  const ownerTotals = new Map<string, OwnerSeriesTotals>();

  let catalogValue = 0;
  let totalPaid = 0;
  let totalMihonSavings = 0;

  for (const volume of volumes) {
    if (isVolumeCountedInCatalog(volume)) {
      catalogValue += volume.effectivePrice;
    }

    const financials = computeVolumeFinancials(
      volume.effectivePrice,
      volume.owners,
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
 * @description Valeur catalogue des tomes avec achat physique (hors tomes 100 % Mihon).
 * @param volumes - Liste des tomes avec prix effectif et propriétaires.
 */
export function computePurchasedCatalogValue(
  volumes: SeriesVolumeInput[],
): number {
  const total = volumes.reduce((sum, volume) => {
    const hasPayingOwner = volume.owners.some((owner) => resolvesHasPurchase(owner));
    return hasPayingOwner ? sum + volume.effectivePrice : sum;
  }, 0);

  return roundCurrency(total);
}

/**
 * @description Arrondit un montant à deux décimales (centimes).
 * @param value - Montant brut.
 * @returns Montant arrondi.
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
