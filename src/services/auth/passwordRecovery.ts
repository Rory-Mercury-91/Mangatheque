const PASSWORD_RECOVERY_PENDING_KEY = "mangatheque:auth:password-recovery";

/**
 * @description Indique qu'une réinitialisation de mot de passe est en cours.
 */
export function isPasswordRecoveryPending(): boolean {
  try {
    return sessionStorage.getItem(PASSWORD_RECOVERY_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * @description Marque une réinitialisation en attente (formulaire obligatoire).
 */
export function markPasswordRecoveryPending(): void {
  try {
    sessionStorage.setItem(PASSWORD_RECOVERY_PENDING_KEY, "1");
  } catch {
    /* stockage indisponible */
  }
}

/**
 * @description Efface l'état de réinitialisation après succès ou déconnexion.
 */
export function clearPasswordRecoveryPending(): void {
  try {
    sessionStorage.removeItem(PASSWORD_RECOVERY_PENDING_KEY);
  } catch {
    /* stockage indisponible */
  }
}
