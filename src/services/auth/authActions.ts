import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  getAuthRedirectUrl,
  getPasswordResetRedirectUrl,
} from "@/services/auth/authRedirectService";
import { clearPasswordRecoveryPending } from "@/services/auth/passwordRecovery";
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
 * @description Envoie un e-mail de réinitialisation du mot de passe.
 * @param email - Adresse du compte concerné.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getPasswordResetRedirectUrl(),
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
 * @description Définit un nouveau mot de passe (après lien de récupération).
 * @param newPassword - Nouveau mot de passe (min. 6 caractères).
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
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
 * @description Déconnexion de l'utilisateur courant.
 */
export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  clearPasswordRecoveryPending();
  await supabase.auth.signOut();
}
