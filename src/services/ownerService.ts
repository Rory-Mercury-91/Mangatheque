import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Owner } from "@/types/database";

/**
 * @description Charge tous les propriétaires du foyer, triés par ordre d'affichage.
 * @returns Liste des propriétaires (Céline, Sébastien, Alexandre…).
 */
export async function fetchOwners(): Promise<Owner[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("owners")
    .select("id, name, sort_order, created_at")
    .order("sort_order");

  if (error) {
    throw new Error(`Impossible de charger les propriétaires : ${error.message}`);
  }

  return data ?? [];
}
