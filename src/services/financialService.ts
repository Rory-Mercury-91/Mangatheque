import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Owner, SeriesVolumeInput } from "@/types/database";
import {
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
    color: string;
    amountPaid: number;
    mihonSavings: number;
  }>;
}

/** Dernière œuvre ou tome ajouté. */
export interface RecentAddition {
  kind: "work" | "volume";
  title: string;
  workId: string;
  detail: string;
  createdAt: string;
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
      ownerName: owner.name,
      color: owner.color,
      amountPaid: row?.amountPaid ?? 0,
      mihonSavings: row?.mihonSavings ?? 0,
    };
  });

  for (const row of totals.perOwner) {
    if (!ownerMap.has(row.ownerId)) {
      perOwner.push({
        ownerId: row.ownerId,
        ownerName: "Inconnu",
        color: "#6b7280",
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
 * @description Retourne la dernière œuvre et le dernier tome ajoutés.
 * @returns Jusqu'à deux entrées récentes.
 */
export async function fetchRecentAdditions(): Promise<RecentAddition[]> {
  const supabase = getSupabaseClient();
  const results: RecentAddition[] = [];

  const { data: lastWork } = await supabase
    .from("works")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastWork) {
    results.push({
      kind: "work",
      title: lastWork.title,
      workId: lastWork.id,
      detail: "Nouvelle œuvre",
      createdAt: lastWork.created_at,
    });
  }

  const { data: lastVolume } = await supabase
    .from("volumes")
    .select("id, volume_number, created_at, work_id, works(title)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastVolume) {
    const workTitle =
      (lastVolume.works as { title?: string } | null)?.title ?? "Œuvre";
    results.push({
      kind: "volume",
      title: workTitle,
      workId: lastVolume.work_id,
      detail: `Tome ${lastVolume.volume_number} ajouté`,
      createdAt: lastVolume.created_at,
    });
  }

  return results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
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
    throw new Error(`Impossible de charger les œuvres : ${worksError.message}`);
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
