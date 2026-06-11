import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/**
 * @description Retourne le client Supabase singleton (lazy init).
 * @returns Instance Supabase configurée via les variables d'environnement Vite.
 * @throws Si les variables VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY sont absentes.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Configuration Supabase manquante. Vérifiez le fichier .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).",
    );
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }

  return client;
}

/**
 * @description Vérifie si Supabase est configuré sans lever d'exception.
 * @returns true si les deux variables d'environnement sont définies.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
