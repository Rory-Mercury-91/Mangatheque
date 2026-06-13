/**
 * @description Extrait un message lisible depuis une erreur inconnue (Tauri, Supabase, etc.).
 * @param error - Valeur attrapée dans un catch.
 * @param fallback - Message par défaut si rien n'est exploitable.
 */
export function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
  }

  return fallback;
}
