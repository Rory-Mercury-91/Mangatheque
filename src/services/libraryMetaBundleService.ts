import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchInBatches } from "@/services/supabaseBatchQuery";
import {
  fetchLibraryUserReadingMeta,
  type LibraryReadingVolumeRow,
} from "@/services/readingProgressService";
import { fetchVolumeOwnerLinks } from "@/services/volumeOwnerLinkService";
import { toVolumeOwnerShares } from "@/services/volumeOwnerLinks";
import {
  computeSeriesFinancials,
  resolveEffectiveVolumePrice,
} from "@/services/volumePriceService";
import type {
  LibraryUserReadingMeta,
  LibraryWorkMeta,
} from "@/types/libraryFilters";
import type { Work } from "@/types/database";

export interface LibraryMetaBundle {
  workMeta: Map<string, LibraryWorkMeta>;
  readingMeta: Map<string, LibraryUserReadingMeta>;
}

/**
 * @description Charge meta biblio + progression lecture en un seul scan volumes.
 * Remplace le couple fetchLibraryWorkMeta + fetchLibraryUserReadingMeta.
 * @param works - Séries de la bibliothèque (déjà en mémoire / cache).
 * @param options.targetUserId - Compte dont on affiche la progression.
 * @param options.includeWorkMeta - false = lecture seule (dashboard).
 */
export async function fetchLibraryMetaBundle(
  works: Work[],
  options?: {
    targetUserId?: string | null;
    includeWorkMeta?: boolean;
  },
): Promise<LibraryMetaBundle> {
  const includeWorkMeta = options?.includeWorkMeta ?? true;
  const emptyWorkMeta = new Map<string, LibraryWorkMeta>();

  if (works.length === 0) {
    return {
      workMeta: emptyWorkMeta,
      readingMeta: new Map(),
    };
  }

  const supabase = getSupabaseClient();
  const workIds = works.map((work) => work.id);

  const volumeRows = await fetchInBatches(workIds, async (batch) => {
    const { data, error } = await supabase
      .from("volumes")
      .select(
        "id, work_id, volume_number, volume_label, purchase_price, price_manual_override, shared_purchase",
      )
      .in("work_id", batch);

    if (error) {
      throw new Error(`Impossible de charger les tomes : ${error.message}`);
    }

    return data ?? [];
  });

  const readingVolumes: LibraryReadingVolumeRow[] = volumeRows.map((row) => ({
    id: String(row.id),
    work_id: String(row.work_id),
    volume_number:
      row.volume_number == null ? null : Number(row.volume_number),
    volume_label: row.volume_label ? String(row.volume_label) : null,
  }));

  const readingMetaPromise = fetchLibraryUserReadingMeta(works, {
    targetUserId: options?.targetUserId,
    preloadedVolumes: readingVolumes,
  });

  if (!includeWorkMeta) {
    return {
      workMeta: emptyWorkMeta,
      readingMeta: await readingMetaPromise,
    };
  }

  const priceByWork = new Map(
    works.map((work) => [work.id, work.default_price ?? null]),
  );

  const mihonSourcesByWork = new Map<
    string,
    Array<{ id: string; name: string | null }>
  >();

  const mihonSourceRows = await fetchInBatches(workIds, async (batch) => {
    const { data, error } = await supabase
      .from("work_mihon_sources")
      .select("work_id, source_id, source_name")
      .in("work_id", batch);

    if (error) {
      const lower = error.message.toLowerCase();
      if (
        lower.includes("work_mihon_sources") ||
        lower.includes("does not exist") ||
        lower.includes("schema cache")
      ) {
        return [];
      }
      throw new Error(
        `Impossible de charger les sources Mihon : ${error.message}`,
      );
    }
    return data ?? [];
  });

  for (const row of mihonSourceRows) {
    const workId = String(row.work_id ?? "").trim();
    const sourceId = String(row.source_id ?? "").trim();
    if (!workId || !sourceId) continue;
    const list = mihonSourcesByWork.get(workId) ?? [];
    if (!list.some((item) => item.id === sourceId)) {
      list.push({
        id: sourceId,
        name: row.source_name ? String(row.source_name) : null,
      });
    }
    mihonSourcesByWork.set(workId, list);
  }

  for (const work of works) {
    if ((mihonSourcesByWork.get(work.id) ?? []).length > 0) continue;
    const legacyId = String(work.mihon_source_id ?? "").trim();
    if (!legacyId) continue;
    mihonSourcesByWork.set(work.id, [
      {
        id: legacyId,
        name: work.mihon_source_name
          ? String(work.mihon_source_name)
          : null,
      },
    ]);
  }

  const volumeIds = volumeRows.map((row) => String(row.id));
  const ownersByVolume = new Map<
    string,
    ReturnType<typeof toVolumeOwnerShares>
  >();

  if (volumeIds.length > 0) {
    const ownerLinks = await fetchVolumeOwnerLinks(volumeIds);
    const linksByVolume = new Map<string, typeof ownerLinks>();
    for (const link of ownerLinks) {
      const list = linksByVolume.get(link.volume_id) ?? [];
      list.push(link);
      linksByVolume.set(link.volume_id, list);
    }
    for (const [volumeId, links] of linksByVolume) {
      ownersByVolume.set(volumeId, toVolumeOwnerShares(links));
    }
  }

  const volumesByWork = new Map<
    string,
    Array<{
      effectivePrice: number;
      sharedPurchase: boolean;
      owners: ReturnType<typeof toVolumeOwnerShares>;
    }>
  >();

  for (const vol of volumeRows) {
    const workId = String(vol.work_id);
    const effectivePrice = resolveEffectiveVolumePrice(
      priceByWork.get(workId) ?? null,
      vol.purchase_price,
      vol.price_manual_override,
    );
    const list = volumesByWork.get(workId) ?? [];
    list.push({
      effectivePrice,
      sharedPurchase: vol.shared_purchase ?? true,
      owners: ownersByVolume.get(String(vol.id)) ?? [],
    });
    volumesByWork.set(workId, list);
  }

  const workMeta = new Map<string, LibraryWorkMeta>();
  for (const workId of workIds) {
    const volumes = volumesByWork.get(workId) ?? [];
    const financials = computeSeriesFinancials(
      volumes.map((v) => ({
        effectivePrice: v.effectivePrice,
        sharedPurchase: v.sharedPurchase,
        owners: v.owners.map((o) => ({
          ownerId: o.ownerId,
          hasMihon: o.hasMihon,
          hasPurchase: o.hasPurchase,
        })),
      })),
    );

    const ownerIds = new Set<string>();
    const mihonOwnerIds = new Set<string>();
    for (const vol of volumes) {
      for (const owner of vol.owners) {
        if (owner.hasPurchase) ownerIds.add(owner.ownerId);
        if (owner.hasMihon) mihonOwnerIds.add(owner.ownerId);
      }
    }

    workMeta.set(workId, {
      catalogValue: financials.catalogValue,
      ownerIds: [...ownerIds],
      mihonOwnerIds: [...mihonOwnerIds],
      mihonSources: mihonSourcesByWork.get(workId) ?? [],
    });
  }

  return {
    workMeta,
    readingMeta: await readingMetaPromise,
  };
}
