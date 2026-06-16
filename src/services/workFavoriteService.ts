import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * @description Charge les favoris série par propriétaire.
 */
export async function fetchWorkFavoritesByWork(): Promise<Map<string, string[]>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_favorites")
    .select("work_id, owner_id");

  if (error) {
    throw new Error(`Impossible de charger les favoris : ${error.message}`);
  }

  const byWork = new Map<string, string[]>();
  for (const row of data ?? []) {
    const list = byWork.get(row.work_id as string) ?? [];
    list.push(row.owner_id as string);
    byWork.set(row.work_id as string, list);
  }

  return byWork;
}

/**
 * @description Bascule le favori d'une série pour un propriétaire.
 */
export async function toggleWorkFavorite(
  workId: string,
  ownerId: string,
  favorited: boolean,
): Promise<void> {
  const supabase = getSupabaseClient();

  if (favorited) {
    const { error } = await supabase
      .from("work_favorites")
      .insert({ work_id: workId, owner_id: ownerId });

    if (error && error.code !== "23505") {
      throw new Error(`Impossible d'ajouter le favori : ${error.message}`);
    }
    return;
  }

  const { error } = await supabase
    .from("work_favorites")
    .delete()
    .eq("work_id", workId)
    .eq("owner_id", ownerId);

  if (error) {
    throw new Error(`Impossible de retirer le favori : ${error.message}`);
  }
}
