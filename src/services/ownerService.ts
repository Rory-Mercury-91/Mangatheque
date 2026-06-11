import { getSupabaseClient } from "@/lib/supabaseClient";
import type { Owner } from "@/types/database";

/**
 * @description Charge tous les propriétaires du foyer, triés par ordre d'affichage.
 * @returns Liste des propriétaires (Celine, Sebastien, Alexandre…).
 */
export async function fetchOwners(): Promise<Owner[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("owners")
    .select("id, name, color, badge_label, sort_order, created_at")
    .order("sort_order");

  if (error) {
    throw new Error(`Impossible de charger les propriétaires : ${error.message}`);
  }

  return data ?? [];
}

export type OwnerProfilePatch = {
  color?: string;
  badgeLabel?: string | null;
};

/**
 * @description Met à jour la couleur et/ou le texte de pastille d'un propriétaire.
 * @param ownerId Identifiant du propriétaire.
 * @param patch Champs à modifier.
 */
export async function updateOwnerProfile(
  ownerId: string,
  patch: OwnerProfilePatch,
): Promise<void> {
  const supabase = getSupabaseClient();
  const update: { color?: string; badge_label?: string | null } = {};

  if (patch.color !== undefined) {
    update.color = patch.color;
  }
  if (patch.badgeLabel !== undefined) {
    const trimmed = patch.badgeLabel?.trim() ?? "";
    update.badge_label = trimmed.length > 0 ? trimmed.slice(0, 4) : null;
  }

  if (Object.keys(update).length === 0) {
    return;
  }

  const { error } = await supabase.from("owners").update(update).eq("id", ownerId);

  if (error) {
    throw new Error(`Impossible de mettre à jour le profil : ${error.message}`);
  }
}
