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
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("over_email_send_rate_limit") ||
    lower.includes("email rate limit")
  ) {
    return "Limite d'envoi atteinte (protection Supabase). Attendez 5 à 10 minutes, ou ouvrez le dernier e-mail reçu si vous l'avez encore.";
  }
  if (lower.includes("same as the old password")) {
    return "Le nouveau mot de passe doit être différent de l'ancien.";
  }
  return message;
}
