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
 * @description Calcule la répartition financière d'un tome.
 *
 * Règles :
 * - **Achat solo** (1 propriétaire, sans Mihon) : paie le prix entier.
 * - **Tome Mihon** : un seul propriétaire désigné = compte Mihon sur lequel le tome
 *   a été téléchargé (Céline, Sébastien ou Alexandre). 0 € dépensé, économie = prix du tome.
 * - **Co-achat** (plusieurs propriétaires, sans Mihon) : prix ÷ nombre de propriétaires
 *   (ex. 10 € / 3 ≈ 3,33 € chacun).
 *
 * Mihon et co-achat sont mutuellement exclusifs sur un même tome (achat physique OU Mihon).
 *
 * @param effectivePrice - Prix du tome (manuel ou hérité de l'œuvre).
 * @param owners - Liste des propriétaires avec indicateur Mihon.
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

  const payingOwners = owners.filter((owner) => !owner.hasMihon);
  const mihonOwners = owners.filter((owner) => owner.hasMihon);

  // Tome entièrement Mihon : aucun euro dépensé, économie = prix catalogue du tome
  if (payingOwners.length === 0) {
    const savingsPerMihonOwner = effectivePrice / mihonOwners.length;
    const perOwner: OwnerFinancialResult[] = owners.map((owner) => ({
      ownerId: owner.ownerId,
      amountPaid: 0,
      mihonSavings: owner.hasMihon ? roundCurrency(savingsPerMihonOwner) : 0,
    }));

    return {
      effectivePrice,
      perOwner,
      totalPaid: 0,
      totalMihonSavings: roundCurrency(effectivePrice),
    };
  }

  // Achat solo ou co-achat (éventuellement mixte avec Mihon)
  const sharePerOwner = effectivePrice / owners.length;

  const perOwner: OwnerFinancialResult[] = owners.map((owner) => {
    if (owner.hasMihon) {
      return {
        ownerId: owner.ownerId,
        amountPaid: 0,
        mihonSavings: roundCurrency(sharePerOwner),
      };
    }
    return {
      ownerId: owner.ownerId,
      amountPaid: roundCurrency(sharePerOwner),
      mihonSavings: 0,
    };
  });

  const totalPaid = perOwner.reduce((sum, row) => sum + row.amountPaid, 0);
  const totalMihonSavings = perOwner.reduce(
    (sum, row) => sum + row.mihonSavings,
    0,
  );

  return {
    effectivePrice,
    perOwner,
    totalPaid: roundCurrency(totalPaid),
    totalMihonSavings: roundCurrency(totalMihonSavings),
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
    catalogValue += volume.effectivePrice;
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
 * @description Valeur catalogue des tomes réellement achetés (hors tomes 100 % Mihon).
 * @param volumes - Liste des tomes avec prix effectif et propriétaires.
 */
export function computePurchasedCatalogValue(
  volumes: SeriesVolumeInput[],
): number {
  const total = volumes.reduce((sum, volume) => {
    const hasPayingOwner = volume.owners.some((owner) => !owner.hasMihon);
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
