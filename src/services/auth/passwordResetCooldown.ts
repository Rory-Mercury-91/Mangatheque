const STORAGE_KEY = "mangatheque:reset-email-cooldown";

/** Délai minimum entre deux demandes pour la même adresse (côté app). */
export const PASSWORD_RESET_COOLDOWN_MS = 60_000;

interface CooldownEntry {
  email: string;
  sentAt: number;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * @description Indique si un nouvel envoi est autorisé pour cette adresse.
 * @param email - Adresse saisie par l'utilisateur.
 */
export function getPasswordResetCooldownRemaining(email: string): number {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return 0;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return 0;
    }
    const entry = JSON.parse(raw) as CooldownEntry;
    if (entry.email !== normalized) {
      return 0;
    }
    return Math.max(0, PASSWORD_RESET_COOLDOWN_MS - (Date.now() - entry.sentAt));
  } catch {
    return 0;
  }
}

/**
 * @description Enregistre l'envoi réussi pour activer le délai local.
 * @param email - Adresse utilisée pour la demande.
 */
export function markPasswordResetEmailSent(email: string): void {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return;
  }

  try {
    const entry: CooldownEntry = { email: normalized, sentAt: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* stockage indisponible */
  }
}
