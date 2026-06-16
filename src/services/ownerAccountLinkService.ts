import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchHouseholdAccounts } from "@/services/activityLogService";

/** Propriétaire métier avec son compte Supabase éventuellement lié. */
export interface OwnerWithAccountLink {
  id: string;
  name: string;
  linkedUserId: string | null;
}

/** Compte Supabase du foyer (table profiles). */
export interface HouseholdMember {
  userId: string;
  email: string | null;
}

/**
 * @description Liste les propriétaires avec leur compte lié éventuel.
 */
export async function fetchOwnersWithAccountLinks(): Promise<OwnerWithAccountLink[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("owners")
    .select("id, name, linked_user_id")
    .order("sort_order");

  if (error) {
    throw new Error(`Impossible de charger les propriétaires : ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    linkedUserId: (row.linked_user_id as string | null) ?? null,
  }));
}

/**
 * @description Liste les comptes Supabase inscrits au foyer.
 */
export async function fetchHouseholdMembers(): Promise<HouseholdMember[]> {
  const accounts = await fetchHouseholdAccounts();
  return accounts.map((account) => ({
    userId: account.userId,
    email: account.userEmail,
  }));
}

/**
 * @description Associe un propriétaire à un compte Supabase.
 * @param ownerId - Identifiant du propriétaire métier.
 * @param linkedUserId - Identifiant auth du compte à lier.
 */
export async function linkOwnerToUser(
  ownerId: string,
  linkedUserId: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("owners")
    .update({ linked_user_id: linkedUserId })
    .eq("id", ownerId);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ce compte est déjà lié à un autre propriétaire.");
    }
    throw new Error(`Impossible de lier le propriétaire : ${error.message}`);
  }
}

/**
 * @description Retire le lien entre un propriétaire et son compte Supabase.
 * @param ownerId - Identifiant du propriétaire métier.
 */
export async function unlinkOwnerFromUser(ownerId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("owners")
    .update({ linked_user_id: null })
    .eq("id", ownerId);

  if (error) {
    throw new Error(`Impossible de retirer la liaison : ${error.message}`);
  }
}
