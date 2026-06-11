import { getSupabaseClient } from "@/lib/supabaseClient";
import { getAuthRedirectUrl } from "@/services/auth/authRedirectService";
import { mapSupabaseAuthError } from "@/services/auth/mapSupabaseAuthError";

export type AuthResult = { ok: true } | { ok: false; error: string };

/**
 * @description Connexion par e-mail et mot de passe.
 */
export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      return { ok: false, error: mapSupabaseAuthError(error.message) };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return { ok: false, error: mapSupabaseAuthError(msg) };
  }
}

/**
 * @description Création de compte par e-mail.
 */
export async function signUpWithEmailPassword(
  email: string,
  password: string,
): Promise<AuthResult & { needsConfirmation?: boolean }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });
    if (error) {
      return { ok: false, error: mapSupabaseAuthError(error.message) };
    }
    if (!data.session) {
      return {
        ok: true,
        needsConfirmation: true,
      };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return { ok: false, error: mapSupabaseAuthError(msg) };
  }
}

/**
 * @description Déconnexion de l'utilisateur courant.
 */
export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}
