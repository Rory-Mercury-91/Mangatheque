import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * @description Charge les favoris anime par série (ownerIds).
 */
export async function fetchAnimeFavoritesByAnime(): Promise<
  Map<string, string[]>
> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("anime_favorites")
    .select("anime_id, owner_id");

  if (error) {
    throw new Error(`Impossible de charger les favoris anime : ${error.message}`);
  }

  const byAnime = new Map<string, string[]>();
  for (const row of data ?? []) {
    const list = byAnime.get(row.anime_id as string) ?? [];
    list.push(row.owner_id as string);
    byAnime.set(row.anime_id as string, list);
  }
  return byAnime;
}

/**
 * @description Vérifie que le compte peut gérer les favoris du propriétaire.
 */
async function assertCanToggleFavoriteForOwner(ownerId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;

  if (!userId) {
    throw new Error("Connectez-vous pour gérer vos favoris.");
  }

  const { data, error } = await supabase
    .from("owners")
    .select("linked_user_id")
    .eq("id", ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossible de vérifier le propriétaire : ${error.message}`);
  }

  if (!data?.linked_user_id || data.linked_user_id !== userId) {
    throw new Error("Vous ne pouvez gérer que vos propres favoris.");
  }
}

/**
 * @description Bascule le favori d'un animé pour un propriétaire.
 */
export async function toggleAnimeFavorite(
  animeId: string,
  ownerId: string,
  favorited: boolean,
): Promise<void> {
  const supabase = getSupabaseClient();
  await assertCanToggleFavoriteForOwner(ownerId);

  if (favorited) {
    const { error } = await supabase
      .from("anime_favorites")
      .insert({ anime_id: animeId, owner_id: ownerId });

    if (error && error.code !== "23505") {
      throw new Error(`Impossible d'ajouter le favori : ${error.message}`);
    }
    return;
  }

  const { error } = await supabase
    .from("anime_favorites")
    .delete()
    .eq("anime_id", animeId)
    .eq("owner_id", ownerId);

  if (error) {
    throw new Error(`Impossible de retirer le favori : ${error.message}`);
  }
}
