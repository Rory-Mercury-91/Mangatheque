/** Taille max des lots `.in()` PostgREST pour éviter les URL trop longues (400 Bad Request). */
export const IN_QUERY_BATCH_SIZE = 80;

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
