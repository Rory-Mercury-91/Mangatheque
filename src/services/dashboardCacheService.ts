import {
  LOCAL_CACHE_KEYS,
  readLocalCache,
  writeLocalCache,
} from "@/services/localDataCache";
import type {
  GlobalFinancials,
  TopExpensiveWork,
} from "@/services/financialService";

/** Snapshot sérialisable du tableau de bord. */
export interface DashboardCacheBundle {
  ownersKey: string;
  worksSyncKey: string;
  financials: GlobalFinancials;
  topExpensive: TopExpensiveWork[];
  savedAt: number;
}

/**
 * @description Clé stable dérivée de la liste des propriétaires.
 */
export function buildOwnersCacheKey(ownerIds: string[]): string {
  return [...ownerIds].sort().join("|");
}

/**
 * @description Charge le snapshot tableau de bord si les clés correspondent.
 */
export async function readDashboardCacheBundle(
  ownersKey: string,
  worksSyncKey: string,
): Promise<DashboardCacheBundle | null> {
  const cached = await readLocalCache<DashboardCacheBundle>(
    LOCAL_CACHE_KEYS.dashboardBundle,
  );

  if (!cached) {
    return null;
  }

  if (cached.ownersKey !== ownersKey || cached.worksSyncKey !== worksSyncKey) {
    return null;
  }

  return cached;
}

/**
 * @description Persiste le snapshot tableau de bord.
 */
export async function writeDashboardCacheBundle(
  ownersKey: string,
  worksSyncKey: string,
  data: Pick<DashboardCacheBundle, "financials" | "topExpensive">,
): Promise<void> {
  await writeLocalCache(LOCAL_CACHE_KEYS.dashboardBundle, {
    ownersKey,
    worksSyncKey,
    financials: data.financials,
    topExpensive: data.topExpensive,
    savedAt: Date.now(),
  });
}
