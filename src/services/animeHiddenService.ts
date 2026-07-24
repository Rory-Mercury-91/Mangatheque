import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * @description Charge les IDs d'animés masqués pour un compte auth.
 * @param userId - Compte connecté.
 */
export async function fetchHiddenAnimeIdsForUser(
  userId: string,
): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_anime_hidden")
    .select("anime_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `Impossible de charger les animés masqués : ${error.message}`,
    );
  }

  return new Set((data ?? []).map((row) => String(row.anime_id)));
}

/**
 * @description Indique si un animé est masqué pour le compte courant.
 */
export async function isAnimeHiddenForCurrentUser(
  animeId: string,
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("user_anime_hidden")
    .select("anime_id")
    .eq("user_id", user.id)
    .eq("anime_id", animeId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de vérifier le masquage : ${error.message}`,
    );
  }
  return Boolean(data);
}

/**
 * @description Masque ou réaffiche un animé dans la liste personnelle du compte courant.
 * @param animeId - Identifiant local de l'animé.
 * @param hidden - True pour masquer, false pour démasquer.
 */
export async function setAnimeHidden(
  animeId: string,
  hidden: boolean,
): Promise<void> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Connectez-vous pour masquer un animé.");
  }

  if (hidden) {
    const { error } = await supabase.from("user_anime_hidden").insert({
      user_id: user.id,
      anime_id: animeId,
    });
    if (error && error.code !== "23505") {
      throw new Error(`Impossible de masquer l'animé : ${error.message}`);
    }
    return;
  }

  const { error } = await supabase
    .from("user_anime_hidden")
    .delete()
    .eq("user_id", user.id)
    .eq("anime_id", animeId);

  if (error) {
    throw new Error(`Impossible de démasquer l'animé : ${error.message}`);
  }
}
