import { getSupabaseClient } from "@/lib/supabaseClient";

/** Identifiant factice pour cibler toutes les lignes via une clause « différent de ». */
const DELETE_ALL_SENTINEL = "00000000-0000-0000-0000-000000000000";

/**
 * @description Supprime toutes les données applicatives (séries, tomes, journal).
 * @description Réservé aux tests — conserve propriétaires et comptes utilisateurs.
 * @throws Erreur si une suppression échoue.
 */
export async function wipeAllApplicationData(): Promise<void> {
  const supabase = getSupabaseClient();

  const { error: logsError } = await supabase
    .from("activity_logs")
    .delete()
    .neq("id", DELETE_ALL_SENTINEL);

  if (logsError) {
    throw new Error(
      `Impossible de vider le journal : ${logsError.message}`,
    );
  }

  const { error: worksError } = await supabase
    .from("works")
    .delete()
    .neq("id", DELETE_ALL_SENTINEL);

  if (worksError) {
    throw new Error(
      `Impossible de vider la bibliothèque : ${worksError.message}`,
    );
  }
}
