import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchInBatches } from "@/services/supabaseBatchQuery";

export interface VolumeOwnerLink {
  volume_id: string;
  owner_id: string;
  has_mihon: boolean;
  has_purchase: boolean;
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

  return fetchInBatches(volumeIds, async (batch) => {
    const { data, error } = await supabase
      .from("volume_owners")
      .select("volume_id, owner_id, has_mihon, has_purchase")
      .in("volume_id", batch);

    if (error) {
      throw new Error(
        `Impossible de charger les propriétaires : ${error.message}`,
      );
    }

    return ((data ?? []) as VolumeOwnerLink[]).map((row) => ({
      ...row,
      has_purchase: row.has_purchase ?? !row.has_mihon,
    }));
  });
}
