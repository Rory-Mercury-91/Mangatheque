/**
 * @description Messages utilisateur en français pour les erreurs fréquentes Supabase Auth.
 * @param message Message brut renvoyé par Supabase.
 * @returns Message localisé et lisible.
 */
export function mapSupabaseAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "E-mail ou mot de passe incorrect.";
  }
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered")
  ) {
    return "Un compte existe déjà avec cette adresse e-mail.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirmez d'abord votre adresse e-mail (lien reçu par mail).";
  }
  if (lower.includes("password") && (lower.includes("least") || lower.includes("6"))) {
    return "Le mot de passe doit contenir au moins 6 caractères.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Impossible de joindre Supabase. Vérifiez votre connexion.";
  }
  return message;
}
