import { getSupabaseClient } from "@/lib/supabaseClient";

/** Taille max des lots `.in()` pour éviter les URL PostgREST trop longues (400 Bad Request). */
const IN_QUERY_BATCH_SIZE = 80;

export interface VolumeOwnerLink {
  volume_id: string;
  owner_id: string;
  has_mihon: boolean;
}

/**
 * @description Charge les liens volume_owners par lots.
 * @param volumeIds - Identifiants des tomes concernés.
 * @returns Liens propriétaire / Mihon par tome.
 */
export async function fetchVolumeOwnerLinks(
  volumeIds: string[],
): Promise<VolumeOwnerLink[]> {
  if (volumeIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();
  const uniqueIds = [...new Set(volumeIds)];
  const results: VolumeOwnerLink[] = [];

  for (let offset = 0; offset < uniqueIds.length; offset += IN_QUERY_BATCH_SIZE) {
    const batch = uniqueIds.slice(offset, offset + IN_QUERY_BATCH_SIZE);
    const { data, error } = await supabase
      .from("volume_owners")
      .select("volume_id, owner_id, has_mihon")
      .in("volume_id", batch);

    if (error) {
      throw new Error(
        `Impossible de charger les propriétaires : ${error.message}`,
      );
    }

    results.push(...((data ?? []) as VolumeOwnerLink[]));
  }

  return results;
}
