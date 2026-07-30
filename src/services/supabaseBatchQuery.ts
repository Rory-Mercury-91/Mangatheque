/** Taille max des lots `.in()` PostgREST pour éviter les URL trop longues (400 Bad Request). */
export const IN_QUERY_BATCH_SIZE = 80;

/**
 * Taille de page pour les SELECT sans filtre (plafond PostgREST / Supabase ≈ 1000).
 * Au-delà, les lignes suivantes sont silencieusement tronquées.
 */
export const TABLE_PAGE_SIZE = 1000;

/**
 * @description Exécute une requête Supabase `.in()` par lots et fusionne les résultats.
 * @param ids - Identifiants à interroger.
 * @param fetchBatch - Fonction exécutant une requête pour un lot d'identifiants.
 * @returns Résultats concaténés, sans doublons d'ordre de lot.
 */
export async function fetchInBatches<T>(
  ids: string[],
  fetchBatch: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(ids)];
  const results: T[] = [];

  for (let offset = 0; offset < uniqueIds.length; offset += IN_QUERY_BATCH_SIZE) {
    const batch = uniqueIds.slice(offset, offset + IN_QUERY_BATCH_SIZE);
    results.push(...(await fetchBatch(batch)));
  }

  return results;
}

/**
 * @description Charge toutes les lignes d'une table via pagination `.range()`.
 * Évite la troncature silencieuse au plafond PostgREST (~1000 lignes).
 * @param fetchPage - Requête pour un intervalle inclusif [from, to].
 * @param pageSize - Taille de page (défaut TABLE_PAGE_SIZE).
 * @returns Toutes les lignes concaténées.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = TABLE_PAGE_SIZE,
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;

  for (;;) {
    const to = from + pageSize - 1;
    const page = await fetchPage(from, to);
    results.push(...page);
    if (page.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return results;
}
