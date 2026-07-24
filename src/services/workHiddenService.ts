import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * @description Charge les IDs d'œuvres masquées pour un compte auth.
 * @param userId - Compte connecté.
 */
export async function fetchHiddenWorkIdsForUser(
  userId: string,
): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_work_hidden")
    .select("work_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `Impossible de charger les œuvres masquées : ${error.message}`,
    );
  }

  return new Set((data ?? []).map((row) => String(row.work_id)));
}

/**
 * @description Indique si une œuvre est masquée pour le compte courant.
 */
export async function isWorkHiddenForCurrentUser(
  workId: string,
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("user_work_hidden")
    .select("work_id")
    .eq("user_id", user.id)
    .eq("work_id", workId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de vérifier le masquage : ${error.message}`,
    );
  }
  return Boolean(data);
}

/**
 * @description Masque ou réaffiche une œuvre dans la liste personnelle du compte courant.
 * @param workId - Identifiant local de l'œuvre.
 * @param hidden - True pour masquer, false pour démasquer.
 */
export async function setWorkHidden(
  workId: string,
  hidden: boolean,
): Promise<void> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Connectez-vous pour masquer une œuvre.");
  }

  if (hidden) {
    const { error } = await supabase.from("user_work_hidden").insert({
      user_id: user.id,
      work_id: workId,
    });
    if (error && error.code !== "23505") {
      throw new Error(`Impossible de masquer l'œuvre : ${error.message}`);
    }
    return;
  }

  const { error } = await supabase
    .from("user_work_hidden")
    .delete()
    .eq("user_id", user.id)
    .eq("work_id", workId);

  if (error) {
    throw new Error(`Impossible de démasquer l'œuvre : ${error.message}`);
  }
}
