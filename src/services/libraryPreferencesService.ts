import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  isLibrarySortKey,
  type LibrarySortKey,
} from "@/types/libraryFilters";

/**
 * @description Charge le tri par défaut bibliothèque du compte connecté.
 * @returns Clé de tri enregistrée ou null si non définie.
 */
export async function fetchLibraryDefaultSort(): Promise<LibrarySortKey | null> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(`Session utilisateur : ${userError.message}`);
  }

  const userId = userData.user?.id;
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("library_default_sort")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Préférence de tri : ${error.message}`);
  }

  const raw = data?.library_default_sort;
  if (typeof raw === "string" && isLibrarySortKey(raw)) {
    return raw;
  }

  return null;
}

/**
 * @description Enregistre le tri par défaut bibliothèque pour le compte connecté.
 * @param sort - Tri choisi par l'utilisateur.
 */
export async function saveLibraryDefaultSort(
  sort: LibrarySortKey,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(`Session utilisateur : ${userError.message}`);
  }

  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("Session expirée — reconnectez-vous.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ library_default_sort: sort })
    .eq("id", userId);

  if (error) {
    throw new Error(`Enregistrement du tri par défaut : ${error.message}`);
  }
}
