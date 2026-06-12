import { getOwnerDisplayName } from "@/constants/ownerColors";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Owner, SeriesVolumeInput } from "@/types/database";
import {
  computeSeriesFinancials,
  computeVolumeFinancials,
  resolveEffectiveVolumePrice,
} from "@/services/volumePriceService";
import { formatMonthYearFr } from "@/utils/dateFormat";

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

/** Entrée du fil d'activité récente (œuvre ou tome). */
export interface RecentAddition {
  entryId: string;
  kind: "work" | "volume";
  title: string;
  workId: string;
  detail: string;
  coverUrl: string | null;
  createdAt: string;
}

/** Période mensuelle du récapitulatif d'achats. */
export interface PurchaseRecapPeriod {
  periodKey: string;
  label: string;
  totalPaid: number;
  volumeCount: number;
}

/** Série classée par coût catalogue. */
export interface TopExpensiveWork {
  workId: string;
  title: string;
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
 * @description Retourne les dernières œuvres et tomes ajoutés, fusionnés par date.
 * @param limit - Nombre maximal d'entrées (défaut 10).
 */
export async function fetchRecentAdditions(
  limit = 10,
): Promise<RecentAddition[]> {
  const supabase = getSupabaseClient();
  const results: RecentAddition[] = [];
  const fetchLimit = Math.max(limit, 10);

  const { data: recentWorks, error: worksError } = await supabase
    .from("works")
    .select("id, title, cover_url, created_at")
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (worksError) {
    throw new Error(
      `Impossible de charger les séries récentes : ${worksError.message}`,
    );
  }

  for (const work of recentWorks ?? []) {
    results.push({
      entryId: `work-${work.id}`,
      kind: "work",
      title: work.title,
      workId: work.id,
      detail: "Nouvelle série",
      coverUrl: work.cover_url,
      createdAt: work.created_at,
    });
  }

  const { data: recentVolumes, error: volumesError } = await supabase
    .from("volumes")
    .select("id, volume_number, cover_url, created_at, work_id, works(title, cover_url)")
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (volumesError) {
    throw new Error(
      `Impossible de charger les tomes récents : ${volumesError.message}`,
    );
  }

  for (const volume of recentVolumes ?? []) {
    const workRow = volume.works as {
      title?: string;
      cover_url?: string | null;
    } | null;
    const workTitle = workRow?.title ?? "Série";
    results.push({
      entryId: `volume-${volume.id}`,
      kind: "volume",
      title: workTitle,
      workId: volume.work_id,
      detail: `Tome ${volume.volume_number} ajouté`,
      coverUrl: volume.cover_url ?? workRow?.cover_url ?? null,
      createdAt: volume.created_at,
    });
  }

  return results
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
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
      "id, purchase_date, purchase_price, price_manual_override, works(default_price)",
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

  const { data: ownerLinks, error: ownerError } = await supabase
    .from("volume_owners")
    .select("volume_id, owner_id, has_mihon")
    .in("volume_id", volumeIds);

  if (ownerError) {
    throw new Error(
      `Impossible de charger les propriétaires : ${ownerError.message}`,
    );
  }

  for (const link of ownerLinks ?? []) {
    const list = ownersByVolume.get(link.volume_id) ?? [];
    list.push({ ownerId: link.owner_id, hasMihon: link.has_mihon });
    ownersByVolume.set(link.volume_id, list);
  }

  const byMonth = new Map<string, { totalPaid: number; volumeCount: number }>();

  for (const row of volumeRows) {
    const purchaseDate = row.purchase_date as string;
    const periodKey = purchaseDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(periodKey)) {
      continue;
    }

    const workRelation = row.works as
      | { default_price: number | null }
      | { default_price: number | null }[]
      | null;
    const defaultPrice = Array.isArray(workRelation)
      ? (workRelation[0]?.default_price ?? null)
      : (workRelation?.default_price ?? null);
    const effectivePrice = resolveEffectiveVolumePrice(
      defaultPrice,
      row.purchase_price,
      row.price_manual_override,
    );
    const { totalPaid } = computeVolumeFinancials(
      effectivePrice,
      ownersByVolume.get(row.id) ?? [],
    );

    const entry = byMonth.get(periodKey) ?? { totalPaid: 0, volumeCount: 0 };
    entry.totalPaid += totalPaid;
    entry.volumeCount += 1;
    byMonth.set(periodKey, entry);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodKey, data]) => ({
      periodKey,
      label: formatMonthYearFr(periodKey),
      totalPaid: data.totalPaid,
      volumeCount: data.volumeCount,
    }));
}

/**
 * @description Retourne les séries au coût catalogue le plus élevé.
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
        catalogValue: totals.catalogValue,
        totalPaid: totals.totalPaid,
      };
    })
    .sort((a, b) => b.catalogValue - a.catalogValue)
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
    const { data: ownerLinks, error: ownerError } = await supabase
      .from("volume_owners")
      .select("volume_id, owner_id, has_mihon")
      .in("volume_id", volumeIds);

    if (ownerError) {
      throw new Error(
        `Impossible de charger les propriétaires : ${ownerError.message}`,
      );
    }

    for (const link of ownerLinks ?? []) {
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
