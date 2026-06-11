import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ActivityLog, LogActivityInput } from "@/types/activityLog";

/**
 * @description Enregistre une action dans le journal (suppression, création…).
 * @param input - Détails de l'action et justification éventuelle.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("activity_logs").insert({
    action_type: input.actionType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    entity_title: input.entityTitle ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error("Impossible d'enregistrer le journal :", error.message);
  }
}

/**
 * @description Charge les entrées du journal, les plus récentes en premier.
 * @param limit - Nombre maximum d'entrées.
 * @returns Liste des logs d'activité.
 */
export async function fetchActivityLogs(limit = 50): Promise<ActivityLog[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Impossible de charger le journal : ${error.message}`);
  }

  return (data ?? []) as ActivityLog[];
}
