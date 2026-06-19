import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchInBatches } from "@/services/supabaseBatchQuery";
import { fetchVolumeOwnerLinks } from "@/services/volumeOwnerLinkService";
import { toVolumeOwnerShares } from "@/services/volumeOwnerLinks";
import {
  computeSeriesFinancials,
  resolveEffectiveVolumePrice,
} from "@/services/volumePriceService";
import { normalizeWorkReadingStatus } from "@/constants/workStatus";
import {
  hasActiveOwnerFilters,
  type LibraryFiltersState,
  type LibraryOwnerFilterMode,
  type LibrarySortKey,
  type LibraryUserReadingMeta,
  type LibraryWorkMeta,
} from "@/types/libraryFilters";
import type { Work } from "@/types/database";

/**
 * @description Charge les métadonnées bibliothèque (prix catalogue, propriétaires, Mihon).
 * @returns Map workId → métadonnées agrégées.
 */
export async function fetchLibraryWorkMeta(): Promise<
  Map<string, LibraryWorkMeta>
> {
  const supabase = getSupabaseClient();

  const { data: works, error: worksError } = await supabase
    .from("works")
    .select("id, default_price");

  if (worksError) {
    throw new Error(
      `Impossible de charger les métadonnées : ${worksError.message}`,
    );
  }

  if (!works?.length) {
    return new Map();
  }

  const priceByWork = new Map(
    works.map((w) => [w.id, w.default_price as number | null]),
  );
  const workIds = works.map((w) => w.id);

  const volumeRows = await fetchInBatches(workIds, async (batch) => {
    const { data, error } = await supabase
      .from("volumes")
      .select("id, work_id, purchase_price, price_manual_override, shared_purchase")
      .in("work_id", batch);

    if (error) {
      throw new Error(`Impossible de charger les tomes : ${error.message}`);
    }

    return data ?? [];
  });

  const volumeIds = volumeRows.map((v) => v.id);
  const ownersByVolume = new Map<string, ReturnType<typeof toVolumeOwnerShares>>();

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
    const effectivePrice = resolveEffectiveVolumePrice(
      priceByWork.get(vol.work_id) ?? null,
      vol.purchase_price,
      vol.price_manual_override,
    );
    const list = volumesByWork.get(vol.work_id) ?? [];
    list.push({
      effectivePrice,
      sharedPurchase: vol.shared_purchase ?? true,
      owners: ownersByVolume.get(vol.id) ?? [],
    });
    volumesByWork.set(vol.work_id, list);
  }

  const meta = new Map<string, LibraryWorkMeta>();

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
        if (owner.hasPurchase) {
          ownerIds.add(owner.ownerId);
        }
        if (owner.hasMihon) {
          mihonOwnerIds.add(owner.ownerId);
        }
      }
    }

    meta.set(workId, {
      catalogValue: financials.catalogValue,
      ownerIds: [...ownerIds],
      mihonOwnerIds: [...mihonOwnerIds],
    });
  }

  return meta;
}

/**
 * @description Extrait les valeurs uniques de démographie et tags pour les filtres.
 */
export function collectLibraryFilterOptions(works: Work[]): {
  demographics: string[];
  tags: string[];
} {
  const demographics = new Set<string>();
  const tags = new Set<string>();

  for (const work of works) {
    if (work.demographic_type?.trim()) {
      demographics.add(work.demographic_type.trim());
    }
    for (const genre of work.genres ?? []) {
      if (genre.trim()) {
        tags.add(genre.trim());
      }
    }
    for (const theme of work.themes ?? []) {
      if (theme.trim()) {
        tags.add(theme.trim());
      }
    }
  }

  return {
    demographics: [...demographics].sort((a, b) => a.localeCompare(b, "fr")),
    tags: [...tags].sort((a, b) => a.localeCompare(b, "fr")),
  };
}

/**
 * @description Indique si une série correspond au filtre d'un propriétaire donné.
 */
function matchesLibraryOwnerFilter(
  meta: LibraryWorkMeta | undefined,
  ownerId: string,
  mode: LibraryOwnerFilterMode,
): boolean {
  const physicalOwners = meta?.ownerIds ?? [];
  const mihonOwners = meta?.mihonOwnerIds ?? [];
  const allOwners = new Set([...physicalOwners, ...mihonOwners]);

  if (mode === "any") {
    return allOwners.has(ownerId);
  }

  if (mode === "physical") {
    return physicalOwners.includes(ownerId);
  }

  if (mihonOwners.length > 0) {
    return false;
  }

  return physicalOwners.length === 1 && physicalOwners[0] === ownerId;
}

/**
 * @description Applique recherche, filtres et tri sur la liste d'œuvres.
 */
export function filterAndSortLibraryWorks(
  works: Work[],
  metaByWork: Map<string, LibraryWorkMeta>,
  filters: LibraryFiltersState,
  readingMetaByWork: Map<string, LibraryUserReadingMeta> = new Map(),
  favoritesByWork: Map<string, string[]> = new Map(),
): Work[] {
  const query = filters.search.trim().toLowerCase();

  let result = works.filter((work) => {
    if (query && !work.title.toLowerCase().includes(query)) {
      return false;
    }

    const meta = metaByWork.get(work.id);
    const hasMihon = (meta?.mihonOwnerIds.length ?? 0) > 0;
    const activeOwnerFilters = Object.entries(filters.ownerFilterById);

    if (activeOwnerFilters.length > 0) {
      const matchesOwnerFilter = activeOwnerFilters.some(([ownerId, mode]) =>
        mode != null &&
        matchesLibraryOwnerFilter(meta, ownerId, mode),
      );
      if (!matchesOwnerFilter) {
        return false;
      }
    }

    if (filters.mihonFilter === "only" && !hasMihon) {
      return false;
    }

    if (filters.mihonFilter === "exclude" && !hasActiveOwnerFilters(filters.ownerFilterById) && hasMihon) {
      return false;
    }

    if (filters.readingStatuses.length > 0) {
      const status = normalizeWorkReadingStatus(work.reading_status);
      if (!filters.readingStatuses.includes(status)) {
        return false;
      }
    }

    if (filters.userReadingStatuses.length > 0) {
      const userStatus =
        readingMetaByWork.get(work.id)?.userReadingStatus ?? "to_read";
      if (!filters.userReadingStatuses.includes(userStatus)) {
        return false;
      }
    }

    if (filters.demographics.length > 0) {
      const demo = work.demographic_type?.trim() ?? "";
      if (!filters.demographics.includes(demo)) {
        return false;
      }
    }

    if (filters.tags.length > 0) {
      const workTags = new Set([...(work.genres ?? []), ...(work.themes ?? [])]);
      if (!filters.tags.some((tag) => workTags.has(tag))) {
        return false;
      }
    }

    if (filters.favoriteOwnerIds.length > 0) {
      const favorites = favoritesByWork.get(work.id) ?? [];
      if (!filters.favoriteOwnerIds.some((id) => favorites.includes(id))) {
        return false;
      }
    }

    return true;
  });

  const sortKey = filters.sort;
  result = [...result].sort((a, b) => compareWorks(a, b, sortKey, metaByWork));

  return result;
}

function compareWorks(
  a: Work,
  b: Work,
  sort: LibrarySortKey,
  metaByWork: Map<string, LibraryWorkMeta>,
): number {
  switch (sort) {
    case "created_asc":
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    case "price_desc": {
      const pa = metaByWork.get(a.id)?.catalogValue ?? 0;
      const pb = metaByWork.get(b.id)?.catalogValue ?? 0;
      return pb - pa || a.title.localeCompare(b.title, "fr");
    }
    case "price_asc": {
      const pa = metaByWork.get(a.id)?.catalogValue ?? 0;
      const pb = metaByWork.get(b.id)?.catalogValue ?? 0;
      return pa - pb || a.title.localeCompare(b.title, "fr");
    }
    case "title_asc":
      return a.title.localeCompare(b.title, "fr");
    case "title_desc":
      return b.title.localeCompare(a.title, "fr");
    case "created_desc":
    default:
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }
}
