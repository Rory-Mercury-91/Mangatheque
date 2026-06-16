import { getOwnerDisplayName } from "@/constants/ownerColors";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchInBatches } from "@/services/supabaseBatchQuery";
import { fetchVolumeOwnerLinks } from "@/services/volumeOwnerLinkService";
import type { Owner, SeriesVolumeInput } from "@/types/database";
import {
  computePurchasedCatalogValue,
  computeSeriesFinancials,
  resolveEffectiveVolumePrice,
} from "@/services/volumePriceService";

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

/** Série classée par dépenses réelles (hors Mihon). */
export interface TopExpensiveWork {
  workId: string;
  title: string;
  /** Valeur catalogue des tomes achetés (sans tomes 100 % Mihon). */
  catalogValue: number;
  totalPaid: number;
}

/** Snapshot complet du tableau de bord (un seul passage réseau). */
export interface DashboardSnapshot {
  financials: GlobalFinancials;
  topExpensive: TopExpensiveWork[];
}

/**
 * @description Charge récap financier + top dépenses en une seule requête agrégée.
 * @param owners - Propriétaires pour les libellés.
 * @param topLimit - Nombre de séries dans le top dépenses.
 */
export async function fetchDashboardSnapshot(
  owners: Owner[],
  topLimit = 3,
): Promise<DashboardSnapshot> {
  const inputs = await fetchAllVolumeInputs();
  const financials = buildGlobalFinancialsFromInputs(inputs, owners);
  const topExpensive = buildTopExpensiveFromInputs(inputs, topLimit);
  return { financials, topExpensive };
}

function buildGlobalFinancialsFromInputs(
  inputs: WorkVolumeInputs[],
  owners: Owner[],
): GlobalFinancials {
  const allVolumes: SeriesVolumeInput[] = inputs.flatMap(
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

function buildTopExpensiveFromInputs(
  inputs: WorkVolumeInputs[],
  limit: number,
): TopExpensiveWork[] {
  return inputs
    .map((work) => {
      const totals = computeSeriesFinancials(work.volumes);
      return {
        workId: work.workId,
        title: work.title,
        catalogValue: computePurchasedCatalogValue(work.volumes),
        totalPaid: totals.totalPaid,
      };
    })
    .filter((work) => work.totalPaid > 0)
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, limit);
}

/**
 * @description Calcule les coûts globaux de toute la collection.
 * @param owners - Propriétaires pour les libellés et couleurs.
 * @returns Récapitulatif catalogue, dépenses, Mihon et détail par personne.
 */
export async function fetchGlobalFinancials(
  owners: Owner[],
): Promise<GlobalFinancials> {
  const { financials } = await fetchDashboardSnapshot(owners);
  return financials;
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
 * @description Retourne les séries aux dépenses réelles les plus élevées (Mihon exclu).
 * @param limit - Nombre de séries à retourner (défaut 3).
 */
export async function fetchTopExpensiveWorks(
  limit = 3,
): Promise<TopExpensiveWork[]> {
  const inputs = await fetchAllVolumeInputs();
  return buildTopExpensiveFromInputs(inputs, limit);
}

interface WorkVolumeInputs {
  workId: string;
  title: string;
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

  let worksQuery = supabase.from("works").select("id, title, default_price");
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
  const titleByWork = new Map(
    works.map((w) => [w.id, w.title as string]),
  );

  const volumeRows = await fetchInBatches(workIds, async (batch) => {
    const { data, error } = await supabase
      .from("volumes")
      .select("id, work_id, purchase_price, price_manual_override")
      .in("work_id", batch);

    if (error) {
      throw new Error(`Impossible de charger les tomes : ${error.message}`);
    }

    return data ?? [];
  });

  const volumeIds = (volumeRows ?? []).map((v) => v.id);
  const ownersByVolume = new Map<
    string,
    Array<{ ownerId: string; hasMihon: boolean; hasPurchase: boolean }>
  >();

  if (volumeIds.length > 0) {
    const ownerLinks = await fetchVolumeOwnerLinks(volumeIds);

    for (const link of ownerLinks) {
      const list = ownersByVolume.get(link.volume_id) ?? [];
      list.push({
        ownerId: link.owner_id,
        hasMihon: link.has_mihon,
        hasPurchase: link.has_purchase,
      });
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
    title: titleByWork.get(id) ?? "Sans titre",
    volumes: byWork.get(id) ?? [],
  }));
}
