import { getSupabaseClient } from "@/lib/supabaseClient";
import type { TrackerProvider, UserTrackerAccount } from "@/types/tracker";

export interface TrackerTokenUpsert {
  provider: TrackerProvider;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  externalUserId?: string | null;
  externalUsername?: string | null;
}

/**
 * @description Liste les comptes tracker liés au compte connecté.
 */
export async function fetchLinkedTrackerAccounts(): Promise<UserTrackerAccount[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_tracker_accounts")
    .select(
      "provider, external_user_id, external_username, expires_at, updated_at",
    )
    .order("provider");

  if (error) {
    throw new Error(`Impossible de charger les trackers : ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    provider: row.provider as TrackerProvider,
    externalUserId: row.external_user_id ?? null,
    externalUsername: row.external_username ?? null,
    expiresAt: row.expires_at ?? null,
    updatedAt: row.updated_at,
  }));
}

/**
 * @description Charge le token d'accès d'un provider pour le compte connecté.
 */
export async function fetchTrackerAccessToken(
  provider: TrackerProvider,
): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_tracker_accounts")
    .select("access_token, expires_at")
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossible de charger le token ${provider} : ${error.message}`);
  }

  if (!data?.access_token) {
    return null;
  }

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return data.access_token;
}

/**
 * @description Enregistre ou met à jour le token tracker du compte connecté.
 */
export async function upsertTrackerAccount(
  input: TrackerTokenUpsert,
): Promise<void> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Connexion requise pour lier un tracker.");
  }

  const { error } = await supabase.from("user_tracker_accounts").upsert(
    {
      user_id: user.id,
      provider: input.provider,
      access_token: input.accessToken,
      refresh_token: input.refreshToken ?? null,
      expires_at: input.expiresAt ?? null,
      external_user_id: input.externalUserId ?? null,
      external_username: input.externalUsername ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) {
    throw new Error(`Impossible d'enregistrer le tracker : ${error.message}`);
  }
}

/**
 * @description Déconnecte un tracker du compte courant.
 */
export async function disconnectTrackerAccount(
  provider: TrackerProvider,
): Promise<void> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Connexion requise.");
  }

  const { error } = await supabase
    .from("user_tracker_accounts")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", provider);

  if (error) {
    throw new Error(`Impossible de déconnecter ${provider} : ${error.message}`);
  }
}
