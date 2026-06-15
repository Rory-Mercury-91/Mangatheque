import { getOwnerDisplayName } from "@/constants/ownerColors";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchVolumeOwnerLinks } from "@/services/volumeOwnerLinkService";
import type { Owner, SeriesVolumeInput, TrackingUnit } from "@/types/database";
import {
  computePurchasedCatalogValue,
  computeSeriesFinancials,
  computeVolumeFinancials,
  resolveEffectiveVolumePrice,
} from "@/services/volumePriceService";
import { formatMonthYearFr, isoDateToPeriodKey, normalizeIsoDate } from "@/utils/dateFormat";

/** Totaux financiers globaux de la collection. */
export interface GlobalFinancials {
  catalogValue: number;
  totalPaid: number;
  totalMihonSavings: number;
  perOwner: Array<{
    ownerId: string;
    ownerName: string;
    amountPaid: number;
    mihonSavings: number;
  }>;
}

/** Tome comptabilisé dans le récapitulatif d'achats d'un mois. */
export interface PurchaseRecapVolume {
  volumeId: string;
  workId: string;
  workTitle: string;
  volumeNumber: number | null;
  volumeLabel: string | null;
  trackingUnit: TrackingUnit;
  purchaseDate: string;
  amountPaid: number;
}

/** Période mensuelle du récapitulatif d'achats. */
export interface PurchaseRecapPeriod {
  periodKey: string;
  label: string;
  totalPaid: number;
  volumeCount: number;
  volumes: PurchaseRecapVolume[];
}

/** Série classée par dépenses réelles (hors Mihon). */
export interface TopExpensiveWork {
  workId: string;
  title: string;
  /** Valeur catalogue des tomes achetés (sans tomes 100 % Mihon). */
  catalogValue: number;
  totalPaid: number;
}

/**
 * @description Calcule les coûts globaux de toute la collection.
 * @param owners - Propriétaires pour les libellés et couleurs.
 * @returns Récapitulatif catalogue, dépenses, Mihon et détail par personne.
 */
export async function fetchGlobalFinancials(
  owners: Owner[],
): Promise<GlobalFinancials> {
  const volumeInputs = await fetchAllVolumeInputs();
  const allVolumes: SeriesVolumeInput[] = volumeInputs.flatMap(
    (work) => work.volumes,
  );

  const totals = computeSeriesFinancials(allVolumes);
  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  const perOwner = owners.map((owner) => {
    const row = totals.perOwner.find((r) => r.ownerId === owner.id);
    return {
      ownerId: owner.id,
      ownerName: getOwnerDisplayName(owner.name),
      amountPaid: row?.amountPaid ?? 0,
      mihonSavings: row?.mihonSavings ?? 0,
    };
  });

  for (const row of totals.perOwner) {
    if (!ownerMap.has(row.ownerId)) {
      perOwner.push({
        ownerId: row.ownerId,
        ownerName: "Inconnu",
        amountPaid: row.amountPaid,
        mihonSavings: row.mihonSavings,
      });
    }
  }

  return {
    catalogValue: totals.catalogValue,
    totalPaid: totals.totalPaid,
    totalMihonSavings: totals.totalMihonSavings,
    perOwner,
  };
}

/**
 * @description Calcule les finances d'une seule œuvre.
 * @param workId - Identifiant de l'œuvre.
 * @returns Totaux série ou null si introuvable.
 */
export async function fetchWorkFinancials(workId: string) {
  const inputs = await fetchAllVolumeInputs(workId);
  const work = inputs[0];
  if (!work) {
    return null;
  }
  return computeSeriesFinancials(work.volumes);
}

/**
 * @description Agrège les achats par mois à partir des dates d'achat des tomes.
 * @returns Périodes chronologiques avec montant payé et nombre de tomes.
 */
export async function fetchPurchaseRecap(): Promise<PurchaseRecapPeriod[]> {
  const supabase = getSupabaseClient();

  const { data: volumeRows, error: volError } = await supabase
    .from("volumes")
    .select(
      "id, work_id, volume_number, volume_label, purchase_date, purchase_price, price_manual_override, works(title, default_price, tracking_unit)",
    )
    .not("purchase_date", "is", null);

  if (volError) {
    throw new Error(
      `Impossible de charger les dates d'achat : ${volError.message}`,
    );
  }

  if (!volumeRows?.length) {
    return [];
  }

  const volumeIds = volumeRows.map((row) => row.id);
  const ownersByVolume = new Map<
    string,
    Array<{ ownerId: string; hasMihon: boolean }>
  >();

  const ownerLinks = await fetchVolumeOwnerLinks(volumeIds);

  for (const link of ownerLinks) {
    const list = ownersByVolume.get(link.volume_id) ?? [];
    list.push({ ownerId: link.owner_id, hasMihon: link.has_mihon });
    ownersByVolume.set(link.volume_id, list);
  }

  const byMonth = new Map<
    string,
    {
      totalPaid: number;
      volumeCount: number;
      volumes: PurchaseRecapVolume[];
    }
  >();

  for (const row of volumeRows) {
    const purchaseDate = normalizeIsoDate(row.purchase_date as string);
    if (!purchaseDate) {
      continue;
    }

    const periodKey = isoDateToPeriodKey(purchaseDate);
    if (!periodKey) {
      continue;
    }

    const workRelation = row.works as
      | {
          title: string;
          default_price: number | null;
          tracking_unit: TrackingUnit;
        }
      | {
          title: string;
          default_price: number | null;
          tracking_unit: TrackingUnit;
        }[]
      | null;
    const workRow = Array.isArray(workRelation)
      ? workRelation[0]
      : workRelation;
    const defaultPrice = workRow?.default_price ?? null;
    const effectivePrice = resolveEffectiveVolumePrice(
      defaultPrice,
      row.purchase_price,
      row.price_manual_override,
    );
    const { totalPaid } = computeVolumeFinancials(
      effectivePrice,
      ownersByVolume.get(row.id) ?? [],
    );

    const entry = byMonth.get(periodKey) ?? {
      totalPaid: 0,
      volumeCount: 0,
      volumes: [],
    };
    entry.totalPaid += totalPaid;
    entry.volumeCount += 1;
    entry.volumes.push({
      volumeId: row.id,
      workId: row.work_id,
      workTitle: workRow?.title ?? "Sans titre",
      volumeNumber:
        row.volume_number != null ? Number(row.volume_number) : null,
      volumeLabel: row.volume_label,
      trackingUnit: workRow?.tracking_unit ?? "volume",
      purchaseDate,
      amountPaid: totalPaid,
    });
    byMonth.set(periodKey, entry);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodKey, data]) => ({
      periodKey,
      label: formatMonthYearFr(periodKey),
      totalPaid: data.totalPaid,
      volumeCount: data.volumeCount,
      volumes: sortPurchaseRecapVolumes(data.volumes),
    }));
}

/**
 * @description Trie les tomes d'un mois par série puis numéro.
 */
function sortPurchaseRecapVolumes(
  volumes: PurchaseRecapVolume[],
): PurchaseRecapVolume[] {
  return [...volumes].sort((a, b) => {
    const titleCmp = a.workTitle.localeCompare(b.workTitle, "fr");
    if (titleCmp !== 0) {
      return titleCmp;
    }
    return (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0);
  });
}

/**
 * @description Retourne les séries aux dépenses réelles les plus élevées (Mihon exclu).
 * @param limit - Nombre de séries à retourner (défaut 3).
 */
export async function fetchTopExpensiveWorks(
  limit = 3,
): Promise<TopExpensiveWork[]> {
  const supabase = getSupabaseClient();
  const inputs = await fetchAllVolumeInputs();

  if (inputs.length === 0) {
    return [];
  }

  const workIds = inputs.map((work) => work.workId);
  const { data: works, error } = await supabase
    .from("works")
    .select("id, title")
    .in("id", workIds);

  if (error) {
    throw new Error(`Impossible de charger les titres : ${error.message}`);
  }

  const titleById = new Map((works ?? []).map((work) => [work.id, work.title]));

  return inputs
    .map((work) => {
      const totals = computeSeriesFinancials(work.volumes);
      return {
        workId: work.workId,
        title: titleById.get(work.workId) ?? "Sans titre",
        catalogValue: computePurchasedCatalogValue(work.volumes),
        totalPaid: totals.totalPaid,
      };
    })
    .filter((work) => work.totalPaid > 0)
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, limit);
}

interface WorkVolumeInputs {
  workId: string;
  volumes: SeriesVolumeInput[];
}

/**
 * @description Charge les tomes et propriétaires pour le calcul financier.
 * @param workId - Filtre optionnel sur une œuvre.
 */
async function fetchAllVolumeInputs(
  workId?: string,
): Promise<WorkVolumeInputs[]> {
  const supabase = getSupabaseClient();

  let worksQuery = supabase.from("works").select("id, default_price");
  if (workId) {
    worksQuery = worksQuery.eq("id", workId);
  }
  const { data: works, error: worksError } = await worksQuery;
  if (worksError) {
    throw new Error(`Impossible de charger les séries : ${worksError.message}`);
  }

  if (!works?.length) {
    return [];
  }

  const workIds = works.map((w) => w.id);
  const priceByWork = new Map(
    works.map((w) => [w.id, w.default_price as number | null]),
  );

  const { data: volumeRows, error: volError } = await supabase
    .from("volumes")
    .select(
      "id, work_id, purchase_price, price_manual_override",
    )
    .in("work_id", workIds);

  if (volError) {
    throw new Error(`Impossible de charger les tomes : ${volError.message}`);
  }

  const volumeIds = (volumeRows ?? []).map((v) => v.id);
  const ownersByVolume = new Map<
    string,
    Array<{ ownerId: string; hasMihon: boolean }>
  >();

  if (volumeIds.length > 0) {
    const ownerLinks = await fetchVolumeOwnerLinks(volumeIds);

    for (const link of ownerLinks) {
      const list = ownersByVolume.get(link.volume_id) ?? [];
      list.push({ ownerId: link.owner_id, hasMihon: link.has_mihon });
      ownersByVolume.set(link.volume_id, list);
    }
  }

  const byWork = new Map<string, SeriesVolumeInput[]>();

  for (const vol of volumeRows ?? []) {
    const effectivePrice = resolveEffectiveVolumePrice(
      priceByWork.get(vol.work_id) ?? null,
      vol.purchase_price,
      vol.price_manual_override,
    );
    const list = byWork.get(vol.work_id) ?? [];
    list.push({
      effectivePrice,
      owners: ownersByVolume.get(vol.id) ?? [],
    });
    byWork.set(vol.work_id, list);
  }

  return workIds.map((id) => ({
    workId: id,
    volumes: byWork.get(id) ?? [],
  }));
}
