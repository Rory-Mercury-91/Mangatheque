import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Owner } from "@/types/database";

export type SupabaseHealthStatus =
  | { state: "not_configured" }
  | { state: "checking" }
  | { state: "connected"; owners: Owner[] }
  | { state: "migration_missing" }
  | { state: "error"; message: string };

/**
 * @description Vérifie la connexion Supabase et la présence des tables migrées.
 * @returns Statut détaillé : connecté avec propriétaires, migration manquante ou erreur.
 */
export async function checkSupabaseHealth(): Promise<
  Exclude<SupabaseHealthStatus, { state: "checking" }>
> {
  if (!isSupabaseConfigured()) {
    return { state: "not_configured" };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("owners")
      .select("id, name, color, sort_order, created_at")
      .order("sort_order");

    if (error) {
      const code = error.code ?? "";
      const message = error.message.toLowerCase();

      if (
        code === "PGRST205" ||
        code === "42P01" ||
        message.includes("does not exist") ||
        message.includes("could not find the table")
      ) {
        return { state: "migration_missing" };
      }

      return {
        state: "error",
        message: error.message,
      };
    }

    return { state: "connected", owners: data ?? [] };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erreur de connexion inconnue.";
    return { state: "error", message };
  }
}
